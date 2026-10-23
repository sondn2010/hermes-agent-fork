---
phase: 4
title: "bkt-files"
status: completed
priority: P1
effort: "2.5d"
dependencies: [1]
---

# Phase 4: bkt-files

## Goal

Add an extended file manager tab with these features:
- Folder and subfolder upload.
- Unzip, and download a folder as a zip.
- Drag-and-drop move, plus a "Move to…" dialog.
- Rename, copy and multi-select.
- A markdown, text and code viewer with mermaid support.
- Search, image and PDF preview, and inline text editing.

## Context

- The core endpoints are list, read, download, stream, upload, upload-stream, mkdir and delete
  (`hermes_cli/web_routers/files.py:515-770`).
- Core `POST /api/files/upload-stream` already takes the full target `path`, runs it through
  the managed write policy, and creates parent directories
  (`files.py:708-726`). Folder upload therefore needs no new backend route.
  <!-- Red Team: /upload-tree duplicated core upload-stream -->
- Core has no move, rename, copy, unzip or zip endpoints.
- Core `/api/fs/write-text` (`files.py:843-897`) is the desktop filesystem API. It resolves
  through `_fs_path` and, for SSH-configured profiles, a remote `_fs_backend(profile)`
  (`files.py:269-287`). It applies neither the managed policy nor the sensitive guard, so
  bkt-files never calls it.
  <!-- Red Team: fs/write-text bypasses the managed policy -->
- The guards are split across two files, and every new route applies all of them:
  - `hermes_cli/web_server_files.py`: `ManagedFilesPolicy`, `_managed_files_policy(request)`,
    `_resolve_managed_path(raw, request, for_write=...)` (`:302`) and `_path_is_under`
    (`:234`). On a local install the policy returns `locked_root=None` (`:298-299`), so
    `locked_root` checks nothing there.
  - `hermes_cli/web_routers/files.py`: `_is_sensitive_path` (`:97`) covers `.env*`,
    credential basenames, `mcp-tokens/` and `pairing/`. It is documented as read-side only, so
    core write routes do not apply it, and BKT must. `_refuse_live_database` (`:201`) blocks
    SQLite files with an open connection.
  <!-- Red Team: blocked trees are not part of the managed policy -->
- `hermes_cli/archive_safe.py` already has `normalize_archive_parts` (`:13`), which rejects
  absolute, drive-letter, empty and `..` members after folding backslashes, and
  `copy_regular_files` (`:88`).

## Files to create

- `plugins/bkt-files/dashboard/manifest.json` declares the `/bkt-files` tab with icon
  `FolderOpen`, `"api": "plugin_api.py"`, and position `end`.
- `plugins/bkt-files/dashboard/plugin_api.py`:
  - One shared guard, `_guard(path, request, *, write)`, runs for every source, destination,
    walked entry, archive member and final target:
    - `_resolve_managed_path(..., for_write=write)`.
    - It refuses `_is_sensitive_path`, checked on both the resolved path and the requested
      name, so a rename to or from a credential name is caught.
    - For reads of file content (zip, copy), it calls `_refuse_live_database`.
    - It refuses to move, rename or delete the managed root, the Hermes root home, or any
      profile home.
    - It refuses any destination under a Hermes home's `plugins/` directory, because content
      written there becomes code the dashboard loads.
  - Symlinks are never followed:
    - Trees are walked with `follow_symlinks=False`, and symlink entries are skipped and
      reported.
    - `/rename` and `/move` act on the link itself: the parent is resolved, and the last
      component is not.
    - Before each write, the final target's `realpath` is checked again against the root and the
      sensitive guard. This narrows the gap between check and use.
  <!-- Red Team: symlinks in trees and check-then-use -->
  - `POST /move` takes `{sources[], dest_dir, on_conflict: fail|rename|overwrite}`. It refuses
    to move a folder into itself or into one of its descendants.
  - `POST /rename` takes `{path, new_name}` and rejects separators, `..`, Windows-reserved names
    and sensitive names.
  - `POST /copy` takes `{sources[], dest_dir, on_conflict}`. It copies regular files only.
  - `POST /unzip` takes `{path, dest_dir?, on_conflict}` and guards it:
    - Each member is normalized with `archive_safe.normalize_archive_parts`.
    - Symlink members (an `S_ISLNK` mode in `external_attr`) and sensitive member names are
      rejected.
    - Total uncompressed size and member count are capped, and the compression ratio is checked.
    - Extraction goes into a fresh temporary directory under the destination's parent. Each
      entry is then moved into place, with its final `realpath` checked again. An existing
      symlinked subfolder in the destination therefore cannot redirect a write.
  - `POST /zip` takes `{paths[]}` and streams a zip archive. It skips, and reports, every
    sensitive entry, symlink and live database. The download goes through `SDK.authedFetch` and a
    Blob, because `?token=` is only accepted on core `/api/files/download`
    (`hermes_cli/web_server.py:308`).
  - `POST /write-text` takes `{path, content, expected_mtime?}`:
    - Resolves the path with `_guard(write=True)`.
    - Caps the size.
    - Writes to a sibling temporary file and uses `os.replace`.
    - Refuses with 409 when the file changed since it was opened.
  - `GET /search?root=&q=` is a bounded name search with a result cap and a timeout. It never
    lists sensitive paths and never follows symlinks.
  - The heavy operations run through `asyncio.to_thread` so they do not block the event loop.
