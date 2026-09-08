/* Geometry adapters run locally in the browser. They never claim survey-grade
 * reconstruction: a single photograph supplies only a visual approximation. */
(function () {
  const extensionOf = (name) => name.split(".").pop().toLowerCase();

  function normaliseMesh(vertices, faces) {
    if (!vertices.length) throw new Error("El archivo no contiene vértices utilizables.");
    const bounds = vertices.reduce((result, vertex) => ({
      min: [0, 1, 2].map((i) => Math.min(result.min[i], vertex[i])),
      max: [0, 1, 2].map((i) => Math.max(result.max[i], vertex[i]))
    }), { min: [...vertices[0]], max: [...vertices[0]] });
    const centre = bounds.min.map((value, i) => (value + bounds.max[i]) / 2);
    const span = Math.max(...bounds.max.map((value, i) => value - bounds.min[i]), .001);
    const scale = 170 / span;
    return {
      vertices: vertices.map(([x, y, z]) => ({ x: (x - centre[0]) * scale, y: (z - centre[2]) * scale + 35, z: (y - centre[1]) * scale })),
      faces: faces.filter((face) => face.length >= 3),
      bounds,
      coordinateTransform: { centre, scale }
    };
  }

  function parseObj(text) {
    const vertices = [], faces = [];
    text.split(/\r?\n/).forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === "v" && parts.length >= 4) vertices.push(parts.slice(1, 4).map(Number));
      if (parts[0] === "f" && parts.length >= 4) faces.push(parts.slice(1).map((part) => Number(part.split("/")[0]) - 1));
    });
    return normaliseMesh(vertices, faces);
  }

  function parseAsciiStl(text) {
    const vertices = [], faces = [], lookup = new Map();
    const indexFor = (values) => {
      const key = values.join(",");
      if (!lookup.has(key)) { lookup.set(key, vertices.length); vertices.push(values); }
      return lookup.get(key);
    };
    const triangles = text.match(/facet[\s\S]*?endfacet/gim) || [];
    triangles.forEach((triangle) => {
      const points = [...triangle.matchAll(/vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi)].map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
      if (points.length === 3) faces.push(points.map(indexFor));
    });
    return normaliseMesh(vertices, faces);
  }

  function parseCsvTerrain(text) {
    const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (rows.length < 5) throw new Error("El CSV necesita una cabecera y al menos cuatro puntos XYZ.");
    const separator = rows[0].includes(";") ? ";" : ",";
    const header = rows[0].split(separator).map((value) => value.trim().toLowerCase());
    const findColumn = (names) => header.findIndex((value) => names.includes(value));
    const xColumn = findColumn(["x", "x_m", "east", "east_m", "easting"]);
    const yColumn = findColumn(["y", "y_m", "north", "north_m", "northing"]);
    const zColumn = findColumn(["z", "z_m", "elev", "elevation", "elevation_m", "altitude"]);
    if ([xColumn, yColumn, zColumn].some((index) => index < 0)) throw new Error("La cabecera CSV debe incluir X, Y, Z; o east_m, north_m, elevation_m.");
    const vertices = rows.slice(1).map((row) => row.split(separator).map((value) => Number(value.trim()))).filter((values) => [values[xColumn], values[yColumn], values[zColumn]].every(Number.isFinite)).map((values) => [values[xColumn], values[yColumn], values[zColumn]]);
    if (vertices.length < 4) throw new Error("El CSV no contiene suficientes coordenadas numéricas XYZ.");
    const xs = [...new Set(vertices.map(([x]) => x))].sort((a, b) => a - b);
    const ys = [...new Set(vertices.map(([, y]) => y))].sort((a, b) => a - b);
    const indexByCoordinate = new Map(vertices.map(([x, y], index) => [`${x}|${y}`, index]));
    const faces = [];
    for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
      const lowerLeft = indexByCoordinate.get(`${xs[x]}|${ys[y]}`), lowerRight = indexByCoordinate.get(`${xs[x + 1]}|${ys[y]}`);
      const upperLeft = indexByCoordinate.get(`${xs[x]}|${ys[y + 1]}`), upperRight = indexByCoordinate.get(`${xs[x + 1]}|${ys[y + 1]}`);
      if ([lowerLeft, lowerRight, upperLeft, upperRight].every(Number.isInteger)) faces.push([lowerLeft, lowerRight, upperRight, upperLeft]);
    }
    if (!faces.length) throw new Error("El CSV debe formar una cuadrícula XYZ regular. Para puntos irregulares se requiere triangulación TIN en la siguiente fase.");
    return normaliseMesh(vertices, faces);
  }

  function parseDxfPairs(text) {
    const lines = text.split(/\r?\n/);
    const pairs = [];
    for (let index = 0; index < lines.length - 1; index += 2) pairs.push({ code: Number(lines[index].trim()), value: lines[index + 1].trim() });
    return pairs;
  }

  function dxfProfilePoints(text) {
    const pairs = parseDxfPairs(text), profiles = [];
    for (let index = 0; index < pairs.length; index++) {
      if (pairs[index].code !== 0 || !["LWPOLYLINE", "POLYLINE"].includes(pairs[index].value.toUpperCase())) continue;
      const points = [];
      if (pairs[index].value.toUpperCase() === "LWPOLYLINE") {
        let current = {};
        for (let cursor = index + 1; cursor < pairs.length && pairs[cursor].code !== 0; cursor++) {
          const pair = pairs[cursor];
          if (pair.code === 10) { if (Number.isFinite(current.x) && Number.isFinite(current.y)) points.push(current); current = { x: Number(pair.value) }; }
          if (pair.code === 20) current.y = Number(pair.value);
        }
        if (Number.isFinite(current.x) && Number.isFinite(current.y)) points.push(current);
      } else {
        for (let cursor = index + 1; cursor < pairs.length && pairs[cursor].value.toUpperCase() !== "SEQEND"; cursor++) {
          if (pairs[cursor].code !== 0 || pairs[cursor].value.toUpperCase() !== "VERTEX") continue;
          const point = {};
          for (cursor += 1; cursor < pairs.length && pairs[cursor].code !== 0; cursor++) { if (pairs[cursor].code === 10) point.x = Number(pairs[cursor].value); if (pairs[cursor].code === 20) point.y = Number(pairs[cursor].value); }
          if (Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
        }
      }
      if (points.length >= 2) profiles.push(points);
    }
    if (!profiles.length) throw new Error("El DXF debe contener una polilínea 2D (LWPOLYLINE o POLYLINE) con el perfil del talud.");
    return profiles.sort((a, b) => b.length - a.length)[0];
  }

  function extrudeDxfProfile(points) {
    const horizontalSpan = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const halfDepth = Math.max(horizontalSpan * .22, 8), vertices = [], faces = [];
    points.forEach((point) => vertices.push([point.x, -halfDepth, point.y], [point.x, halfDepth, point.y]));
    for (let index = 0; index < points.length - 1; index++) faces.push([index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2]);
    return normaliseMesh(vertices, faces);
  }

  async function readModel(file) {
    const format = extensionOf(file.name);
    if (["obj", "stl", "gltf", "csv", "dxf"].includes(format)) {
      const text = await file.text();
      if (format === "obj") return { format: "OBJ", mesh: parseObj(text), note: "Malla OBJ previsualizada localmente." };
      if (format === "stl") {
        if (!/^solid\b/i.test(text.trim())) return { format: "STL", note: "STL binario registrado; la previsualización requiere el adaptador binario pendiente." };
        return { format: "STL", mesh: parseAsciiStl(text), note: "Malla STL ASCII previsualizada localmente." };
      }
      if (format === "csv") return { format: "CSV XYZ", coordinateReference: "Este · Norte · Cota (unidades del archivo)", mesh: parseCsvTerrain(text), note: "Cuadrícula topográfica XYZ convertida localmente en una malla 3D." };
      if (format === "dxf") return { format: "DXF", coordinateReference: "X · Y de perfil (unidades del archivo)", mesh: extrudeDxfProfile(dxfProfilePoints(text)), note: "Perfil de polilínea DXF extruido localmente para la vista 3D." };
      const gltf = JSON.parse(text);
      return { format: "glTF", note: `glTF registrado (${gltf.meshes?.length || 0} malla(s)); la lectura de buffers/accesores queda preparada para la siguiente fase.` };
    }
    if (format === "glb") return { format: "GLB", note: "GLB registrado; la decodificación de buffers binarios queda preparada para la siguiente fase." };
    throw new Error("Formato no soportado. Usa CSV XYZ, DXF, OBJ, STL, glTF o GLB.");
  }

  async function approximateFromPhoto(file) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("No se pudo leer la fotografía.")); image.src = url; });
    const canvas = document.createElement("canvas"), width = 32, height = 24;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const profile = Array.from({ length: width }, (_, x) => {
      let contrast = 0;
      for (let y = 1; y < height; y++) {
        const current = pixels[(y * width + x) * 4], previous = pixels[((y - 1) * width + x) * 4];
        contrast += Math.abs(current - previous);
      }
      return contrast;
    });
    const colors = Array.from({ length: width }, (_, x) => {
      let red = 0, green = 0, blue = 0;
      for (let y = 0; y < height; y++) {
        const offset = (y * width + x) * 4;
        red += pixels[offset]; green += pixels[offset + 1]; blue += pixels[offset + 2];
      }
      const shade = .45;
      return `rgb(${Math.round(red / height * shade)},${Math.round(green / height * shade)},${Math.round(blue / height * shade)})`;
    });
    const max = Math.max(...profile, 1);
    return {
      previewUrl: url,
      profile: profile.map((value) => value / max),
      colors,
      width: image.naturalWidth,
      height: image.naturalHeight,
      note: "Aproximación visual de una sola imagen: perfil y color derivados localmente; no representa una reconstrucción 3D ni dimensiones métricas."
    };
  }

  window.M1Geometry = { readModel, approximateFromPhoto };
})();
