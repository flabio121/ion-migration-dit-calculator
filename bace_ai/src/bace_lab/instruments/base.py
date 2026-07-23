from __future__ import annotations

from typing import Protocol

from ..models import BaceRecipe, TransientRecord


class BaceInstrument(Protocol):
    """Minimal deterministic interface exposed to the experiment controller.

    LLM-facing code must never receive the underlying VISA session or a raw
    write/query method. Hardware adapters translate these bounded operations
    into instrument-specific commands.
    """

    def identify(self) -> str: ...

    def verify_safe_state(self) -> None: ...

    def connect_pixel(self, pixel: str | None) -> None: ...

    def acquire_voltage_step(self, recipe: BaceRecipe, repetition: int) -> TransientRecord: ...

    def output_off(self) -> None: ...

    def disconnect_all(self) -> None: ...

    def abort(self) -> None: ...
