import { DEFAULT_RISK_POLICY, DEFAULT_SIMULATION_PARAMETERS, syntheticReadings, validateReading } from "./core/forecast-engine.js";
import { RESEARCH_PROTOCOL, runAblationStudy } from "./core/research-engine.js";
import { rainfallRecordForDate, uniformHourlyProfile } from "./core/rainfall-history.js";
import { FEM_2D_METHOD } from "./core/fem-2d.js";
import { TA01_PARAMETER_RANGES, TA01_STUDY_CASE, runTa01FemCase } from "./core/study-case-ta01.js";

const SIMULATION_RANGES = {
  cohesionKpa: [20, 500], frictionAngleDeg: [5, 55], unitWeightKNm3: [10, 35], slopeAngleDeg: [15, 75], characteristicDepthM: [5, 100],
  waterPressureFactor: [0, 2], rainfallFactor: [0, 3], weatheringFactor: [0, 0.9], seismicCoefficient: [0, 0.5], surchargeKpa: [0, 500], drainageEfficiency: [0, 0.9], reinforcementKpa: [0, 500],
  slopeHeightM: [20, 300], slopeWidthM: [40, 600], bedrockDepthM: [0, 150], rockDiscontinuityFactor: [0, 0.9]
};
const SIMULATION_ENUMS = { geometryType: ["LINEAR", "BENCHED", "CIRCULAR", "SEMICIRCULAR", "WASTE_DUMP"], bedrockCondition: ["NONE", "HARD", "FRACTURED"] };

export class TwinStore {
  constructor({ rainfallDataset = null } = {}) {
    this.readings = syntheticReadings({ critical: false });
    this.alerts = [];
    this.weatherEvents = [];
    this.experiments = [];
    this.femRuns = [];
    this.rainfallDataset = rainfallDataset;
    this.simulationParameters = { ...DEFAULT_SIMULATION_PARAMETERS };
    this.riskPolicy = { ...DEFAULT_RISK_POLICY };
    this.geometry = {
      current: { id: "GEO-PROC-001", source: "PROCEDURAL", name: "Talud paramétrico", scientificStatus: "DEMONSTRACION" },
      history: []
    };
    this.modelStatus = [
      { component: "FEM", status: "FEM_2D_DISPONIBLE", detail: "Solver triangular lineal para TA-01 disponible; el pronóstico en vivo aún usa el indicador reducido." },
      { component: "LSTM", status: "LSTM_ENTRENADA_SEMISINTETICA", detail: "LSTM many-to-one entrenada a 1 y 6 horas; requiere validación con desplazamientos observados." },
      { component: "PINN", status: "PROTOTIPO_FISICO", detail: "Corrección informada por física; requiere entrenamiento y validación." }
    ];
  }

  addReading(input) {
    const reading = validateReading(input);
    this.readings.push(reading);
    this.readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    this.readings = this.readings.slice(-500);
    return reading;
  }

  getReadings(limit = 72) {
    return this.readings.slice(-Math.min(Math.max(Number(limit) || 72, 1), 500));
  }

  loadScenario(name) {
    if (!["normal", "critical"].includes(name)) throw new Error("Escenario válido: normal o critical");
    this.readings = syntheticReadings({ critical: name === "critical" });
    this.alerts = [];
    this.weatherEvents = [];
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
    if (!(this.riskPolicy.fsWatch >= this.riskPolicy.fsAlert && this.riskPolicy.fsAlert >= this.riskPolicy.fsCritical)) throw new Error("Los umbrales de FS deben ser decrecientes");
    this.riskPolicy.status = "CONFIGURADA_PENDIENTE_VALIDACION";
    return { ...this.riskPolicy };
  }

  runResearchAblation(input = {}) {
    const experiment = runAblationStudy(this.getReadings(500), input, this.simulationParameters, this.riskPolicy);
    this.experiments.unshift(experiment);
    this.experiments = this.experiments.slice(0, 20);
    return experiment;
  }

  runFemCase(input = {}) {
    const run = runTa01FemCase(this.rainfallDataset, input);
    this.femRuns.unshift(run);
    this.femRuns = this.femRuns.slice(0, 5);
    return run;
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
    return entry;
  }

  getTwinStatus() {
    const latest = this.readings.at(-1);
    return {
      updatedAt: new Date().toISOString(),
      dataStatus: latest?.source === "synthetic" ? "DATOS_SINTETICOS" : latest?.source === "rain-simulation" ? "SIMULACION_LLUVIA" : latest?.source === "historical-rain-replay" ? "REANALISIS_LLUVIA_NASA_POWER" : "DATOS_INGRESADOS",
      geometry: this.geometry,
      modelStatus: this.modelStatus,
      monitoring: {
        readingCount: this.readings.length,
        sensorIds: [...new Set(this.readings.map((reading) => reading.sensorId))],
        latestReadingAt: latest?.timestamp ?? null
      },
      weather: { latestEvent: this.weatherEvents[0] || null, eventCount: this.weatherEvents.length, rainfallDataset: this.rainfallDataset ? { metadata: this.rainfallDataset.metadata, summary: this.rainfallDataset.summary } : null },
      research: this.getResearchStatus(),
      riskPolicy: this.riskPolicy
    };
  }

  recordAlert(forecast) {
    if (forecast.risk.level === "NORMAL") return null;
    const alert = {
      id: `ALT-${Date.now()}`,
      createdAt: forecast.generatedAt,
      level: forecast.risk.level,
      sensorId: forecast.sensorId,
      message: `Pronóstico ${forecast.horizonHours}h: ${forecast.risk.level}; FS=${forecast.femState.factorOfSafety}.`,
      forecast
    };
    this.alerts.unshift(alert);
    this.alerts = this.alerts.slice(0, 50);
    return alert;
  }
}
