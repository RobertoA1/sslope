import { DEFAULT_RISK_POLICY, DEFAULT_SIMULATION_PARAMETERS, syntheticReadings, validateReading } from "./core/forecast-engine.js";
import { RESEARCH_PROTOCOL, runAblationStudy } from "./core/research-engine.js";
import { rainfallRecordForDate, uniformHourlyProfile } from "./core/rainfall-history.js";
import { FEM_2D_METHOD } from "./core/fem-2d.js";
import { adaptExternalFemResult } from "./core/external-fem-adapter.js";
import { forecastFemRunWithLstm } from "./core/lstm-inference.js";
import { forecastFemRunWithPhysicsGuidance } from "./core/physics-guided-inference.js";
import { TA01_PARAMETER_RANGES, TA01_STUDY_CASE, runTa01FemCase } from "./core/study-case-ta01.js";

const SIMULATION_RANGES = {
  cohesionKpa: [20, 500], frictionAngleDeg: [5, 55], unitWeightKNm3: [10, 35], slopeAngleDeg: [15, 75], characteristicDepthM: [5, 100],
  waterPressureFactor: [0, 2], rainfallFactor: [0, 3], weatheringFactor: [0, 0.9], seismicCoefficient: [0, 0.5], surchargeKpa: [0, 500], drainageEfficiency: [0, 0.9], reinforcementKpa: [0, 500],
  slopeHeightM: [20, 300], slopeWidthM: [40, 600], bedrockDepthM: [0, 150], rockDiscontinuityFactor: [0, 0.9]
};
const SIMULATION_ENUMS = { geometryType: ["LINEAR", "BENCHED", "CIRCULAR", "SEMICIRCULAR", "WASTE_DUMP"], bedrockCondition: ["NONE", "HARD", "FRACTURED"] };
const DEMO_SOURCES = new Set(["synthetic", "rain-simulation", "historical-rain-replay", "template-example", "api", "api-unverified", "unknown"]);

export class TwinStore {
  constructor({ rainfallDataset = null, lstmModels = {}, physicsGuidedModels = {}, spatialPinnArtifact = null, ta01SpatialPinnArtifact = null, repository = null } = {}) {
    this.repository = repository;
    const persistedReadings = repository?.loadRecentReadings(500) || [];
    this.readings = persistedReadings.length ? persistedReadings : syntheticReadings({ critical: false });
    this.alerts = repository?.loadRecentAlerts(50) || [];
    this.weatherEvents = [];
    this.experiments = [];
    this.femRuns = [];
    this.rainfallDataset = rainfallDataset;
    this.lstmModels = lstmModels;
    this.physicsGuidedModels = physicsGuidedModels;
    this.activeScenario = false;
    if (repository && !persistedReadings.length) repository.recordTelemetryBatch(this.readings);
    Object.values(lstmModels).forEach((model) => repository?.registerModel(model, "LSTM"));
    Object.values(physicsGuidedModels).forEach((model) => repository?.registerModel(model, "PHYSICS_GUIDED_CORRECTOR"));
    if (spatialPinnArtifact) repository?.registerModel(spatialPinnArtifact, "SPATIAL_PINN_BENCHMARK");
    if (ta01SpatialPinnArtifact) repository?.registerModel(ta01SpatialPinnArtifact, "TA01_SPATIAL_PINN_DISCRETE");
    this.simulationParameters = { ...DEFAULT_SIMULATION_PARAMETERS };
    this.riskPolicy = { ...DEFAULT_RISK_POLICY };
    const persistedGeometry = repository?.latestGeometry();
    this.geometry = {
      current: persistedGeometry || { id: "GEO-PROC-001", source: "PROCEDURAL", name: "Talud paramétrico", scientificStatus: "DEMONSTRACION" },
      history: []
    };
    this.modelStatus = [
      { component: "FEM", status: "FEM_2D_DISPONIBLE", detail: "Solver triangular lineal para TA-01 disponible; el pronóstico general aún usa el indicador reducido." },
      { component: "LSTM", status: Object.keys(lstmModels).length ? "LSTM_INTEGRADA_SEMISINTETICA" : "LSTM_NO_DISPONIBLE", detail: Object.keys(lstmModels).length ? "LSTM many-to-one conectada al FEM TA-01 a 1 y 6 horas; requiere validación con desplazamientos observados." : "No se cargaron los artefactos de pesos entrenados." },
      { component: "Red física agregada", status: Object.keys(physicsGuidedModels).length ? "ENTRENADA" : "NO_DISPONIBLE", detail: Object.keys(physicsGuidedModels).length ? "Corrector neuronal monótono conectado a la LSTM TA-01." : "Corrección informada por física pendiente." },
      { component: "PINN espacial · manufacturada", status: spatialPinnArtifact?.verification?.passed ? "BENCHMARK_PDE_VERIFICADO" : "NO_VERIFICADA", detail: spatialPinnArtifact?.verification?.passed ? "Equilibrio elástico y contorno verificados sobre una solución manufacturada; no equivale a validar TA-01 con campo." : "No se cargó una verificación espacial de equilibrio PDE." },
      { component: "PIELM espacial · TA-01", status: ta01SpatialPinnArtifact?.verification?.passedInternalApproximationGate ? "EQUILIBRIO_DISCRETO_APROXIMADO" : "NO_VERIFICADA", detail: ta01SpatialPinnArtifact?.verification?.passedInternalApproximationGate ? "Aproximación del incremento de desplazamiento por un evento de lluvia, con equilibrio FEM discreto y 12 sensores semisintéticos. Comparte el solver de referencia; no está validada con campo ni se usa para alertas." : "No se cargó el modelo espacial TA-01." }
    ];
  }

