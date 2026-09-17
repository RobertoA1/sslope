import {
  ArrowHelper,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WireframeGeometry
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

function slopeFootprint(x, z, parameters) {
  const width = parameters.slopeWidthM || 160;
  const halfWidth = width / 2;
  const halfDepth = width * 0.42;
  const type = parameters.geometryType || "LINEAR";
  if (type === "CIRCULAR" || type === "WASTE_DUMP") return Math.hypot(x / halfWidth, z / halfDepth) <= 1;
  if (type === "SEMICIRCULAR") return Math.hypot((x - halfWidth) / width, z / halfDepth) <= 1;
  return true;
}

function terrainHeight(x, z, parameters) {
  const width = parameters.slopeWidthM || 160;
  const height = parameters.slopeHeightM || 90;
  const halfWidth = width / 2;
  const halfDepth = width * 0.42;
  const type = parameters.geometryType || "LINEAR";
  const progress = clamp((x + halfWidth) / width);
  if (type === "LINEAR") return height * (1 - progress);
  if (type === "BENCHED") return Math.round((height * (1 - progress)) / 12) * 12;
  if (type === "CIRCULAR") return height * (0.08 + 0.92 * clamp(Math.hypot(x / halfWidth, z / halfDepth)));
  if (type === "SEMICIRCULAR") return height * clamp(Math.hypot((x - halfWidth) / width, z / halfDepth));
  return height * (1 - clamp(Math.hypot(x / halfWidth, z / halfDepth))) ** 0.72;
}

function layerValue(layer, forecast, readings) {
  const last = readings.at(-1) || { porePressureKpa: 0 };
  return {
    risk: forecast.risk.score,
    displacement: clamp(forecast.predictedIncrementMm / 40),
    pore: clamp(last.porePressureKpa / 210),
    safety: clamp((1.5 - forecast.femState.factorOfSafety) / 0.6),
    uncertainty: forecast.risk.uncertainty
  }[layer] ?? 0;
}

function analyticalColor(value) {
  const low = new Color("#32c7a5");
  const middle = new Color("#e9b949");
  const high = new Color("#de5667");
  return value < 0.5 ? low.lerp(middle, value * 2) : middle.lerp(high, (value - 0.5) * 2);
}

function materialColor(depth, parameters, x, z) {
  const variation = Math.sin(x * 0.13 + z * 0.08) * 0.015;
  let color;
  if (parameters.bedrockCondition !== "NONE" && depth >= parameters.bedrockDepthM) color = new Color("#92857a");
  else if (depth > 12) color = new Color("#a8754d");
  else color = new Color("#936b4d");
  color.offsetHSL(variation, variation * 0.3, variation);
  return color;
}

function displacedPoint(point, parameters, forecast, progress, amplification) {
  if (!progress || !forecast) return point;
  const width = parameters.slopeWidthM || 160;
  const halfWidth = width / 2;
  const halfDepth = width * 0.42;
  const normalizedX = clamp((point.x + halfWidth) / width);
  const normalizedZ = clamp((point.z + halfDepth) / (halfDepth * 2));
  const type = parameters.geometryType || "LINEAR";
  let influence = Math.exp(-(((normalizedX - 0.47) ** 2) / 0.075 + ((normalizedZ - 0.52) ** 2) / 0.16));
  let direction = new Vector3(0.92, -0.28, 0.08);
  if (type === "CIRCULAR" || type === "WASTE_DUMP") {
    const radial = new Vector3(point.x / Math.max(halfWidth, 1), 0, point.z / Math.max(halfDepth, 1));
    radial.normalize();
    direction = new Vector3(radial.x, type === "CIRCULAR" ? -0.18 : -0.1, radial.z);
    influence = type === "CIRCULAR"
      ? clamp(1 - Math.hypot(point.x / halfWidth, point.z / halfDepth) * 0.58)
      : clamp(0.35 + Math.hypot(point.x / halfWidth, point.z / halfDepth) * 0.5);
  } else if (type === "SEMICIRCULAR") {
    const radial = new Vector3((point.x - halfWidth) / Math.max(width, 1), 0, point.z / Math.max(halfDepth, 1));
    const length = radial.length() || 1;
    radial.normalize();
    direction = new Vector3(radial.x, -0.2, radial.z);
    influence = clamp(1 - length * 0.6);
  }
  const visualMeters = Math.min(22, forecast.predictedIncrementMm * 0.001 * amplification) * progress * influence;
  return {
    x: point.x + direction.x * visualMeters,
    y: point.y + direction.y * visualMeters,
    z: point.z + direction.z * visualMeters
  };
}

function createEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#e0ccb2");
  gradient.addColorStop(0.5, "#b9a087");
  gradient.addColorStop(1, "#8d7968");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  let seed = 9247;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let index = 0; index < 2600; index++) {
    const shade = Math.floor(35 + random() * 75);
    context.fillStyle = "rgba(" + shade + "," + Math.floor(shade * 0.78) + "," + Math.floor(shade * 0.58) + "," + (0.05 + random() * 0.12) + ")";
    const size = 1 + random() * 5;
    context.fillRect(random() * 512, random() * 512, size * 2.2, size);
  }
  context.lineCap = "round";
  for (let mark = 0; mark < 70; mark++) {
    const x = random() * 512;
    const y = random() * 512;
    const length = 25 + random() * 150;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + length * 0.3, y - 8 + random() * 16, x + length * 0.7, y - 8 + random() * 16, x + length, y - 3 + random() * 6);
    context.strokeStyle = mark % 4 === 0 ? "rgba(38,25,17,.25)" : "rgba(238,205,153,.11)";
    context.lineWidth = 0.7 + random() * 2.2;
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4.5, 3.5);
  return texture;
}

function createLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(5,22,18,.88)";
  context.roundRect(2, 2, 252, 60, 12);
  context.fill();
  context.strokeStyle = "#66e6cb";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#e8fff8";
  context.font = "600 26px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 33);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(25, 6.25, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function disposeObject(object, preservedTextures) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture && !preservedTextures.has(value)) value.dispose();
      });
      material.dispose();
    });
  });
}

export class SlopeScene3D {
  constructor(canvas, onSensorSelect) {
    this.canvas = canvas;
    this.onSensorSelect = onSensorSelect;
    this.scene = new Scene();
    this.scene.background = new Color("#9fb9b2");
    this.scene.fog = new Fog("#9fb9b2", 380, 950);
    this.camera = new PerspectiveCamera(42, 1, 0.5, 2400);
    this.projectionMode = "PERSPECTIVE";
    this.orthographicHalfHeight = 120;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 1000;
    this.controls.maxPolarAngle = Math.PI * 0.93;
    this.controls.target.set(0, 38, 0);
    this.controls.addEventListener("change", () => this.renderer.render(this.scene, this.camera));
    this.root = new Group();
    this.scene.add(this.root);
    this.earthTexture = createEarthTexture();
    this.preservedTextures = new Set([this.earthTexture]);
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.sensors = [];
    this.rainLines = null;
    this.rainFrame = null;
    this.rainLastFrame = 0;
    this.structureState = null;
    this.terrainBasePositions = null;
    this.ghostTerrain = null;
    this.displacementCuesRoot = null;
    this.femSlice = null;
    this.femVectorRoot = null;
    this.femSliceNodeIds = [];
    this.femSliceLastState = "";
    this.materialFragments = [];
    this.lastParameters = {};
    this.setupLights();
    this.camera.position.set(190, 145, 220);
  }

  setupLights() {
    this.hemisphere = new HemisphereLight("#edf8ff", "#523720", 1.35);
    this.scene.add(this.hemisphere);
    this.sun = new DirectionalLight("#fff2d3", 2.45);
    this.sun.position.set(180, 260, -120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -330;
    this.sun.shadow.camera.right = 330;
    this.sun.shadow.camera.top = 330;
    this.sun.shadow.camera.bottom = -330;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 850;
    this.sun.shadow.bias = -0.00025;
    this.scene.add(this.sun);
    this.fill = new DirectionalLight("#75a7c8", 0.55);
    this.fill.position.set(160, 90, 180);
    this.scene.add(this.fill);
  }

  clearRoot() {
    this.rainLines = null;
    disposeObject(this.root, this.preservedTextures);
    this.scene.remove(this.root);
    this.root = new Group();
    this.scene.add(this.root);
    this.sensors = [];
    this.terrainBasePositions = null;
    this.ghostTerrain = null;
    this.displacementCuesRoot = null;
    this.femSlice = null;
    this.femVectorRoot = null;
    this.femSliceNodeIds = [];
    this.femSliceLastState = "";
    this.materialFragments = [];
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const pixelRatio = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.floor(width * pixelRatio) || this.canvas.height !== Math.floor(height * pixelRatio)) {
      this.renderer.setSize(width, height, false);
      const aspect = width / height;
      if (this.camera.isPerspectiveCamera) this.camera.aspect = aspect;
      if (this.camera.isOrthographicCamera) {
        this.camera.left = -this.orthographicHalfHeight * aspect;
        this.camera.right = this.orthographicHalfHeight * aspect;
        this.camera.top = this.orthographicHalfHeight;
        this.camera.bottom = -this.orthographicHalfHeight;
      }
      this.camera.updateProjectionMatrix();
    }
  }

