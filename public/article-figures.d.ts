export const articleTitle: string;
export const articleScope: string;
export const articleFigures: { number: number; title: string; src: string; svg: string; png: string; width: number; height: number; alt: string; caption: string; interpretation: string; source: string }[];
export function renderArticleFigures(host: HTMLElement | null): void;