  addReading(input) {
    return this.addReadings([input]).readings[0];
  }

  addReadings(inputs) {
    if (!Array.isArray(inputs)) throw new Error("readings debe ser una lista");
    if (!inputs.length) throw new Error("El lote debe contener al menos una lectura");
    if (inputs.length > 5000) throw new Error("El lote admite como máximo 5000 lecturas");
    const readings = inputs.map((input, index) => {
      try { return validateReading(input); }
      catch (error) { throw new Error(`Lectura ${index + 1}: ${error.message}`); }
    });
    this.repository?.recordTelemetryBatch(readings);
    this.activeScenario = false;
    this.readings.push(...readings);
    this.readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    this.readings = this.readings.slice(-500);
    return {
      acceptedCount: readings.length,
      firstTimestamp: readings.reduce((earliest, reading) => reading.timestamp < earliest ? reading.timestamp : earliest, readings[0].timestamp),
      lastTimestamp: readings.reduce((latest, reading) => reading.timestamp > latest ? reading.timestamp : latest, readings[0].timestamp),
      sensorIds: [...new Set(readings.map((reading) => reading.sensorId))],
      readings
    };
  }

  getReadings(limit = 72, sensorId = null) {
    const count = Math.min(Math.max(Number(limit) || 72, 1), 500);
    const selectedSensor = sensorId || this.readings.at(-1)?.sensorId;
    if (!selectedSensor) return [];
    const latest = this.getSensors().find((sensor) => sensor.sensorId === selectedSensor);
    const sourceMode = DEMO_SOURCES.has(latest?.latestSource) ? "demo" : "declared";
    if (this.activeScenario) return this.readings.filter((reading) => reading.sensorId === selectedSensor).slice(-count);
    if (this.repository) return this.repository.loadRecentReadings(count, selectedSensor, sourceMode);
    return this.readings.filter((reading) => reading.sensorId === selectedSensor && DEMO_SOURCES.has(reading.source) === (sourceMode === "demo")).slice(-count);
  }

