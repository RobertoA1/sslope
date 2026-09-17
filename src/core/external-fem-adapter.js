const finite = (value, label) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Valor FEM externo inválido: ${label}`);
  return numeric;
};

const LENGTH_FACTORS_TO_M = { m: 1, mm: 0.001 };
const DISPLACEMENT_FACTORS_TO_MM = { mm: 1, m: 1000 };
const PRESSURE_FACTORS_TO_KPA = { kPa: 1, Pa: 0.001, MPa: 1000 };

function units(input) {
  const value = { length: input?.length || "m", displacement: input?.displacement || "mm", porePressure: input?.porePressure || "kPa" };
  if (!(value.length in LENGTH_FACTORS_TO_M)) throw new Error("La longitud FEM externa debe usar m o mm");
  if (!(value.displacement in DISPLACEMENT_FACTORS_TO_MM)) throw new Error("El desplazamiento FEM externo debe usar mm o m");
  if (!(value.porePressure in PRESSURE_FACTORS_TO_KPA)) throw new Error("La presión FEM externa debe usar Pa, kPa o MPa");
  return value;
}

function adaptNodes(nodes, unitContract) {
  if (!Array.isArray(nodes) || nodes.length < 3 || nodes.length > 50_000) throw new Error("El FEM externo debe contener entre 3 y 50000 nodos");
  const lengthFactor = LENGTH_FACTORS_TO_M[unitContract.length];
  const displacementFactor = DISPLACEMENT_FACTORS_TO_MM[unitContract.displacement];
  const pressureFactor = PRESSURE_FACTORS_TO_KPA[unitContract.porePressure];
  const adapted = nodes.map((node, index) => {
    const uxMm = finite(node.uxMm ?? node.ux ?? 0, `ux nodo ${index}`) * displacementFactor;
    const uyMm = finite(node.uyMm ?? node.uy ?? 0, `uy nodo ${index}`) * displacementFactor;
    const deltaUxMm = finite(node.deltaUxMm ?? node.deltaUx ?? uxMm / displacementFactor, `deltaUx nodo ${index}`) * displacementFactor;
    const deltaUyMm = finite(node.deltaUyMm ?? node.deltaUy ?? uyMm / displacementFactor, `deltaUy nodo ${index}`) * displacementFactor;
    return {
      id: index,
      sourceNodeId: node.id ?? index,
      xM: finite(node.xM ?? node.x, `x nodo ${index}`) * lengthFactor,
      yM: finite(node.yM ?? node.y, `y nodo ${index}`) * lengthFactor,
      uxMm, uyMm, deltaUxMm, deltaUyMm,
      displacementMm: Math.hypot(uxMm, uyMm),
      rainfallInducedDisplacementMm: finite(node.rainfallInducedDisplacementMm ?? Math.hypot(deltaUxMm, deltaUyMm), `desplazamiento nodo ${index}`),
      porePressureKpa: finite(node.porePressureKpa ?? node.porePressure ?? 0, `presión nodo ${index}`) * pressureFactor
    };
  });
  if (new Set(adapted.map((node) => String(node.sourceNodeId))).size !== adapted.length) throw new Error("Los identificadores de nodos FEM externos deben ser únicos en cada estado");
  return adapted;
}

function canonicalizeTimeSeries(adaptedStates) {
  const canonical = adaptedStates[0].nodes;
  const canonicalIds = canonical.map((node) => String(node.sourceNodeId));
  return adaptedStates.map((state, stateIndex) => {
    const bySourceId = new Map(state.nodes.map((node) => [String(node.sourceNodeId), node]));
    if (bySourceId.size !== canonicalIds.length || canonicalIds.some((id) => !bySourceId.has(id))) throw new Error(`El estado temporal ${stateIndex} no conserva la topología de nodos`);
    const nodes = canonicalIds.map((id, index) => {
      const node = bySourceId.get(id);
      const reference = canonical[index];
      if (Math.abs(node.xM - reference.xM) > 1e-8 || Math.abs(node.yM - reference.yM) > 1e-8) throw new Error(`El nodo ${id} cambia de coordenada entre estados; usa desplazamientos, no coordenadas deformadas`);
      return { ...node, id: index };
    });
    return { hour: state.hour, ...summarize(nodes, state), nodes };
  });
}

function adaptElements(elements, nodes) {
  if (!Array.isArray(elements) || !elements.length || elements.length > 100_000) throw new Error("El FEM externo debe contener entre 1 y 100000 elementos triangulares");
  const indexBySourceId = new Map(nodes.map((node) => [String(node.sourceNodeId), node.id]));
  return elements.map((element, index) => {
    const ids = element.nodeIds || element.nodes;
    if (!Array.isArray(ids) || ids.length !== 3 || ids.some((id) => !indexBySourceId.has(String(id)))) throw new Error(`Elemento ${index} debe referenciar exactamente tres nodos existentes`);
    return { id: Number.isInteger(element.id) ? element.id : index, nodeIds: ids.map((id) => indexBySourceId.get(String(id))), material: String(element.material || "EXTERNAL") };
  });
}

function summarize(nodes, state = {}) {
  const maxDisplacement = Math.max(...nodes.map((node) => node.displacementMm));
  const maxRainfallDisplacement = Math.max(...nodes.map((node) => node.rainfallInducedDisplacementMm));
  const maxPore = Math.max(...nodes.map((node) => node.porePressureKpa));
  return {
    maximumDisplacementMm: maxDisplacement,
    maximumRainfallInducedDisplacementMm: maxRainfallDisplacement,
    maximumPorePressureKpa: maxPore,
    mohrCoulombSafetyIndex: state.mohrCoulombSafetyIndex == null ? null : finite(state.mohrCoulombSafetyIndex, "índice de seguridad"),
    riskLevel: state.riskLevel || "UNAVAILABLE"
  };
}

export function adaptExternalFemResult(input = {}) {
  const unitContract = units(input.units);
  const rawStates = Array.isArray(input.timeSeries) && input.timeSeries.length ? input.timeSeries : [{ hour: 1, nodes: input.nodes }];
  if (rawStates.length > 168) throw new Error("El FEM externo admite hasta 168 estados temporales");
  const adaptedStates = rawStates.map((state, index) => {
    const nodes = adaptNodes(state.nodes, unitContract);
    return { ...state, hour: finite(state.hour ?? index + 1, `hora ${index}`), nodes };
  });
  const timeSeries = canonicalizeTimeSeries(adaptedStates);
  const finalNodes = timeSeries.at(-1).nodes;
  const elements = adaptElements(input.elements, finalNodes);
  const summary = summarize(finalNodes, input.summary || timeSeries.at(-1));
  const generatedAt = new Date().toISOString();
  return {
    id: String(input.id || `FEM-EXTERNAL-${Date.now()}`).slice(0, 140),
    generatedAt,
    imported: true,
    method: {
      id: "EXTERNAL_FEM_JSON_ADAPTER_V1",
      formulation: String(input.source?.formulation || "Declarada por la fuente externa"),
      scientificStatus: "FEM_EXTERNO_IMPORTADO_NO_VERIFICADO",
      limitation: "El adaptador valida contrato, unidades y conectividad; no certifica convergencia, formulación ni calibración del software de origen."
    },
    provenance: {
      sourceSoftware: String(input.source?.software || "NO_DECLARADO").slice(0, 100),
      sourceModel: String(input.source?.model || "NO_DECLARADO").slice(0, 140),
      coordinateReference: String(input.source?.coordinateReference || "LOCAL_NO_DECLARADO").slice(0, 180),
      originalUnits: unitContract,
      importedAt: generatedAt
    },
    scenario: { external: true, meshX: null, meshY: null },
    rainfall: {
      observedDailyTotalMm: finite(input.rainfall?.totalMm ?? 0, "lluvia total"),
      date: input.rainfall?.date || generatedAt.slice(0, 10),
      temporalProfile: input.rainfall?.temporalProfile || "EXTERNAL_NOT_DECLARED",
      source: input.rainfall?.source || "EXTERNAL"
    },
    mesh: { nodeCount: finalNodes.length, elementCount: elements.length, nodes: finalNodes, elements },
    timeSeries,
    summary: {
      ...summary,
      durationHours: timeSeries.length,
      totalRainfallMm: finite(input.rainfall?.totalMm ?? 0, "lluvia total"),
      crestDisplacementMm: 0,
      toeDisplacementMm: 0,
      meanEffectiveStressKpa: 0,
      converged: input.convergence?.converged === true,
      maximumSolverResidual: input.convergence?.relativeResidual == null ? null : finite(input.convergence.relativeResidual, "residuo del solver")
    },
    lstmForecasts: {},
    physicsGuidedForecasts: {}
  };
}
