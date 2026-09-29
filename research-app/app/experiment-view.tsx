'use client';
import { Check, Play, ScanLine, Square, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts';
import type { Config, Job, ModelName, Preview } from './types';
import { Card, Note, Plot, axisStyle, gridStyle, tooltipStyle } from './components';
import { dateLabel, fmt, labels } from './helpers';

const descriptions: Record<ModelName, string> = {
  persistence: 'Conserva la última lectura. Referencia obligatoria.', trend: 'Proyecta el último incremento según su intervalo.', ridge: 'Regresión lineal regularizada de la ventana.',
  random_forest: 'Ensamble de árboles; captura relaciones no lineales.', boosting: 'Boosting de árboles con histogramas de scikit-learn.',
  dense: 'Red neuronal de la ventana completa.', lstm: 'Red recurrente con memoria temporal.', gru: 'Red recurrente con menos compuertas que LSTM.',
};

export function ExperimentView({ config, onChange, preview, onPreview, onTrain, busy, cleaning, active, onCancel }: {
  config: Config; onChange: (value: Config) => void; preview: Preview | null; onPreview: () => void; onTrain: () => void;
  busy: boolean; cleaning: boolean; active?: Job; onCancel: (job: Job) => void;
}) {
  const change = <K extends keyof Config>(key: K, value: Config[K]) => onChange({ ...config, [key]: value });
  const toggleModel = (name: ModelName) => {
    if (name !== 'persistence') change('models', config.models.includes(name) ? config.models.filter(v => v !== name) : [...config.models, name]);
  };
  return <>
    <div className="section-intro"><div><h2>{cleaning ? 'Preparación trazable de los datos' : 'Configura una comparación'}</h2><p>{cleaning ? 'La fuente permanece intacta. Primero revisa qué cambia y qué se excluye.' : 'Los modelos comparten filas, fechas y objetivo. El ajuste usa solo entrenamiento.'}</p></div><span className="tag">{cleaning ? 'Sin interpolar prismas' : 'Optuna · 3 folds temporales'}</span></div>
    {active && <div className="run-banner"><div><b>Entrenamiento en curso · {active.name}</b><p>{active.message}</p><progress value={active.progress} max={100}/></div><span>{fmt(active.progress, 0)}%</span><button className="button" onClick={() => onCancel(active)}><Square size={14}/>Cancelar</button></div>}
    <div className="two-grid">
      <Card title="Política de limpieza" note="Las reglas se aplican a una copia para este experimento. Los movimientos grandes pueden ser reales.">
        <div className="form-grid">
          <label className="full">Lluvia ausente<select value={config.rain_policy} onChange={e => change('rain_policy', e.target.value as Config['rain_policy'])}><option value="drop">Excluir ventanas con lluvia ausente</option><option value="past_fill">Arrastre de lluvia pasada, máximo 2 fechas</option></select></label>
          <label className="check-label full"><input type="checkbox" checked={config.use_rain} onChange={e => change('use_rain', e.target.checked)}/><span>Usar lluvia como variable predictora<small>Disponible con desfase conservador de 2 fechas.</small></span></label>
          <label className="check-label full"><input type="checkbox" checked={config.remove_train_outliers} onChange={e => change('remove_train_outliers', e.target.checked)}/><span>Excluir incrementos extremos solo del entrenamiento<small>Umbral 3×IQR aprendido en train. Validación y prueba intactas.</small></span></label>
        </div>
        <Note>Sin interpolación de desplazamientos, sin rellenar presión de poros y sin lluvia futura. El arrastre opcional conserva una bandera de imputación.</Note>
      </Card>
      <Card title="Ventana y cortes de tiempo" note="Orden cronológico, sin particiones aleatorias. Las ventanas que cruzan un límite se excluyen.">
        <div className="form-grid">
          <label>Historial (días)<input type="number" min={2} max={14} value={config.lookback} onChange={e => change('lookback', Number(e.target.value))}/></label>
          <label>Fin de entrenamiento<input type="date" min="2013-12-10" max="2014-02-15" value={config.train_end} onChange={e => change('train_end', e.target.value)}/></label>
          <label>Fin de validación<input type="date" min={config.train_end} max="2014-02-19" value={config.validation_end} onChange={e => change('validation_end', e.target.value)}/></label>
          <label>Fin de prueba<input type="date" min={config.validation_end} max="2014-02-20" value={config.test_end} onChange={e => change('test_end', e.target.value)}/></label>
        </div><p className="small-copy">Objetivo: lectura del día calendario siguiente, en mm. Los intervalos reales entre horas son variables.</p>
      </Card>
      {!cleaning && <>
        <Card title="Técnicas que quieres comparar" note="La persistencia siempre participa. La mejor red neuronal no tiene por qué ser el mejor modelo global." wide>
          <div className="model-grid">{(Object.keys(descriptions) as ModelName[]).map(name => <label key={name} className={`model-option${config.models.includes(name) ? ' selected' : ''}`}><input type="checkbox" checked={config.models.includes(name)} disabled={name === 'persistence'} onChange={() => toggleModel(name)}/><span><b>{labels[name]}</b><small>{descriptions[name]}</small><em>{['dense', 'lstm', 'gru'].includes(name) ? 'Keras · .h5 y .keras' : ['persistence', 'trend'].includes(name) ? 'Regla reproducible' : 'scikit-learn · .joblib'}</em></span></label>)}</div>
        </Card>
        <Card title="Presupuesto del ajuste" note="Optuna explora hiperparámetros sobre tres folds por fecha. Un proceso a la vez para limitar el uso de CPU.">
          <div className="form-grid"><label>Ensayos por modelo<input type="number" min={1} max={12} value={config.trials} onChange={e => change('trials', Number(e.target.value))}/></label><label>Máximo de épocas (redes)<input type="number" min={2} max={100} value={config.epochs} onChange={e => change('epochs', Number(e.target.value))}/></label><label>Semilla<input type="number" min={0} max={2147483647} value={config.seed} onChange={e => change('seed', Number(e.target.value))}/></label><label>Nombre del experimento<input maxLength={100} value={config.name} onChange={e => change('name', e.target.value)}/></label></div>
          <p className="small-copy">Early stopping de las redes en una partición interna de train. La prueba no elige épocas ni hiperparámetros.</p>
        </Card>
        <Card title="Qué se guardará" note="Cada experimento queda en el historial independiente del laboratorio."><div className="check-list">{['Predicciones por fecha y prisma, métricas y errores', 'Ensayos del ajuste y curvas de aprendizaje', 'Modelos entrenados y contrato de preprocesamiento', 'Limpieza, particiones, versiones, hashes y ficha del modelo'].map(v => <p key={v}><Check size={16}/>{v}</p>)}</div><Note>`.h5` es una exportación real de Keras. Las técnicas clásicas no se renombran a HDF5. Descarga el paquete completo para reproducir una inferencia.</Note></Card>
      </>}
      <Card title="Revisión antes de entrenar" note="Actualiza la vista previa después de cambiar las opciones." wide>
        <div className="actions"><button className="button" onClick={onPreview} disabled={busy}><ScanLine size={16}/>{busy ? 'Calculando…' : 'Revisar limpieza y particiones'}</button>{!cleaning && <button className="button primary" onClick={onTrain} disabled={busy || !preview || !!active || config.models.length < 2}><Play size={16}/>Entrenar y comparar</button>}<span className="small-copy">{!preview ? 'Revisa los datos para habilitar el entrenamiento.' : 'Vista previa lista. La fuente original no se modifica.'}</span></div>
        {preview && <>
          <div className="split-strip">{(['train', 'validation', 'test'] as const).map(k => <div key={k} className={`split ${k}`}><span>{labels[k]}</span><strong>{preview.partitions[k]} ventanas</strong><small>{preview.partition_dates[k].join(' a ')}</small></div>)}</div>
          <div className="audit-grid"><div><span>Lluvia imputada</span><b>{preview.rain_imputed_rows} registros</b></div><div><span>Huecos o variables ausentes</span><b>{preview.exclusions.gaps_or_missing_features} ventanas excluidas</b></div><div><span>Cruces de frontera</span><b>{preview.exclusions.crossing_boundary} excluidas</b></div><div><span>Prismas no vistos en train</span><b>{preview.exclusions.unseen_sensor} excluidas</b></div><div><span>Extremos de train</span><b>{preview.exclusions.train_outliers} excluidos</b></div><div><span>Variables del modelo</span><b>{preview.features.length} variables</b></div></div>
          <div className="table-scroll"><table><thead><tr><th>Fold de ajuste</th><th>Ventanas train</th><th>Última fecha train</th><th>Ventanas validación interna</th><th>Primera fecha validación</th></tr></thead><tbody>{preview.folds.map((f, i) => <tr key={i}><td>{i + 1}</td><td>{f.train}</td><td>{f.train_end}</td><td>{f.validation}</td><td>{f.validation_start}</td></tr>)}</tbody></table></div>
        </>}
      </Card>
      {preview && <>
        <Card title={`Lluvia antes y después · prisma ${preview.sensor}`} note="La línea discontinua incluye el arrastre opcional. Las observaciones originales se conservan.">
          <Plot><ComposedChart data={preview.series} margin={{ top: 15, right: 12, left: 0, bottom: 0 }}><CartesianGrid {...gridStyle}/><XAxis dataKey="date" tickFormatter={dateLabel} {...axisStyle} minTickGap={25}/><YAxis {...axisStyle} width={48}/><Tooltip contentStyle={tooltipStyle} labelFormatter={v => String(v).slice(0, 10)}/><Legend wrapperStyle={{ fontSize: 11 }}/><Bar dataKey="rain_before" name="Original (mm)" fill="#bdd4e8" maxBarSize={12} isAnimationActive={false}/><Line dataKey="rain" name="Preparada (mm)" stroke="#168c88" strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false}/></ComposedChart></Plot>
        </Card>
        <Card title="Registro de la limpieza" note="Muestra del prisma elegido. Una lluvia 0 permanece 0; una lluvia ausente se mantiene vacía o marcada como imputada.">
          <div className="table-scroll bounded"><table><thead><tr><th>Fecha</th><th>Despl. mm</th><th>Lluvia antes</th><th>Después</th><th>Imputada</th></tr></thead><tbody>{preview.series.map(r => <tr key={r.date}><td>{r.date.slice(0, 10)}</td><td>{fmt(r.movement)}</td><td>{fmt(r.rain_before)}</td><td>{fmt(r.rain)}</td><td>{r.rain_imputed ? 'Sí · pasada' : 'No'}</td></tr>)}</tbody></table></div>
        </Card>
      </>}
    </div>
  </>;
}
