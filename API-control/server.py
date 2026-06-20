"""
Flask API server wrapping William's oscilloscope control layer.
Exposes read_state, set_parameter, run_measurement, and confirm endpoints.
Runs in mock mode by default; set SCOPE_RESOURCE env var for real hardware.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS

from api_control.scope_client import build_mock_client, build_rs_instrument_client

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


@app.route("/api/state", methods=["GET"])
def read_state():
    scope = request.args.get("scope", "all")
    r = client.read_state(scope=scope)
    return jsonify(result_to_dict(r))


@app.route("/api/set", methods=["POST"])
def set_parameter():
    data = request.get_json(force=True)
    path = data.get("path", "")
    value = data.get("value")
    confirmed = data.get("confirmed", False)
    confirmation_id = data.get("confirmationId")
    r = client.set_parameter(
        path=path,
        value=value,
        confirmed=confirmed,
        confirmation_id=confirmation_id,
    )
    return jsonify(result_to_dict(r))


@app.route("/api/measure", methods=["POST"])
def run_measurement():
    data = request.get_json(force=True)
    measurement_type = data.get("measurementType", "frequency")
    source = data.get("source")
    gate = data.get("gate")
    confirmed = data.get("confirmed", False)
    confirmation_id = data.get("confirmationId")
    r = client.run_measurement(
        measurement_type=measurement_type,
        source=source,
        gate=gate,
        confirmed=confirmed,
        confirmation_id=confirmation_id,
    )
    return jsonify(result_to_dict(r))


@app.route("/api/confirm", methods=["POST"])
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


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "mode": "mock" if not resource else "hardware"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
