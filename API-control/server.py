"""
Flask API server wrapping William's oscilloscope control layer.
Exposes read_state, set_parameter, run_measurement, and confirm endpoints.
Runs in mock mode by default; set SCOPE_RESOURCE env var for real hardware.

Serves both original paths (/api/state) and unified paths (/api/instrument/state)
so the frontend works regardless of which server is running.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS

from api_control.scope_client import (
    build_mock_client,
    build_rs_instrument_client,
    discover_usb_instruments,
)

app = Flask(__name__)
CORS(app)

resource = os.environ.get("SCOPE_RESOURCE")
if resource:
    print(f"Connecting to real instrument: {resource}")
    client = build_rs_instrument_client(resource)
else:
    print("No SCOPE_RESOURCE set — running in mock mode")
    client = build_mock_client()


def result_to_dict(r):
    return {
        "ok": r.ok,
        "name": r.name,
        "category": r.category,
        "needsConfirmation": r.needsConfirmation,
        "confirmationId": r.confirmationId,
        "summary": r.summary,
        "result": r.result,
        "error": r.error,
    }


# ─── Instrument endpoints (both path styles) ───

@app.route("/api/state", methods=["GET"])
@app.route("/api/instrument/state", methods=["GET"])
def read_state():
    scope = request.args.get("scope", "all")
    r = client.read_state(scope=scope)
    return jsonify(result_to_dict(r))


@app.route("/api/set", methods=["POST"])
@app.route("/api/instrument/set", methods=["POST"])
def set_parameter():
    data = request.get_json(force=True)
    r = client.set_parameter(
        path=data.get("path", ""),
        value=data.get("value"),
        confirmed=data.get("confirmed", False),
        confirmation_id=data.get("confirmationId"),
    )
    return jsonify(result_to_dict(r))


@app.route("/api/measure", methods=["POST"])
@app.route("/api/instrument/measure", methods=["POST"])
def run_measurement():
    data = request.get_json(force=True)
    r = client.run_measurement(
        measurement_type=data.get("measurementType", "frequency"),
        source=data.get("source"),
        gate=data.get("gate"),
        confirmed=data.get("confirmed", False),
        confirmation_id=data.get("confirmationId"),
    )
    return jsonify(result_to_dict(r))


@app.route("/api/confirm", methods=["POST"])
@app.route("/api/instrument/confirm", methods=["POST"])
def confirm():
    data = request.get_json(force=True)
    confirmation_id = data.get("confirmationId")
    action = data.get("action", "set_parameter")
    path = data.get("path", "")
    value = data.get("value")

    if action == "set_parameter":
        r = client.set_parameter(
            path=path,
            value=value,
            confirmed=True,
            confirmation_id=confirmation_id,
        )
    else:
        r = client.run_measurement(
            measurement_type=path,
            confirmed=True,
            confirmation_id=confirmation_id,
        )
    return jsonify(result_to_dict(r))


@app.route("/api/instrument/discover", methods=["GET"])
def discover():
    resources = discover_usb_instruments()
    return jsonify({"resources": resources, "count": len(resources)})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "instrument": "hardware" if resource else "mock",
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"\n{'='*44}")
    print(f"  API Control — http://0.0.0.0:{port}")
    print(f"  Instrument: {'hardware (' + resource + ')' if resource else 'mock'}")
    print(f"{'='*44}\n")
    app.run(host="0.0.0.0", port=port, debug=True)
