import test from "node:test";
import assert from "node:assert/strict";
import { amplificationFromSlider, femDisplayScale, sliderFromAmplification } from "../public/displacement-scale.js";

test("el control incluye 1× y conserva los pasos amplificados", () => {
  assert.equal(amplificationFromSlider(0), 1);
  assert.equal(amplificationFromSlider(1), 200);
  assert.equal(amplificationFromSlider(11), 1200);
  assert.equal(amplificationFromSlider(19), 2000);
  assert.equal(sliderFromAmplification(1), 0);
  assert.equal(sliderFromAmplification(1200), 11);
  assert.equal(sliderFromAmplification(2000), 19);
});

test("la sección FEM respeta 1× y conserva autoescala al amplificar", () => {
  assert.equal(femDisplayScale(1, 0.06), 1);
  assert.ok(Math.abs(femDisplayScale(200, 0.06) - 100000) < 1e-6);
  assert.equal(femDisplayScale(2000, 10), 2000);
});
