from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Protocol


class ScopeBackend(Protocol):
    def read_state(
        self,
        scope: str,
        keys: list[str] | None = None,
    ) -> dict[str, Any]:
        ...

    def set_parameter(self, path: str, value: Any) -> None:
        ...

    def run_measurement(
        self,
        measurement_type: str,
        source: str | None = None,
        gate: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ...


@dataclass
class MockScopeBackend:
    state: Dict[str, Any] = field(default_factory=lambda: {
        "instrument_id": "R&S RTB24 (mock)",
        "acquisition_state": "stopped",
        "horizontal_record_length": 1_000_000,
        "channels": {
            1: {
                "enabled": True,
                "vertical_scale": 0.5,
                "offset": 0.0,
                "coupling": "DC",
            },
            2: {
                "enabled": False,
                "vertical_scale": 1.0,
                "offset": 0.0,
                "coupling": "DC",
            },
        },
        "trigger": {"source": "CH1", "level": 0.0, "edge": "rising"},
    })

    def read_state(
        self,
        scope: str,
        keys: list[str] | None = None,
    ) -> dict[str, Any]:
        if scope == "all":
            return dict(self.state)
        if scope == "acquisition":
            return {
                "acquisition_state": self.state["acquisition_state"],
                "horizontal_record_length": (
                    self.state["horizontal_record_length"]
                ),
            }
        if scope == "channel":
            return {"channels": self.state["channels"]}
        if scope == "trigger":
            return {"trigger": self.state["trigger"]}
        if keys:
            return {key: self.state.get(key) for key in keys}
        return dict(self.state)

    def set_parameter(self, path: str, value: Any) -> None:
        if path == "acquisition.state":
            self.state["acquisition_state"] = value
            return
        if path == "timebase.record_length":
            self.state["horizontal_record_length"] = value
            return
        if path.startswith("channel."):
            _, channel_text, field_name = path.split(".", 2)
            channel = int(channel_text)
            self.state["channels"][channel][field_name] = value
            return
        if path.startswith("trigger."):
            _, field_name = path.split(".", 1)
            self.state["trigger"][field_name] = value
            return
        self.state[path] = value

    def run_measurement(
        self,
        measurement_type: str,
        source: str | None = None,
        gate: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        base_value = {
            "frequency": 1_000.0,
            "peak_to_peak": 2.0,
            "rms": 0.707,
            "rise_time": 12e-9,
            "fall_time": 12e-9,
            "delay": 0.0,
            "cursor": 0.0,
        }.get(measurement_type, 0.0)
        return {
            "measurement_type": measurement_type,
            "source": source or "CH1",
            "gate": gate,
            "value": base_value,
            "unit": {
                "frequency": "Hz",
                "peak_to_peak": "V",
                "rms": "V",
                "rise_time": "s",
                "fall_time": "s",
                "delay": "s",
                "cursor": "arb.",
            }.get(measurement_type, "arb."),
            "status": "mock",
        }
