"use strict";

const fs = require("fs");
const path = require("path");
const deps = "/home/robertoa1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const sharp = require(path.join(deps, "sharp"));
const { mathjax } = require(path.join(deps, "mathjax-full/js/mathjax.js"));
const { TeX } = require(path.join(deps, "mathjax-full/js/input/tex.js"));
const { SVG } = require(path.join(deps, "mathjax-full/js/output/svg.js"));
const { liteAdaptor } = require(path.join(deps, "mathjax-full/js/adaptors/liteAdaptor.js"));
const { RegisterHTMLHandler } = require(path.join(deps, "mathjax-full/js/handlers/html.js"));
const { AllPackages } = require(path.join(deps, "mathjax-full/js/input/tex/AllPackages.js"));

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "local" }),
});
const equations = [
  String.raw`K(\theta)\boldsymbol{u}_t=\boldsymbol{f}_g(\theta)+\boldsymbol{f}_p(p_t,\theta)`,
  String.raw`\hat y_{\mathrm{LSTM}}(t+h)=\max\{y_t,\;y_t+\mu_\Delta+\sigma_\Delta q_\psi(X_{t,h})\}`,
  String.raw`\hat y_{\mathrm{H}}(t+h)=\max\{y_t,\;y_t+\mu_\Delta+\sigma_\Delta[q_\psi(X_{t,h})+c_\phi(Z_{t,h})]\}`,
  String.raw`\frac{\partial c_\phi}{\partial r}\geq 0,\qquad \frac{\partial c_\phi}{\partial s}\leq 0`,
];
const dir = path.join(__dirname, "equations-bgm");
fs.mkdirSync(dir, { recursive: true });

async function main() {
  for (let i = 0; i < equations.length; i++) {
    const html = adaptor.outerHTML(document.convert(equations[i], { display: true }));
    const start = html.indexOf("<svg");
    const end = html.indexOf("</svg>");
    let svg = html.slice(start, end + 6).replace(/currentColor/g, "#000000");
    if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) {
      svg = svg.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ');
    }
    svg = svg.replace(/(width|height)="([0-9.]+)(ex|em)"/g, (_m, attr, num) =>
      `${attr}="${Math.round(parseFloat(num) * 8.5)}px"`);
    const out = path.join(dir, `equation-${i + 1}.png`);
    await sharp(Buffer.from(svg), { density: 300 }).png().toFile(out);
    process.stdout.write(out + "\n");
  }
}

main().catch((error) => { process.stderr.write(String(error)); process.exit(1); });
