'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { mountArtifact } from '../../public/artifact-tools.js';
import { researchApiPath } from './helpers';

export function ArtifactPanel({ children, title, context = '', table = false, className = '' }: { children: ReactNode; title?: string; context?: string; table?: boolean; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current) return mountArtifact(root.current, { endpoint: researchApiPath('/table-explanation') });
  }, []);
  return <div ref={root} className={`artifact-panel ${className}`} data-artifact-title={title} data-artifact-context={context}>
    <div data-artifact-tools/>
    <div data-artifact-content>{children}</div>
    {table && <div data-artifact-explanation/>}
  </div>;
}

export function TableArtifact({ children, bounded = false }: { children: ReactNode; bounded?: boolean }) {
  return <ArtifactPanel table><div className={`table-scroll${bounded ? ' bounded' : ''}`}>{children}</div></ArtifactPanel>;
}
