"""bkt-files hardening: Unicode case-fold aliases of credential names, Windows name aliases,
deep archive paths, overwrite-move data loss, unzip rename collisions, code directories beyond
plugins/, zip temp-file cleanup and header size, and the session-token check on every route."""

from __future__ import annotations

import asyncio
import errno
import io
import json
import os
import tempfile
import zipfile
from pathlib import Path

import pytest

from tests.plugins.bkt_files.conftest import PREFIX, make_zip, snapshot

LONG_S = "\u017f"  # LATIN SMALL LETTER LONG S: casefolds to "s"; str.lower() keeps it
FI = "\ufb01"  # LATIN SMALL LIGATURE FI: NFKC-normalizes to "fi"
MOD_V_ENV = ".en\u1d5b"  # MODIFIER LETTER SMALL V: NFKC-normalizes to ".env"


def post(client, route: str, body: dict):
    return client.post(f"{PREFIX}/{route}", json=body)


def write(path: Path, text: str = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# Unicode aliases of credential names (case-insensitive APFS/NTFS fold them)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", [f"auth.j{LONG_S}on", f"mcp-token{LONG_S}", f"con{FI}g.yaml", MOD_V_ENV])
def test_zip_refuses_unicode_aliases_of_credentials(client, tree, name):
    r = post(client, "zip", {"paths": [str(tree.home / name)]})
    assert r.status_code == 403, (name, r.status_code)
    assert b"secret" not in r.content


def test_rename_refuses_unicode_aliases(client, tree):
    r = post(client, "rename", {"path": str(tree.home / f"auth.j{LONG_S}on"), "new_name": "stolen.txt"})
    assert r.status_code == 403
    assert (tree.home / "auth.json").exists() and not (tree.home / "stolen.txt").exists()
    write(tree.ws / "plain.txt")
    for new_name in (f"auth.j{LONG_S}on", f"con{FI}g.yaml", f"AUTH.J{LONG_S.upper()}ON"):
        r = post(client, "rename", {"path": str(tree.ws / "plain.txt"), "new_name": new_name})
        assert r.status_code == 403, new_name


def test_write_text_refuses_unicode_aliases(client, tree):
    r = post(client, "write-text", {"path": str(tree.home / f"con{FI}g.yaml"), "content": "pwned: 1\n"})
    assert r.status_code == 403
    assert (tree.home / "config.yaml").read_text() == "model: x\n"


def test_unzip_refuses_unicode_alias_members(client, tree):
    archive = tree.ws / "a.zip"
    for member in (f"con{FI}g.yaml", f"mcp-token{LONG_S}/evil.json", f"x/auth.j{LONG_S}on"):
        archive.write_bytes(make_zip([(member, b"pwned: 2\n")]))
        before = snapshot(tree.home)
        r = post(client, "unzip", {"path": str(archive), "dest_dir": str(tree.home), "on_conflict": "overwrite"})
        assert r.status_code == 400, (member, r.text)
        assert snapshot(tree.home) == before
    assert (tree.home / "config.yaml").read_text() == "model: x\n"


def test_walk_and_search_skip_unicode_aliases(client, tree, plugin):
    folder = tree.ws / "share"
    write(folder / "ok.txt")
    assert plugin._sensitive(folder / f"auth.j{LONG_S}on")
    assert plugin._sensitive(folder / f"MCP-TOKEN{LONG_S.upper()}" / "x.json")
    assert not plugin._sensitive(folder / "authjson.txt")


# ---------------------------------------------------------------------------
# Windows name aliases on the final component
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["notes.txt.", "notes.txt ", "notes.txt::$DATA", "x:stream", "CON", "nul.txt"])
def test_final_component_aliases_are_refused(client, tree, name):
    r = post(client, "write-text", {"path": str(tree.ws / name), "content": "x"})
    assert r.status_code == 400, (name, r.text)
    r = post(client, "zip", {"paths": [str(tree.ws / name)]})
    assert r.status_code == 400, (name, r.text)
    assert list(tree.ws.iterdir()) == []


def test_alias_problem_is_host_independent(plugin):
    for bad in ("a.", "a ", ".env::$DATA", "a:b", "COM1", "con.txt", "lpt3.log", "x\x01"):
        assert plugin.alias_problem(bad), bad
    for good in ("a.txt", ".env.example", "console.log", "back\\slash.txt", "Báo cáo.md"):
        assert plugin.alias_problem(good) is None, good


@pytest.mark.platforms("windows")
def test_windows_stream_and_trailing_dot_aliases_cannot_reach_credentials(client, tree):
    for name in (".env::$DATA", ".env ", "config.yaml.", "auth.json::$DATA"):
        assert post(client, "zip", {"paths": [str(tree.home / name)]}).status_code in (400, 403), name
        assert post(client, "write-text", {"path": str(tree.home / name), "content": "x"}).status_code in (400, 403), name
    assert (tree.home / "config.yaml").read_text() == "model: x\n"


