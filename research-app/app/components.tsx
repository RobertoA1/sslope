'use client';
import type { ReactNode } from 'react';
import { Download, Info, LoaderCircle } from 'lucide-react';
import { ResponsiveContainer } from 'recharts';

export function Card({ title, note, children, wide = false }: { title: string; note?: string; children: ReactNode; wide?: boolean }) {
  return <section className={`card${wide ? ' wide' : ''}`}><div className="card-heading"><h3>{title}</h3>{note && <p>{note}</p>}</div>{children}</section>;
}
export function Plot({ children, height = 260 }: { children: React.ReactElement; height?: number }) {
  return <div className="plot" style={{ height }}><ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer></div>;
}
export function Note({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`note${warning ? ' warning' : ''}`}><Info size={17} aria-hidden="true"/><div>{children}</div></div>;
}
export function Loading({ message = 'Cargando datos reales…' }: { message?: string }) {
  return <div className="empty"><LoaderCircle className="spin" size={25}/><p>{message}</p></div>;
}
export function DownloadLink({ id, file, children, primary = false }: { id: string; file: string; children: ReactNode; primary?: boolean }) {
  return <a className={`button${primary ? ' primary' : ''}`} href={`/api/experiments/${id}/files/${encodeURIComponent(file)}`} download><Download size={16}/>{children}</a>;
}
export const gridStyle = { stroke: '#e9edf3', strokeDasharray: '3 3' };
export const axisStyle = { tick: { fill: '#7a8698', fontSize: 11 }, axisLine: false, tickLine: false } as const;
export const tooltipStyle = { borderRadius: 10, border: '1px solid #dce3ec', fontSize: 12, boxShadow: '0 8px 24px #162e4c12' };
