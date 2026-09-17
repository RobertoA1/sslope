/** Escala la respuesta incremental del modelo TA-01 únicamente en su régimen lineal fijo. */
export function predictTa01SpatialRainfall(model, benchmark, rainfallMm) {
  if (typeof rainfallMm === "string" && rainfallMm.trim() === "") throw new Error("rainfallMm debe ser numérico");
  const amount = Number(rainfallMm);
  if (!Number.isFinite(amount) || amount < 0 || amount > 500) throw new Error("rainfallMm debe estar entre 0 y 500");
  if (model?.benchmark?.id !== benchmark?.id || model?.benchmark?.cumulativeRainfallMm !== benchmark?.cumulativeRainfallMm) {
    throw new Error("El modelo espacial y el benchmark TA-01 no coinciden");
  }
  if (!model.verification?.passedInternalApproximationGate) throw new Error("El modelo espacial TA-01 no superó su puerta interna");
  const referenceRainMm = benchmark.cumulativeRainfallMm;
  if (!(referenceRainMm > 0)) throw new Error("El benchmark debe tener lluvia positiva");
  const referenceField = model.model?.predictedNodalDisplacementMm;
  if (!Array.isArray(referenceField) || referenceField.length !== benchmark.mesh.nodes.length * 2) {
    throw new Error("El campo nodal guardado no coincide con la malla TA-01");
  }
  const scale = amount / referenceRainMm;
  const nodes = benchmark.mesh.nodes.map((node, index) => {
    const deltaUxMm = referenceField[index * 2] * scale;
    const deltaUyMm = referenceField[index * 2 + 1] * scale;
    return { id: node.id, xM: node.xM, yM: node.yM, deltaUxMm, deltaUyMm, displacementMm: Math.hypot(deltaUxMm, deltaUyMm) };
  });
  return {
    id: `${model.id}-RAIN-${amount}`,
    scientificStatus: "EXTRAPOLACION_LINEAL_FEM_TA01_SEMISINTETICA_NO_OPERACIONAL",
    sourceModelId: model.id,
    benchmarkId: benchmark.id,
    rainfallMm: amount,
    referenceRainfallMm: referenceRainMm,
    assumption: "K y materiales constantes; la carga incremental de presión de poros es proporcional a la lluvia acumulada. No hay flujo transitorio, plasticidad ni cambio de geometría.",
    scope: "Solo la geometría, materiales y contornos del benchmark TA-01 30×20; no trasladar a otro talud ni a sensores reales.",
    maximumPredictedDisplacementMm: Math.max(...nodes.map((node) => node.displacementMm)),
    mesh: { nodeCount: nodes.length, elementCount: benchmark.mesh.elements.length, elements: benchmark.mesh.elements },
    nodes
  };
}
