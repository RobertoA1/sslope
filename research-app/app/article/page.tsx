import { ArticleFigures } from './article-figures';

export default function ArticlePage() {
  return <>
    <nav className="portal-nav" aria-label="Aplicaciones del proyecto"><a href="/">Gemelo digital</a><a href="/research">Century Lab</a><a href="/research/article" aria-current="page">Figuras y tablas del artículo</a></nav>
    <main className="paper-page"><ArticleFigures/></main>
  </>;
}
