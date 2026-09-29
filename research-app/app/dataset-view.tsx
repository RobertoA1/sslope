'use client';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, LineChart } from 'recharts';
import type { DataSet } from './types';
import { calendarSeries, dateLabel, fmt, labels } from './helpers';
import { Card, Note, Plot, axisStyle, gridStyle, tooltipStyle } from './components';

export function DatasetView({ data, crossed, onLag }: { data: DataSet; crossed: boolean; onLag: (n: number) => void }) {
  const series = calendarSeries(data.series);
  const pairs = data.series.filter(r => r.rain_at_lag != null && r.increment != null);
  const vars = ['movement', 'increment', 'interval', 'rain'];
  const short = ['Despl.', 'Δ mm', 'Horas', 'Lluvia'];
  const selectedLag = data.lagged.find(r => r.lag === data.lag);
  const marked = data.series.filter(r => r.outlier_descriptive).length;
  return <>
    <div className="section-intro"><div><h2>{crossed ? 'Relaciones entre las mediciones' : 'Exploración de los datos'}</h2><p>Prisma {data.sensor}. {data.series.length} observaciones reales en el intervalo elegido.</p></div><span className="tag">{crossed ? 'Asociación, no causalidad' : 'West Wall · mm'}</span></div>
    <div className="two-grid">
      <Card title="Desplazamiento y lluvia" note="Pasa el cursor: las dos gráficas temporales comparten la misma fecha. Los huecos son días sin lectura.">
        <Plot><ComposedChart data={series} syncId="century-series" margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridStyle}/><XAxis dataKey="date" tickFormatter={dateLabel} {...axisStyle} minTickGap={25}/>
          <YAxis yAxisId="movement" {...axisStyle} width={48} label={{ value: 'mm', position: 'insideTopLeft', fill: '#7a8698', fontSize: 11 }}/>
          <YAxis yAxisId="rain" orientation="right" {...axisStyle} width={42}/>
          <Tooltip contentStyle={tooltipStyle} labelFormatter={v => String(v).slice(0, 10)}/><Legend wrapperStyle={{ fontSize: 11 }}/>
          <Bar yAxisId="rain" dataKey="rain" name="Lluvia con desfase 2 d (mm)" fill="#c0dcec" maxBarSize={12} isAnimationActive={false}/>
          <Line yAxisId="movement" dataKey="movement" name="Desplazamiento (mm)" stroke="#188b89" dot={false} strokeWidth={2.2} connectNulls={false} isAnimationActive={false}/>
        </ComposedChart></Plot>
      </Card>
      <Card title="Cambio de un día al siguiente" note="Incremento entre lecturas de días consecutivos. Puede ser negativo por medición o movimiento.">
        <Plot><LineChart data={series} syncId="century-series" margin={{ top: 12, right: 15, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridStyle}/><XAxis dataKey="date" tickFormatter={dateLabel} {...axisStyle} minTickGap={25}/><YAxis {...axisStyle} width={48}/>
          <ReferenceLine y={0} stroke="#a6afba"/><Tooltip contentStyle={tooltipStyle} labelFormatter={v => String(v).slice(0, 10)}/>
          <Line dataKey="increment" name="Incremento (mm)" stroke="#7560bf" dot={false} connectNulls={false} strokeWidth={2} isAnimationActive={false}/>
        </LineChart></Plot>
      </Card>
      {crossed ? <>
        <Card title="Lluvia frente al incremento" note={`Cada punto es una fecha del mismo prisma; lluvia conocida ${data.lag} fechas antes. No se mezclan prismas.`}>
          <div className="inline-control"><label htmlFor="cross-lag">Desfase de lluvia</label><select id="cross-lag" value={data.lag} onChange={e => onLag(Number(e.target.value))}>{data.lagged.map(v => <option key={v.lag} value={v.lag}>{v.lag} días</option>)}</select><span>ρ = {fmt(selectedLag?.rho)} · n = {pairs.length}</span></div>
          <Plot height={230}><ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 15 }}>
            <CartesianGrid {...gridStyle}/><XAxis dataKey="rain_at_lag" type="number" name="Lluvia" unit=" mm" {...axisStyle} label={{ value: `Lluvia, desfase ${data.lag} d (mm)`, position: 'insideBottom', offset: -10, fontSize: 11 }}/>
            <YAxis dataKey="increment" type="number" name="Incremento" unit=" mm" {...axisStyle} width={48}/><ReferenceLine y={0} stroke="#bdc7d2"/>
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
              const point = payload?.[0]?.payload;
              return active && point ? <div className="chart-tooltip"><b>{point.date.slice(0, 10)}</b><span>Lluvia: {fmt(point.rain_at_lag)} mm</span><span>Incremento: {fmt(point.increment)} mm</span></div> : null;
            }}/><Scatter data={pairs} fill="#288e9c" fillOpacity={.75} isAnimationActive={false}/>
          </ScatterChart></Plot>
        </Card>
        <Card title="Correlación con lluvia a distintos desfases" note="Spearman por fechas exactas. Los desfases de 2–9 días se exploran, no se interpretan como un tiempo de infiltración identificado.">
          <Plot><BarChart data={data.lagged} margin={{ top: 12, right: 18, left: 0, bottom: 10 }}>
            <CartesianGrid {...gridStyle}/><XAxis dataKey="lag" {...axisStyle} label={{ value: 'Desfase (días)', position: 'insideBottom', offset: -5, fontSize: 11 }}/><YAxis domain={[-1, 1]} {...axisStyle} width={48}/><ReferenceLine y={0} stroke="#a6afba"/>
            <Tooltip contentStyle={tooltipStyle} labelFormatter={v => `${v} días antes`}/><Bar dataKey="rho" name="Spearman ρ" fill="#6d69b9" radius={[4, 4, 0, 0]} isAnimationActive={false}/>
          </BarChart></Plot>
        </Card>
        <Card title="Matriz de asociaciones" note="Spearman. Lluvia usa el desfase base de 2 días. Los niveles pueden compartir tendencia sin relación causal.">
          <div className="matrix" role="table" aria-label="Matriz de correlación Spearman"><span/>{short.map(s => <b key={s}>{s}</b>)}
            {vars.map((v, i) => <div className="matrix-row" key={v}><b>{short[i]}</b>{vars.map(w => {
              const r = data.correlations.find(c => c.x === v && c.y === w);
              const color = r?.rho == null ? '#f1f3f7' : r.rho >= 0 ? `rgba(26, 139, 137, ${.08 + Math.abs(r.rho) * .7})` : `rgba(117, 96, 191, ${.08 + Math.abs(r.rho) * .7})`;
              return <span key={w} style={{ background: color, color: r?.rho != null && Math.abs(r.rho) > .7 ? '#fff' : '#23394b' }} title={`${labels[v]} / ${labels[w]} · n=${r?.n}`}>{fmt(r?.rho)}</span>;
            })}</div>)}
          </div><div className="matrix-legend"><span>−1 · inversa</span><span>0 · sin asociación monótona</span><span>+1 · directa</span></div>
        </Card>
        <Normality data={data}/>
      </> : <>
        <Card title="Distribución de desplazamientos" note="Histograma del prisma y período seleccionados. No mezcla referencias de sensores distintos.">
          <Plot><BarChart data={data.histogram} margin={{ top: 12, right: 15, left: 0, bottom: 8 }}>
            <CartesianGrid {...gridStyle}/><XAxis dataKey="bin" tickFormatter={n => fmt(n, 0)} {...axisStyle} minTickGap={20}/><YAxis {...axisStyle} width={48} allowDecimals={false}/><Tooltip contentStyle={tooltipStyle} labelFormatter={v => `Centro del intervalo: ${fmt(Number(v))} mm`}/>
            <Bar dataKey="count" name="Lecturas" fill="#6587b8" radius={[3, 3, 0, 0]} isAnimationActive={false}/>
          </BarChart></Plot>
        </Card>
        <Card title="Disponibilidad de variables" note="Dataset completo: ausente no equivale a cero. Los incrementos faltan al comenzar un prisma o tras una interrupción.">
          <div className="missing-list">{data.missingness.map(v => <div key={v.column}><div><b>{labels[v.column]}</b><span>{v.missing} / {v.total} ausentes</span></div><div className="meter"><span style={{ width: `${v.missing / v.total * 100}%` }}/></div></div>)}</div>
          <Note>{data.audit.zero_rain.toLocaleString('es-PE')} registros contienen lluvia cero real; {data.audit.missing_rain} no tienen lluvia disponible. {marked} incrementos del prisma están señalados por 3×IQR, sin borrarlos.</Note>
        </Card>
        <Card title="Resumen numérico" note="Unidades originales. Estadística descriptiva del prisma y filtro seleccionados." wide>
          <div className="table-scroll"><table><thead><tr><th>Variable</th><th>n</th><th>Media</th><th>Desv. estándar</th><th>Mínimo</th><th>Mediana</th><th>Máximo</th></tr></thead><tbody>{data.summary.map(r => <tr key={r.variable}><td>{labels[r.variable]}</td><td>{r.count}</td><td>{fmt(r.mean)}</td><td>{fmt(r.std)}</td><td>{fmt(r.min)}</td><td>{fmt(r['50%'])}</td><td>{fmt(r.max)}</td></tr>)}</tbody></table></div>
        </Card>
        <Card title="Cobertura por prisma" note="Días sin lectura dentro del período de actividad de cada prisma. No se completa el terreno con valores inventados." wide>
          <div className="table-scroll bounded"><table><thead><tr><th>Prisma</th><th>Inicio</th><th>Fin</th><th>Días observados</th><th>Días ausentes</th><th>Cobertura</th></tr></thead><tbody>{data.coverage.map(r => <tr key={r.sensor}><td>{r.sensor}</td><td>{r.start}</td><td>{r.end}</td><td>{r.observed}</td><td>{r.missing}</td><td>{fmt(100 * r.observed / (r.observed + r.missing), 1)}%</td></tr>)}</tbody></table></div>
        </Card>
      </>}
    </div>
  </>;
}

export function Normality({ data }: { data: DataSet }) {
  const n = data.normality;
  return <Card title="Prueba de distribución de los incrementos" note="Shapiro–Wilk compara la forma de la distribución con una normal; no determina qué modelo predice mejor.">
    {n ? <><div className="stats-row"><div><span>Estadístico W</span><strong>{fmt(n.statistic, 4)}</strong></div><div><span>p descriptivo</span><strong>{n.p < .0001 ? n.p.toExponential(2) : fmt(n.p, 4)}</strong></div><div><span>Incrementos</span><strong>{n.n}</strong></div></div><p className="body-copy">{n.p < .05 ? 'La distribución observada difiere de una normal bajo los supuestos del test.' : 'Este test no detecta una diferencia clara con una normal; no demuestra normalidad.'}</p><Note warning>{n.caution} No se eliminan movimientos extremos automáticamente.</Note></> : <Note>No hay suficientes incrementos no constantes para realizar esta prueba.</Note>}
  </Card>;
}
