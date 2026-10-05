// workerIdleMemoryLimit es una opción de configuración, no del CLI de Jest.
// Conserva el catálogo y las transformaciones del repo y sólo acota recursos
// de CI. Las particiones y los archivos elegidos llegan como argumentos.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import configuracion from '../../jest.config.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const resultado = spawnSync(process.execPath, [
  resolve(rootDir, 'node_modules/jest/bin/jest.js'),
  ...process.argv.slice(2),
  '--config',
  JSON.stringify({ ...configuracion, rootDir, maxWorkers: 2, workerIdleMemoryLimit: '1024MB' }),
], { cwd: rootDir, stdio: 'inherit' });
if (resultado.error) throw resultado.error;
if (resultado.signal) console.error(`Jest terminó por la señal ${resultado.signal}.`);
process.exitCode = resultado.status ?? 1;
