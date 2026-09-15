import { Matrix4, Vector3 } from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/* Geometry adapters run locally in the browser. They never claim survey-grade
 * reconstruction: a single photograph supplies only a visual approximation. */
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

  function appendBufferGeometry(geometry, matrix, vertices, faces, upAxis = "Z") {
    const position = geometry?.getAttribute("position");
    if (!position) return;
    const base = vertices.length, point = new Vector3();
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(matrix);
      vertices.push(upAxis === "Y" ? [point.x, point.z, point.y] : [point.x, point.y, point.z]);
    }
    const indices = geometry.getIndex();
    if (indices) {
      for (let index = 0; index + 2 < indices.count; index += 3) faces.push([base + indices.getX(index), base + indices.getX(index + 1), base + indices.getX(index + 2)]);
      return;
    }
    for (let index = 0; index + 2 < position.count; index += 3) faces.push([base + index, base + index + 1, base + index + 2]);
  }

  function normaliseThreeObject(object, upAxis = "Z") {
    const vertices = [], faces = [];
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (child.isMesh) appendBufferGeometry(child.geometry, child.matrixWorld, vertices, faces, upAxis);
    });
    if (!faces.length) throw new Error("El modelo no contiene superficies trianguladas utilizables.");
    return normaliseMesh(vertices, faces);
  }

  function normaliseThreeGeometry(geometry, upAxis = "Z") {
    const vertices = [], faces = [];
    appendBufferGeometry(geometry, new Matrix4(), vertices, faces, upAxis);
    if (!faces.length) throw new Error("El modelo no contiene superficies trianguladas utilizables.");
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

  export async function readModel(file) {
    const format = extensionOf(file.name);
    if (["csv", "dxf"].includes(format)) {
      const text = await file.text();
      if (format === "csv") return { format: "CSV XYZ", coordinateReference: "Este · Norte · Cota (unidades del archivo)", mesh: parseCsvTerrain(text), note: "Cuadrícula topográfica XYZ convertida localmente en una malla 3D." };
      return { format: "DXF", coordinateReference: "X · Y de perfil (unidades del archivo)", mesh: extrudeDxfProfile(dxfProfilePoints(text)), note: "Perfil de polilínea DXF extruido localmente para la vista 3D." };
    }
    if (format === "obj") {
      const object = new OBJLoader().parse(await file.text());
      return { format: "OBJ", mesh: normaliseThreeObject(object), note: "Malla OBJ cargada localmente con Three.js." };
    }
    if (format === "stl") {
      const geometry = new STLLoader().parse(await file.arrayBuffer());
      return { format: "STL", mesh: normaliseThreeGeometry(geometry), note: "Malla STL ASCII o binaria cargada localmente con Three.js." };
    }
    if (["gltf", "glb"].includes(format)) {
      let payload = await file.arrayBuffer();
      if (format === "gltf") {
        const json = JSON.parse(new TextDecoder().decode(payload));
        const externalUris = [...(json.buffers || []), ...(json.images || [])].map((entry) => entry.uri).filter((uri) => uri && !uri.startsWith("data:"));
        if (externalUris.length) throw new Error("Este glTF referencia archivos externos. Usa un GLB o un glTF con buffers e imágenes embebidos.");
        payload = JSON.stringify(json);
      }
      const dracoLoader = new DRACOLoader().setDecoderPath("/vendor/three/examples/jsm/libs/draco/");
      const loader = new GLTFLoader().setDRACOLoader(dracoLoader).setMeshoptDecoder(MeshoptDecoder);
      const model = await loader.parseAsync(payload, "").finally(() => dracoLoader.dispose());
      return { format: format === "glb" ? "GLB" : "glTF", mesh: normaliseThreeObject(model.scene, "Y"), note: `${format === "glb" ? "GLB" : "glTF"} cargado localmente con Three.js (${model.scene.children.length} objeto(s) raíz).` };
    }
    throw new Error("Formato no soportado. Usa CSV XYZ, DXF, OBJ, STL, glTF o GLB.");
  }

  export async function approximateFromPhoto(file) {
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