@pytest.mark.platforms("windows")
def test_windows_short_name_of_a_credential_dir_is_refused(client, tree):
    import ctypes

    buffer = ctypes.create_unicode_buffer(512)
    ctypes.windll.kernel32.GetShortPathNameW(str(tree.home / "mcp-tokens"), buffer, 512)
    short = Path(buffer.value)
    if short.name.lower() == "mcp-tokens":
        pytest.skip("8.3 short names are disabled on this volume")
    assert post(client, "zip", {"paths": [str(short)]}).status_code == 403
    assert post(client, "rename", {"path": str(short), "new_name": "loot"}).status_code == 403


# ---------------------------------------------------------------------------
# Archive path depth and name length
# ---------------------------------------------------------------------------


def test_deep_member_paths_are_refused_quickly(client, tree, plugin):
    archive = tree.ws / "deep.zip"
    archive.write_bytes(make_zip([("a/" * (plugin.UNZIP_MAX_DEPTH + 1) + "f", b"x")]))
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 400 and "deep" in r.json()["detail"]
    with zipfile.ZipFile(io.BytesIO(make_zip([("a/" * 20_000 + "f", b"x")]))) as z:
        with pytest.raises(Exception) as caught:
            plugin._scan_archive(z, 1)
        assert getattr(caught.value, "status_code", None) == 400


def test_long_member_names_are_refused(client, tree, plugin):
    archive = tree.ws / "long.zip"
    # Every part is a legal 250-byte name; only the whole path is over the cap.
    archive.write_bytes(make_zip([("/".join(ch * 250 for ch in "nmopq") + "/f.txt", b"x")]))
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 400 and "long" in r.json()["detail"]
    assert snapshot(tree.ws) == {"long.zip"}


# ---------------------------------------------------------------------------
# Overwrite move keeps the destination when the rename fails
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", ["file", "dir"])
def test_overwrite_move_restores_destination_when_rename_fails(client, tree, monkeypatch, kind):
    dest = tree.ws / "dest"
    if kind == "file":
        write(tree.ws / "src" / "item", "new")
        write(dest / "item", "old")
    else:
        write(tree.ws / "src" / "item" / "f.txt", "new")
        write(dest / "item" / "f.txt", "old")
    source = tree.ws / "src" / "item"
    real_rename = os.rename

    def failing_rename(src, dst, *args, **kwargs):
        if Path(src) == source:
            raise OSError(errno.EXDEV, "Invalid cross-device link")
        return real_rename(src, dst, *args, **kwargs)

    monkeypatch.setattr(os, "rename", failing_rename)
    r = post(client, "move", {"sources": [str(source)], "dest_dir": str(dest), "on_conflict": "overwrite"})
    assert r.status_code == 409, r.text
    survivor = dest / "item" if kind == "file" else dest / "item" / "f.txt"
    assert survivor.read_text() == "old"
    assert sorted(p.name for p in dest.iterdir()) == ["item"]
    assert source.exists()


# ---------------------------------------------------------------------------
# Unzip collisions
# ---------------------------------------------------------------------------


def test_unzip_rename_mode_keeps_every_member(client, tree):
    out = tree.ws / "out"
    write(out / "a.txt", "disk")
    archive = tree.ws / "b.zip"
    archive.write_bytes(make_zip([("a.txt", b"member-a"), ("a (1).txt", b"member-a1")]))
    r = post(client, "unzip", {"path": str(archive), "dest_dir": str(out), "on_conflict": "rename"})
    assert r.status_code == 200, r.text
    contents = {p.name: p.read_text() for p in out.iterdir()}
    assert contents["a.txt"] == "disk"
    assert sorted(contents.values()) == ["disk", "member-a", "member-a1"]


def test_no_clobber_placement_refuses_a_late_target(plugin, tmp_path):
    staged = write(tmp_path / "staged.txt", "new")
    target = write(tmp_path / "target.txt", "appeared late")
    with pytest.raises(Exception) as caught:
        plugin._place(staged, target, replace=False)
    assert getattr(caught.value, "status_code", None) == 409
    assert target.read_text() == "appeared late"
    plugin._place(staged, tmp_path / "fresh.txt", replace=False)
    assert (tmp_path / "fresh.txt").read_text() == "new" and not staged.exists()


# ---------------------------------------------------------------------------
# Code directories beyond plugins/
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sub", ["hooks/evil/handler.py", "skills/evil/SKILL.md", "profiles/alpha/hooks/h/handler.py",
                                 "profiles/alpha/skills/s/SKILL.md"])