- `bkt/packages/files/src/` contains:
  - `index.tsx`: a tree, a list and a preview pane, with a breadcrumb.
  - `useSelection.ts`: multi-select with shift and ctrl.
  - `DragMove.tsx`: drag from the list onto a folder or breadcrumb, with a drop highlight.
  - `UploadTree.tsx`:
    - Folder upload through `webkitdirectory`, and folder drops from the OS through
      `DataTransferItem.webkitGetAsEntry`.
    - For each file, it posts `dest + relative_path` to core `/api/files/upload-stream` through
      `bktUpload`.
    - It rejects relative paths that contain `..` or are absolute before sending, and shows a
      progress list.
  - `PreviewPane.tsx`:
    - `MarkdownView` for `.md` files, a code view for text, plus images and PDFs in an iframe.
    - An edit toggle that saves through the bkt `/write-text` route.
  - `ContextMenu.tsx`: rename, copy, move to (`FolderPickerDialog`), unzip, download as zip and
    delete (core).
- `tests/plugins/bkt_files/test_ops.py` covers:
  - Move, copy and rename, including the conflict modes.
  - Moving into a descendant is refused. So is leaving `locked_root` (with
    `HERMES_DASHBOARD_FILES_ROOT` set), and so is moving the Hermes home or a profile home.
  - Renaming `.env` to `env.txt` is refused. Copying `.env` or `auth.json` is refused. A zip of
    the Hermes home contains no `.env`, `auth.json`, `mcp-tokens/` or `pairing/` entry.
  - A zip of a folder that contains a symlink to `auth.json` does not include its target.
  - A copy refuses a live SQLite database.
  - Zip-slip, symlink-member and zip-bomb archives are rejected. An unzip into a destination
    that holds a symlinked subfolder writes nothing outside the root.
  - Unzip and copy into a Hermes `plugins/` directory are refused.
  - `/write-text` respects `locked_root` and the sensitive guard, and returns 409 on a stale
    `expected_mtime`.
  - Windows-reserved names are rejected.
  - Separator handling is checked on both operating systems, with
    `@pytest.mark.platforms(...)` for the host-specific cases.

## Steps

1. Read `web_server_files.py:22-372`, `files.py:60-290` and `files.py:515-900`, and
   `hermes_cli/archive_safe.py`. Record every helper in `UPSTREAM-SEAMS.md`.
2. Write the backend tests first, with each guard red before it passes, then the routes.
3. Build the UI. Reuse the core upload-stream, download and delete endpoints rather than
   copying them.
4. Run end to end on Windows (backslash paths, drive letters) and on WSL.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_files` is green.
- Uploading a three-level folder rebuilds the same tree.
- An archive built to escape its destination returns 400 and writes nothing.
- A zip of the Hermes home holds no credential file.

## Risks

- The private `_`-prefixed helpers may be renamed upstream. They are listed in seams, and the
  phase 8 import test catches a rename.
- Large unzips are costly. The caps above are the mitigation.
- The agent can still create a symlink between the final `realpath` check and the write. That
  window is accepted, because the agent already has filesystem access of its own.
