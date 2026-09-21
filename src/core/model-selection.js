/** Diagnóstico retrospectivo: decide solo con validación y mide el resultado en prueba. */
export function summarizeValidationSelection(artifact, testYear, horizonHours) {
  const validation = artifact?.metrics?.validation;
  const test = artifact?.metrics?.test;
  const values = [validation?.lstm, validation?.pinn, test?.lstm, test?.pinn];
  if (values.some((value) => !value || !Number.isFinite(value.maeMm) || !Number.isInteger(value.sampleCount) || value.sampleCount < 1)) {
    throw new Error("Se requieren MAE y recuentos válidos de LSTM e híbrido en validación y prueba");
  }
  if (validation.lstm.sampleCount !== validation.pinn.sampleCount || test.lstm.sampleCount !== test.pinn.sampleCount) {
    throw new Error("La selección requiere ventanas comparables entre LSTM e híbrido");
  }
  const selectedOnValidation = validation.pinn.maeMm < validation.lstm.maeMm ? "HYBRID_PHYSICS_GUIDED" : "LSTM";
  const bestOnTest = test.pinn.maeMm < test.lstm.maeMm ? "HYBRID_PHYSICS_GUIDED" : "LSTM";
  const selectedTestMaeMm = selectedOnValidation === "LSTM" ? test.lstm.maeMm : test.pinn.maeMm;
  const bestTestMaeMm = Math.min(test.lstm.maeMm, test.pinn.maeMm);
  return {
    testYear,
    horizonHours,
    validationSampleCount: validation.lstm.sampleCount,
    testSampleCount: test.lstm.sampleCount,
    validationMaeLstmMm: validation.lstm.maeMm,
    validationMaeHybridMm: validation.pinn.maeMm,
    selectedOnValidation,
    testMaeLstmMm: test.lstm.maeMm,
    testMaeHybridMm: test.pinn.maeMm,
    bestOnTest,
    selectedTestMaeMm,
    bestTestMaeMm,
    selectionRegretMm: Math.max(0, selectedTestMaeMm - bestTestMaeMm),
    selectionMatchesTest: selectedOnValidation === bestOnTest
  };
}