  getSensors() {
    if (this.repository && !this.activeScenario) return this.repository.loadSensors();
    const grouped = new Map();
    for (const reading of this.readings) {
      const current = grouped.get(reading.sensorId) || { sensorId: reading.sensorId, firstSeen: reading.timestamp, lastSeen: reading.timestamp, latestSource: reading.source, readingCount: 0 };
      current.firstSeen = reading.timestamp < current.firstSeen ? reading.timestamp : current.firstSeen;
      if (reading.timestamp >= current.lastSeen) { current.lastSeen = reading.timestamp; current.latestSource = reading.source; }
      current.readingCount++;
      grouped.set(reading.sensorId, current);
    }
    return [...grouped.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  loadScenario(name) {
    if (!["normal", "critical"].includes(name)) throw new Error("Escenario válido: normal o critical");
    this.readings = syntheticReadings({ critical: name === "critical" });
    this.activeScenario = true;
    this.alerts = [];
    this.weatherEvents = [];
    this.repository?.recordTelemetryBatch(this.readings);
    return this.getReadings();
  }

  simulateRainfall(input) {
    const intensityMmH = Number(input.intensityMmH);
    const durationHours = Number(input.durationHours);
    if (!Number.isFinite(intensityMmH) || intensityMmH < 0 || intensityMmH > 150) throw new Error("intensityMmH debe estar entre 0 y 150");
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 72) throw new Error("durationHours debe ser un entero entre 1 y 72");
    return this.applyRainfallProfile({
      hourlyRainfallMm: Array.from({ length: durationHours }, () => intensityMmH),
      readingSource: "rain-simulation",
      qualityFlag: "SIMULATED",
      scientificStatus: "SIMULACION_HIDROLOGICA_DEMOSTRATIVA",
      provenance: { source: "MANUAL_SIMULATION", temporalDistribution: "CONSTANT_INTENSITY" }
    });
  }

  simulateHistoricalRainfall(input) {
    const record = rainfallRecordForDate(this.rainfallDataset, input.date);
    return this.applyRainfallProfile({
      hourlyRainfallMm: uniformHourlyProfile(record.rainfallMmDay),
      readingSource: "historical-rain-replay",
      qualityFlag: "SOURCE_DAILY_TEMPORAL_PROFILE_ESTIMATED",
      scientificStatus: "REANALISIS_DIARIO_CON_PERFIL_HORARIO_ESTIMADO",
      provenance: {
        source: this.rainfallDataset.metadata.id,
        sourceDate: record.date,
        observedDailyTotalMm: record.rainfallMmDay,
        observedAggregation: "DAILY",
        temporalDistribution: "UNIFORM_24H_ESTIMATED"
      }
    });
  }

  applyRainfallProfile({ hourlyRainfallMm, readingSource, qualityFlag, scientificStatus, provenance }) {
    if (!Array.isArray(hourlyRainfallMm) || hourlyRainfallMm.length < 1 || hourlyRainfallMm.length > 72) throw new Error("El perfil de lluvia debe contener entre 1 y 72 horas");
    const profile = hourlyRainfallMm.map((value) => Number(value));
    if (profile.some((value) => !Number.isFinite(value) || value < 0 || value > 150)) throw new Error("Cada intensidad horaria debe estar entre 0 y 150 mm/h");
    const previous = this.readings.at(-1);
    if (!previous) throw new Error("No existen lecturas base para simular lluvia");
    const drainage = this.simulationParameters.drainageEfficiency;
    const infiltration = this.simulationParameters.rainfallFactor;
    const added = [];
    let porePressure = previous.porePressureKpa;
    let displacement = previous.displacementMm;
    for (let hour = 1; hour <= profile.length; hour++) {
      const intensityMmH = profile[hour - 1];
      const effectiveRain = intensityMmH * infiltration * (1 - drainage * 0.72);
      const saturation = 1 - Math.exp(-hour / Math.max(2, profile.length * 0.38));
      porePressure += effectiveRain * (0.08 + saturation * 0.12) - drainage * 0.55;
      porePressure = Math.max(0, porePressure);
      const pressureAcceleration = Math.max(0, porePressure - previous.porePressureKpa) * 0.0022;
      displacement += 0.04 + effectiveRain * 0.0045 + pressureAcceleration + this.simulationParameters.weatheringFactor * 0.08;
      added.push({
        sensorId: previous.sensorId,
        timestamp: new Date(new Date(previous.timestamp).getTime() + hour * 3_600_000).toISOString(),
        displacementMm: Number(displacement.toFixed(3)),
        porePressureKpa: Number(porePressure.toFixed(3)),
        rainfallMmH: intensityMmH,
        qualityFlag,
        source: readingSource
      });
    }
    this.readings.push(...added);
    this.readings = this.readings.slice(-500);
    this.repository?.recordTelemetryBatch(added);
    const event = {
      id: `RAIN-${Date.now()}`,
      createdAt: new Date().toISOString(),
      intensityMmH: Number(Math.max(...profile).toFixed(3)),
      meanIntensityMmH: Number((profile.reduce((sum, value) => sum + value, 0) / profile.length).toFixed(3)),
      durationHours: profile.length,
      totalRainfallMm: Number(profile.reduce((sum, value) => sum + value, 0).toFixed(2)),
      drainageEfficiency: drainage,
      infiltrationFactor: infiltration,
      porePressureIncreaseKpa: Number((porePressure - previous.porePressureKpa).toFixed(2)),
      displacementIncreaseMm: Number((displacement - previous.displacementMm).toFixed(3)),
      scientificStatus,
      provenance
    };
    this.weatherEvents.unshift(event);
    this.weatherEvents = this.weatherEvents.slice(0, 30);
    this.repository?.recordEvent(event, "WEATHER");
    return { event, readings: added };
  }

  getRainfallHistory() {
    if (!this.rainfallDataset) return { available: false, error: "No se cargó el conjunto NASA POWER" };
    return {
      available: true,
      metadata: this.rainfallDataset.metadata,
      summary: this.rainfallDataset.summary,
      records: this.rainfallDataset.records
    };
  }

  updateSimulationParameters(input) {
    for (const [key, value] of Object.entries(input)) {
      if (key in SIMULATION_ENUMS) {
        if (!SIMULATION_ENUMS[key].includes(value)) throw new Error(`${key} no es un valor permitido`);
        this.simulationParameters[key] = value;
        continue;
      }
      if (!(key in SIMULATION_RANGES)) throw new Error(`Parámetro de simulación no permitido: ${key}`);
      const numeric = Number(value);
      const [min, max] = SIMULATION_RANGES[key];
      if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error(`${key} debe estar entre ${min} y ${max}`);
      this.simulationParameters[key] = numeric;
    }
    return { ...this.simulationParameters };
  }

  updateRiskPolicy(input) {
    const allowed = ["riskWatch", "riskAlert", "riskCritical", "fsWatch", "fsAlert", "fsCritical", "uncertaintyWatch"];
    for (const [key, value] of Object.entries(input)) {
      if (!allowed.includes(key)) throw new Error(`Umbral de riesgo no permitido: ${key}`);
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 2) throw new Error(`${key} debe ser numérico y estar dentro de un rango válido`);
      this.riskPolicy[key] = numeric;
    }
    if (!(this.riskPolicy.riskWatch <= this.riskPolicy.riskAlert && this.riskPolicy.riskAlert <= this.riskPolicy.riskCritical)) throw new Error("Los umbrales de riesgo deben ser crecientes");
    if (!(this.riskPolicy.fsWatch >= this.riskPolicy.fsAlert && this.riskPolicy.fsAlert >= this.riskPolicy.fsCritical)) throw new Error("Los umbrales del índice reducido deben ser decrecientes");
    this.riskPolicy.status = "CONFIGURADA_PENDIENTE_VALIDACION";
    return { ...this.riskPolicy };
  }

