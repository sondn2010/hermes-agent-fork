"""Behaviour contract of the per-profile bkt-dia run log (``plugins.bkt_dia_common.run_log``)."""

from __future__ import annotations

import sqlite3

from plugins.bkt_dia_common import run_log


def _entry(**overrides) -> dict:
    entry = {"module": "bkt-dia-enterprise-profile", "tool": "bkt_dia_enterprise_profile_lookup",
             "source": "agent", "ok": True, "stage": None, "error": None, "duration_ms": 12,
             "question": "Hồ sơ doanh nghiệp ACME"}
    entry.update(overrides)
    return entry


def test_recent_returns_newest_first_with_contract_fields(hermes_home):
    run_log.record(_entry(source="agent"))
    run_log.record(_entry(source="console", ok=False, stage="http", error="HTTP 503"))

    runs = run_log.recent()

    assert [r["source"] for r in runs] == ["console", "agent"]
    assert set(runs[0]) == {"id", "at", "module", "tool", "source", "ok", "stage", "error", "duration_ms",
                            "question_preview"}
    assert runs[0]["ok"] is False and runs[0]["stage"] == "http"
    assert runs[1]["ok"] is True and runs[1]["question_preview"] == "Hồ sơ doanh nghiệp ACME"


def test_preview_is_capped_and_redacted(hermes_home):
    secret = "sk-proj-" + "A1b2C3d4E5f6G7h8I9j0" * 2
    run_log.record(_entry(question=f"use key {secret} " + "x" * 500))

    preview = run_log.recent()[0]["question_preview"]

    assert len(preview) == run_log.PREVIEW_CHARS
    assert secret not in preview


def test_missing_question_stores_no_preview(hermes_home):
    run_log.record(_entry(question=None))

    assert run_log.recent()[0]["question_preview"] is None


def test_log_prunes_to_max_rows_keeping_the_newest(hermes_home):
    total = run_log.MAX_ROWS + run_log.PRUNE_SLACK + 1
    for index in range(total):
        run_log.record(_entry(tool=f"t{index}"))

    runs = run_log.recent(limit=run_log.MAX_ROWS)

    assert len(runs) == run_log.MAX_ROWS
    assert runs[0]["tool"] == f"t{total - 1}"
    with sqlite3.connect(hermes_home / "plugin-data" / "bkt-dia-common" / run_log.DB_FILENAME) as conn:
        assert conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == run_log.MAX_ROWS


def test_limit_is_clamped(hermes_home):
    for _ in range(3):
        run_log.record(_entry())

    assert len(run_log.recent(limit=2)) == 2
    assert len(run_log.recent(limit=0)) == 1


def test_each_home_keeps_its_own_log(hermes_home, tmp_path, monkeypatch):
    run_log.record(_entry(tool="first-home"))
    other = tmp_path / "other-home"
    other.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(other))

    assert run_log.recent() == []
    run_log.record(_entry(tool="second-home"))
    assert [r["tool"] for r in run_log.recent()] == ["second-home"]

    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    assert [r["tool"] for r in run_log.recent()] == ["first-home"]


def test_storage_failure_never_raises(hermes_home, monkeypatch):
    def broken_open():
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(run_log, "_open", broken_open)

    run_log.record(_entry())
    assert run_log.recent() == []


def test_unwritable_plugin_data_never_breaks_the_caller(hermes_home):
    # A file where the plugin-data directory belongs makes directory creation raise OSError.
    (hermes_home / "plugin-data").write_text("not a directory", encoding="utf-8")

    run_log.record(_entry())

    assert run_log.recent() == []
