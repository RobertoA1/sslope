const DEFAULT_AMPLIFICATION = 1200;

// El primer punto permite 1×; los demás conservan los pasos previos de 200× a 2000×.
export function amplificationFromSlider(value) {
  const position = Number(value);
  if (!Number.isFinite(position)) return DEFAULT_AMPLIFICATION;
  const step = Math.min(19, Math.max(0, Math.round(position)));
  return step === 0 ? 1 : (step + 1) * 100;
}

export function sliderFromAmplification(value) {
  const amplification = Number(value);
  if (!Number.isFinite(amplification)) return 11;
  if (amplification <= 1) return 0;
  return Math.min(19, Math.max(1, Math.round(amplification / 100) - 1));
}

export function femDisplayScale(amplification, maximumDisplacementMm) {
  if (amplification === 1) return 1;
  const maximumMm = Math.max(Number(maximumDisplacementMm) || 0, 1e-9);
  return Math.max(amplification || 1, Math.min(1_000_000, 6 / (maximumMm / 1000)));
}