  runResearchAblation(input = {}) {
    const experiment = runAblationStudy(this.getReadings(500), input, this.simulationParameters, this.riskPolicy);
    this.experiments.unshift(experiment);
    this.experiments = this.experiments.slice(0, 20);
    this.repository?.recordExperiment(experiment);
    return experiment;
  }

  runFemCase(input = {}) {
    const run = runTa01FemCase(this.rainfallDataset, input);
    run.lstmForecasts = Object.fromEntries(Object.entries(this.lstmModels).map(([horizon, artifact]) => [horizon, forecastFemRunWithLstm(run, artifact)]));
    run.physicsGuidedForecasts = Object.fromEntries(Object.entries(this.physicsGuidedModels).flatMap(([horizon, artifact]) => {
      const lstmArtifact = this.lstmModels[horizon];
      return lstmArtifact ? [[horizon, forecastFemRunWithPhysicsGuidance(run, artifact, lstmArtifact)]] : [];
    }));
    this.femRuns.unshift(run);
    this.femRuns = this.femRuns.slice(0, 5);
    this.repository?.recordFemRun(run);
    return run;
  }

  importFemCase(input = {}) {
    const run = adaptExternalFemResult(input);
    this.femRuns.unshift(run);
    this.femRuns = this.femRuns.slice(0, 5);
    this.repository?.recordFemRun(run);
    return run;
  }

