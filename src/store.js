import { DEFAULT_RISK_POLICY, DEFAULT_SIMULATION_PARAMETERS, syntheticReadings, validateReading } from "./core/forecast-engine.js";

const SIMULATION_RANGES = {
  cohesionKpa: [20, 500], frictionAngleDeg: [5, 55], unitWeightKNm3: [10, 35], slopeAngleDeg: [15, 75], characteristicDepthM: [5, 100],
  waterPressureFactor: [0, 2], rainfallFactor: [0, 3], weatheringFactor: [0, 0.9], seismicCoefficient: [0, 0.5], surchargeKpa: [0, 500], drainageEfficiency: [0, 0.9], reinforcementKpa: [0, 500],
  slopeHeightM: [20, 300], slopeWidthM: [40, 600], bedrockDepthM: [0, 150], rockDiscontinuityFactor: [0, 0.9]
};
const SIMULATION_ENUMS = { geometryType: ["LINEAR", "BENCHED", "CIRCULAR", "SEMICIRCULAR", "WASTE_DUMP"], bedrockCondition: ["NONE", "HARD", "FRACTURED"] };

export class TwinStore {
  constructor() {
    this.readings = syntheticReadings({ critical: false });
    this.alerts = [];
    this.simulationParameters = { ...DEFAULT_SIMULATION_PARAMETERS };
    this.riskPolicy = { ...DEFAULT_RISK_POLICY };
    this.geometry = {
      current: { id: "GEO-PROC-001", source: "PROCEDURAL", name: "Talud paramétrico", scientificStatus: "DEMONSTRACION" },
      history: []
    };
    this.modelStatus = [
      { component: "FEM", status: "MODELO_REDUCIDO", detail: "Indicador físico Mohr–Coulomb simplificado; no es un solver FEM calibrado." },
      { component: "LSTM", status: "SUSTITUTO_NO_ENTRENADO", detail: "Contrato temporal demostrativo; requiere entrenamiento y validación." },
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
    return this.getReadings();
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
      dataStatus: latest?.source === "synthetic" ? "DATOS_SINTETICOS" : "DATOS_INGRESADOS",
      geometry: this.geometry,
      modelStatus: this.modelStatus,
      monitoring: {
        readingCount: this.readings.length,
        sensorIds: [...new Set(this.readings.map((reading) => reading.sensorId))],
        latestReadingAt: latest?.timestamp ?? null
      },
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
