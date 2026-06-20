"""
Integration tests for the Rhoda backend API.
Run: python -m pytest server/test_api.py -v
Or:  cd server && python test_api.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app import app


def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_health():
    c = client()
    r = c.get("/api/health")
    assert r.status_code == 200
    data = r.get_json()
    assert data["status"] == "ok"
    assert "instrument" in data
    assert "session_logs" in data


def test_instrument_state_read():
    c = client()
    r = c.get("/api/instrument/state?scope=all")
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True
    assert data["category"] == "READ"
    assert data["result"] is not None


def test_instrument_set_requires_confirmation():
    c = client()
    r = c.post("/api/instrument/set", json={
        "path": "channel.1.vertical_scale",
        "value": 2.0,
        "confirmed": False,
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data["needsConfirmation"] is True
    assert data["confirmationId"] is not None


def test_instrument_set_confirmed():
    c = client()
    # First get a confirmation ID
    r1 = c.post("/api/instrument/set", json={
        "path": "channel.1.vertical_scale",
        "value": 2.0,
        "confirmed": False,
    })
    cid = r1.get_json()["confirmationId"]

    # Now confirm
    r2 = c.post("/api/instrument/confirm", json={
        "path": "channel.1.vertical_scale",
        "value": 2.0,
        "confirmationId": cid,
    })
    assert r2.status_code == 200
    data = r2.get_json()
    assert data["ok"] is True


def test_instrument_measure():
    c = client()
    r = c.post("/api/instrument/measure", json={
        "measurementType": "frequency",
        "source": "CH1",
        "confirmed": True,
        "confirmationId": "skip",
    })
    assert r.status_code == 200


def test_instrument_discover():
    c = client()
    r = c.get("/api/instrument/discover")
    assert r.status_code == 200
    data = r.get_json()
    assert "resources" in data
    assert "count" in data


def test_session_log_and_retrieve():
    c = client()
    r1 = c.post("/api/session/log", json={
        "session_id": "test-123",
        "role": "user",
        "content": "How do I measure frequency?",
    })
    assert r1.status_code == 200
    assert r1.get_json()["ack"] is True

    r2 = c.get("/api/session/logs?session_id=test-123")
    assert r2.status_code == 200
    logs = r2.get_json()["logs"]
    assert len(logs) >= 1
    assert logs[-1]["content"] == "How do I measure frequency?"


def test_session_transcript_export():
    c = client()
    c.post("/api/session/log", json={
        "session_id": "test-export",
        "role": "user",
        "content": "test message",
    })
    r = c.get("/api/session/transcript?session_id=test-export")
    assert r.status_code == 200
    assert r.content_type == "text/plain; charset=utf-8"
    assert b"test message" in r.data


def test_session_progress():
    c = client()
    # Log enough data for progress tracking
    for content in ["trigger edge rising", "trigger level auto", "trigger source CH1"]:
        c.post("/api/session/log", json={
            "session_id": "test-progress",
            "role": "user",
            "content": content,
        })
    r = c.get("/api/session/progress?session_id=test-progress")
    assert r.status_code == 200
    data = r.get_json()
    assert "topic_scores" in data
    assert "recommended_next" in data


def test_failure_points():
    c = client()
    r = c.get("/api/session/failure-points")
    assert r.status_code == 200
    data = r.get_json()
    assert "total_errors" in data
    assert "common_faults" in data


def test_rag_retrieve():
    c = client()
    r = c.post("/api/rag/retrieve", json={
        "query": "how to measure a sine wave",
        "top_k": 3,
    })
    assert r.status_code == 200
    data = r.get_json()
    assert "chunks" in data


if __name__ == "__main__":
    passed = 0
    failed = 0
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test_fn in tests:
        name = test_fn.__name__
        try:
            test_fn()
            print(f"  PASS  {name}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {name}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed out of {passed + failed}")
    sys.exit(1 if failed else 0)