  render(data) {
    this.lastData = data;
    this.lastParameters = data.forecast.simulationParameters || {};
    const animated = Number(data.weather?.rainfallMmH || 0) > 0 || (data.playback.progress > 0 && data.playback.progress < 1);
    const targetPixelRatio = Math.min(window.devicePixelRatio || 1, animated ? 1.35 : 1.8);
    if (Math.abs(this.renderer.getPixelRatio() - targetPixelRatio) > 0.01) this.renderer.setPixelRatio(targetPixelRatio);
    this.resize();
    const optionsKey = Object.entries(data.options).map(([key, value]) => `${key}:${value}`).join("|");
    const sameStructure = this.structureState
      && this.structureState.forecast === data.forecast
      && this.structureState.readings === data.readings
      && this.structureState.geometryAsset === data.geometryAsset
      && this.structureState.photoApproximation === data.photoApproximation
      && this.structureState.femRun === data.femRun
      && this.structureState.layer === data.layer
      && this.structureState.optionsKey === optionsKey
      && this.structureState.rainfallMmH === Number(data.weather?.rainfallMmH || 0);
    if (sameStructure && this.terrain && this.terrainBasePositions) {
      this.updateTerrainDisplacement(data);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.clearRoot();
    this.structureState = {
      forecast: data.forecast,
      readings: data.readings,
      geometryAsset: data.geometryAsset,
      photoApproximation: data.photoApproximation,
      femRun: data.femRun,
      layer: data.layer,
      optionsKey,
      rainfallMmH: Number(data.weather?.rainfallMmH || 0)
    };
    const realistic = data.options.realistic;
    this.renderer.shadowMap.enabled = realistic;
    this.sun.castShadow = realistic;
    this.scene.background.set(realistic ? "#9fb9b2" : "#071511");
    this.scene.fog.color.set(realistic ? "#9fb9b2" : "#071511");
    this.hemisphere.intensity = realistic ? 1.35 : 0.8;
    this.sun.intensity = realistic ? 2.45 : 1.25;
    this.buildGround(data, realistic);
    this.buildTerrain(data, realistic);
    this.buildFemSlice(data);
    if (data.options.coordinates) this.buildGrid(data);
    this.buildSensors(data);
    this.buildRain(data);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  buildGround(data, realistic) {
    const width = data.forecast.simulationParameters.slopeWidthM || 160;
    const wetness = clamp(Number(data.weather?.rainfallMmH || 0) / 100);
    const ground = new Mesh(
      new PlaneGeometry(Math.max(1000, width * 5), Math.max(1000, width * 5)),
      new MeshStandardMaterial({
        color: realistic ? new Color("#554539").multiplyScalar(1 - wetness * 0.28) : "#102820",
        map: realistic ? this.earthTexture : null,
        roughness: realistic ? 1 - wetness * 0.34 : 1,
        metalness: 0
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.5;
    ground.receiveShadow = realistic;
    this.root.add(ground);
  }

  buildTerrain(data, realistic) {
    const { forecast, readings, geometryAsset, photoApproximation, layer, options, playback } = data;
    const parameters = forecast.simulationParameters || {};
    const positions = [];
    const basePositions = [];
    const colors = [];
    const normals = [];
    const uvs = [];
    const baseLayer = layerValue(layer, forecast, readings);
    const wetness = clamp(Number(data.weather?.rainfallMmH || 0) / 100);
    const addFace = (points, baseColor, value, normalAt = null) => {
      const display = points.map((point) => options.materialMotion && !data.femRun ? displacedPoint(point, parameters, forecast, playback.progress, playback.amplification) : point);
      for (let index = 1; index < display.length - 1; index++) {
        const sourceIndices = [0, index + 1, index];
        const edgeA = new Vector3().subVectors(new Vector3().copy(display[index + 1]), new Vector3().copy(display[0]));
        const edgeB = new Vector3().subVectors(new Vector3().copy(display[index]), new Vector3().copy(display[0]));
        const faceNormal = edgeA.cross(edgeB).normalize();
        if (faceNormal.y < 0) faceNormal.negate();
        sourceIndices.forEach((sourceIndex) => {
          const point = display[sourceIndex];
          const color = baseColor.clone();
          if (wetness) color.multiplyScalar(1 - wetness * 0.3);
          if (options.overlay) color.lerp(analyticalColor(value), options.highContrast ? 0.68 : 0.34);
          positions.push(point.x, point.y, point.z);
          const basePoint = points[sourceIndex];
          basePositions.push(basePoint.x, basePoint.y, basePoint.z);
          colors.push(color.r, color.g, color.b);
          const normal = normalAt ? normalAt(points[sourceIndex]) : faceNormal;
          normals.push(normal.x, normal.y, normal.z);
          uvs.push(point.x / 80, point.z / 80);
        });
      }
    };

    if (geometryAsset?.mesh) {
      const { vertices, faces } = geometryAsset.mesh;
      faces.slice(0, 25000).forEach((indices) => {
        const points = indices.map((index) => vertices[index]).filter(Boolean);
        if (points.length < 3) return;
        const centre = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
        centre.x /= points.length;
        centre.y /= points.length;
        centre.z /= points.length;
        addFace(points, new Color("#78695c"), clamp(baseLayer + centre.y / 400));
      });
    } else {
      const width = parameters.slopeWidthM || 160;
      const height = parameters.slopeHeightM || 90;
      const halfWidth = width / 2;
      const halfDepth = width * 0.42;
      const xs = Array.from({ length: 39 }, (_, index) => -halfWidth + index * (width / 38));
      const zs = Array.from({ length: 29 }, (_, index) => -halfDepth + index * ((halfDepth * 2) / 28));
      const heightAt = (x, z) => {
        const base = options.terrain ? terrainHeight(x, z, parameters) : 12;
        if (!photoApproximation?.profile) return base;
        const profileIndex = clamp(Math.round(((x + halfWidth) / width) * (photoApproximation.profile.length - 1)), 0, photoApproximation.profile.length - 1);
        return base * (0.48 + photoApproximation.profile[profileIndex] * 0.82);
      };
      const normalAt = (point) => {
        const step = Math.max(0.35, width / 180);
        return new Vector3(
          heightAt(point.x - step, point.z) - heightAt(point.x + step, point.z),
          step * 2,
          heightAt(point.x, point.z - step) - heightAt(point.x, point.z + step)
        ).normalize();
      };
      for (let xi = 0; xi < xs.length - 1; xi++) {
        for (let zi = 0; zi < zs.length - 1; zi++) {
          const x = xs[xi];
          const z = zs[zi];
          const x2 = xs[xi + 1];
          const z2 = zs[zi + 1];
          const midX = (x + x2) / 2;
          const midZ = (z + z2) / 2;
          if (!slopeFootprint(midX, midZ, parameters)) continue;
          const points = [
            { x, y: heightAt(x, z), z },
            { x: x2, y: heightAt(x2, z), z },
            { x: x2, y: heightAt(x2, z2), z: z2 },
            { x, y: heightAt(x, z2), z: z2 }
          ];
          const averageHeight = points.reduce((sum, point) => sum + point.y, 0) / points.length;
          const depth = Math.max(0, height - averageHeight);
          const baseColor = options.materials ? materialColor(depth, parameters, midX, midZ) : new Color("#315448");
          const spatialValue = clamp(baseLayer + ((midX + halfWidth) / width) * 0.17 + ((midZ + halfDepth) / (halfDepth * 2)) * 0.06);
          addFace(points, baseColor, spatialValue, normalAt);
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    const material = new MeshStandardMaterial({
      vertexColors: true,
      map: realistic ? this.earthTexture : null,
      roughness: realistic ? 0.94 - wetness * 0.38 : 0.72,
      metalness: 0,
      side: DoubleSide,
      flatShading: !realistic
    });
    const terrain = new Mesh(geometry, material);
    terrain.castShadow = realistic;
    terrain.receiveShadow = realistic;
    this.terrain = terrain;
    this.terrainBasePositions = new Float32Array(basePositions);
    this.root.add(terrain);
    const baseGeometry = new BufferGeometry();
    baseGeometry.setAttribute("position", new Float32BufferAttribute(this.terrainBasePositions, 3));
    this.ghostTerrain = new LineSegments(
      new WireframeGeometry(baseGeometry),
      new LineBasicMaterial({ color: "#84f4df", transparent: true, opacity: 0.24, depthWrite: false })
    );
    baseGeometry.dispose();
    this.ghostTerrain.renderOrder = 8;
    this.root.add(this.ghostTerrain);
    this.displacementCuesRoot = new Group();
    this.root.add(this.displacementCuesRoot);
    this.buildMaterialFragments(data);
    this.updatePlaybackOverlay(data);
  }

  updateTerrainDisplacement(data) {
    const position = this.terrain.geometry.getAttribute("position");
    const parameters = data.forecast.simulationParameters || {};
    const base = this.terrainBasePositions;
    for (let offset = 0, index = 0; offset < base.length; offset += 3, index++) {
      const point = { x: base[offset], y: base[offset + 1], z: base[offset + 2] };
      const display = data.options.materialMotion && !data.femRun
        ? displacedPoint(point, parameters, data.forecast, data.playback.progress, data.playback.amplification)
        : point;
      position.setXYZ(index, display.x, display.y, display.z);
    }
    position.needsUpdate = true;
    this.updateFemSlice(data);
    this.updatePlaybackOverlay(data);
  }

  updatePlaybackOverlay(data) {
    const visible = data.playback.progress > 0.005;
    const materialMotion = data.options.materialMotion;
    if (this.ghostTerrain) this.ghostTerrain.visible = visible && materialMotion && !data.femRun;
    this.materialFragments.forEach((fragment) => {
      fragment.visible = visible && materialMotion && !data.femRun;
      if (!fragment.visible) return;
      const base = fragment.userData.basePoint;
      const display = displacedPoint(base, data.forecast.simulationParameters || {}, data.forecast, data.playback.progress, data.playback.amplification);
      fragment.position.set(display.x, display.y, display.z);
      fragment.rotation.z = fragment.userData.baseRotation + data.playback.progress * 0.42;
    });
    if (!this.displacementCuesRoot) return;
    disposeObject(this.displacementCuesRoot, this.preservedTextures);
    this.displacementCuesRoot.clear();
    if (visible && !materialMotion && !data.femRun) this.buildDisplacementCues(data);
  }

  buildFemSlice(data) {
    const run = data.femRun;
    if (!run?.mesh?.nodes?.length || !run.mesh.elements?.length) return;
    const positions = [];
    const colors = [];
    const nodeIds = [];
    const width = run.scenario?.slopeWidthM || 160;
    const frontZ = width * 0.42 + 3;
    for (const element of run.mesh.elements) {
      for (const nodeId of element.nodeIds) {
        const node = run.mesh.nodes[nodeId];
        if (!node) continue;
        positions.push(node.xM - width / 2, node.yM, frontZ);
        colors.push(0.12, 0.62, 0.5);
        nodeIds.push(nodeId);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const surface = new Mesh(geometry, new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      transparent: true,
      opacity: 0.82,
      roughness: 0.72,
      metalness: 0,
      depthWrite: false
    }));
    const wire = new Mesh(geometry, new MeshBasicMaterial({
      color: "#d8fff5",
      side: DoubleSide,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }));
    surface.renderOrder = 10;
    wire.renderOrder = 11;
    this.femSlice = surface;
    this.femSliceNodeIds = nodeIds;
    this.root.add(surface, wire);
    this.femVectorRoot = new Group();
    this.femVectorRoot.renderOrder = 13;
    this.root.add(this.femVectorRoot);
    const label = createLabel("FEM 2D · CORTE");
    label.position.set(0, (run.scenario?.slopeHeightM || 100) + 9, frontZ);
    this.root.add(label);
    this.updateFemSlice(data, true);
  }

  updateFemSlice(data, force = false) {
    if (!this.femSlice || !data.femRun) return;
    const run = data.femRun;
    const progress = clamp(data.playback.progress);
    const steps = run.timeSeries || [];
    const stepIndex = progress <= 0 ? -1 : Math.min(steps.length - 1, Math.max(0, Math.ceil(progress * steps.length) - 1));
    const stateKey = `${stepIndex}|${data.options.materialMotion}`;
    if (!force && stateKey === this.femSliceLastState) return;
    this.femSliceLastState = stateKey;
    const stepNodes = stepIndex >= 0 ? steps[stepIndex]?.nodes : null;
    const baseNodes = run.mesh.nodes;
    const width = run.scenario?.slopeWidthM || 160;
    const frontZ = width * 0.42 + 3;
    const finalMaximumMm = Math.max(run.summary?.maximumRainfallInducedDisplacementMm || 0, 1e-9);
    // La autoescala hace legibles desplazamientos submilimétricos. El panel
    // conserva y muestra siempre la magnitud física sin amplificar.
    const visualScale = Math.max(data.playback.amplification || 1, Math.min(1_000_000, 6 / (finalMaximumMm / 1000)));
    const position = this.femSlice.geometry.getAttribute("position");
    const color = this.femSlice.geometry.getAttribute("color");
    this.femSliceNodeIds.forEach((nodeId, vertexIndex) => {
      const base = baseNodes[nodeId];
      const result = stepNodes?.[nodeId] || base;
      const deformation = data.options.materialMotion && stepNodes ? visualScale : 0;
      position.setXYZ(
        vertexIndex,
        base.xM - width / 2 + (result.deltaUxMm || 0) / 1000 * deformation,
        base.yM + (result.deltaUyMm || 0) / 1000 * deformation,
        frontZ
      );
      const ratio = clamp((result.rainfallInducedDisplacementMm || 0) / finalMaximumMm);
      const mapped = analyticalColor(ratio);
      color.setXYZ(vertexIndex, mapped.r, mapped.g, mapped.b);
    });
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.femSlice.geometry.computeVertexNormals();

    if (!this.femVectorRoot) return;
    disposeObject(this.femVectorRoot, this.preservedTextures);
    this.femVectorRoot.clear();
    if (data.options.materialMotion || !stepNodes) return;
    const candidates = stepNodes
      .filter((node) => node.rainfallInducedDisplacementMm > finalMaximumMm * 0.18)
      .sort((a, b) => b.rainfallInducedDisplacementMm - a.rainfallInducedDisplacementMm)
      .slice(0, 12);
    candidates.forEach((node) => {
      const direction = new Vector3(node.deltaUxMm || 0, node.deltaUyMm || 0, 0);
      if (direction.lengthSq() < 1e-12) return;
      direction.normalize();
      const length = Math.max(3.5, node.rainfallInducedDisplacementMm / finalMaximumMm * 8);
      const arrow = new ArrowHelper(direction, new Vector3(node.xM - width / 2, node.yM, frontZ + 0.4), length, "#ffca6a", Math.min(2.2, length * 0.3), Math.min(1.3, length * 0.18));
      this.femVectorRoot.add(arrow);
    });
  }

  buildMaterialFragments(data) {
    if (data.geometryAsset?.mesh) return;
    const parameters = data.forecast.simulationParameters || {};
    const width = parameters.slopeWidthM || 160;
    const height = parameters.slopeHeightM || 90;
    const depth = width * 0.42;
    const samples = [
      [-0.38, -0.52, 0.8], [-0.31, 0.18, 1.1], [-0.24, 0.52, 0.7], [-0.15, -0.25, 0.9],
      [-0.08, 0.34, 1.25], [0.02, -0.48, 0.75], [0.08, 0.06, 1.0], [0.16, 0.48, 0.72],
      [0.22, -0.16, 1.15], [0.29, 0.28, 0.86], [0.35, -0.52, 0.68], [0.41, 0.08, 0.94]
    ];
    samples.forEach(([xRatio, zRatio, sizeFactor], index) => {
      const x = xRatio * width;
      const z = zRatio * depth;
      if (!slopeFootprint(x, z, parameters)) return;
      const surface = terrainHeight(x, z, parameters);
      const basePoint = { x, y: surface + Math.max(0.8, width / 180), z };
      const material = new MeshStandardMaterial({
        color: materialColor(Math.max(0, height - surface), parameters, x, z),
        roughness: 0.96,
        metalness: 0
      });
      const fragment = new Mesh(new DodecahedronGeometry(Math.max(0.7, width / 105) * sizeFactor, 0), material);
      fragment.position.set(basePoint.x, basePoint.y, basePoint.z);
      fragment.rotation.set(index * 0.37, index * 0.61, index * 0.29);
      fragment.castShadow = data.options.realistic;
      fragment.receiveShadow = data.options.realistic;
      fragment.visible = false;
      fragment.userData.basePoint = basePoint;
      fragment.userData.baseRotation = fragment.rotation.z;
      this.materialFragments.push(fragment);
      this.root.add(fragment);
    });
  }

  buildDisplacementCues(data) {
    if (data.geometryAsset?.mesh) return;
    const parameters = data.forecast.simulationParameters || {};
    const width = parameters.slopeWidthM || 160;
    const depth = width * 0.42;
    const progress = data.playback.progress;
    const samples = [
      [-0.32, -0.35], [-0.12, 0.2], [0.08, -0.2], [0.28, 0.35], [0.43, 0]
    ];
    samples.forEach(([xRatio, zRatio]) => {
      const start = {
        x: xRatio * width,
        y: terrainHeight(xRatio * width, zRatio * depth, parameters) + 1.5,
        z: zRatio * depth
      };
      if (!slopeFootprint(start.x, start.z, parameters)) return;
      const end = displacedPoint(start, parameters, data.forecast, progress, data.playback.amplification);
      const direction = new Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
      const computedLength = direction.length();
      if (computedLength < 0.01) return;
      direction.normalize();
      const visibleLength = Math.max(computedLength, progress * Math.max(4, width * 0.055));
      const arrow = new ArrowHelper(direction, new Vector3(start.x, start.y, start.z), visibleLength, "#ffca6a", Math.min(4, visibleLength * 0.32), Math.min(2.2, visibleLength * 0.18));
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.9;
      arrow.renderOrder = 12;
      this.displacementCuesRoot.add(arrow);
    });
  }

  buildRain(data) {
    const intensity = Number(data.weather?.rainfallMmH || 0);
    if (intensity <= 0) return;
    const parameters = data.forecast.simulationParameters || {};
    const width = parameters.slopeWidthM || 160;
    const height = Math.max(parameters.slopeHeightM || 90, 90);
    const count = Math.round(180 + clamp(intensity / 100) * 720);
    const positions = [];
    let seed = 3719;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let index = 0; index < count; index++) {
      const x = (random() - 0.5) * width * 2.3;
      const y = 5 + random() * (height * 1.9);
      const z = (random() - 0.5) * width * 1.55;
      const streak = 2.5 + random() * 6;
      positions.push(x, y, z, x - streak * 0.16, y - streak, z + streak * 0.08);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({ color: "#9bdcff", transparent: true, opacity: 0.62, depthWrite: false });
    this.rainLines = new LineSegments(geometry, material);
    this.rainLines.userData.verticalSpan = height * 1.9;
    this.rainLines.renderOrder = 15;
    this.root.add(this.rainLines);
    if (!this.rainFrame) this.rainFrame = requestAnimationFrame((timestamp) => this.animateRain(timestamp));
  }

  animateRain(timestamp) {
    if (!this.rainLines) {
      this.rainFrame = null;
      this.rainLastFrame = 0;
      return;
    }
    const previous = this.rainLastFrame || timestamp;
    const deltaSeconds = Math.min(0.05, (timestamp - previous) / 1000);
    this.rainLastFrame = timestamp;
    const position = this.rainLines.geometry.getAttribute("position");
    const span = this.rainLines.userData.verticalSpan;
    for (let index = 0; index < position.count; index++) {
      let y = position.getY(index) - deltaSeconds * 58;
      if (y < -3) y += span;
      position.setY(index, y);
    }
    position.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.rainFrame = requestAnimationFrame((nextTimestamp) => this.animateRain(nextTimestamp));
  }

  buildGrid(data) {
    const width = data.forecast.simulationParameters.slopeWidthM || 160;
    const grid = new GridHelper(Math.max(width * 1.8, 240), 12, "#d66a53", "#4f756b");
    grid.position.y = 0.15;
    grid.material.transparent = true;
    grid.material.opacity = 0.58;
    this.root.add(grid);
  }

  buildSensors(data) {
    const { forecast, readings } = data;
    const parameters = forecast.simulationParameters || {};
    const width = parameters.slopeWidthM || 160;
    const halfDepth = width * 0.42;
    const definitions = [
      { id: forecast.sensorId, name: "Sensor activo", x: -width * 0.06, z: -halfDepth * 0.06, detail: "Desplazamiento actual: " + forecast.currentDisplacementMm.toFixed(2) + " mm; previsto: " + forecast.predictedDisplacementMm.toFixed(2) + " mm." },
      { id: "PZ-02", name: "Piezómetro", x: width * 0.30, z: halfDepth * 0.35, detail: "Presión de poros interpolada: " + (readings.at(-1)?.porePressureKpa || 0).toFixed(1) + " kPa." },
      { id: "INC-03", name: "Inclinómetro", x: -width * 0.45, z: halfDepth * 0.4, detail: "Velocidad derivada: " + forecast.femState.displacementRateMmH.toFixed(3) + " mm/h." }
    ];
    definitions.filter((sensor) => slopeFootprint(sensor.x, sensor.z, parameters)).forEach((sensor) => {
      const y = terrainHeight(sensor.x, sensor.z, parameters) + 5;
      const marker = new Mesh(
        new SphereGeometry(Math.max(1.7, width / 90), 20, 14),
        new MeshStandardMaterial({ color: "#eafff8", emissive: "#28d9b5", emissiveIntensity: 1.25, roughness: 0.35 })
      );
      marker.position.set(sensor.x, y, sensor.z);
      marker.castShadow = true;
      marker.userData.sensor = sensor;
      const label = createLabel(sensor.id);
      label.position.set(0, Math.max(7, width / 32), 0);
      marker.add(label);
      this.sensors.push(marker);
      this.root.add(marker);
    });
  }

  selectAt(event) {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.sensors, false)[0];
    if (hit?.object.userData.sensor) this.onSensorSelect(hit.object.userData.sensor);
  }

  fit() {
    if (!this.terrain) return;
    const bounds = new Box3().setFromObject(this.terrain);
    const centre = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const distance = Math.max(size.x, size.y, size.z) * 1.65;
    this.orthographicHalfHeight = Math.max(size.y * 0.7, size.x * 0.38, size.z * 0.55, 20);
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).add(new Vector3(1.05, 0.72, 1.15).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(0.2, distance / 900);
    this.camera.far = Math.max(1800, distance * 8);
    this.camera.updateProjectionMatrix();
    this.resize();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setProjection(mode) {
    const nextMode = mode === "ORTHOGRAPHIC" ? "ORTHOGRAPHIC" : "PERSPECTIVE";
    if (nextMode === this.projectionMode) return;
    const position = this.camera.position.clone();
    const up = this.camera.up.clone();
    const near = this.camera.near;
    const far = this.camera.far;
    const aspect = Math.max(this.canvas.clientWidth, 1) / Math.max(this.canvas.clientHeight, 1);
    this.camera = nextMode === "ORTHOGRAPHIC"
      ? new OrthographicCamera(-this.orthographicHalfHeight * aspect, this.orthographicHalfHeight * aspect, this.orthographicHalfHeight, -this.orthographicHalfHeight, near, far)
      : new PerspectiveCamera(42, aspect, near, far);
    this.camera.position.copy(position);
    this.camera.up.copy(up);
    this.controls.object = this.camera;
    this.projectionMode = nextMode;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setViewpoint(name) {
    const parameters = this.lastParameters;
    const width = parameters.slopeWidthM || 160;
    const height = parameters.slopeHeightM || 90;
    const depth = width * 0.42;
    if (name === "overview") return this.fit();
    const views = {
      crest: { position: [-width * 0.42, height * 1.05, depth * 0.55], target: [0, height * 0.55, 0] },
      midbench: { position: [0, height * 0.58, depth * 0.72], target: [width * 0.18, height * 0.38, 0] },
      toe: { position: [width * 0.62, Math.max(8, height * 0.12), depth * 0.72], target: [0, height * 0.42, 0] }
    };
    const view = views[name];
    if (!view) return;
    this.camera.position.fromArray(view.position);
    this.controls.target.fromArray(view.target);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  moveFreeCamera(key, speed) {
    const forward = new Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new Vector3().crossVectors(forward, this.camera.up).normalize().negate();
    const movement = new Vector3();
    if (key === "w") movement.copy(forward);
    if (key === "s") movement.copy(forward).negate();
    if (key === "a") movement.copy(right).negate();
    if (key === "d") movement.copy(right);
    if (key === "q") movement.set(0, -1, 0);
    if (key === "e") movement.set(0, 1, 0);
    if (!movement.lengthSq()) return false;
    movement.multiplyScalar(speed);
    this.camera.position.add(movement);
    this.controls.target.add(movement);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    return true;
  }
}
