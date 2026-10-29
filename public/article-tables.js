export function renderArticleTables(host, dataset) {
  const document = host.ownerDocument;
  host.replaceChildren();
  for (const item of dataset.tables) {
    const details = document.createElement('details'); details.className = 'card paper-table';
    const summary = document.createElement('summary'); summary.textContent = item.caption;
    const wrapper = document.createElement('div'); wrapper.className = 'paper-table-scroll';
    wrapper.dataset.artifactTitle = `Tabla ${item.id} del artículo`;
    wrapper.dataset.artifactContext = `${item.caption} Fuente: ${dataset.source}.`;
    const table = document.createElement('table'), head = table.createTHead(), body = table.createTBody();
    table.dataset.artifactTitle = wrapper.dataset.artifactTitle;
    table.dataset.artifactContext = wrapper.dataset.artifactContext;
    const header = head.insertRow();
    item.headers.forEach(value => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = value; header.append(cell); });
    item.rows.forEach(values => { const row = body.insertRow(); values.forEach(value => { row.insertCell().textContent = value; }); });
    const note = document.createElement('p'); note.className = 'paper-table-note';
    note.textContent = `${item.rows.length} filas · ${item.headers.length} columnas · Excel (.xlsx) y CSV incluyen la tabla completa.`;
    wrapper.append(table); details.append(summary, note, wrapper); host.append(details);
  }
}

export async function loadArticleTables(host) {
  if (!host) return;
  try {
    const response = await host.ownerDocument.defaultView.fetch('/article/tables.json');
    if (!response.ok) throw new Error('No se pudieron cargar las tablas del artículo.');
    renderArticleTables(host, await response.json());
  } catch (error) { host.textContent = `${error.message} Recarga la página para volver a intentarlo.`; }
}
