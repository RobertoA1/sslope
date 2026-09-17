#!/usr/bin/env python3
"""Verificación espacial physics-informed con solución manufacturada.

Entrena una red de una capa con características tanh aleatorias y pesos de
salida obtenidos por mínimos cuadrados sobre el equilibrio elástico y las
condiciones de contorno. Es un PIELM reproducible, no el modelo operativo TA-01.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

SEED = 20260919
HIDDEN_UNITS = 96
INTERIOR_POINTS_PER_AXIS = 25
BOUNDARY_POINTS_PER_EDGE = 33
EVALUATION_POINTS_PER_AXIS = 51
BOUNDARY_WEIGHT = 30.0
RIDGE = 1e-10
YOUNG_MODULUS = 1.0
POISSON_RATIO = 0.30


def lame_parameters() -> tuple[float, float]:
    lam = YOUNG_MODULUS * POISSON_RATIO / ((1 + POISSON_RATIO) * (1 - 2 * POISSON_RATIO))
    mu = YOUNG_MODULUS / (2 * (1 + POISSON_RATIO))
    return lam, mu


def exact_displacement(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    u = 1e-3 * (x * x + 0.3 * x * y + 0.2 * y * y + 0.1 * x)
    v = 1e-3 * (-0.8 * y * y + 0.4 * x * y + 0.1 * x * x - 0.05 * y)
    return u, v


def exact_operator() -> tuple[float, float]:
    """Operador de Navier L(u,v); la fuerza de cuerpo es -L."""
    lam, mu = lame_parameters()
    u_xx, u_yy, u_xy = 2e-3, 0.4e-3, 0.3e-3
    v_xx, v_yy, v_xy = 0.2e-3, -1.6e-3, 0.4e-3
    equilibrium_x = (lam + 2 * mu) * u_xx + mu * u_yy + (lam + mu) * v_xy
    equilibrium_y = mu * v_xx + (lam + 2 * mu) * v_yy + (lam + mu) * u_xy
    return equilibrium_x, equilibrium_y


def feature_fields(x: np.ndarray, y: np.ndarray, weights: np.ndarray, bias: np.ndarray) -> dict[str, np.ndarray]:
    x = np.asarray(x, dtype=np.float64).reshape(-1, 1)
    y = np.asarray(y, dtype=np.float64).reshape(-1, 1)
    wx = weights[:, 0].reshape(1, -1)
    wy = weights[:, 1].reshape(1, -1)
    z = x @ wx + y @ wy + bias.reshape(1, -1)
    activation = np.tanh(z)
    first = 1.0 - activation * activation
    second = -2.0 * activation * first
    ones = np.ones_like(x)
    zeros = np.zeros_like(x)
    return {
        "value": np.concatenate([ones, x, y, activation], axis=1),
        "xx": np.concatenate([zeros, zeros, zeros, second * wx * wx], axis=1),
        "yy": np.concatenate([zeros, zeros, zeros, second * wy * wy], axis=1),
        "xy": np.concatenate([zeros, zeros, zeros, second * wx * wy], axis=1),
    }


def training_points() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    interior_axis = np.linspace(0.0, 1.0, INTERIOR_POINTS_PER_AXIS + 2)[1:-1]
    interior_x, interior_y = np.meshgrid(interior_axis, interior_axis)
    edge = np.linspace(0.0, 1.0, BOUNDARY_POINTS_PER_EDGE)
    boundary_x = np.concatenate([edge, edge, np.zeros_like(edge), np.ones_like(edge)])
    boundary_y = np.concatenate([np.zeros_like(edge), np.ones_like(edge), edge, edge])
    return interior_x.ravel(), interior_y.ravel(), boundary_x, boundary_y


def assemble_system(weights: np.ndarray, bias: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    interior_x, interior_y, boundary_x, boundary_y = training_points()
    fields = feature_fields(interior_x, interior_y, weights, bias)
    boundary = feature_fields(boundary_x, boundary_y, weights, bias)["value"]
    feature_count = fields["value"].shape[1]
    zeros_interior = np.zeros_like(fields["xx"])
    zeros_boundary = np.zeros_like(boundary)
    lam, mu = lame_parameters()
    op_u_x = (lam + 2 * mu) * fields["xx"] + mu * fields["yy"]
    op_v_x = (lam + mu) * fields["xy"]
    op_u_y = (lam + mu) * fields["xy"]
    op_v_y = mu * fields["xx"] + (lam + 2 * mu) * fields["yy"]
    exact_x, exact_y = exact_operator()
    exact_u, exact_v = exact_displacement(boundary_x, boundary_y)
    matrix = np.vstack([
        np.hstack([op_u_x, op_v_x]),
        np.hstack([op_u_y, op_v_y]),
        BOUNDARY_WEIGHT * np.hstack([boundary, zeros_boundary]),
        BOUNDARY_WEIGHT * np.hstack([zeros_boundary, boundary]),
        np.sqrt(RIDGE) * np.eye(feature_count * 2),
    ])
    target = np.concatenate([
        np.full(interior_x.size, exact_x),
        np.full(interior_x.size, exact_y),
        BOUNDARY_WEIGHT * exact_u,
        BOUNDARY_WEIGHT * exact_v,
        np.zeros(feature_count * 2),
    ])
    return matrix, target


def evaluate(weights: np.ndarray, bias: np.ndarray, output_weights: np.ndarray) -> dict:
    axis = np.linspace(0.0, 1.0, EVALUATION_POINTS_PER_AXIS)
    grid_x, grid_y = np.meshgrid(axis, axis)
    x, y = grid_x.ravel(), grid_y.ravel()
    fields = feature_fields(x, y, weights, bias)
    feature_count = fields["value"].shape[1]
    alpha, beta = output_weights[:feature_count], output_weights[feature_count:]
    predicted_u = fields["value"] @ alpha
    predicted_v = fields["value"] @ beta
    exact_u, exact_v = exact_displacement(x, y)
    displacement_error = np.hypot(predicted_u - exact_u, predicted_v - exact_v)
    lam, mu = lame_parameters()
    residual_x = ((lam + 2 * mu) * fields["xx"] + mu * fields["yy"]) @ alpha + (lam + mu) * fields["xy"] @ beta - exact_operator()[0]
    residual_y = (lam + mu) * fields["xy"] @ alpha + (mu * fields["xx"] + (lam + 2 * mu) * fields["yy"]) @ beta - exact_operator()[1]
    residual = np.hypot(residual_x, residual_y)
    boundary_mask = (np.isclose(x, 0) | np.isclose(x, 1) | np.isclose(y, 0) | np.isclose(y, 1))
    exact_magnitude = np.hypot(exact_u, exact_v)
    nonzero_mask = exact_magnitude >= exact_magnitude.max() * 0.01
    return {
        "evaluationPointCount": int(x.size),
        "maximumDisplacementError": float(displacement_error.max()),
        "meanDisplacementError": float(displacement_error.mean()),
        "relativeL2DisplacementError": float(np.linalg.norm(displacement_error) / np.linalg.norm(exact_magnitude)),
        "maximumRelativeDisplacementErrorAboveOnePercentScale": float((displacement_error[nonzero_mask] / exact_magnitude[nonzero_mask]).max()),
        "maximumBoundaryError": float(displacement_error[boundary_mask].max()),
        "rootMeanSquareEquilibriumResidual": float(np.sqrt(np.mean(residual * residual))),
        "maximumEquilibriumResidual": float(residual.max()),
    }


def main() -> None:
    project_dir = Path(__file__).resolve().parent.parent
    rng = np.random.default_rng(SEED)
    hidden_weights = rng.normal(0.0, 1.6, size=(HIDDEN_UNITS, 2))
    hidden_bias = rng.uniform(-1.5, 1.5, size=HIDDEN_UNITS)
    matrix, target = assemble_system(hidden_weights, hidden_bias)
    output_weights, _, rank, singular_values = np.linalg.lstsq(matrix, target, rcond=1e-12)
    verification = evaluate(hidden_weights, hidden_bias, output_weights)
    equilibrium_scale = float(np.hypot(*exact_operator()))
    verification["relativeRmsEquilibriumResidual"] = verification["rootMeanSquareEquilibriumResidual"] / equilibrium_scale
    verification["passed"] = verification["maximumDisplacementError"] < 2e-6 and verification["relativeL2DisplacementError"] < 0.01 and verification["relativeRmsEquilibriumResidual"] < 0.05
    lam, mu = lame_parameters()
    artifact = {
        "id": "SPATIAL-PINN-ELM-MANUFACTURED-ELASTICITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "method": "PHYSICS_INFORMED_EXTREME_LEARNING_MACHINE",
        "scientificStatus": "PINN_ESPACIAL_VERIFICADA_EN_SOLUCION_MANUFACTURADA_NO_INTEGRADA_A_TA01_NO_CAMPO",
        "scope": "Verificación matemática del equilibrio elástico 2D y condiciones de Dirichlet en un dominio unitario.",
        "limitations": [
            "Los pesos ocultos son aleatorios y solo se entrenan los pesos de salida por mínimos cuadrados.",
            "No incluye plasticidad, presión de poros, geometría de talud ni datos de mina.",
            "No sustituye la validación del FEM ni del modelo híbrido TA-01.",
        ],
        "pde": {
            "name": "NAVIER_LINEAR_ELASTICITY_PLANE_STRAIN",
            "domain": "UNIT_SQUARE",
            "youngModulusNormalized": YOUNG_MODULUS,
            "poissonRatio": POISSON_RATIO,
            "lameLambda": lam,
            "lameMu": mu,
            "bodyForce": [-exact_operator()[0], -exact_operator()[1]],
            "boundaryCondition": "Dirichlet exacta en los cuatro bordes",
            "manufacturedSolution": {
                "u": "1e-3*(x^2 + 0.3*x*y + 0.2*y^2 + 0.1*x)",
                "v": "1e-3*(-0.8*y^2 + 0.4*x*y + 0.1*x^2 - 0.05*y)",
            },
        },
        "training": {
            "seed": SEED,
            "hiddenUnits": HIDDEN_UNITS,
            "activation": "tanh",
            "trainableParameters": "pesos lineales de salida",
            "interiorCollocationPoints": INTERIOR_POINTS_PER_AXIS**2,
            "boundarySamplesIncludingCorners": BOUNDARY_POINTS_PER_EDGE * 4,
            "boundaryWeight": BOUNDARY_WEIGHT,
            "ridge": RIDGE,
            "linearSystemRows": int(matrix.shape[0]),
            "linearSystemColumns": int(matrix.shape[1]),
            "rank": int(rank),
            "conditionNumber": float(singular_values[0] / singular_values[-1]),
        },
        "verification": verification,
        "model": {
            "input": ["x", "y"],
            "output": ["ux", "uy"],
            "hiddenWeights": hidden_weights.tolist(),
            "hiddenBias": hidden_bias.tolist(),
            "outputWeights": output_weights.tolist(),
        },
    }
    validation_path = project_dir / "data" / "validation" / "spatial-pinn-manufactured-elasticity.json"
    model_path = project_dir / "data" / "models" / "spatial-pinn-manufactured-elasticity.json"
    validation_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    validation_path.write_text(json.dumps({key: value for key, value in artifact.items() if key != "model"}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    model_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"validation": str(validation_path.relative_to(project_dir)), "model": str(model_path.relative_to(project_dir)), "verification": verification}, indent=2))
    if not verification["passed"]:
        raise SystemExit("La verificación espacial no alcanzó los umbrales definidos")


if __name__ == "__main__":
    main()
