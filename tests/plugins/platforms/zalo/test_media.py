"""Zalo media both ways: inbound copies move into the Hermes cache (and leave openzca's directory),
outbound images and files go through local paths only."""

from __future__ import annotations

from pathlib import Path

import pytest

from gateway.platforms.event import MessageType
from plugins.platforms.zalo import media
from tests.plugins.platforms.zalo._fake_openzca import (
    dm_line, make_adapter, make_fake_openzca, zalo_module,
)

_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _inbound(tmp_path: Path, name: str, data: bytes) -> tuple[Path, Path]:
    inbound = tmp_path / "zalo-inbound"
    inbound.mkdir(exist_ok=True)
    path = inbound / name
    path.write_bytes(data)
    return inbound, path


@pytest.mark.asyncio
async def test_image_line_is_cached_and_source_removed(tmp_path):
    inbound, src = _inbound(tmp_path, "photo.png", _PNG)
    line = dm_line(f"[media attached: {src} (image/png) | https://cdn.example/p.png]\nlook at this",
                   mediaKind="image", mediaPath=str(src), mediaType="image/png", msgType="chat.photo")
    adapter = make_adapter(make_fake_openzca(tmp_path))
    adapter._inbound_dir = inbound

    await adapter._on_line(line)

    [event] = adapter.received
    assert event.text == "look at this"
    assert event.message_type is MessageType.PHOTO
    assert event.media_types == ["image/png"]
    cached = Path(event.media_urls[0])
    assert cached.read_bytes() == _PNG and cached != src
    assert not src.exists()


@pytest.mark.asyncio
async def test_media_path_outside_inbound_dir_is_neither_read_nor_deleted(tmp_path):
    inbound = tmp_path / "zalo-inbound"
    inbound.mkdir()
    outside = tmp_path / "elsewhere.png"
    outside.write_bytes(_PNG)
    line = dm_line("x", mediaKind="file", mediaPath=str(outside))

    assert await media.collect_inbound(line, inbound) == ([], [], MessageType.TEXT)
    assert outside.exists()


@pytest.mark.asyncio
async def test_url_only_fallback_uses_ssrf_safe_helper(tmp_path, monkeypatch):
    cached = tmp_path / "cached.jpg"
    seen = []

    async def fake_cache(url, ext=".jpg", retries=2):
        seen.append(url)
        return str(cached)

    monkeypatch.setattr(media, "cache_image_from_url", fake_cache)
    line = dm_line("", mediaKind="image", mediaUrl="https://cdn.example/p.jpg")

    paths, types, message_type = await media.collect_inbound(line, tmp_path / "zalo-inbound")

    assert seen == ["https://cdn.example/p.jpg"]
    assert (paths, types, message_type) == ([str(cached)], ["image/jpeg"], MessageType.PHOTO)


@pytest.mark.asyncio
async def test_file_line_maps_to_document(tmp_path):
    inbound, src = _inbound(tmp_path, "report.pdf", b"%PDF-1.4 test document")
    line = dm_line("[media attached: report.pdf]", mediaKind="file", mediaPath=str(src),
                   mediaType="application/pdf", msgType="share.file")

    paths, types, message_type = await media.collect_inbound(line, inbound)

    assert message_type is MessageType.DOCUMENT
    assert types == ["application/pdf"]
    assert Path(paths[0]).read_bytes() == b"%PDF-1.4 test document"
    assert not src.exists()


def test_strip_media_markers_keeps_only_the_caption():
    content = "[media attached: 2 files]\n[media attached 1/2: /a.jpg]\n[media attached 2/2: /b.jpg]\nhi"
    assert media.strip_media_markers(content) == "hi"


async def _connected(tmp_path):
    fake = make_fake_openzca(tmp_path)
    adapter = make_adapter(fake)
    assert await adapter.connect()
    return fake, adapter


@pytest.mark.asyncio
@pytest.mark.platforms("posix")  # executable-shebang fake openzca
async def test_send_image_with_local_path(tmp_path):
    image = tmp_path / "out.png"
    image.write_bytes(_PNG)
    fake, adapter = await _connected(tmp_path)
    try:
        assert (await adapter.send_image("111", str(image), caption="look")).success
        assert fake.msg_calls()[-1] == ["--profile", "test", "msg", "image", "-m", "look", "--", "111",
                                        str(image.resolve())]
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
@pytest.mark.platforms("posix")  # executable-shebang fake openzca
async def test_send_image_with_url_downloads_first(tmp_path, monkeypatch):
    downloaded = tmp_path / "downloaded.png"
    downloaded.write_bytes(_PNG)

    async def fake_cache(url, ext=".jpg", retries=2):
        return str(downloaded)

    monkeypatch.setattr(zalo_module(), "cache_image_from_url", fake_cache)
    fake, adapter = await _connected(tmp_path)
    try:
        assert (await adapter.send_image("group:555", "https://example.com/a.png")).success
        call = fake.msg_calls()[-1]
        assert call == ["--profile", "test", "msg", "image", "--group", "--", "555", str(downloaded)]
        assert "-u" not in call and not any("example.com" in arg for arg in call)
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
@pytest.mark.platforms("posix")  # executable-shebang fake openzca
async def test_send_voice_uses_msg_upload(tmp_path):
    voice = tmp_path / "note.ogg"
    voice.write_bytes(b"OggS" + b"\x00" * 32)
    fake, adapter = await _connected(tmp_path)
    try:
        assert (await adapter.send_voice("111", str(voice))).success
        assert fake.msg_calls()[-1] == ["--profile", "test", "msg", "upload", "--", str(voice.resolve()), "111"]
    finally:
        await adapter.disconnect()
