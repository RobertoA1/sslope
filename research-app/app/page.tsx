'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BarChart3, Beaker, ChartNoAxesCombined, CircleCheck, Database, FlaskConical, Layers3, LoaderCircle, Play, SlidersHorizontal, X } from 'lucide-react';
import type { Artifact, Config, DataSet, Job, Preview, Report, Trial } from './types';
import { api, fmt, labels } from './helpers';
import { DatasetView } from './dataset-view';
import { ExperimentView } from './experiment-view';
import { ResultsView } from './results-view';
import { Loading, Note } from './components';

type View = 'eda' | 'cross' | 'clean' | 'train' | 'results';
const sections = [
  { id: 'eda' as View, name: 'Explorar datos', caption: 'EDA y cobertura', icon: Database },
  { id: 'cross' as View, name: 'Análisis cruzado', caption: 'Relaciones y desfases', icon: ChartNoAxesCombined },
  { id: 'clean' as View, name: 'Limpieza', caption: 'Cambios y particiones', icon: SlidersHorizontal },
  { id: 'train' as View, name: 'Entrenamiento', caption: 'Modelos y ajuste', icon: Beaker },
  { id: 'results' as View, name: 'Comparar resultados', caption: 'Errores, pruebas y modelos', icon: BarChart3 },
];
const defaults: Config = { name: 'Century · comparación temporal', models: ['persistence', 'ridge', 'boosting', 'lstm'], lookback: 6,
  train_end: '2014-01-31', validation_end: '2014-02-10', test_end: '2014-02-20', rain_policy: 'drop', use_rain: true,
  remove_train_outliers: false, trials: 3, epochs: 20, seed: 15003054 };
const statuses: Record<Job['status'], string> = { queued: 'Preparando', running: 'Entrenando', completed: 'Completado', failed: 'Falló', interrupted: 'Interrumpido', cancelled: 'Cancelado' };

