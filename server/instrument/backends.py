"""
Instrument backends for the Rhoda Lab Assistant.

MockScopeBackend: in-memory simulator, no hardware needed.
RsInstrumentBackend: talks to a real R&S RTB2 via RsInstrument/SCPI.

SCPI commands are taken from the RTB2 User Manual (1333.1611.02, Version 14),
Chapter 16 "Remote control commands".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Protocol


class ScopeBackend(Protocol):
    def read_state(self, scope: str, keys: list[str] | None = None) -> dict[str, Any]: ...
    def set_parameter(self, path: str, value: Any) -> None: ...
    def run_measurement(self, measurement_type: str, source: str | None = None, gate: dict[str, Any] | None = None) -> dict[str, Any]: ...


@dataclass
class MockScopeBackend:
    state: Dict[str, Any] = field(default_factory=lambda: {
        "instrument_id": "R&S RTB24 (simulator — no hardware connected)",
        "acquisition_state": "STOP",
        "timebase_scale": 0.001,
        "channels": {
            1: {"enabled": True, "vertical_scale": 0.5, "offset": 0.0, "coupling": "DCLimit", "probe_attenuation": 10.0},
            2: {"enabled": False, "vertical_scale": 1.0, "offset": 0.0, "coupling": "DCLimit", "probe_attenuation": 10.0},
            3: {"enabled": False, "vertical_scale": 1.0, "offset": 0.0, "coupling": "DCLimit", "probe_attenuation": 10.0},
            4: {"enabled": False, "vertical_scale": 1.0, "offset": 0.0, "coupling": "DCLimit", "probe_attenuation": 10.0},
        },
        "trigger": {"source": "CH1", "level": 0.0, "slope": "POSitive", "mode": "AUTO"},
    })

    def read_state(self, scope: str, keys: list[str] | None = None) -> dict[str, Any]:
        if scope == "all":
            return dict(self.state)
        if scope == "channel":
            return {"channels": self.state["channels"]}
        if scope == "trigger":
            return {"trigger": self.state["trigger"]}
        if scope == "acquisition":
            return {"acquisition_state": self.state["acquisition_state"], "timebase_scale": self.state["timebase_scale"]}
        return dict(self.state)

    def set_parameter(self, path: str, value: Any) -> None:
        if path == "acquisition.state":
            self.state["acquisition_state"] = str(value).upper()
            return
        if path == "timebase.scale":
            self.state["timebase_scale"] = float(value)
            return
        if path.startswith("channel."):
            parts = path.split(".", 2)
            ch = int(parts[1])
            field_name = parts[2]
            self.state["channels"][ch][field_name] = value
            return
        if path.startswith("trigger."):
            field_name = path.split(".", 1)[1]
            self.state["trigger"][field_name] = value
            return

    def run_measurement(self, measurement_type: str, source: str | None = None, gate: dict[str, Any] | None = None) -> dict[str, Any]:
        sim_values = {
            "FREQuency": (1000.0, "Hz"), "PERiod": (0.001, "s"), "PEAK": (2.0, "V"),
            "RMS": (0.707, "V"), "MEAN": (0.0, "V"), "RTIMe": (12e-9, "s"), "FTIMe": (12e-9, "s"),
        }
        key = measurement_type.upper()
        for k, (v, u) in sim_values.items():
            if k.upper().startswith(key[:4]):
                return {"measurement_type": measurement_type, "source": source or "CH1", "value": v, "unit": u, "status": "simulator"}
        return {"measurement_type": measurement_type, "source": source or "CH1", "value": 0.0, "unit": "?", "status": "simulator"}


class RsInstrumentBackend:
    """
    Backend for real R&S RTB2 oscilloscopes via RsInstrument.
    SCPI commands from RTB2 User Manual Chapter 16.
    """

    def __init__(self, instrument: Any) -> None:
        self._inst = instrument
        self._idn = self._q("*IDN?", "unknown")

    # ── READ ──

    def read_state(self, scope: str, keys: list[str] | None = None) -> dict[str, Any]:
        result: dict[str, Any] = {"instrument_id": self._idn}

        if scope in ("all", "acquisition"):
            result["acquisition_state"] = self._q("ACQuire:STATe?", "STOP")
            result["timebase_scale"] = self._qf("TIMebase:SCALe?", 0.001)
            result["record_length"] = self._qi("ACQuire:POINts?", 10000)
            result["sample_rate"] = self._qf("ACQuire:SRATe?", 0.0)

        if scope in ("all", "channel"):
            channels: dict[int, dict] = {}
            for ch in range(1, 5):
                state_raw = self._q(f"CHANnel{ch}:STATe?", "OFF")
                enabled = state_raw.strip().upper() in ("1", "ON")
                channels[ch] = {
                    "enabled": enabled,
                    "vertical_scale": self._qf(f"CHANnel{ch}:SCALe?", 1.0),
                    "offset": self._qf(f"CHANnel{ch}:OFFSet?", 0.0),
                    "coupling": self._q(f"CHANnel{ch}:COUPling?", "DCLimit"),
                    "probe_attenuation": self._qf(f"PROBe{ch}:SETup:ATTenuation:MANual?", 10.0),
                    "bandwidth": self._q(f"CHANnel{ch}:BANDwidth?", "FULL"),
                }
            result["channels"] = channels

        if scope in ("all", "trigger"):
            result["trigger"] = {
                "source": self._q("TRIGger:A:SOURce?", "CH1"),
                "type": self._q("TRIGger:A:TYPE?", "EDGE"),
                "mode": self._q("TRIGger:A:MODE?", "AUTO"),
                "slope": self._q("TRIGger:A:EDGE:SLOPe?", "POSitive"),
                "level": self._qf("TRIGger:A:LEVel1:VALue?", 0.0),
                "coupling": self._q("TRIGger:A:EDGE:COUPling?", "DC"),
            }

        return result

    # ── WRITE ──

    def set_parameter(self, path: str, value: Any) -> None:
        scpi = self._path_to_scpi(path, value)
        self._inst.write_str(scpi)

    # ── MEASURE ──

    def run_measurement(self, measurement_type: str, source: str | None = None, gate: dict[str, Any] | None = None) -> dict[str, Any]:
        meas_slot = 1

        type_map = {
            "frequency": "FREQuency", "period": "PERiod", "peak": "PEAK",
            "peak_to_peak": "PEAK", "rms": "RMS", "mean": "MEAN",
            "rise_time": "RTIMe", "fall_time": "FTIMe",
            "amplitude": "AMPLitude", "high": "HIGH", "low": "LOW",
        }
        scpi_type = type_map.get(measurement_type.lower(), measurement_type)

        try:
            self._inst.write_str(f"MEASurement{meas_slot}:MAIN {scpi_type}")
            if source:
                self._inst.write_str(f"MEASurement{meas_slot}:SOURce {source}")
            self._inst.write_str(f"MEASurement{meas_slot}:ENABle ON")
        except Exception:
            pass

        val = self._qf(f"MEASurement{meas_slot}:RESult:ACTual?", float('nan'))

        unit_map = {
            "FREQuency": "Hz", "PERiod": "s", "PEAK": "V", "RMS": "V",
            "MEAN": "V", "RTIMe": "s", "FTIMe": "s", "AMPLitude": "V",
            "HIGH": "V", "LOW": "V",
        }

        is_nan = val != val or abs(val) > 9e36
        return {
            "measurement_type": measurement_type,
            "source": source or "CH1",
            "value": None if is_nan else val,
            "unit": unit_map.get(scpi_type, "?"),
            "status": "no_signal" if is_nan else "ok",
        }

    # ── SCPI path mapping (from RTB2 User Manual Ch16) ──

    def _path_to_scpi(self, path: str, value: Any) -> str:
        p = path.lower()
        ch = self._extract_ch(path)

        if p == "acquisition.state":
            v = str(value).upper()
            if v in ("RUN", "RUNNING", "1", "TRUE"):
                return "RUN"
            return "STOP"

        if p == "timebase.scale":
            return f"TIMebase:SCALe {value}"

        if p == "timebase.position":
            return f"TIMebase:POSition {value}"

        if p.endswith(".vertical_scale") or p.endswith(".scale"):
            return f"CHANnel{ch}:SCALe {value}"

        if p.endswith(".offset"):
            return f"CHANnel{ch}:OFFSet {value}"

        if p.endswith(".coupling"):
            v = str(value).upper()
            if v in ("AC", "ACLIMIT"):
                v = "ACLimit"
            elif v in ("DC", "DCLIMIT"):
                v = "DCLimit"
            elif v == "GND":
                v = "GND"
            return f"CHANnel{ch}:COUPling {v}"

        if p.endswith(".enabled"):
            v = "ON" if value in (True, 1, "1", "ON", "on", "true") else "OFF"
            return f"CHANnel{ch}:STATe {v}"

        if p.endswith(".probe_attenuation"):
            return f"PROBe{ch}:SETup:ATTenuation:MANual {value}"

        if p.endswith(".bandwidth"):
            return f"CHANnel{ch}:BANDwidth {value}"

        if p == "trigger.source":
            return f"TRIGger:A:SOURce {value}"

        if p == "trigger.level":
            return f"TRIGger:A:LEVel1:VALue {value}"

        if p == "trigger.slope" or p == "trigger.edge":
            v = str(value).upper()
            if v in ("RISING", "POS", "POSITIVE"):
                v = "POSitive"
            elif v in ("FALLING", "NEG", "NEGATIVE"):
                v = "NEGative"
            elif v in ("EITHER", "BOTH"):
                v = "EITHer"
            return f"TRIGger:A:EDGE:SLOPe {v}"

        if p == "trigger.mode":
            v = str(value).upper()
            if v in ("AUTO",):
                v = "AUTO"
            elif v in ("NORMAL", "NORM"):
                v = "NORMal"
            return f"TRIGger:A:MODE {v}"

        if p == "trigger.type":
            return f"TRIGger:A:TYPE {value}"

        if p == "autoset":
            return "AUToscale"

        return f"{path} {value}"

    # ── Helpers ──

    def _q(self, cmd: str, default: str) -> str:
        try:
            return self._inst.query_str(cmd).strip()
        except Exception:
            return default

    def _qf(self, cmd: str, default: float) -> float:
        try:
            return float(self._inst.query_str(cmd).strip())
        except Exception:
            return default

    def _qi(self, cmd: str, default: int) -> int:
        try:
            return int(float(self._inst.query_str(cmd).strip()))
        except Exception:
            return default

    @staticmethod
    def _extract_ch(path: str) -> int:
        for part in path.split("."):
            try:
                return int(part)
            except ValueError:
                continue
        return 1
