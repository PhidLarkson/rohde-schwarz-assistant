from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict
from uuid import uuid4


@dataclass(frozen=True)
class PendingChange:
    confirmation_id: str
    action: str
    path: str
    previous_value: Any
    proposed_value: Any
    summary: str


class ConfirmationGate:
    def __init__(self) -> None:
        self._pending: Dict[str, PendingChange] = {}

    def preview(
        self,
        action: str,
        path: str,
        previous_value: Any,
        proposed_value: Any,
    ) -> PendingChange:
        confirmation_id = uuid4().hex
        summary = f"{action}: {path} {previous_value!r} -> {proposed_value!r}"
        pending = PendingChange(
            confirmation_id=confirmation_id,
            action=action,
            path=path,
            previous_value=previous_value,
            proposed_value=proposed_value,
            summary=summary,
        )
        self._pending[confirmation_id] = pending
        return pending

    def confirm(
        self,
        confirmation_id: str,
        action: str,
        path: str,
    ) -> PendingChange:
        pending = self._pending.get(confirmation_id)
        if pending is None:
            raise ValueError("Unknown or expired confirmation token")
        if pending.action != action or pending.path != path:
            raise ValueError(
                "Confirmation token does not match the requested change"
            )
        del self._pending[confirmation_id]
        return pending