def test_hooks_and_skills_dirs_are_code_dirs(client, tree, sub):
    target = tree.home / sub
    target.parent.mkdir(parents=True)
    assert post(client, "write-text", {"path": str(target), "content": "import os"}).status_code == 403
    write(tree.ws / "handler.py")
    assert post(client, "copy", {"sources": [str(tree.ws / "handler.py")], "dest_dir": str(target.parent)}).status_code == 403
    assert not target.exists()


def test_targets_that_contain_a_code_dir_are_refused(client, tree, monkeypatch):
    checkout = tree.ws / "checkout"
    write(checkout / "plugins" / "x" / "dashboard" / "manifest.json", "{}")
    monkeypatch.setenv("HERMES_BUNDLED_PLUGINS", str(checkout / "plugins"))
    # Renaming or moving a folder that holds a code dir would let a staged tree take its place.
    assert post(client, "rename", {"path": str(checkout), "new_name": "old"}).status_code == 403
    (tree.ws / "dest").mkdir()
    assert post(client, "move", {"sources": [str(checkout)], "dest_dir": str(tree.ws / "dest")}).status_code == 403

    staged = tree.ws / "stage" / "newname"
    write(staged / "plugins" / "evil" / "dashboard" / "plugin_api.py", "import os")
    monkeypatch.setenv("HERMES_BUNDLED_PLUGINS", str(tree.ws / "newname" / "plugins"))
    r = post(client, "move", {"sources": [str(staged)], "dest_dir": str(tree.ws)})
    assert r.status_code == 403
    r = post(client, "copy", {"sources": [str(staged)], "dest_dir": str(tree.ws)})
    assert r.status_code == 403
    assert not (tree.ws / "newname").exists()


# ---------------------------------------------------------------------------
# Zip temp file and skipped header
# ---------------------------------------------------------------------------


@pytest.fixture
def private_tmp(tmp_path, monkeypatch) -> Path:
    directory = tmp_path / "systmp"
    directory.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(directory))
    return directory


def test_zip_leaves_no_temp_file(client, tree, private_tmp):
    write(tree.ws / "a" / "f.txt", "x")
    r = post(client, "zip", {"paths": [str(tree.ws / "a")]})
    assert r.status_code == 200
    assert int(r.headers["content-length"]) == len(r.content)
    assert list(private_tmp.iterdir()) == []


def test_zip_temp_file_is_removed_when_the_client_disconnects(tree, plugin, private_tmp):
    write(tree.ws / "a" / "big.bin", "y" * (3 * 1024 * 1024))
    handle, size = plugin._open_spooled_zip(lambda tmp: _make_zip(tmp, tree.ws / "a" / "big.bin"))
    body = plugin._stream_and_close(handle)

    async def read_one_then_disconnect():
        first = await body.__anext__()
        await body.aclose()
        return first

    assert asyncio.run(read_one_then_disconnect())
    assert handle.closed
    assert list(private_tmp.iterdir()) == []
    assert size > 0


def _make_zip(tmp: Path, src: Path) -> None:
    with zipfile.ZipFile(tmp, "w") as archive:
        archive.write(src, src.name)


def test_skipped_header_is_capped_and_count_is_exact(client, tree):
    folder = tree.ws / "many"
    for i in range(120):
        write(folder / f"sub{i:03d}-{'x' * 60}" / ".env", "K=V")
    write(folder / "keep.txt")
    r = post(client, "zip", {"paths": [str(folder)]})
    assert r.status_code == 200
    assert len(r.headers["X-BKT-Skipped"]) <= 4096
    assert int(r.headers["X-BKT-Skipped-Count"]) == 120
    assert 0 < len(json.loads(r.headers["X-BKT-Skipped"])) < 120


# ---------------------------------------------------------------------------
# Session token
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("method,route,body", [
    ("post", "move", {"sources": ["/x"], "dest_dir": "/y"}),
    ("post", "copy", {"sources": ["/x"], "dest_dir": "/y"}),
    ("post", "rename", {"path": "/x", "new_name": "y"}),
    ("post", "unzip", {"path": "/x.zip"}),
    ("post", "zip", {"paths": ["/x"]}),
    ("post", "write-text", {"path": "/x", "content": ""}),
    ("get", "search", None),
])
def test_every_route_requires_the_session_token(client, tree, method, route, body):
    from hermes_cli.web_server import _SESSION_HEADER_NAME

    client.headers.pop(_SESSION_HEADER_NAME)
    if method == "get":
        r = client.get(f"{PREFIX}/{route}", params={"root": str(tree.ws), "q": "x"})
    else:
        r = client.post(f"{PREFIX}/{route}", json=body)
    assert r.status_code == 401
