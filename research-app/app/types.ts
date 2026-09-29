export type ModelName = 'persistence' | 'trend' | 'ridge' | 'random_forest' | 'boosting' | 'dense' | 'lstm' | 'gru';
export type Config = {
  name: string; models: ModelName[]; lookback: number; train_end: string; validation_end: string; test_end: string;
  rain_policy: 'drop' | 'past_fill'; use_rain: boolean; remove_train_outliers: boolean; trials: number; epochs: number; seed: number;
};
export type Source = { mine: string; author: string; url: string; doi: string; license: string; archiveSha256: string; file: string };
export type Series = {
  date: string; movement: number | null; increment: number | null; interval: number | null; rain: number | null;
  rain_at_lag: number | null; rain_quality: string; outlier_descriptive: boolean;
};
export type DataSet = {
  source: Source; warnings: string[]; sensors: string[]; sensor: string; series: Series[]; lag: number;
  audit: { raw_readings: number; daily_readings: number; sensors: number; invalid_rows: number; identical_duplicates: number;
    conflicting_timestamps: number; missing_sensor_days: number; missing_rain: number; zero_rain: number; start: string; end: string; rain_quality_counts: Record<string, number> };
  histogram: { bin: number; count: number }[];
  summary: { variable: string; count: number; mean: number | null; std: number | null; min: number | null; max: number | null; '25%': number | null; '50%': number | null; '75%': number | null }[];
  correlations: { x: string; y: string; rho: number | null; n: number }[];
  lagged: { lag: number; rho: number | null; n: number }[];
  missingness: { column: string; missing: number; total: number }[];
  normality: { test: string; statistic: number; p: number; n: number; caution: string } | null;
  coverage: { sensor: string; observed: number; missing: number; start: string; end: string }[];
};
export type Audit = {
  source: DataSet['audit']; features: string[]; partitions: Record<'train' | 'validation' | 'test', number>;
  partition_dates: Record<'train' | 'validation' | 'test', string[]>; rain_imputed_rows: number;
  exclusions: Record<string, number>; train_outlier_bounds_mm: number[] | null; outlier_rule: string; prepared_sha256: string;
};
export type Preview = Audit & {
  sensor: string; series: { date: string; movement: number; rain: number | null; rain_before: number | null; rain_imputed: boolean; partition: string }[];
  folds: { train: number; validation: number; train_end: string; validation_start: string }[];
};
export type Job = { id: string; name: string; created: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled'; progress: number; message: string; config: Config };
export type Metric = { mae: number; rmse: number; r2: number | null; r2_delta: number | null; n: number };
export type ModelResult = {
  model: ModelName; label: string; params: Record<string, number>; cv_mae: number | null; validation: Metric; test: Metric;
  per_sensor: (Metric & { sensor: string })[]; seconds: number; history: { loss: number[]; val_loss?: number[] } | null;
  export: string; test_skill_vs_persistence_percent: number | null;
};
export type Prediction = { model: ModelName; partition: 'validation' | 'test'; sensor: string; date: string; origin: string; current: number; actual: number; predicted: number; residual: number; interval_hours: number };
export type Trial = { model: ModelName; trial: number; cv_mae: number; params: Record<string, number>; fold_mae: number[] };
export type Report = {
  config: Config; source: Source; warnings: string[]; audit: Audit; models: ModelResult[]; failures: { model: ModelName; error: string }[];
  selected_model: ModelName; best_neural_model: ModelName | null; selection_rule: string;
  statistics: { model: ModelName; daily_mae_difference_mm: number; ci95_exploratory: number[] | null; days: number; blocks: number; p_wilcoxon: number | null; p_holm: number | null; status: string }[];
  statistics_method: string; predictions: Prediction[]; duration_seconds: number; versions: Record<string, string>;
  folds: { train_dates: string[]; validation_dates: string[]; train_n: number; validation_n: number }[];
};
export type Artifact = { name: string; bytes: number; sha256?: string };
