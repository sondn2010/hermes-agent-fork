"""Every Python internal listed in bkt/UPSTREAM-SEAMS.md still imports, so an upstream rename
fails here instead of inside a plugin route at runtime."""

from __future__ import annotations

import importlib
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SEAMS = REPO / "bkt" / "UPSTREAM-SEAMS.md"
_MODULE = re.compile(r"^`([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)`$")
_SYMBOL = re.compile(r"`([A-Za-z_]\w*)`")


def _python_seams() -> list[tuple[str, str]]:
    seams = []
    for line in SEAMS.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2 or not (module := _MODULE.match(cells[0])):
            continue
        root = module.group(1).split(".")[0]
        if not ((REPO / root / "__init__.py").is_file() or (REPO / f"{root}.py").is_file()):
            continue  # a browser global or TypeScript path, not a Python import
        seams.extend((module.group(1), symbol) for symbol in _SYMBOL.findall(cells[1]))
    return seams


SEAM_LIST = _python_seams()


def test_seams_file_lists_python_imports():
    assert SEAM_LIST, "no Python module rows parsed from UPSTREAM-SEAMS.md"


@pytest.mark.parametrize(("module", "symbol"), SEAM_LIST, ids=[f"{m}:{s}" for m, s in SEAM_LIST])
def test_seam_still_exists(module, symbol):
    assert hasattr(importlib.import_module(module), symbol), f"{module}.{symbol} is gone"
