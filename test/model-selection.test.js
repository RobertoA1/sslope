import test from "node:test";
import assert from "node:assert/strict";
import { summarizeValidationSelection } from "../src/core/model-selection.js";

const artifact = (validationLstm, validationHybrid, testLstm, testHybrid) => ({
  metrics: {
    validation: { lstm: { maeMm: validationLstm, sampleCount: 20 }, pinn: { maeMm: validationHybrid, sampleCount: 20 } },
    test: { lstm: { maeMm: testLstm, sampleCount: 15 }, pinn: { maeMm: testHybrid, sampleCount: 15 } }
  }
});

test("selecciona solo con validación y mide el arrepentimiento en prueba", () => {
  const result = summarizeValidationSelection(artifact(0.1, 0.09, 0.03, 0.05), 2024, 6);
  assert.equal(result.selectedOnValidation, "HYBRID_PHYSICS_GUIDED");
  assert.equal(result.bestOnTest, "LSTM");
  assert.equal(result.selectionMatchesTest, false);
  assert.ok(Math.abs(result.selectionRegretMm - 0.02) < 1e-12);
  const changedTest = summarizeValidationSelection(artifact(0.1, 0.09, 0.08, 0.02), 2024, 6);
  assert.equal(changedTest.selectedOnValidation, result.selectedOnValidation);
  assert.equal(changedTest.selectionMatchesTest, true);
});

test("en empates prefiere la LSTM simple y exige ventanas comparables", () => {
  const tied = summarizeValidationSelection(artifact(0.1, 0.1, 0.02, 0.02), 2025, 1);
  assert.equal(tied.selectedOnValidation, "LSTM");
  assert.equal(tied.selectionRegretMm, 0);
  const invalid = artifact(0.1, 0.09, 0.03, 0.05);
  invalid.metrics.validation.pinn.sampleCount = 19;
  assert.throws(() => summarizeValidationSelection(invalid, 2024, 1), /ventanas comparables/);
});
