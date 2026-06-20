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
        "timebase_scale": 0.001,
        "channels": {
            1: {
                "enabled": True,
                "vertical_scale": 0.5,
                "offset": 0.0,
                "coupling": "DC",
                "probe_attenuation": "10X",
            },
            2: {
                "enabled": False,
                "vertical_scale": 1.0,
                "offset": 0.0,
                "coupling": "DC",
                "probe_attenuation": "10X",
            },
        },
        "trigger": {"source": "CH1", "level": 0.0, "edge": "rising", "mode": "auto"},
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
                "horizontal_record_length": self.state["horizontal_record_length"],
                "timebase_scale": self.state["timebase_scale"],
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
        if path == "timebase.scale":
            self.state["timebase_scale"] = value
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


class RsInstrumentBackend:
    """Backend that talks to a real R&S oscilloscope via RsInstrument / SCPI."""

    def __init__(self, instrument: Any) -> None:
        self._inst = instrument
        self._idn = ""
        try:
            self._idn = self._inst.query_str("*IDN?").strip()
        except Exception:
            pass

    def read_state(
        self,
        scope: str,
        keys: list[str] | None = None,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {"instrument_id": self._idn}

        if scope in ("all", "acquisition"):
            result["acquisition_state"] = self._query_safe("ACQuire:STATe?", "unknown")
            result["timebase_scale"] = self._query_float("TIMebase:SCALe?", 0.001)
            result["horizontal_record_length"] = self._query_int("ACQuire:POINts:VALue?", 1000000)

        if scope in ("all", "channel"):
            channels: dict[int, dict] = {}
            for ch in (1, 2, 3, 4):
                try:
                    enabled = self._query_safe(f"CHANnel{ch}:STATe?", "0")
                    channels[ch] = {
                        "enabled": enabled.strip() in ("1", "ON"),
                        "vertical_scale": self._query_float(f"CHANnel{ch}:SCALe?", 1.0),
                        "offset": self._query_float(f"CHANnel{ch}:OFFSet?", 0.0),
                        "coupling": self._query_safe(f"CHANnel{ch}:COUPling?", "DC"),
                    }
                except Exception:
                    channels[ch] = {"enabled": False, "vertical_scale": 1.0, "offset": 0.0, "coupling": "DC"}
            result["channels"] = channels

        if scope in ("all", "trigger"):
            result["trigger"] = {
                "source": self._query_safe("TRIGger:A:SOURce?", "CH1"),
                "level": self._query_float("TRIGger:A:LEVel1:VALue?", 0.0),
                "edge": self._query_safe("TRIGger:A:EDGE:SLOPe?", "POS"),
                "mode": self._query_safe("TRIGger:A:MODE?", "AUTO"),
            }

        return result

    def set_parameter(self, path: str, value: Any) -> None:
        scpi = self._resolve_scpi(path, value)
        self._inst.write_str(scpi)

    def run_measurement(
        self,
        measurement_type: str,
        source: str | None = None,
        gate: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if source:
            try:
                self._inst.write_str(f"MEASurement1:SOURce {source}")
            except Exception:
                pass

        meas_type_map = {
            "frequency": "FREQuency",
            "peak_to_peak": "PEAK",
            "rms": "RMS",
            "rise_time": "RTIMe",
            "fall_time": "FTIMe",
        }
        scpi_type = meas_type_map.get(measurement_type, measurement_type.upper())
        try:
            self._inst.write_str(f"MEASurement1:MAIN {scpi_type}")
            self._inst.write_str("MEASurement1:STATe ON")
        except Exception:
            pass

        try:
            raw = self._inst.query_str("MEASurement1:RESult:ACTual?").strip()
            val = float(raw) if raw else 0.0
        except Exception:
            val = 0.0

        unit_map = {
            "frequency": "Hz", "peak_to_peak": "V", "rms": "V",
            "rise_time": "s", "fall_time": "s",
        }
        return {
            "measurement_type": measurement_type,
            "source": source or "CH1",
            "gate": gate,
            "value": val,
            "unit": unit_map.get(measurement_type, "arb."),
            "status": "hardware",
        }

    def _resolve_scpi(self, path: str, value: Any) -> str:
        """Convert dot-notation path to proper RTB24 SCPI command."""
        if path == "acquisition.state":
            return "RUN" if str(value).upper() in ("RUN", "RUNNING", "1", "TRUE") else "STOP"

        scpi_map = {
            "channel.{ch}.enabled": "CHANnel{ch}:STATe",
            "channel.{ch}.vertical_scale": "CHANnel{ch}:SCALe",
            "channel.{ch}.offset": "CHANnel{ch}:OFFSet",
            "channel.{ch}.coupling": "CHANnel{ch}:COUPling",
            "channel.{ch}.probe_attenuation": "CHANnel{ch}:PROBe:SETup:ATTenuation:MANual",
            "trigger.source": "TRIGger:A:SOURce",
            "trigger.level": "TRIGger:A:LEVel1:VALue",
            "trigger.edge": "TRIGger:A:EDGE:SLOPe",
            "trigger.mode": "TRIGger:A:MODE",
            "timebase.scale": "TIMebase:SCALe",
            "timebase.record_length": "ACQuire:POINts:VALue",
        }

        ch = self._extract_channel(path)
        for pattern, scpi_template in scpi_map.items():
            if self._path_matches(pattern, path):
                scpi = scpi_template.replace("{ch}", str(ch))
                if isinstance(value, bool):
                    return f"{scpi} {'ON' if value else 'OFF'}"
                return f"{scpi} {value}"

        return f"{path} {value}"

    def _query_safe(self, cmd: str, default: str) -> str:
        try:
            return self._inst.query_str(cmd).strip()
        except Exception:
            return default

    def _query_float(self, cmd: str, default: float) -> float:
        try:
            return float(self._inst.query_str(cmd).strip())
        except Exception:
            return default

    def _query_int(self, cmd: str, default: int) -> int:
        try:
            return int(float(self._inst.query_str(cmd).strip()))
        except Exception:
            return default

    @staticmethod
    def _path_matches(pattern: str, path: str) -> bool:
        p_parts = pattern.split(".")
        v_parts = path.split(".")
        if len(p_parts) != len(v_parts):
            return False
        for pp, vp in zip(p_parts, v_parts):
            if pp.startswith("{") and pp.endswith("}"):
                continue
            if pp != vp:
                return False
        return True

    @staticmethod
    def _extract_channel(path: str) -> int:
        for p in path.split("."):
            try:
                return int(p)
            except ValueError:
                continue
        return 1
