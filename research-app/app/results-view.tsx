'use client';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, FileDown, FlaskConical } from 'lucide-react';
import type { Artifact, Job, ModelName, Report, Trial } from './types';
import { Card, DownloadLink, Note, Plot, axisStyle, gridStyle, tooltipStyle } from './components';
import { colors, dateLabel, fmt, labels } from './helpers';

export function ResultsView({ report, job, files, trials }: { report: Report; job: Job; files: Artifact[]; trials: Trial[] }) {
  const [chosenModel, setModel] = useState<ModelName>(report.selected_model);
  const [chosenSensor, setSensor] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [partition, setPartition] = useState<'validation' | 'test'>('test');
  const sensors = [...new Set(report.predictions.filter(p => p.partition === partition).map(p => p.sensor))].sort();
  const sensor = sensors.includes(chosenSensor) ? chosenSensor : sensors[0];
  const model = report.models.find(r => r.model === chosenModel) || report.models[0];
  const winner = report.models.find(r => r.model === report.selected_model)!;
  const rows = report.predictions.filter(p => p.partition === partition && p.sensor === sensor);
  const timeSeries = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    for (const p of rows) {
      const point = grouped.get(p.date) || { date: p.date, actual: p.actual };
      point[p.model] = p.predicted;
      grouped.set(p.date, point);
    }
    return [...grouped.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [rows]);
  const selectedPredictions = rows.filter(p => p.model === model.model);
  const allPredictions = report.predictions.filter(p => p.model === model.model && p.partition === partition);
  const ranked = [...report.models].sort((a, b) => a.validation.mae - b.validation.mae);
  const learning = model.history?.loss.map((loss, i) => ({ epoch: i + 1, loss })) || [];
  const dailyErrors = [...new Set(allPredictions.map(p => p.date))].sort().map(date => {
    const r = report.predictions.filter(p => p.partition === partition && p.date === date);
    const point: Record<string, number | string> = { date };
    for (const m of report.models) {
      const a = r.filter(p => p.model === m.model);
      point[m.model] = a.reduce((sum, p) => sum + Math.abs(p.residual), 0) / a.length;
    }
    return point;
  });
  return <>
    <div className="section-intro"><div><h2>Comparación de resultados</h2><p>{job.name} · {fmt(report.duration_seconds, 0)} s · {report.audit.partitions.test} ventanas de prueba</p></div><DownloadLink id={job.id} file="experiment.zip" primary>Descargar experimento</DownloadLink></div>
    <div className="winner-strip"><div><span>Elegido por MAE de validación</span><strong>{winner.label}</strong></div><div><span>MAE de prueba del elegido</span><strong>{fmt(winner.test.mae)} <small>mm</small></strong></div><div><span>Mejora frente a persistencia en prueba</span><strong className={(winner.test_skill_vs_persistence_percent ?? 0) < 0 ? 'negative' : ''}>{fmt(winner.test_skill_vs_persistence_percent, 1)} <small>%</small></strong></div><div><span>Mejor red en validación</span><strong>{report.best_neural_model ? labels[report.best_neural_model] : 'No entrenada'}</strong></div></div>
    <Note>{report.selection_rule} Un porcentaje negativo significa que fue peor que la persistencia en prueba. R² de niveles puede ser alto aunque el pronóstico de incrementos sea pobre.</Note>
    {report.failures.length > 0 && <Note warning>{report.failures.map(f => <p key={f.model}>{labels[f.model]} no se completó: {f.error}</p>)}</Note>}
    <Card title="Métricas sobre las mismas filas" note="Orden por MAE de validación, no por prueba. MAE y RMSE menores son mejores. R² de incrementos compara la dinámica, no los niveles." wide>
      <div className="table-scroll"><table className="metrics-table"><thead><tr><th>Modelo</th><th>CV train MAE</th><th>Validación MAE</th><th>Prueba MAE</th><th>Prueba RMSE</th><th>R² niveles</th><th>R² incrementos</th><th>Tiempo</th></tr></thead><tbody>{ranked.map(r => <tr key={r.model} className={r.model === report.selected_model ? 'winner-row' : ''}><td><i style={{ background: colors[r.model] }}/>{r.label}{r.model === report.selected_model && <span className="tag mini">Elegido</span>}</td><td>{fmt(r.cv_mae)}</td><td>{fmt(r.validation.mae)} mm</td><td>{fmt(r.test.mae)} mm</td><td>{fmt(r.test.rmse)} mm</td><td>{fmt(r.test.r2, 3)}</td><td>{fmt(r.test.r2_delta, 3)}</td><td>{fmt(r.seconds, 0)} s</td></tr>)}</tbody></table></div>
    </Card>
    <div className="result-filters"><label>Modelo para inspeccionar<select value={model.model} onChange={e => setModel(e.target.value as ModelName)}>{report.models.map(r => <option key={r.model} value={r.model}>{r.label}</option>)}</select></label><label>Prisma<select value={sensor} onChange={e => setSensor(e.target.value)}>{sensors.map(s => <option key={s}>{s}</option>)}</select></label><label>Partición<select value={partition} onChange={e => setPartition(e.target.value as 'validation' | 'test')}><option value="test">Prueba</option><option value="validation">Validación</option></select></label><label className="check-label"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}/><span>Mostrar todas las técnicas en el pronóstico</span></label></div>
    <div className="two-grid">
      <Card title={`Observado frente a predicho · ${sensor}`} note="Por defecto: observado, modelo elegido y persistencia. Activa todas las curvas para cruzarlas. No se recortan salidas negativas de modelos sin restricciones físicas.">
        <Plot><LineChart data={timeSeries} margin={{ top: 15, right: 16, left: 0, bottom: 0 }}><CartesianGrid {...gridStyle}/><XAxis dataKey="date" tickFormatter={dateLabel} {...axisStyle}/><YAxis {...axisStyle} width={48}/><Tooltip contentStyle={tooltipStyle}/><Legend wrapperStyle={{ fontSize: 11 }}/><Line dataKey="actual" name="Observado (mm)" stroke="#172f47" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false}/>{report.models.filter(m => showAll || m.model === model.model || m.model === 'persistence').map(m => <Line key={m.model} dataKey={m.model} name={m.label} stroke={colors[m.model]} strokeWidth={m.model === model.model ? 2.7 : 1} strokeOpacity={m.model === model.model || m.model === 'persistence' ? 1 : .35} dot={false} strokeDasharray={m.model === 'persistence' ? '4 4' : undefined} isAnimationActive={false}/>)}</LineChart></Plot>
      </Card>
      <Card title="Error por fecha, cruzado entre modelos" note="MAE medio de todos los prismas de la misma fecha. Destaca si varias técnicas fallan durante los mismos días.">
        <Plot><LineChart data={dailyErrors} margin={{ top: 15, right: 16, left: 0, bottom: 0 }}><CartesianGrid {...gridStyle}/><XAxis dataKey="date" tickFormatter={dateLabel} {...axisStyle}/><YAxis {...axisStyle} width={48}/><Tooltip contentStyle={tooltipStyle}/><Legend wrapperStyle={{ fontSize: 11 }}/>{report.models.map(m => <Line key={m.model} dataKey={m.model} name={m.label} stroke={colors[m.model]} strokeWidth={m.model === model.model ? 2.5 : 1.4} dot={false} isAnimationActive={false}/>)}</LineChart></Plot>
      </Card>
      <Card title={`Residuos de ${model.label} · ${sensor}`} note="Residuo = observado − predicho. Un error positivo indica que el modelo subestimó el desplazamiento.">
        <Plot><BarChart data={selectedPredictions} margin={{ top: 15, right: 16, left: 0, bottom: 0 }}><CartesianGrid {...gridStyle}/><XAxis dataKey="date" tickFormatter={dateLabel} {...axisStyle}/><YAxis {...axisStyle} width={48}/><ReferenceLine y={0} stroke="#7b899a"/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="residual" name="Residuo (mm)" fill={colors[model.model]} radius={[3, 3, 0, 0]} isAnimationActive={false}/></BarChart></Plot>
      </Card>
      <Card title={`Calidad del pronóstico · ${model.label}`} note={`Todos los prismas de ${labels[partition].toLowerCase()}. Cerca de la diagonal = observado y predicho coinciden.`}>
        <Plot><ScatterChart margin={{ top: 15, right: 20, left: 0, bottom: 15 }}><CartesianGrid {...gridStyle}/><XAxis type="number" dataKey="actual" name="Observado" unit=" mm" {...axisStyle} label={{ value: 'Observado (mm)', position: 'insideBottom', offset: -10, fontSize: 11 }}/><YAxis type="number" dataKey="predicted" name="Predicho" unit=" mm" {...axisStyle} width={48}/><ReferenceLine segment={[{ x: Math.min(...allPredictions.map(p => Math.min(p.actual, p.predicted))), y: Math.min(...allPredictions.map(p => Math.min(p.actual, p.predicted))) }, { x: Math.max(...allPredictions.map(p => Math.max(p.actual, p.predicted))), y: Math.max(...allPredictions.map(p => Math.max(p.actual, p.predicted))) }]} stroke="#b0bbc8" strokeDasharray="4 4"/><Tooltip content={({ active, payload }) => { const p = payload?.[0]?.payload; return active && p ? <div className="chart-tooltip"><b>{p.sensor} · {p.date}</b><span>Observado: {fmt(p.actual)} mm</span><span>Predicho: {fmt(p.predicted)} mm</span></div> : null; }}/><Scatter data={allPredictions} fill={colors[model.model]} fillOpacity={.7} isAnimationActive={false}/></ScatterChart></Plot>
      </Card>
      <Card title="Curva de aprendizaje" note={`${model.label}. Pérdida MSE del incremento normalizado, no MAE en mm. Entrenamiento final tras elegir épocas dentro de train.`}>
        {learning.length ? <Plot><LineChart data={learning} margin={{ top: 15, right: 16, left: 0, bottom: 0 }}><CartesianGrid {...gridStyle}/><XAxis dataKey="epoch" {...axisStyle} allowDecimals={false}/><YAxis {...axisStyle} width={48}/><Tooltip contentStyle={tooltipStyle}/><Line dataKey="loss" name="MSE normalizado" stroke={colors[model.model]} dot={false} strokeWidth={2.2} isAnimationActive={false}/></LineChart></Plot> : <div className="empty compact"><FlaskConical size={24}/><p>{model.label} no tiene entrenamiento por épocas.</p><small>El ajuste temporal se ve en la tabla de ensayos.</small></div>}
      </Card>
      <Card title="Métricas por prisma" note={`${model.label}, partición de prueba. R² no disponible si no hay variación suficiente.`}>
        <div className="table-scroll bounded"><table><thead><tr><th>Prisma</th><th>n</th><th>MAE mm</th><th>RMSE mm</th><th>R² Δ</th></tr></thead><tbody>{model.per_sensor.map(r => <tr key={r.sensor}><td>{r.sensor}</td><td>{r.n}</td><td>{fmt(r.mae)}</td><td>{fmt(r.rmse)}</td><td>{fmt(r.r2_delta, 3)}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Pruebas estadísticas de comparación" note="Diferencia frente a persistencia: negativa favorece al modelo. Las fechas son la unidad de agrupación, no cada ventana." wide>
        <div className="table-scroll"><table><thead><tr><th>Modelo</th><th>Δ MAE diario (mm)</th><th>IC 95% exploratorio</th><th>Fechas / bloques</th><th>p Wilcoxon</th><th>p corregido Holm</th></tr></thead><tbody>{report.statistics.map(r => <tr key={r.model}><td>{labels[r.model]}</td><td>{fmt(r.daily_mae_difference_mm, 3)}</td><td>{r.ci95_exploratory ? r.ci95_exploratory.map(v => fmt(v, 3)).join(' a ') : 'Insuficiente'}</td><td>{r.days} / {r.blocks}</td><td title={r.status}>{fmt(r.p_wilcoxon, 4)}</td><td>{fmt(r.p_holm, 4)}</td></tr>)}</tbody></table></div>
        <Note warning>{report.statistics_method} Un guion en p indica que no hay suficientes bloques; no significa “sin diferencias”. Con esta prueba corta, los intervalos son solo exploratorios.</Note>
      </Card>
      <Card title="Ensayos del ajuste de hiperparámetros" note="CV MAE en los tres folds de entrenamiento. No se optimiza sobre la prueba externa." wide>
        <div className="table-scroll bounded"><table><thead><tr><th>Modelo</th><th>Ensayo</th><th>CV MAE mm</th><th>MAE por fold</th><th>Parámetros</th></tr></thead><tbody>{trials.map(t => <tr key={`${t.model}-${t.trial}`}><td>{labels[t.model]}</td><td>{t.trial}</td><td>{fmt(t.cv_mae)}</td><td>{t.fold_mae.map(v => fmt(v)).join(' / ')}</td><td className="parameter-cell">{Object.entries(t.params).map(([k, v]) => `${k}: ${fmt(v, 4)}`).join(', ')}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Modelos, datos e informe descargables" note="El ZIP incluye todo lo necesario para auditar este experimento. La red HDF5 necesita su contrato de preprocesamiento." wide>
        <div className="actions"><DownloadLink id={job.id} file="experiment.zip" primary>Paquete completo</DownloadLink><DownloadLink id={job.id} file="model-card.md">Ficha del experimento</DownloadLink>{report.best_neural_model && <DownloadLink id={job.id} file={`${report.best_neural_model}.h5`}>Mejor red por validación (.h5)</DownloadLink>}</div>
        <div className="artifact-grid">{files.filter(f => f.name !== 'experiment.zip').map(f => <a key={f.name} href={`/api/experiments/${job.id}/files/${f.name}`} download><FileDown size={18}/><span><b>{f.name}</b><small>{fmt(f.bytes / 1024, 1)} KB</small></span><ArrowRight size={15}/></a>)}</div>
      </Card>
      <Card title="Procedencia y límites del resultado" note="Este laboratorio no modifica el gemelo del artículo ni demuestra estabilidad operacional." wide><ul className="limitations">{report.warnings.map(w => <li key={w}>{w}</li>)}</ul><details><summary>Ver versiones y contrato de datos</summary><div className="version-list">{Object.entries(report.versions).map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}</div><p className="small-copy hash">Dataset preparado SHA256: {report.audit.prepared_sha256}</p></details></Card>
    </div>
  </>;
}

