"""
Rhoda Lab Assistant — Unified Backend

Combines:
  - Instrument control (William) — mock or real R&S oscilloscope via RsInstrument
  - RAG retrieval (Gregory) — procedure/safety/fault corpus with sentence-transformers
  - Session logging + progress tracking
  - Conversation transcript export

Start: python server/app.py
Or:    ./start.sh (runs backend + frontend in parallel)
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, request, Response
from flask_cors import CORS

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# Instrument API (William's ScopeClient)
# ─────────────────────────────────────────────

from instrument.scope_client import build_mock_client, build_rs_instrument_client, discover_usb_instruments

SCOPE_RESOURCE = os.environ.get("SCOPE_RESOURCE")
SCOPE_SIMULATE = os.environ.get("SCOPE_SIMULATE", "").lower() in ("1", "true", "yes")
if SCOPE_RESOURCE:
    print(f"🔬 Instrument: connecting to {SCOPE_RESOURCE}" + (" (simulation)" if SCOPE_SIMULATE else ""))
    try:
        scope = build_rs_instrument_client(SCOPE_RESOURCE, simulate=SCOPE_SIMULATE)
    except Exception as e:
        print(f"🔬 Instrument: connection failed — {e}")
        print("🔬 Instrument: falling back to simulator")
        scope = build_mock_client()
else:
    print("🔬 Instrument: simulator (set SCOPE_RESOURCE=USB for real hardware)")
    scope = build_mock_client()


def _op(r):
    return {
        "ok": r.ok, "name": r.name, "category": r.category,
        "needsConfirmation": r.needsConfirmation,
        "confirmationId": r.confirmationId,
        "summary": r.summary, "result": r.result, "error": r.error,
    }


@app.route("/api/instrument/state", methods=["GET"])
@app.route("/api/state", methods=["GET"])
def instrument_state():
    return jsonify(_op(scope.read_state(scope=request.args.get("scope", "all"))))


@app.route("/api/instrument/set", methods=["POST"])
@app.route("/api/set", methods=["POST"])
def instrument_set():
    d = request.get_json(force=True)
    return jsonify(_op(scope.set_parameter(
        path=d.get("path", ""), value=d.get("value"),
        confirmed=d.get("confirmed", False),
        confirmation_id=d.get("confirmationId"),
    )))


@app.route("/api/instrument/measure", methods=["POST"])
@app.route("/api/measure", methods=["POST"])
def instrument_measure():
    d = request.get_json(force=True)
    return jsonify(_op(scope.run_measurement(
        measurement_type=d.get("measurementType", "frequency"),
        source=d.get("source"), gate=d.get("gate"),
        confirmed=d.get("confirmed", False),
        confirmation_id=d.get("confirmationId"),
    )))


@app.route("/api/instrument/confirm", methods=["POST"])
@app.route("/api/confirm", methods=["POST"])
def instrument_confirm():
    d = request.get_json(force=True)
    return jsonify(_op(scope.set_parameter(
        path=d.get("path", ""), value=d.get("value"),
        confirmed=True, confirmation_id=d.get("confirmationId"),
    )))


@app.route("/api/instrument/discover", methods=["GET"])
def instrument_discover():
    resources = discover_usb_instruments()
    return jsonify({"resources": resources, "count": len(resources)})


# ─────────────────────────────────────────────
# RAG Retrieval (Gregory's RetrievalIndex)
# ─────────────────────────────────────────────

rag_index = None
try:
    from rag.rag import RetrievalIndex
    corpus_dir = ROOT / "rag" / "corpus"
    if corpus_dir.exists() and any(corpus_dir.glob("*/*.md")):
        rag_index = RetrievalIndex(corpus_dir=corpus_dir)
        print(f"📚 RAG: {len(rag_index.docs)} docs loaded from {corpus_dir}")
    else:
        print(f"📚 RAG: no corpus found at {corpus_dir}")
except ImportError as e:
    print(f"📚 RAG: sentence-transformers not installed ({e})")
except Exception as e:
    print(f"📚 RAG: failed ({e})")


@app.route("/api/rag/retrieve", methods=["POST"])
def rag_retrieve():
    if not rag_index:
        return jsonify({"chunks": []})
    d = request.get_json(force=True)
    return jsonify(rag_index.retrieve(
        query=d.get("query", ""),
        top_k=d.get("top_k", 3),
        category=d.get("category"),
    ))


# ─────────────────────────────────────────────
# Session Logging + Transcript Export
# ─────────────────────────────────────────────

session_logs: list[dict] = []


@app.route("/api/session/log", methods=["POST"])
def log_event():
    d = request.get_json(force=True)
    d["server_timestamp"] = datetime.utcnow().isoformat() + "Z"
    session_logs.append(d)
    return jsonify({"ack": True, "count": len(session_logs)})


@app.route("/api/session/logs", methods=["GET"])
def get_logs():
    sid = request.args.get("session_id")
    logs = [l for l in session_logs if not sid or l.get("session_id") == sid]
    return jsonify({"logs": logs, "count": len(logs)})


@app.route("/api/session/transcript", methods=["GET"])
def export_transcript():
    sid = request.args.get("session_id")
    logs = [l for l in session_logs if not sid or l.get("session_id") == sid]
    lines = []
    for l in logs:
        role = l.get("role", "?").upper()
        content = l.get("content", "")
        ts = l.get("timestamp", l.get("server_timestamp", ""))
        tool = l.get("tool_call")
        if tool:
            lines.append(f"[{ts}] TOOL: {tool.get('name','')} ({tool.get('category','')}) confirmed={l.get('confirmed','')}")
        else:
            lines.append(f"[{ts}] {role}: {content}")
    text = "\n".join(lines)
    return Response(text, mimetype="text/plain",
                    headers={"Content-Disposition": f"attachment; filename=transcript_{sid or 'all'}.txt"})


# ─────────────────────────────────────────────
# Progress Tracking
# ─────────────────────────────────────────────

TOPIC_KEYWORDS = {
    "probe_compensation": ["probe", "compensation", "calibrat", "trimmer"],
    "vertical_scale": ["vertical", "v/div", "volts", "amplitude", "scale"],
    "timebase": ["timebase", "time/div", "horizontal", "sweep"],
    "triggering": ["trigger", "edge", "level", "slope"],
    "measurements": ["measure", "frequency", "period", "peak", "rms"],
    "safety": ["safety", "voltage limit", "ground", "overload", "warning"],
    "troubleshooting": ["noise", "clip", "alias", "drift", "fault", "fix"],
}


@app.route("/api/session/progress", methods=["GET"])
def get_progress():
    sid = request.args.get("session_id")
    logs = [l for l in session_logs if not sid or l.get("session_id") == sid]

    topic_scores: dict[str, int] = {}
    for log in logs:
        content = (log.get("content", "") or "").lower()
        for topic, keywords in TOPIC_KEYWORDS.items():
            if any(kw in content for kw in keywords):
                topic_scores[topic] = topic_scores.get(topic, 0) + 1

    covered = [t for t, s in topic_scores.items() if s >= 2]
    curriculum = ["safety", "probe_compensation", "vertical_scale", "timebase", "triggering", "measurements", "troubleshooting"]
    next_topic = next((t for t in curriculum if topic_scores.get(t, 0) < 2), curriculum[0])

    return jsonify({
        "session_id": sid,
        "total_turns": len(logs),
        "topic_scores": topic_scores,
        "topics_covered": covered,
        "recommended_next": next_topic,
    })


# ─────────────────────────────────────────────
# Failure Points (Instructor View)
# ─────────────────────────────────────────────

@app.route("/api/session/failure-points", methods=["GET"])
def failure_points():
    errors = [l for l in session_logs if
              l.get("role") == "system" and "error" in (l.get("content", "") or "").lower()]
    faults = [l for l in session_logs if
              l.get("topic") == "troubleshooting" or "fault" in (l.get("content", "") or "").lower()]
    denied = [l for l in session_logs if l.get("confirmed") is False]

    fault_counts: dict[str, int] = {}
    for f in faults:
        content = (f.get("content", "") or "")[:80]
        fault_counts[content] = fault_counts.get(content, 0) + 1

    return jsonify({
        "total_errors": len(errors),
        "total_faults": len(faults),
        "total_denied_actions": len(denied),
        "common_faults": sorted(fault_counts.items(), key=lambda x: x[1], reverse=True)[:10],
        "recent_errors": errors[-10:],
    })


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "instrument": "hardware" if SCOPE_RESOURCE else "mock",
        "rag": f"{len(rag_index.docs)} docs" if rag_index else "disabled",
        "session_logs": len(session_logs),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"\n{'='*44}")
    print(f"  Rhoda Backend — http://0.0.0.0:{port}")
    print(f"  Instrument: {'hardware (' + SCOPE_RESOURCE + ')' if SCOPE_RESOURCE else 'mock'}")
    print(f"  RAG: {len(rag_index.docs) if rag_index else 0} docs")
    print(f"{'='*44}\n")
    app.run(host="0.0.0.0", port=port, debug=True)
