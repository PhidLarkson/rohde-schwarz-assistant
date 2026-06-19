from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .backends import MockScopeBackend, ScopeBackend
from .confirmation import ConfirmationGate


try:
    from RsInstrument import RsInstrument  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    RsInstrument = None


@dataclass
class OperationResult:
    ok: bool
    name: str
    category: str
    needsConfirmation: bool = False
    confirmationId: str | None = None
    summary: str | None = None
    result: Any = None
    error: str | None = None


class ScopeClient:
    def __init__(
        self,
        backend: ScopeBackend,
        gate: ConfirmationGate | None = None,
    ) -> None:
        self._backend = backend
        self._gate = gate or ConfirmationGate()

    def read_state(
        self,
        scope: str = "all",
        keys: list[str] | None = None,
    ) -> OperationResult:
        try:
            result = self._backend.read_state(scope, keys)
            return OperationResult(
                ok=True,
                name="read_state",
                category="READ",
                result=result,
            )
        except Exception as error:
            return OperationResult(
                ok=False,
                name="read_state",
                category="READ",
                error=str(error),
            )

    def set_parameter(
        self,
        path: str,
        value: Any,
        confirmed: bool = False,
        confirmation_id: str | None = None,
    ) -> OperationResult:
        try:
            current_state = self._backend.read_state("all")
            previous_value = _lookup_path(current_state, path)
            pending = self._gate.preview(
                "set_parameter",
                path,
                previous_value,
                value,
            )
            if not confirmed:
                return OperationResult(
                    ok=True,
                    name="set_parameter",
                    category="WRITE",
                    needsConfirmation=True,
                    confirmationId=pending.confirmation_id,
                    summary=pending.summary,
                    result={
                        "previousValue": previous_value,
                        "proposedValue": value,
                    },
                )

            if confirmation_id is None:
                raise ValueError("confirmed=True requires a confirmationId")

            self._gate.confirm(confirmation_id, "set_parameter", path)
            self._backend.set_parameter(path, value)
            return OperationResult(
                ok=True,
                name="set_parameter",
                category="WRITE",
                result={"path": path, "value": value},
            )
        except Exception as error:
            return OperationResult(
                ok=False,
                name="set_parameter",
                category="WRITE",
                error=str(error),
            )

    def run_measurement(
        self,
        measurement_type: str,
        source: str | None = None,
        gate: dict[str, Any] | None = None,
        confirmed: bool = False,
        confirmation_id: str | None = None,
    ) -> OperationResult:
        try:
            preview = self._gate.preview(
                "run_measurement",
                measurement_type,
                {"source": source, "gate": gate},
                {"source": source, "gate": gate},
            )
            if not confirmed:
                return OperationResult(
                    ok=True,
                    name="run_measurement",
                    category="MEASUREMENT",
                    needsConfirmation=True,
                    confirmationId=preview.confirmation_id,
                    summary=preview.summary,
                    result={
                        "measurementType": measurement_type,
                        "source": source,
                        "gate": gate,
                    },
                )

            if confirmation_id is None:
                raise ValueError("confirmed=True requires a confirmationId")

            self._gate.confirm(
                confirmation_id,
                "run_measurement",
                measurement_type,
            )
            result = self._backend.run_measurement(
                measurement_type,
                source=source,
                gate=gate,
            )
            return OperationResult(
                ok=True,
                name="run_measurement",
                category="MEASUREMENT",
                result=result,
            )
        except Exception as error:
            return OperationResult(
                ok=False,
                name="run_measurement",
                category="MEASUREMENT",
                error=str(error),
            )


def build_mock_client() -> ScopeClient:
    return ScopeClient(MockScopeBackend())


def build_rs_instrument_client(
    resource_name: str,
    reset: bool = False,
    id_query: bool = True,
) -> ScopeClient:
    if RsInstrument is None:
        raise RuntimeError("RsInstrument is not installed in this environment")

    class RsInstrumentBackend:
        def __init__(self, instrument: Any) -> None:
            self._instrument = instrument

        def read_state(
            self,
            scope: str,
            keys: list[str] | None = None,
        ) -> dict[str, Any]:
            return {
                "resource_name": resource_name,
                "idn": self._instrument.query_str("*IDN?"),
                "scope": scope,
                "keys": keys,
            }

        def set_parameter(self, path: str, value: Any) -> None:
            self._instrument.write_str(f"{path} {value}")

        def run_measurement(
            self,
            measurement_type: str,
            source: str | None = None,
            gate: dict[str, Any] | None = None,
        ) -> dict[str, Any]:
            query = f"MEAS:{measurement_type}?"
            if source:
                query = f"MEAS:{measurement_type}? {source}"
            value = self._instrument.query_str(query)
            return {
                "measurement_type": measurement_type,
                "source": source,
                "gate": gate,
                "value": value,
                "status": "ok",
            }

    instrument = RsInstrument(resource_name, id_query=id_query, reset=reset)
    return ScopeClient(RsInstrumentBackend(instrument))


def _lookup_path(state: dict[str, Any], path: str) -> Any:
    current: Any = state
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        if isinstance(current, dict):
            try:
                index = int(part)
            except ValueError:
                return None
            current = current.get(index)
            continue
        return None
    return current
