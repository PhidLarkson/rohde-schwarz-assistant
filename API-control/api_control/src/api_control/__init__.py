"""Lab Assistant wrapper for the RTB24 oscilloscope."""

from .scope_client import (
    ScopeClient,
    build_mock_client,
    build_rs_instrument_client,
)

__all__ = [
    "ScopeClient",
    "build_mock_client",
    "build_rs_instrument_client",
]
