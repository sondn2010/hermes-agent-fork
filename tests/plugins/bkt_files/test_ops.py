"""bkt-files backend: every route applies the managed policy, the sensitive-path guard, the
live-database guard, Hermes-home protection, the plugins-directory refusal, and never follows
symlinks. Archives that escape, smuggle links or expand without bound write nothing."""

from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

import pytest

from tests.plugins.bkt_files.conftest import PREFIX, load_plugin, make_zip, snapshot


def post(client, route: str, body: dict):
    return client.post(f"{PREFIX}/{route}", json=body)


def write(path: Path, text: str = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# Move, copy, rename and conflict modes
# ---------------------------------------------------------------------------


def test_move_conflict_modes(client, tree):
    src_dir, dest = tree.ws / "src", tree.ws / "dest"
    write(dest / "a.txt", "old")

    write(src_dir / "a.txt", "new")
    r = post(client, "move", {"sources": [str(src_dir / "a.txt")], "dest_dir": str(dest)})
    assert r.status_code == 409
    assert (src_dir / "a.txt").exists() and (dest / "a.txt").read_text() == "old"

    r = post(client, "move", {"sources": [str(src_dir / "a.txt")], "dest_dir": str(dest), "on_conflict": "rename"})
    assert r.status_code == 200, r.text
    assert (dest / "a (1).txt").read_text() == "new" and not (src_dir / "a.txt").exists()

    write(src_dir / "a.txt", "newest")
    r = post(client, "move", {"sources": [str(src_dir / "a.txt")], "dest_dir": str(dest), "on_conflict": "overwrite"})
    assert r.status_code == 200, r.text
    assert (dest / "a.txt").read_text() == "newest"


def test_move_folder_tree(client, tree):
    write(tree.ws / "proj" / "deep" / "deeper" / "f.md", "# hi")
    (tree.ws / "archive").mkdir()
    r = post(client, "move", {"sources": [str(tree.ws / "proj")], "dest_dir": str(tree.ws / "archive")})
    assert r.status_code == 200, r.text
    assert (tree.ws / "archive" / "proj" / "deep" / "deeper" / "f.md").read_text() == "# hi"


def test_move_into_itself_or_descendant_is_refused(client, tree):
    write(tree.ws / "a" / "b" / "c.txt")
    for dest in (tree.ws / "a", tree.ws / "a" / "b"):
        r = post(client, "move", {"sources": [str(tree.ws / "a")], "dest_dir": str(dest)})
        assert r.status_code == 400, (dest, r.text)
    assert (tree.ws / "a" / "b" / "c.txt").exists()
    r = post(client, "copy", {"sources": [str(tree.ws / "a")], "dest_dir": str(tree.ws / "a" / "b")})
    assert r.status_code == 400


def test_copy_tree_and_conflict_modes(client, tree):
    write(tree.ws / "src" / "one.txt", "1")
    write(tree.ws / "src" / "sub" / "two.txt", "2")
    dest = tree.ws / "dest"
    dest.mkdir()

    r = post(client, "copy", {"sources": [str(tree.ws / "src")], "dest_dir": str(dest)})
    assert r.status_code == 200, r.text
    assert (dest / "src" / "sub" / "two.txt").read_text() == "2"
    assert (tree.ws / "src" / "one.txt").exists()

    assert post(client, "copy", {"sources": [str(tree.ws / "src")], "dest_dir": str(dest)}).status_code == 409

    r = post(client, "copy", {"sources": [str(tree.ws / "src")], "dest_dir": str(dest), "on_conflict": "rename"})
    assert r.status_code == 200, r.text
    assert (dest / "src (1)" / "sub" / "two.txt").exists()

    write(tree.ws / "src" / "one.txt", "changed")
    write(dest / "src" / "extra.txt", "kept")
    r = post(client, "copy", {"sources": [str(tree.ws / "src")], "dest_dir": str(dest), "on_conflict": "overwrite"})
    assert r.status_code == 200, r.text
    assert (dest / "src" / "one.txt").read_text() == "changed"
    assert (dest / "src" / "extra.txt").read_text() == "kept"


def test_rename_and_conflict(client, tree):
    write(tree.ws / "a.txt")
    write(tree.ws / "taken.txt")
    r = post(client, "rename", {"path": str(tree.ws / "a.txt"), "new_name": "b.txt"})
    assert r.status_code == 200, r.text
    assert (tree.ws / "b.txt").exists() and not (tree.ws / "a.txt").exists()
    assert post(client, "rename", {"path": str(tree.ws / "b.txt"), "new_name": "taken.txt"}).status_code == 409


@pytest.mark.parametrize("name", [
    "CON", "con.txt", "Nul", "aux.tar.gz", "COM1", "lpt9.log", "PRN ", "a:b", 'q"uote', "pipe|", "star*",
    "what?", "trailing.", "trailing ", "a/b", "a\\b", "..", ".", "tab\tname",
])
def test_rename_rejects_unportable_names(client, tree, name):
    write(tree.ws / "a.txt")
    r = post(client, "rename", {"path": str(tree.ws / "a.txt"), "new_name": name})
    assert r.status_code in (400, 422), (name, r.text)
    assert (tree.ws / "a.txt").exists()


def test_portable_names_are_accepted(client, tree):
    write(tree.ws / "a.txt")
    for name in ("console.txt", "con-notes", "nulls.md", "Báo cáo 2026.md"):
        r = post(client, "rename", {"path": str(next(tree.ws.iterdir())), "new_name": name})
        assert r.status_code == 200, (name, r.text)


# ---------------------------------------------------------------------------
# Managed root, Hermes homes and the plugins directory
# ---------------------------------------------------------------------------


def test_locked_root_is_enforced(client, tree, locked):
    write(tree.ws / "in.txt")
    outside = tree.user / "outside"
    write(outside / "o.txt")

    assert post(client, "move", {"sources": [str(tree.ws / "in.txt")], "dest_dir": str(outside)}).status_code == 403
    assert post(client, "move", {"sources": [str(outside / "o.txt")], "dest_dir": str(tree.ws)}).status_code == 403
    assert post(client, "copy", {"sources": [str(outside / "o.txt")], "dest_dir": str(tree.ws)}).status_code == 403
    assert post(client, "zip", {"paths": [str(outside)]}).status_code == 403
    assert post(client, "write-text", {"path": str(outside / "new.txt"), "content": "x"}).status_code == 403
    assert client.get(f"{PREFIX}/search", params={"root": str(outside), "q": "o"}).status_code == 403
    # The managed root itself can never be moved or renamed.
    assert post(client, "rename", {"path": str(tree.ws), "new_name": "gone"}).status_code in (400, 403)
    assert post(client, "move", {"sources": ["/"], "dest_dir": str(tree.ws)}).status_code == 400
    # Relative paths resolve under the locked root.
    r = post(client, "rename", {"path": "in.txt", "new_name": "renamed.txt"})
    assert r.status_code == 200, r.text
    assert (tree.ws / "renamed.txt").exists() and (outside / "o.txt").exists()


def test_hermes_homes_cannot_be_moved_or_renamed(client, tree):
    (tree.ws / "dest").mkdir()
    for path in (tree.home, tree.profile, tree.home / "profiles", tree.user):
        assert post(client, "move", {"sources": [str(path)], "dest_dir": str(tree.ws / "dest")}).status_code == 400, path
        assert post(client, "rename", {"path": str(path), "new_name": "renamed"}).status_code == 400, path
    # A folder that contains a Hermes home is refused too.
    assert post(client, "move", {"sources": [str(tree.root)], "dest_dir": str(tree.ws / "dest")}).status_code == 400
    assert tree.home.is_dir() and tree.profile.is_dir()


def test_overwrite_cannot_replace_a_hermes_home(client, tree):
    source = tree.ws / "alpha"
    source.mkdir()
    r = post(client, "move", {"sources": [str(source)], "dest_dir": str(tree.home / "profiles"),
                              "on_conflict": "overwrite"})
    assert r.status_code == 400
    assert (tree.profile / "config.yaml").exists()


def test_writes_into_a_hermes_plugins_dir_are_refused(client, tree):
    write(tree.ws / "evil" / "dashboard" / "manifest.json", "{}")
    plugins = tree.home / "plugins"
    nested = plugins / "existing"
    nested.mkdir()
    archive = tree.ws / "evil.zip"
    archive.write_bytes(make_zip([("evil/dashboard/plugin_api.py", b"import os")]))

    for dest in (plugins, nested):
        assert post(client, "copy", {"sources": [str(tree.ws / "evil")], "dest_dir": str(dest)}).status_code == 403
        assert post(client, "move", {"sources": [str(tree.ws / "evil")], "dest_dir": str(dest)}).status_code == 403
        assert post(client, "unzip", {"path": str(archive), "dest_dir": str(dest)}).status_code == 403
        assert post(client, "write-text", {"path": str(dest / "x.py"), "content": "x"}).status_code == 403
    # An archive that sits in the plugins dir cannot extract next to itself either.
    inside = plugins / "drop.zip"
    inside.write_bytes(archive.read_bytes())
    assert post(client, "unzip", {"path": str(inside)}).status_code == 403
    assert snapshot(plugins) == {"existing", "drop.zip"}


# ---------------------------------------------------------------------------
# Sensitive files
# ---------------------------------------------------------------------------


def test_rename_to_or_from_a_credential_name_is_refused(client, tree):
    write(tree.ws / ".env", "K=V")
    write(tree.ws / "plain.txt")
    assert post(client, "rename", {"path": str(tree.ws / ".env"), "new_name": "env.txt"}).status_code == 403
    for name in (".env", ".env.local", "auth.json", "Auth.JSON", ".git-credentials"):
        assert post(client, "rename", {"path": str(tree.ws / "plain.txt"), "new_name": name}).status_code == 403, name
    assert (tree.ws / ".env").read_text() == "K=V" and (tree.ws / "plain.txt").exists()
    (tree.ws / "dest").mkdir()
    assert post(client, "move", {"sources": [str(tree.ws / ".env")], "dest_dir": str(tree.ws / "dest")}).status_code == 403


def test_copy_of_credential_files_is_refused(client, tree):
    (tree.ws / "dest").mkdir()
    for name in (".env", "auth.json"):
        r = post(client, "copy", {"sources": [str(tree.home / name)], "dest_dir": str(tree.ws / "dest")})
        assert r.status_code == 403, name
    assert post(client, "copy", {"sources": [str(tree.home / "mcp-tokens")], "dest_dir": str(tree.ws / "dest")}).status_code == 403
    assert list((tree.ws / "dest").iterdir()) == []


def test_copy_of_a_folder_skips_credential_entries(client, tree):
    (tree.ws / "dest").mkdir()
    r = post(client, "copy", {"sources": [str(tree.home)], "dest_dir": str(tree.ws / "dest")})
    assert r.status_code == 200, r.text
    copied = snapshot(tree.ws / "dest" / ".hermes")
    assert "notes.txt" in copied
    assert not {".env", "auth.json", "config.yaml"} & copied
    assert not any(p.split(os.sep)[0] in {"mcp-tokens", "pairing"} for p in copied)
    assert not any(Path(p).name == ".env" for p in copied)


def _zip_names(response) -> set[str]:
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        return set(archive.namelist())


def test_zip_of_the_hermes_home_has_no_credentials(client, tree):
    response = post(client, "zip", {"paths": [str(tree.home)]})
    names = _zip_names(response)
    assert ".hermes/notes.txt" in names
    for name in names:
        parts = name.rstrip("/").split("/")
        assert parts[-1].lower() not in {".env", "auth.json", "config.yaml"}, name
        assert not {"mcp-tokens", "pairing"} & set(parts), name
    skipped = json.loads(response.headers["X-BKT-Skipped"])
    assert {Path(s["path"]).name for s in skipped} >= {".env", "auth.json", "mcp-tokens", "pairing"}
    assert response.headers["content-disposition"].endswith('.hermes.zip"')


def test_zip_with_a_sensitive_path_is_refused(client, tree):
    assert post(client, "zip", {"paths": [str(tree.home / ".env")]}).status_code == 403


@pytest.mark.platforms("linux", "macos")
def test_zip_does_not_follow_a_symlink_to_auth_json(client, tree):
    folder = tree.ws / "share"
    write(folder / "readme.txt", "ok")
    (folder / "innocent.txt").symlink_to(tree.home / "auth.json")
    (folder / "linked-dir").symlink_to(tree.home, target_is_directory=True)
    response = post(client, "zip", {"paths": [str(folder)]})
    names = _zip_names(response)
    assert names == {"share/", "share/readme.txt"}
    assert b"secret" not in response.content
    reasons = {Path(s["path"]).name: s["reason"] for s in json.loads(response.headers["X-BKT-Skipped"])}
    assert reasons == {"innocent.txt": "symlink", "linked-dir": "symlink"}


@pytest.mark.platforms("linux", "macos")
def test_copy_and_rename_act_on_the_link_itself(client, tree):
    link = tree.ws / "link.txt"
    link.symlink_to(tree.home / "notes.txt")
    (tree.ws / "dest").mkdir()
    r = post(client, "copy", {"sources": [str(link)], "dest_dir": str(tree.ws / "dest")})
    assert r.status_code == 200 and r.json()["skipped"][0]["reason"] == "symlink"
    assert list((tree.ws / "dest").iterdir()) == []
    r = post(client, "rename", {"path": str(link), "new_name": "moved-link.txt"})
    assert r.status_code == 200, r.text
    assert (tree.ws / "moved-link.txt").is_symlink() and (tree.home / "notes.txt").exists()


def test_copy_refuses_a_live_sqlite_database(client, tree):
    from hermes_cli.sqlite_safe_read import connect_tracked

    db = tree.ws / "data" / "live.db"
    db.parent.mkdir()
    conn = connect_tracked(db)
    try:
        conn.execute("CREATE TABLE t (x)")
        conn.commit()
        (tree.ws / "dest").mkdir()
        r = post(client, "copy", {"sources": [str(db)], "dest_dir": str(tree.ws / "dest")})
        assert r.status_code == 409, r.text
        r = post(client, "copy", {"sources": [str(db.parent)], "dest_dir": str(tree.ws / "dest")})
        assert r.status_code == 200 and {s["reason"] for s in r.json()["skipped"]} == {"live database"}
        assert not (tree.ws / "dest" / "data" / "live.db").exists()
        names = _zip_names(post(client, "zip", {"paths": [str(db.parent)]}))
        assert "data/live.db" not in names
    finally:
        conn.close()
    r = post(client, "copy", {"sources": [str(db)], "dest_dir": str(tree.ws / "dest")})
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Unzip
# ---------------------------------------------------------------------------


def test_unzip_extracts_a_nested_tree(client, tree):
    archive = tree.ws / "bundle.zip"
    archive.write_bytes(make_zip([("a/b/c.txt", b"deep"), ("top.md", b"# t"), ("empty/", b"")]))
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 200, r.text
    out = tree.ws / "bundle"
    assert (out / "a" / "b" / "c.txt").read_bytes() == b"deep"
    assert (out / "empty").is_dir()
    assert not any(p.name.startswith(".bkt-unzip-") for p in tree.ws.rglob("*"))

    assert post(client, "unzip", {"path": str(archive), "dest_dir": str(out)}).status_code == 409
    r = post(client, "unzip", {"path": str(archive), "dest_dir": str(out), "on_conflict": "rename"})
    assert r.status_code == 200, r.text
    assert (out / "a" / "b" / "c (1).txt").read_bytes() == b"deep"
    (out / "top.md").write_text("changed")
    r = post(client, "unzip", {"path": str(archive), "dest_dir": str(out), "on_conflict": "overwrite"})
    assert r.status_code == 200 and (out / "top.md").read_text() == "# t"


@pytest.mark.parametrize("member", [
    "../evil.txt", "a/../../evil.txt", "..\\evil.txt", "/abs/evil.txt", "C:/evil.txt", "C:evil.txt",
    "a/CON/x.txt", "nul.txt", ".env", "x/mcp-tokens/t.json", "pairing/p.json", "sub/auth.json",
])
def test_malicious_member_paths_write_nothing(client, tree, member):
    archive = tree.ws / "bad.zip"
    archive.write_bytes(make_zip([("ok.txt", b"fine"), (member, b"pwned")]))
    before_ws, before_user = snapshot(tree.ws), snapshot(tree.user)
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 400, (member, r.text)
    r = post(client, "unzip", {"path": str(archive), "dest_dir": str(tree.ws)})
    assert r.status_code == 400, (member, r.text)
    assert snapshot(tree.ws) == before_ws and snapshot(tree.user) == before_user


def test_symlink_member_is_rejected(client, tree):
    archive = tree.ws / "link.zip"
    archive.write_bytes(make_zip([("ok.txt", b"fine")], symlink="escape"))
    before = snapshot(tree.ws)
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 400 and "symlink" in r.json()["detail"]
    assert snapshot(tree.ws) == before


def test_zip_bomb_is_rejected(client, tree):
    archive = tree.ws / "bomb.zip"
    archive.write_bytes(make_zip([("zeros.bin", b"\0" * (32 * 1024 * 1024))]))
    assert archive.stat().st_size < 200 * 1024
    before = snapshot(tree.ws)
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 400 and "ratio" in r.json()["detail"]
    assert snapshot(tree.ws) == before


def test_member_count_cap(client, tree):
    module = load_plugin()
    archive = tree.ws / "many.zip"
    archive.write_bytes(make_zip([(f"f{i}.txt", b"") for i in range(module.UNZIP_MAX_MEMBERS + 1)]))
    r = post(client, "unzip", {"path": str(archive)})
    assert r.status_code == 400 and "too many" in r.json()["detail"]


@pytest.mark.platforms("linux", "macos")
def test_unzip_does_not_write_through_a_symlinked_subfolder(client, tree):
    outside = tree.root / "outside"
    outside.mkdir()
    dest = tree.ws / "dest"
    dest.mkdir()
    (dest / "sub").symlink_to(outside, target_is_directory=True)
    archive = tree.ws / "a.zip"
    archive.write_bytes(make_zip([("sub/payload.txt", b"x"), ("sub/deeper/p2.txt", b"y")]))
    for mode in ("fail", "rename", "overwrite"):
        r = post(client, "unzip", {"path": str(archive), "dest_dir": str(dest), "on_conflict": mode})
        assert r.status_code == 409, (mode, r.text)
    assert list(outside.iterdir()) == []
    assert snapshot(dest) == {"sub"}


def test_unzip_refuses_a_non_zip(client, tree):
    write(tree.ws / "not.zip", "plain text")
    assert post(client, "unzip", {"path": str(tree.ws / "not.zip")}).status_code == 400
    assert not (tree.ws / "not").exists()


# ---------------------------------------------------------------------------
# Write text
# ---------------------------------------------------------------------------


def test_write_text_round_trip_and_stale_mtime(client, tree):
    target = tree.ws / "doc.md"
    r = post(client, "write-text", {"path": str(target), "content": "v1"})
    assert r.status_code == 200, r.text
    mtime = r.json()["mtime"]
    r = post(client, "write-text", {"path": str(target), "content": "v2", "expected_mtime": mtime})
    assert r.status_code == 200 and target.read_text() == "v2"
    os.utime(target, (mtime + 100, mtime + 100))
    r = post(client, "write-text", {"path": str(target), "content": "v3", "expected_mtime": r.json()["mtime"]})
    assert r.status_code == 409
    assert target.read_text() == "v2"
    assert not [p for p in tree.ws.iterdir() if p.name.endswith(".bkt-tmp")]


def test_write_text_respects_guards(client, tree, locked):
    assert post(client, "write-text", {"path": str(tree.ws / ".env"), "content": "K=1"}).status_code == 403
    assert post(client, "write-text", {"path": str(tree.ws / "auth.json"), "content": "{}"}).status_code == 403
    assert post(client, "write-text", {"path": str(tree.home / "notes.txt"), "content": "x"}).status_code == 403
    assert post(client, "write-text", {"path": "../escape.txt", "content": "x"}).status_code == 400
    too_big = "x" * (8 * 1024 * 1024 + 1)
    assert post(client, "write-text", {"path": str(tree.ws / "big.txt"), "content": too_big}).status_code == 413
    assert (tree.home / "notes.txt").read_text() == "hello"
    assert post(client, "write-text", {"path": "inside.txt", "content": "ok"}).status_code == 200
    assert (tree.ws / "inside.txt").read_text() == "ok"


@pytest.mark.platforms("linux", "macos")
def test_write_text_does_not_follow_a_symlink(client, tree):
    (tree.ws / "notes-link.txt").symlink_to(tree.home / "notes.txt")
    r = post(client, "write-text", {"path": str(tree.ws / "notes-link.txt"), "content": "pwned"})
    assert r.status_code == 400
    assert (tree.home / "notes.txt").read_text() == "hello"


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def test_search_finds_names_and_hides_sensitive_paths(client, tree):
    write(tree.ws / "reports" / "q3-report.md")
    write(tree.ws / "deep" / "a" / "b" / "Report-final.txt")
    r = client.get(f"{PREFIX}/search", params={"root": str(tree.ws), "q": "report"})
    assert r.status_code == 200, r.text
    names = {item["name"] for item in r.json()["results"]}
    assert names == {"reports", "q3-report.md", "Report-final.txt"}

    r = client.get(f"{PREFIX}/search", params={"root": str(tree.home), "q": "e"})
    found = [Path(item["path"]) for item in r.json()["results"]]
    assert all(p.name.lower() not in {".env", "auth.json", "config.yaml"} for p in found)
    assert not any({"mcp-tokens", "pairing"} & set(p.parts) for p in found)
    assert client.get(f"{PREFIX}/search", params={"root": str(tree.ws), "q": "  "}).status_code == 400


@pytest.mark.platforms("linux", "macos")
def test_search_does_not_descend_symlinks(client, tree):
    (tree.ws / "loop").symlink_to(tree.home, target_is_directory=True)
    r = client.get(f"{PREFIX}/search", params={"root": str(tree.ws), "q": "notes"})
    assert r.status_code == 200 and r.json()["results"] == []


# ---------------------------------------------------------------------------
# Separators per host
# ---------------------------------------------------------------------------


@pytest.mark.platforms("linux", "macos")
def test_posix_backslash_is_a_literal_name_character(client, tree):
    odd = write(tree.ws / "back\\slash.txt", "b")
    (tree.ws / "dest").mkdir()
    r = post(client, "move", {"sources": [str(odd)], "dest_dir": str(tree.ws / "dest")})
    assert r.status_code == 200, r.text
    assert (tree.ws / "dest" / "back\\slash.txt").read_text() == "b"
    # New names stay portable: a backslash is still refused.
    r = post(client, "rename", {"path": str(tree.ws / "dest" / "back\\slash.txt"), "new_name": "x\\y.txt"})
    assert r.status_code == 400


@pytest.mark.platforms("windows")
def test_windows_backslash_and_forward_slash_paths(client, tree, locked):
    write(tree.ws / "sub" / "a.txt", "w")
    (tree.ws / "dest").mkdir()
    backslash = str(tree.ws / "sub" / "a.txt").replace("/", "\\")
    forward = str(tree.ws / "dest").replace("\\", "/")
    r = post(client, "move", {"sources": [backslash], "dest_dir": forward})
    assert r.status_code == 200, r.text
    assert (tree.ws / "dest" / "a.txt").read_text() == "w"
    r = post(client, "rename", {"path": "dest\\a.txt", "new_name": "b.txt"})
    assert r.status_code == 200, r.text
    assert post(client, "rename", {"path": "dest\\b.txt", "new_name": "c\\d.txt"}).status_code == 400
    assert post(client, "write-text", {"path": "..\\escape.txt", "content": "x"}).status_code == 400
    drive_relative = tree.ws.drive + "escape.txt"
    assert post(client, "write-text", {"path": drive_relative, "content": "x"}).status_code in (400, 403)


@pytest.mark.platforms("windows")
def test_windows_case_insensitive_plugins_dir_is_refused(client, tree):
    write(tree.ws / "p.py")
    upper = Path(str(tree.home / "PLUGINS"))
    assert post(client, "copy", {"sources": [str(tree.ws / "p.py")], "dest_dir": str(upper)}).status_code == 403


@pytest.mark.platforms("macos")
def test_macos_case_insensitive_plugins_dir_is_refused(client, tree):
    write(tree.ws / "p.py")
    upper = tree.home / "PLUGINS"
    assert upper.exists()  # default APFS volumes are case-insensitive
    assert post(client, "copy", {"sources": [str(tree.ws / "p.py")], "dest_dir": str(upper)}).status_code == 403
    assert not (tree.home / "plugins" / "p.py").exists()
