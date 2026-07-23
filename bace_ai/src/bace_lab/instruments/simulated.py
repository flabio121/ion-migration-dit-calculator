from __future__ import annotations

import math
import uuid

import numpy as np

from ..models import BaceRecipe, RunMode, TransientRecord


class SimulatedBaceInstrument:
    """Deterministic RC + ionic-decay simulator for safe development and tests."""

    def __init__(
        self,
        *,
        ionic_time_constant_s: float = 0.35,
        electronic_time_constant_s: float = 8e-4,
        ionic_conductivity_s_m: float = 2e-8,
        leakage_current_a: float = 2e-7,
        noise_std_a: float = 2e-8,
        seed: int = 7,
    ) -> None:
        self.ionic_time_constant_s = ionic_time_constant_s
        self.electronic_time_constant_s = electronic_time_constant_s
        self.ionic_conductivity_s_m = ionic_conductivity_s_m
        self.leakage_current_a = leakage_current_a
        self.noise_std_a = noise_std_a
        self._rng = np.random.default_rng(seed)
        self._aborted = False
        self._pixel: str | None = None

    def identify(self) -> str:
        return "SIMULATED,2460-BACE,0001,0.1"

    def verify_safe_state(self) -> None:
        self._aborted = False

    def connect_pixel(self, pixel: str | None) -> None:
        self._pixel = pixel

    def acquire_voltage_step(self, recipe: BaceRecipe, repetition: int) -> TransientRecord:
        if self._aborted:
            raise RuntimeError("simulation was aborted")

        settings = recipe.acquisition
        time_s = np.arange(settings.point_count, dtype=float) * settings.sample_interval_s
        time_s = np.minimum(time_s, settings.capture_duration_s)

        field_v_m = recipe.delta_voltage_v / recipe.device.thickness_m
        current_density_a_m2 = self.ionic_conductivity_s_m * field_v_m
        ionic_i0_a = current_density_a_m2 * recipe.device.area_m2
        electronic_i0_a = 0.25 * ionic_i0_a

        ionic = ionic_i0_a * np.exp(-time_s / self.ionic_time_constant_s)
        electronic = electronic_i0_a * np.exp(-time_s / self.electronic_time_constant_s)
        drift = self.leakage_current_a * (1 + 0.01 * math.sin(repetition))
        noise = self._rng.normal(0.0, self.noise_std_a, size=time_s.size)
        current_a = ionic + electronic + drift + noise

        compliance_hit = bool(np.any(np.abs(current_a) >= recipe.current_compliance_a))
        current_a = np.clip(current_a, -recipe.current_compliance_a, recipe.current_compliance_a)
        source_voltage = np.full(time_s.shape, recipe.extraction_voltage_v, dtype=float)

        return TransientRecord(
            run_id=str(uuid.uuid4()),
            recipe_id=recipe.recipe_id,
            mode=RunMode.SIMULATION,
            time_s=time_s.tolist(),
            current_a=current_a.tolist(),
            source_voltage_v=source_voltage.tolist(),
            instrument_id=self.identify(),
            metadata={
                "pixel": self._pixel,
                "repetition": repetition,
                "compliance_hit": compliance_hit,
                "simulated_ionic_conductivity_s_m": self.ionic_conductivity_s_m,
            },
        )

    def output_off(self) -> None:
        return None

    def disconnect_all(self) -> None:
        self._pixel = None

    def abort(self) -> None:
        self._aborted = True
