import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = resolve(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const children = [];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);

const occupied = port => new Promise(resolveProbe => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.on('connect', () => { socket.destroy(); resolveProbe(true); });
  socket.on('error', () => resolveProbe(false));
});

try {
  if (!existsSync(python)) throw new Error('Falta .venv. Sigue la instalación del README antes de ejecutar npm run lab.');
  if (await occupied(3001)) throw new Error('El puerto 3001 ya está en uso. Si Century Lab está abierto, usa http://127.0.0.1:3001. No se cerró ningún servidor existente.');
  if (await occupied(8001)) {
    const res = await fetch('http://127.0.0.1:8001/api/health');
    const health = await res.json();
    if (health.application !== 'century-research-lab') throw new Error('El puerto 8001 pertenece a otro servicio. No se modificó.');
    console.log('Se reutiliza la API de Century Lab ya en ejecución.');
  } else {
    children.push(spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8001'], { cwd: root, stdio: 'inherit' }));
  }
  const mode = process.argv.includes('--dev') ? 'dev' : 'start';
  if (mode === 'start' && !existsSync(resolve(root, '.next/BUILD_ID'))) throw new Error('Primero ejecuta npm run build, o usa npm run lab:dev.');
  const ui = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), mode, '--hostname', '127.0.0.1', '--port', '3001'], { cwd: root, stdio: 'inherit' });
  children.push(ui);
  console.log('\nCentury Lab: http://127.0.0.1:3001\nCtrl+C cierra únicamente los procesos iniciados por este comando.\n');
  for (const child of children) child.on('exit', () => { stop(); });
} catch (error) {
  console.error(error.message);
  stop();
  process.exitCode = 1;
}
