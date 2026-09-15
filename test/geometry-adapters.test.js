import test from "node:test";
import assert from "node:assert/strict";
import { readModel } from "../public/geometry-adapters.js";

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) {
    this.type = type;
    Object.assign(this, properties);
  }
};

const textFile = (name, contents) => ({
  name,
  text: async () => contents,
  arrayBuffer: async () => new TextEncoder().encode(contents).buffer
});

function binaryStlFile() {
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const values = [0, 0, 1, 0, 0, 0, 10, 0, 0, 0, 10, 0];
  values.forEach((value, index) => view.setFloat32(84 + index * 4, value, true));
  return { name: "triangulo.stl", arrayBuffer: async () => buffer };
}

test("Three.js carga una superficie OBJ", async () => {
  const result = await readModel(textFile("talud.obj", "v 0 0 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\n"));
  assert.equal(result.format, "OBJ");
  assert.equal(result.mesh.faces.length, 1);
  assert.equal(result.mesh.vertices.length, 3);
});

test("Three.js carga STL binario", async () => {
  const result = await readModel(binaryStlFile());
  assert.equal(result.format, "STL");
  assert.equal(result.mesh.faces.length, 1);
  assert.equal(result.mesh.vertices.length, 3);
  assert.match(result.note, /binaria/);
});

test("Three.js carga glTF con datos embebidos", async () => {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]).buffer).toString("base64");
  const gltf = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 36, uri: `data:application/octet-stream;base64,${positions}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [10, 10, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0
  });
  const result = await readModel(textFile("talud.gltf", gltf));
  assert.equal(result.format, "glTF");
  assert.equal(result.mesh.faces.length, 1);
});