export default function Lab() {
  const previewToken = useRef(0);
  const [view, setView] = useState<View>('eda');
  const [data, setData] = useState<DataSet | null>(null);
  const [sensors, setSensors] = useState<string[]>([]);
  const [sensor, setSensor] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lag, setLag] = useState(2);
  const [loadingData, setLoadingData] = useState(true);
  const [config, setConfig] = useState<Config>(defaults);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [files, setFiles] = useState<Artifact[]>([]);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const selected = jobs.find(j => j.id === selectedId);
  const active = jobs.find(j => j.status === 'running' || j.status === 'queued');

  const refreshJobs = useCallback(async () => {
    try {
      const list = await api<Job[]>('/experiments');
      setJobs(list);
      setOnline(true);
      setSelectedId(value => value || list[0]?.id || '');
    } catch { setOnline(false); }
  }, []);

  useEffect(() => {
    refreshJobs();
    const timer = setInterval(refreshJobs, 3000);
    return () => clearInterval(timer);
  }, [refreshJobs]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingData(true);
    setError('');
    const params = new URLSearchParams({ lag: String(lag) });
    if (sensor) params.set('sensor', sensor);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    api<DataSet>(`/dataset?${params}`, { signal: controller.signal }).then(result => {
      setData(result); setSensors(result.sensors); setOnline(true);
    }).catch(e => { if (!controller.signal.aborted) { setError(e.message); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingData(false); });
    return () => controller.abort();
  }, [sensor, start, end, lag]);

  useEffect(() => {
    previewToken.current += 1;
    setPreview(null);
  }, [sensor]);

  useEffect(() => {
    setReport(null); setFiles([]); setTrials([]);
    if (!selectedId || selected?.status !== 'completed') { setReportLoading(false); return; }
    const controller = new AbortController();
    setReportLoading(true);
    Promise.all([
      api<Report>(`/experiments/${selectedId}/report`, { signal: controller.signal }),
      api<Artifact[]>(`/experiments/${selectedId}/artifacts`, { signal: controller.signal }),
      api<Trial[]>(`/experiments/${selectedId}/files/trials.json`, { signal: controller.signal }),
    ]).then(([r, f, t]) => { setReport(r); setFiles(f); setTrials(t); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setReportLoading(false); });
    return () => controller.abort();
  }, [selectedId, selected?.status]);

  async function review() {
    const token = ++previewToken.current;
    setBusy(true); setError(''); setPreview(null);
    try { const value = await api<Preview>(`/preview?${new URLSearchParams(sensor ? { sensor } : {})}`, { method: 'POST', body: JSON.stringify(config) }); if (token === previewToken.current) setPreview(value); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function train() {
    if (!preview || active) return;
    setBusy(true); setError('');
    try {
      const job = await api<Job>('/experiments', { method: 'POST', body: JSON.stringify(config) });
      setSelectedId(job.id); setView('results'); await refreshJobs();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function cancel(job: Job) {
    try { await api(`/experiments/${job.id}/cancel`, { method: 'POST' }); await refreshJobs(); }
    catch (e) { setError((e as Error).message); }
  }
  const changeConfig = (value: Config) => { previewToken.current += 1; setConfig(value); setPreview(null); };
  const title = sections.find(s => s.id === view)!;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Century Lab inicio"><span className="brand-symbol"><Layers3 size={23}/></span><span><b>CENTURY<span>LAB</span></b><small>Laboratorio de investigación</small></span></a>
      <div className="sidebar-label">FLUJO DE TRABAJO</div>
      <nav aria-label="Secciones del laboratorio">{sections.map((section, i) => <button key={section.id} className={view === section.id ? 'active' : ''} onClick={() => { setView(section.id); setError(''); }} aria-current={view === section.id ? 'page' : undefined}><section.icon size={19}/><span><b>{section.name}</b><small>{section.caption}</small></span><em>{i + 1}</em></button>)}</nav>
      <div className="sidebar-study"><span className="sidebar-label">CASO DE ESTUDIO</span><b>Century Mine</b><p>West Wall · Australia<br/>Prismas 3D y lluvia BOM</p><a href="https://zenodo.org/records/15003054" target="_blank" rel="noreferrer">Dataset público <ArrowUpRight size={14}/></a></div>
      <div className="sidebar-bottom"><span className={`api-status ${online ? 'online' : ''}`}><i/>{online ? 'Motor local conectado' : 'Motor no conectado'}</span><p>App independiente del software del artículo. Evaluación retrospectiva.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div><span>Century Mine</span><span className="crumb">/</span><b>{title.name}</b></div><span className="top-tag"><FlaskConical size={14}/>RESEARCH WORKSPACE</span></header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">DATOS REALES · EXPERIMENTOS REPRODUCIBLES</p><h1>{title.name}</h1><p>Del dato observado a una comparación auditable de modelos de pronóstico.</p></div><button className="button" onClick={() => setView(view === 'train' ? 'results' : 'train')}>{view === 'train' ? <BarChart3 size={16}/> : <Play size={16}/>} {view === 'train' ? 'Ver resultados' : 'Nuevo experimento'}</button></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Cerrar mensaje de error" onClick={() => setError('')}><X size={17}/></button></div>}
        {data && (view === 'eda' || view === 'cross') && <div className="kpi-grid"><div><span>Mediciones de origen</span><strong>{data.audit.raw_readings.toLocaleString('es-PE')}</strong><small>Archivo público verificado por SHA256</small></div><div><span>Observaciones diarias</span><strong>{data.audit.daily_readings.toLocaleString('es-PE')}</strong><small>Última lectura de cada sensor y fecha</small></div><div><span>Prismas monitorizados</span><strong>{data.audit.sensors}</strong><small>Sin mezclar con South West</small></div><div><span>Período disponible</span><strong className="period-value">20 NOV — 20 FEB</strong><small>2013–2014 · anterior a la falla</small></div></div>}
        {(view === 'eda' || view === 'cross' || view === 'clean') && <div className="dataset-filters"><label>Prisma<select value={sensor || data?.sensor || ''} onChange={e => setSensor(e.target.value)} aria-label="Prisma de datos">{sensors.map(s => <option key={s}>{s}</option>)}</select></label>{view !== 'clean' && <><label>Desde<input type="date" min="2013-11-20" max="2014-02-20" value={start} onChange={e => setStart(e.target.value)}/></label><label>Hasta<input type="date" min="2013-11-20" max="2014-02-20" value={end} onChange={e => setEnd(e.target.value)}/></label><button className="text-button" onClick={() => { setStart(''); setEnd(''); }}>Todo el período</button></>}<span className="filter-hint">{view === 'clean' ? 'El filtro de prisma solo cambia la vista previa, no la cohorte de entrenamiento.' : 'Todas las gráficas usan el mismo prisma y filtro.'}</span></div>}
        {(view === 'eda' || view === 'cross') && (loadingData ? <Loading/> : data ? <DatasetView data={data} crossed={view === 'cross'} onLag={setLag}/> : <Note warning>No hay datos para el filtro. Elige otro prisma o restablece todo el período.</Note>)}
        {(view === 'clean' || view === 'train') && <ExperimentView config={config} onChange={changeConfig} preview={preview} onPreview={review} onTrain={train} busy={busy} cleaning={view === 'clean'} active={active} onCancel={cancel}/>}
        {view === 'results' && <>
          <div className="history-bar"><label>Experimento<select value={selectedId} onChange={e => setSelectedId(e.target.value)}>{!jobs.length && <option value="">Todavía no hay experimentos</option>}{jobs.map(j => <option key={j.id} value={j.id}>{j.name} · {statuses[j.status]}</option>)}</select></label>{selected && <span className={`status-pill ${selected.status}`}>{statuses[selected.status]}</span>}<span className="small-copy">Historial guardado localmente</span></div>
          {selected && (selected.status === 'running' || selected.status === 'queued') && <div className="training-state"><LoaderCircle className="spin" size={32}/><h2>Comparación en curso</h2><p>{selected.message}</p><progress value={selected.progress} max={100}/><span>{fmt(selected.progress, 0)}%</span><button className="button" onClick={() => cancel(selected)}>Cancelar entrenamiento</button><small>Puedes explorar los datos mientras el motor trabaja en segundo plano.</small></div>}
          {selected && ['failed', 'cancelled', 'interrupted'].includes(selected.status) && <div className="empty"><Activity size={30}/><h2>{statuses[selected.status]}</h2><p>{selected.message}</p><div className="actions"><a className="button" href={`/api/experiments/${selected.id}/files/worker.log`} download>Descargar diagnóstico</a><button className="button primary" onClick={() => { changeConfig(selected.config); setView('train'); }}>Revisar y volver a ejecutar</button></div></div>}
          {reportLoading && <Loading message="Cargando métricas, gráficas y modelos…"/>}
          {report && selected?.status === 'completed' && <ResultsView key={selected.id} report={report} job={selected} files={files} trials={trials}/>}
          {!selected && <div className="empty"><BarChart3 size={34}/><h2>Tu primera comparación empieza aquí</h2><p>Configura las técnicas, revisa los datos y entrena. Verás predicciones, errores, pruebas estadísticas y modelos descargables.</p><button className="button primary" onClick={() => setView('train')}>Configurar entrenamiento</button></div>}
          {jobs.length > 0 && <details className="history-details"><summary>Historial de experimentos ({jobs.length})</summary><div className="table-scroll"><table><thead><tr><th>Experimento</th><th>Creado</th><th>Estado</th><th>Modelos</th><th/></tr></thead><tbody>{jobs.map(j => <tr key={j.id}><td>{j.name}</td><td>{new Date(j.created).toLocaleString('es-PE')}</td><td>{statuses[j.status]}</td><td>{j.config.models.map(m => labels[m]).join(', ')}</td><td><button className="text-button" onClick={() => setSelectedId(j.id)}>Abrir</button></td></tr>)}</tbody></table></div></details>}
        </>}
        <footer><span>Century Lab · Next.js / React / FastAPI</span><span>Datos: Tjaart de Wit · DOI 10.5281/zenodo.15003054 · CC BY 4.0</span></footer>
      </main>
    </div>
  </div>;
}

