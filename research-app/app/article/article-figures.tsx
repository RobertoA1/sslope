'use client';
import { articleFigures, articleScope, articleTitle } from '../../../public/article-figures.js';
import { ArtifactPanel } from '../artifact-panel';
import articleTables from '../../../public/article/tables.json';

export function ArticleFigures() {
  return <section className="paper-extract" aria-labelledby="article-title">
    <p className="eyebrow">ARTÍCULO · EXPERIMENTO SEMISINTÉTICO TA-01</p>
    <h1 id="article-title">Resultados esenciales del artículo</h1>
    <p>{articleTitle}</p>
    <p>{articleScope}</p>
    <div className="paper-links"><a href="/">Explorar el gemelo digital</a><a href="/research">Explorar Century Lab</a><a href="#article-tables">Tablas del DOCX · Excel y CSV</a><a href="/article/provenance.json" download>Procedencia de las imágenes</a></div>
    <div className="paper-figures">{articleFigures.map(figure => <figure className="card paper-figure" key={figure.number}>
      <h3>Figura {figure.number} · {figure.title}</h3>
      <ArtifactPanel title={`Figura ${figure.number} · ${figure.title}`} context={figure.caption}>
        <img data-artifact-image data-artifact-svg={figure.svg} data-artifact-png={figure.png} src={figure.src} width={figure.width} height={figure.height} loading="lazy" alt={figure.alt}/>
      </ArtifactPanel>
      <figcaption>{figure.caption}</figcaption>
      <p className="paper-reading">{figure.interpretation}</p>
      <small>Fuente del artículo: {figure.source}. Descarga en SVG vectorial o PNG a 600 dpi.</small>
    </figure>)}</div>
    <section id="article-tables" className="paper-tables" aria-labelledby="article-tables-title">
      <h2 id="article-tables-title">Tablas del artículo</h2>
      <p>Las siete tablas del DOCX, incluida la bibliografía A1. Cada descarga conserva todas las filas y las cifras publicadas.</p>
      <div className="paper-links"><a href="/article/tables.json" download>Datos y procedencia de las tablas</a></div>
      {articleTables.tables.map(item => <article className="card paper-table" key={item.id}>
        <h3>{item.caption}</h3>
        <p className="paper-table-note">{item.rows.length} filas · {item.headers.length} columnas · Excel (.xlsx) y CSV incluyen la tabla completa.</p>
        <ArtifactPanel table title={`Tabla ${item.id} del artículo`} context={`${item.caption} Fuente: ${articleTables.source}.`}>
          <div className="paper-table-scroll"><table>
            <thead><tr>{item.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
            <tbody>{item.rows.map((row, index) => <tr key={index}>{row.map((value, col) => <td key={col}>{value}</td>)}</tr>)}</tbody>
          </table></div>
        </ArtifactPanel>
      </article>)}
      <small>Fuente: {articleTables.source}</small>
    </section>
  </section>;
}
