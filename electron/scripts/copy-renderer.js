/*
 * Copia los recursos estáticos de los renderers propios (HTML/CSS) de
 * src/renderer a dist/renderer. tsc solo emite los .ts; sin este paso
 * dist/renderer/toolbar/index.html no existe y la barra no carga.
 * electron-builder empaqueta dist/**, así que en producción viajan dentro
 * del asar (BrowserWindow.loadFile sí puede leerlos de ahí).
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer');
const DST = path.join(__dirname, '..', 'dist', 'renderer');
const EXT = new Set(['.html', '.css', '.svg', '.png']);

function walk(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      walk(s, d);
    } else if (EXT.has(path.extname(entry.name))) {
      fs.copyFileSync(s, d);
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.log('[copy-renderer] No hay src/renderer, nada que copiar');
} else {
  walk(SRC, DST);
  console.log('[copy-renderer] src/renderer → dist/renderer OK');
}
