#!/usr/bin/env python3
"""Prueba rápida de la puerta física del experimento hidráulico."""

from ta01_xslope_common import require_transient_balance


def sample(closure, converged=True, cancelled=False):
    return {"converged": converged, "cancelled": cancelled,
            "mass_balance": {"final_closure": closure, "cumulative_inflow": 1.0,
                             "final_stored_change": 1.0 + closure}}


assert require_transient_balance(sample(0.04))["final_closure"] == 0.04
assert require_transient_balance({"converged": True, "cancelled": False,
        "mass_balance": {"final_closure": 1e-13, "cumulative_inflow": 2.8e-13,
                         "final_stored_change": 2.3e-13}})["final_closure"] == 1e-13
for rejected in (sample(42.85), sample(26.75), sample(float("nan")), sample(0.0, False), sample(0.0, True, True),
                 {"converged": True, "cancelled": False, "mass_balance": {"final_closure": 0.01,
                  "cumulative_inflow": 0.02223, "final_stored_change": 0.0}}):
    try:
        require_transient_balance(rejected)
    except RuntimeError:
        pass
    else:
        raise AssertionError("Se aceptó un campo hidráulico no confiable")
print("TA-01 transient balance gate passed")
