// Contrato espacial independiente: unidades originales, sin IA/FEM ficticio ni relleno temporal.
export function makeMineFrame(asset, index = 0, amplification = 1) {
  if (!asset || !["CENTURY", "PASCO"].includes(asset.id) || !Array.isArray(asset.frames) || !Array.isArray(asset.baseline)) throw new Error("Caso de mina incompatible");
  if (!Number.isInteger(index) || index < 0 || index >= asset.frames.length) throw new Error("Fotograma de mina fuera de rango");
  if (!Number.isFinite(amplification) || amplification < 1 || amplification > 5000) throw new Error("Amplificación visual fuera de rango");
  const source = asset.frames[index], byIndex = new Map();
  const points = source.points.map((row) => {
    const [sensorIndex, e, n, h] = row, reference = asset.baseline[sensorIndex];
    if (![e, n, h].every(Number.isFinite) || !asset.sensorIds[sensorIndex]) throw new Error("Punto de mina inválido");
    const delta = reference ? [e - reference[0], n - reference[1], h - reference[2]] : null;
    const point = { index: sensorIndex, id: asset.sensorIds[sensorIndex], coordinate: [e, n, h], reference,
      displacementMm: delta ? Math.hypot(...delta) * 1000 : null, delta,
      timeLocal: row[4] || null, sourceRow: row[5] ?? null, qcJump: Boolean(row[7]),
      // Transformación rígida + permutación de ejes; nunca normalizar a 170 unidades.
      observed: { x: e - asset.origin[0], y: h - asset.origin[2], z: n - asset.origin[1] },
      base: reference ? { x: reference[0] - asset.origin[0], y: reference[2] - asset.origin[2], z: reference[1] - asset.origin[1] } : null };
    point.display = reference ? { x: point.base.x + delta[0] * amplification, y: point.base.y + delta[2] * amplification, z: point.base.z + delta[1] * amplification } : point.observed;
    byIndex.set(sensorIndex, point);
    return point;
  });
  const definitions = asset.geometry.vertices || asset.baseline.map((_, pointIndex) => ({ pointIndex }));
  const vertices = definitions.map((v) => {
    const point = byIndex.get(v.pointIndex);
    return point ? { point, offsetE: v.offsetE || 0, offsetN: v.offsetN || 0 } : null;
  });
  const faces = asset.geometry.faces.filter((face) => face.every((i) => vertices[i]));
  // Referencia histórica fija: no crea lecturas ni desplazamientos del día.
  const referenceVertices = definitions.map((v) => {
    const reference = asset.baseline[v.pointIndex];
    return reference ? { x: reference[0] - asset.origin[0] + (v.offsetE || 0), y: reference[2] - asset.origin[2], z: reference[1] - asset.origin[1] + (v.offsetN || 0) } : null;
  });
  const referenceFaces = (asset.geometry.referenceFaces || asset.geometry.faces).filter((face) => face.every((i) => referenceVertices[i]));
  const referenceSurface = { vertices: referenceVertices, faces: referenceFaces };
  const measuredFaceKeys = new Set(faces.map((face) => face.join(",")));
  const referenceOnlyFaces = referenceFaces.filter((face) => !measuredFaceKeys.has(face.join(",")));
  const magnitudes = points.map((p) => p.displacementMm).filter(Number.isFinite);
  return { caseId: asset.id, date: source.date, referenceDate: asset.referenceDate, amplification, points, vertices, faces,
    referenceSurface, referenceOnlyFaces, observedPointCount: points.length, visibleTriangleCount: referenceFaces.length,
    observedTriangleCount: faces.length, referenceOnlyTriangleCount: referenceFaces.length - faces.length,
    missingObservationTriangleCount: asset.geometry.faces.length - faces.length,
    referenceContextTriangleCount: referenceFaces.length - asset.geometry.faces.length,
    missingPointCount: asset.sensorIds.length - points.length, maximumDisplacementMm: magnitudes.length ? Math.max(...magnitudes) : null,
    qcJumpCount: points.filter((p) => p.qcJump).length, rain: source.rain,
    operationalDecisionAllowed: false, kind: asset.id === "CENTURY" ? "OBSERVED_COORDINATE_REPLAY" : "HISTORICAL_DEM_PROFILE" };
}

export function mineChatSnapshot(asset, frame, selectedId) {
  if (!asset || !frame) return null;
  return { activeMine: asset.id, name: asset.name, status: asset.status, source: asset.source,
    coordinateReference: asset.coordinateReference, geometry: { ...asset.geometry, faces: undefined, referenceFaces: undefined, vertices: undefined },
    referenceDate: asset.referenceDate, displayedDate: frame.date, amplification: frame.amplification,
    displayedPointCount: frame.observedPointCount, missingPointCount: frame.missingPointCount,
    visibleTriangleCount: frame.visibleTriangleCount, observedTriangleCount: frame.observedTriangleCount,
    referenceOnlyTriangleCount: frame.referenceOnlyTriangleCount, missingObservationTriangleCount: frame.missingObservationTriangleCount,
    referenceContextTriangleCount: frame.referenceContextTriangleCount,
    surfaceDisplay: "Gris: superficie histórica de referencia, no medición actual ni desplazamiento cero. El fondo también incluye triángulos esquemáticos entre prismas muy separados, siempre grises y sin movimiento. El movimiento y los colores analíticos solo cubren triángulos admitidos con tres lecturas del día.",
    maximumDisplacementMm: frame.maximumDisplacementMm,
    rain: frame.rain, selectedPoint: frame.points.find((p) => p.id === selectedId) || null,
    points: frame.points.map((p) => ({ id: p.id, coordinate: p.coordinate, displacementMm: p.displacementMm, timeLocal: p.timeLocal, qcJump: p.qcJump })),
    warnings: asset.warnings, operationalDecisionAllowed: false,
    note: "Century sudoeste: reproducción de coordenadas, no FEM ni pronóstico LSTM West Wall. Pasco: perfil SRTM estático de 2000, no deformación de campo." };
}
