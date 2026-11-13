"""Pairing approval from the bkt-profiles workbench lands in the selected profile's store.

The workbench sends approve/revoke through ``profileRequest`` (``bkt/shared/api.ts``), which puts
the profile in the JSON body (the field ``PairingApprove``/``PairingRevoke`` read) and repeats it
as ``?profile=``. This drives the real dashboard app with that exact request shape for a profile
that is not the launch profile.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def client(_isolate_hermes_home):
    from starlette.testclient import TestClient

    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN, app
    from hermes_constants import get_hermes_home

    work = get_hermes_home() / "profiles" / "work"
    work.mkdir(parents=True)
    (work / "config.yaml").write_text("{}\n")  # profile identity marker
    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    return c


def _approved(store, platform: str) -> list[str]:
    return sorted(row["user_id"] for row in store.list_approved(platform))


def test_approve_and_revoke_on_named_profile_leave_launch_store_unchanged(client):
    from gateway.pairing import PairingStore

    launch, work = PairingStore(), PairingStore(profile="work")
    launch.generate_code("telegram", "launch-user", "Launch")
    work.generate_code("telegram", "work-user", "Work")
    launch_pending_before = [row["user_id"] for row in launch.list_pending("telegram")]
    launch_approved_before = _approved(launch, "telegram")

    listed = client.get("/api/pairing?profile=work").json()["pending"]
    assert [row["user_id"] for row in listed] == ["work-user"]

    approve = client.post(
        "/api/pairing/approve?profile=work",
        json={"platform": "telegram", "request_id": listed[0]["request_id"], "profile": "work"},
    )
    assert approve.status_code == 200, approve.text
    assert work.is_approved("telegram", "work-user") is True

    assert launch.is_approved("telegram", "work-user") is False
    assert [row["user_id"] for row in launch.list_pending("telegram")] == launch_pending_before
    assert _approved(launch, "telegram") == launch_approved_before

    revoke = client.post(
        "/api/pairing/revoke?profile=work",
        json={"platform": "telegram", "user_id": "work-user", "profile": "work"},
    )
    assert revoke.status_code == 200, revoke.text
    assert work.is_approved("telegram", "work-user") is False
    assert [row["user_id"] for row in launch.list_pending("telegram")] == launch_pending_before
