import { DEFAULT_SIMULATION_PARAMETERS, syntheticReadings, validateReading } from "./core/forecast-engine.js";

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
