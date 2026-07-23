from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .controller import BaceController
from .models import BaceRecipe, HardwareApproval, RunMode
from .safety import SafetyPolicy


class LabToolbox:
    """Allowlisted interface intended for an LLM tool server.

    Deliberately absent: raw SCPI, arbitrary VISA writes, relay commands,
    shell execution, policy mutation, and approval creation.
    """

    def __init__(self, controller: BaceController, policy: SafetyPolicy) -> None:
        self.controller = controller
        self.policy = policy
        self._recipes: dict[str, BaceRecipe] = {}
        self._results: dict[str, Any] = {}

    def register_recipe(self, recipe: BaceRecipe) -> dict[str, Any]:
        violations = self.policy.validate(recipe, self.controller.mode)
        if violations:
            return {"accepted": False, "violations": violations}
        self._recipes[recipe.recipe_id] = recipe
        return {
            "accepted": True,
            "recipe_id": recipe.recipe_id,
            "mode": self.controller.mode.value,
            "point_count": recipe.acquisition.point_count,
        }

    def validate_recipe(self, recipe_id: str) -> dict[str, Any]:
        recipe = self._recipes[recipe_id]
        violations = self.policy.validate(recipe, self.controller.mode)
        return {
            "recipe_id": recipe_id,
            "valid": not violations,
            "violations": violations,
            "policy": self.policy.to_dict(),
        }

    def run_registered_recipe(
        self,
        recipe_id: str,
        *,
        approval: HardwareApproval | None = None,
    ) -> dict[str, Any]:
        recipe = self._recipes[recipe_id]
        result = self.controller.run(recipe, approval=approval)
        self._results[recipe_id] = result
        return {
            "recipe_id": recipe_id,
            "state": result.state.value,
            "run_ids": [record.run_id for record in result.records],
            "analyses": [asdict(item) for item in result.analyses],
            "audit_event_count": len(result.audit_events),
        }

    def get_result(self, recipe_id: str) -> dict[str, Any]:
        result = self._results[recipe_id]
        return {
            "recipe": result.recipe.to_dict(),
            "state": result.state.value,
            "records": [
                {
                    "run_id": record.run_id,
                    "sample_count": len(record.time_s),
                    "instrument_id": record.instrument_id,
                    "metadata": record.metadata,
                }
                for record in result.records
            ],
            "analyses": [asdict(item) for item in result.analyses],
            "audit_events": result.audit_events,
        }

    def abort(self, reason: str = "ai_detected_stop_condition") -> dict[str, str]:
        self.controller.request_abort(reason)
        return {"status": "abort_requested", "reason": reason}

    def capabilities(self) -> dict[str, Any]:
        return {
            "mode": self.controller.mode.value,
            "hardware_enabled": self.policy.hardware_enabled,
            "allowed_actions": [
                "register_recipe",
                "validate_recipe",
                "run_registered_recipe",
                "get_result",
                "abort",
            ],
            "forbidden_actions": [
                "raw_scpi",
                "arbitrary_visa_write",
                "direct_relay_control",
                "change_safety_policy",
                "create_hardware_approval",
            ],
            "requires_human_approval": self.controller.mode is RunMode.HARDWARE,
        }
