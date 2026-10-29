export const articleTitle = 'Evaluación semisintética de pronósticos del desplazamiento del talud con MEF y LSTM';
export const articleScope = 'Resultados archivados de TA-01, con geometría y propiedades supuestas. Los desplazamientos y las presiones de poros son simulados; la lluvia procede de reanálisis NASA POWER. Estas figuras no describen los prismas de Century Mine ni validan alertas operativas.';
export const articleFigures = [
  {
    number: 1, title: '¿Mejora el híbrido frente a la LSTM?', src: '/article/figura-1.png', svg: '/article/figura-1.svg', png: '/article/figura-1.png', width: 4067, height: 1750,
    alt: 'Figura 1 del artículo: diferencias pareadas del MAE entre LSTM e híbrido a una y seis horas, para 2024 y 2025, con intervalos del 95 % que cruzan cero.',
    caption: 'Diferencias pareadas del MAE, Δ = MAE(LSTM) − MAE(híbrido), e intervalos percentiles del 95 % agrupados por fecha de lluvia. Los valores positivos favorecen al híbrido. Las escalas horizontales difieren; no se muestran valores p.',
    interpretation: 'La LSTM obtiene menor error en 2024 y el híbrido en 2025. Los cuatro intervalos incluyen cero: el experimento no respalda una ventaja constante de la corrección residual ni demuestra equivalencia.',
    source: 'ta01-rolling-origin-bootstrap.json'
  },
  {
    number: 2, title: 'Cobertura de los intervalos de predicción', src: '/article/figura-2.png', svg: '/article/figura-2.svg', png: '/article/figura-2.png', width: 4030, height: 1810,
    alt: 'Figura 2 del artículo: cobertura global y con lluvia de al menos cinco milímetros al día, comparadas con el nivel nominal del 95 % en 2024 y 2025.',
    caption: 'Cobertura retrospectiva de los intervalos de predicción del híbrido. La cobertura global se compara con precipitaciones ≥5 mm/día. La línea discontinua marca el 95 % nominal. Para lluvias intensas hay solo dos fechas de 2024 y tres de 2025; las ventanas están correlacionadas.',
    interpretation: 'La cobertura global no garantiza cobertura con lluvia más intensa. Los pocos días de esos subconjuntos impiden estimar de forma fiable el comportamiento ante tormentas reales.',
    source: 'ta01-rolling-interval-coverage.csv'
  },
  {
    number: 3, title: 'Sensibilidad al ruido y a los datos faltantes', src: '/article/figura-3.png', svg: '/article/figura-3.svg', png: '/article/figura-3.png', width: 4030, height: 1928,
    alt: 'Figura 3 del artículo: aumento porcentual del MAE de LSTM e híbrido con ruido y valores faltantes a una y seis horas; el híbrido presenta mayor degradación.',
    caption: 'Sensibilidad predictiva al ruido y a las entradas faltantes al azar. El ruido es relativo a la desviación estándar de entrenamiento; los faltantes se imputan con la media de entrenamiento. Cada punto compara la perturbación con el caso limpio del mismo modelo, sin reentrenamiento.',
    interpretation: 'Ambos modelos se degradan con entradas perturbadas. El híbrido aumenta más su error en las condiciones estudiadas: la calidad de las entradas es decisiva. Esta prueba no reproduce todas las fallas posibles de un sensor.',
    source: 'ta01-robustness-summary.csv'
  }
];

export function renderArticleFigures(host) {
  if (!host) return;
  const document = host.ownerDocument;
  for (const figure of articleFigures) {
    const card = document.createElement('figure'); card.className = 'card paper-figure';
    card.dataset.artifactTitle = `Figura ${figure.number} · ${figure.title}`;
    const heading = document.createElement('h3'); heading.textContent = `Figura ${figure.number} · ${figure.title}`;
    const image = document.createElement('img'); image.src = figure.src; image.alt = figure.alt; image.width = figure.width; image.height = figure.height;
    image.loading = 'lazy'; image.setAttribute('data-artifact-image', '');
    image.dataset.artifactSvg = figure.svg; image.dataset.artifactPng = figure.png;
    const caption = document.createElement('figcaption'); caption.textContent = figure.caption;
    const interpretation = document.createElement('p'); interpretation.className = 'paper-reading'; interpretation.textContent = figure.interpretation;
    const source = document.createElement('small'); source.textContent = `Fuente del artículo: ${figure.source}. Descarga en SVG vectorial o PNG a 600 dpi.`;
    card.append(heading, image, caption, interpretation, source); host.append(card);
  }
}
