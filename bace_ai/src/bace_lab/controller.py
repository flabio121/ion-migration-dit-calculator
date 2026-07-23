from __future__ import annotations

import time
from dataclasses import asdict
from typing import Callable

from .analysis import analyze_transient
from .instruments.base import BaceInstrument
from .models import (
    BaceRecipe,
    ControllerState,
    ExperimentResult,
    HardwareApproval,
    RunMode,
)
from .safety import SafetyPolicy, validate_hardware_approval


class BaceController:
    """Owns the experiment state machine and all instrument access."""

    def __init__(
        self,
        instrument: BaceInstrument,
        policy: SafetyPolicy,
        *,
        mode: RunMode = RunMode.SIMULATION,
        event_sink: Callable[[dict], None] | None = None,
    ) -> None:
        self.instrument = instrument
        self.policy = policy
        self.mode = mode
        self.event_sink = event_sink
        self.state = ControllerState.IDLE
        self._abort_requested = False
        self._audit: list[dict] = []

    def _event(self, event: str, **details) -> None:
        payload = {
            "timestamp_unix_s": time.time(),
            "event": event,
            "state": self.state.value,
            **details,
        }
        self._audit.append(payload)
        if self.event_sink:
            self.event_sink(payload)

    def _transition(self, state: ControllerState) -> None:
        self.state = state
        self._event("state_transition", new_state=state.value)

    def request_abort(self, reason: str = "operator_request") -> None:
        self._abort_requested = True
        self._event("abort_requested", reason=reason)
        self.instrument.abort()

    def run(
        self,
        recipe: BaceRecipe,
        *,
        approval: HardwareApproval | None = None,
    ) -> ExperimentResult:
        self._audit = []
        self._abort_requested = False
        records = []
        analyses = []

        try:
            self._transition(ControllerState.VALIDATING)
            self.policy.require_valid(recipe, self.mode)
            if self.mode is RunMode.HARDWARE:
                validate_hardware_approval(recipe, approval)
            self._event(
                "recipe_accepted",
                recipe_id=recipe.recipe_id,
                recipe=recipe.to_dict(),
                mode=self.mode.value,
                instrument=self.instrument.identify(),
            )

            self.instrument.verify_safe_state()
            self.instrument.connect_pixel(recipe.pixel)

            for repetition in range(1, recipe.repetitions + 1):
                if self._abort_requested:
                    self._transition(ControllerState.ABORTED)
                    break

                self._transition(ControllerState.PRECONDITIONING)
                self._event(
                    "precondition_start",
                    repetition=repetition,
                    voltage_v=recipe.precondition_voltage_v,
                    duration_s=recipe.precondition_duration_s,
                )

                self._transition(ControllerState.ACQUIRING)
                record = self.instrument.acquire_voltage_step(recipe, repetition)
                records.append(record)
                self._event(
                    "transient_acquired",
                    repetition=repetition,
                    run_id=record.run_id,
                    samples=len(record.time_s),
                    metadata=record.metadata,
                )

                self._transition(ControllerState.ANALYZING)
                analysis = analyze_transient(record, recipe)
                analyses.append(analysis)
                self._event(
                    "analysis_complete",
                    repetition=repetition,
                    run_id=record.run_id,
                    analysis=asdict(analysis),
                )

                self.instrument.output_off()
                if repetition < recipe.repetitions and recipe.rest_duration_s > 0:
                    self._event("rest_period", duration_s=recipe.rest_duration_s)
                    if self.mode is RunMode.HARDWARE:
                        time.sleep(recipe.rest_duration_s)

            if self.state is not ControllerState.ABORTED:
                self._transition(ControllerState.COMPLETE)
        except Exception as exc:
            self._transition(ControllerState.ERROR)
            self._event("experiment_error", error_type=type(exc).__name__, message=str(exc))
            raise
        finally:
            try:
                self.instrument.output_off()
            finally:
                self.instrument.disconnect_all()
                self._event("safe_teardown_complete")

        return ExperimentResult(
            recipe=recipe,
            records=records,
            analyses=analyses,
            state=self.state,
            audit_events=list(self._audit),
        )