  forecastFemWithLstm(input = {}) {
    const horizonHours = Number(input.horizonHours ?? 1);
    if (![1, 6].includes(horizonHours)) throw new Error("La LSTM TA-01 admite horizontes de 1 o 6 horas");
    const run = input.runId ? this.femRuns.find((entry) => entry.id === input.runId) : this.femRuns[0];
    if (!run) throw new Error("Primero ejecuta un caso FEM TA-01");
    const artifact = this.lstmModels[horizonHours];
    if (!artifact) throw new Error(`No se cargó el modelo LSTM de ${horizonHours} h`);
    const forecast = forecastFemRunWithLstm(run, artifact, { horizonHours, originHour: input.originHour });
    run.lstmForecasts ??= {};
    run.lstmForecasts[horizonHours] = forecast;
    this.repository?.recordForecast(forecast);
    return forecast;
  }

  forecastFemWithPhysicsGuidance(input = {}) {
    const horizonHours = Number(input.horizonHours ?? 1);
    if (![1, 6].includes(horizonHours)) throw new Error("El híbrido físico TA-01 admite horizontes de 1 o 6 horas");
    const run = input.runId ? this.femRuns.find((entry) => entry.id === input.runId) : this.femRuns[0];
    if (!run) throw new Error("Primero ejecuta un caso FEM TA-01");
    const artifact = this.physicsGuidedModels[horizonHours];
    const lstmArtifact = this.lstmModels[horizonHours];
    if (!artifact || !lstmArtifact) throw new Error(`No se cargó la cadena LSTM + corrector físico de ${horizonHours} h`);
    const forecast = forecastFemRunWithPhysicsGuidance(run, artifact, lstmArtifact, { horizonHours, originHour: input.originHour });
    run.physicsGuidedForecasts ??= {};
    run.physicsGuidedForecasts[horizonHours] = forecast;
    this.repository?.recordForecast(forecast);
    return forecast;
  }

  getFemStatus() {
    const latest = this.femRuns[0];
    return {
      available: Boolean(this.rainfallDataset),
      studyCase: TA01_STUDY_CASE,
      method: FEM_2D_METHOD,
      parameterRanges: TA01_PARAMETER_RANGES,
      rainfall: this.rainfallDataset ? { metadata: this.rainfallDataset.metadata, summary: this.rainfallDataset.summary } : null,
      runCount: this.femRuns.length,
      lstm: {
        availableHorizons: Object.keys(this.lstmModels).map(Number).sort((a, b) => a - b),
        scientificStatus: Object.keys(this.lstmModels).length ? "INTEGRADA_SEMISINTETICA_NO_OPERACIONAL" : "NO_DISPONIBLE"
      },
      physicsGuided: {
        availableHorizons: Object.keys(this.physicsGuidedModels).map(Number).sort((a, b) => a - b),
        scientificStatus: Object.keys(this.physicsGuidedModels).length ? "ENTRENADA_AGREGADA_NO_PINN_PDE_NO_OPERACIONAL" : "NO_DISPONIBLE"
      },
      latestRun: latest ? { id: latest.id, generatedAt: latest.generatedAt, rainfall: latest.rainfall, scenario: latest.scenario, summary: latest.summary } : null
    };
  }

