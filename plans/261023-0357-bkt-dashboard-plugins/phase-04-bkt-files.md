---
phase: 4
title: "bkt-files"
status: pending
priority: P1
effort: "2d"
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

- The core endpoints are list, read, download, stream, upload, upload-stream, mkdir, delete
  (`hermes_cli/web_routers/files.py:515-770`), and `fs/write-text`.
- Core has no move, rename, copy, unzip or zip endpoints.
- The policy lives in `hermes_cli/web_server_files.py`. The relevant names are
  `ManagedFilesPolicy`, `_managed_files_policy(request)`, `_resolve_managed_path` and
  `_path_is_under`.
- Every new route resolves both source and destination through the same policy, so `locked_root`
  and the blocked trees hold.

## Files to create

- `plugins/bkt-files/dashboard/manifest.json` declares the `/bkt-files` tab, placed
  `after:files`, with icon `FolderOpen`.
- `plugins/bkt-files/dashboard/plugin_api.py`:
  - `POST /move` takes `{sources[], dest_dir, on_conflict: fail|rename|overwrite}`. It refuses
    to move a folder into itself or into one of its descendants, and refuses to move the locked
    root.
  - `POST /rename` takes `{path, new_name}` and rejects separators, `..` and Windows-reserved
    names.
  - `POST /copy` takes `{sources[], dest_dir, on_conflict}`.
  - `POST /unzip` takes `{path, dest_dir?, on_conflict}` and guards it:
    - Zip-slip: every member path must stay under `dest`.
    - Symlink members are rejected.
    - Total uncompressed size and member count are capped, and the compression ratio is checked.
  - `POST /zip` takes `{paths[]}` and streams a zip archive. It skips any entry blocked by the
    policy.
  - `POST /upload-tree` takes multipart files with `relative_path`. It creates intermediate
    directories through the policy and reuses the core upload-stream size limit.
  - `GET /search?root=&q=` is a bounded name search with a result cap and a timeout.
  - The heavy operations run through `asyncio.to_thread` so they do not block the event loop.
- `bkt/packages/files/src/` contains:
  - `index.tsx`: a tree, a list and a preview pane.
  - `useSelection.ts`: multi-select with shift and ctrl.
  - `DragMove.tsx`: drag from the list onto a folder or breadcrumb, with a drop highlight.
  - `UploadTree.tsx`: folder upload through `webkitdirectory` and folder drops from the OS
    through `DataTransferItem.webkitGetAsEntry`. It shows a progress list.
  - `PreviewPane.tsx`: `MarkdownView` for `.md` files, a code view for text, plus images, PDFs
    in an iframe, and an edit toggle that saves through core `fs/write-text`.
  - `ContextMenu.tsx`: rename, copy, move to (`FolderPickerDialog`), unzip, download as zip and
    delete (core).
- `tests/plugins/bkt_files/test_ops.py` covers:
  - Move, copy and rename, including the conflict modes.
  - Moving into a descendant is refused, and so is leaving `locked_root`.
  - Zip-slip, symlink and zip-bomb archives are rejected.
  - `upload-tree` paths with `..` and absolute paths are rejected.
  - Windows-reserved names are rejected.
  - Separator handling is checked on both operating systems with
    `@pytest.mark.platforms(...)` for the host-specific cases.

## Steps

1. Read `web_server_files.py:22-372` and `files.py:515-770`. Record the helpers in
   `UPSTREAM-SEAMS.md`.
2. Write the backend tests first, each guard red before it passes, then the routes.
3. Build the UI. Reuse the core download and delete endpoints rather than copying them.
4. Run end to end on Windows (backslash paths, drive letters) and on WSL.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_files` is green.
- Uploading a three-level folder rebuilds the same tree.
- An archive built to escape its destination returns 400 and writes nothing.

## Risks

- The private `_`-prefixed helpers may be renamed upstream. They are listed in seams, and the
  phase 8 import test catches a rename.
- Large unzips are costly. The caps above are the mitigation.