  getResearchStatus() {
    return {
      protocol: RESEARCH_PROTOCOL,
      components: this.modelStatus,
      fem2d: this.getFemStatus(),
      latestExperiment: this.experiments[0] || null,
      experimentCount: this.experiments.length
    };
  }

  registerGeometry(input) {
    const allowedSources = ["PROCEDURAL", "PHOTO_APPROXIMATION", "IMPORTED_MODEL"];
    if (!allowedSources.includes(input.source)) throw new Error("Fuente de geometría no permitida");
    const entry = {
      id: `GEO-${Date.now()}`,
      source: input.source,
      name: String(input.name || "Geometría sin nombre").slice(0, 120),
      format: input.format ? String(input.format).slice(0, 20) : null,
      scientificStatus: input.scientificStatus || "PENDIENTE_VALIDACION",
      note: String(input.note || "").slice(0, 500),
      createdAt: new Date().toISOString()
    };
    this.geometry.current = entry;
    this.geometry.history.unshift(entry);
    this.geometry.history = this.geometry.history.slice(0, 30);
    this.repository?.recordGeometry(entry);
    return entry;
  }

  getTwinStatus(sensorId = null) {
    const readings = this.getReadings(500, sensorId);
    const latest = readings.at(-1);
    return {
      updatedAt: new Date().toISOString(),
      dataStatus: latest?.source === "synthetic" ? "DATOS_SINTETICOS" : latest?.source === "rain-simulation" ? "SIMULACION_LLUVIA" : latest?.source === "historical-rain-replay" ? "REANALISIS_LLUVIA_NASA_POWER" : latest?.source === "template-example" ? "PLANTILLA_DEMOSTRATIVA" : DEMO_SOURCES.has(latest?.source) ? "DATOS_INGRESADOS_NO_VERIFICADOS" : "DATOS_INGRESADOS",
      geometry: this.geometry,
      modelStatus: this.modelStatus,
      monitoring: {
        readingCount: readings.length,
        sensorIds: this.getSensors().map((sensor) => sensor.sensorId),
        latestReadingAt: latest?.timestamp ?? null
      },
      weather: { latestEvent: this.weatherEvents[0] || null, eventCount: this.weatherEvents.length, rainfallDataset: this.rainfallDataset ? { metadata: this.rainfallDataset.metadata, summary: this.rainfallDataset.summary } : null },
      research: this.getResearchStatus(),
      riskPolicy: this.riskPolicy
    };
  }

  recordAlert(forecast) {
    if (forecast.risk.level === "NORMAL") return null;
    if (forecast.modelDiagnostics?.dataQuality?.latestAgeHours > 3) return null;
    const previous = this.alerts.find((entry) => entry.sensorId === forecast.sensorId && entry.forecast?.horizonHours === forecast.horizonHours);
    const withinCooldown = previous && new Date(forecast.generatedAt) - new Date(previous.createdAt) < 15 * 60_000;
    if (withinCooldown && previous.level === forecast.risk.level) return null;
    const alert = {
      id: `ALT-${Date.now()}`,
      createdAt: forecast.generatedAt,
      level: forecast.risk.level,
      sensorId: forecast.sensorId,
      message: `[DEMOSTRACIÓN] Pronóstico ${forecast.horizonHours}h: ${forecast.risk.level}; índice reducido=${forecast.femState.factorOfSafety}.`,
      forecast
    };
    this.alerts.unshift(alert);
    this.alerts = this.alerts.slice(0, 50);
    this.repository?.recordAlert(alert);
    return alert;
  }
}
