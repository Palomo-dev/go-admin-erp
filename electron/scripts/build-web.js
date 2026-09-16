/**
 * Construye la web (Next.js standalone) y la deja en electron/resources/web/
 * para que electron-builder la empaquete como extraResource (`resources/web`
 * dentro del instalador; nunca dentro del asar: Next necesita leer archivos
 * reales del disco).
 *
 * Pasos:
 *   1. `next build` en la raíz del repositorio (next.config.js tiene
 *      `output: 'standalone'`) con NEXT_DIST_DIR=.next-desktop (ver DIST_DIR).
 *   2. Copia `<dist>/standalone/**`           → resources/web/
 *            `<dist>/static`                  → resources/web/<dist>/static
 *            `public`                         → resources/web/public
 *      (Next no copia estas dos últimas al standalone a propósito: en un
 *      despliegue normal las sirve un CDN. Aquí las sirve el propio server.js.)
 *   3. Escribe resources/web/.env con SOLO las variables públicas
 *      (allow-list de abajo). Ningún secreto de servidor viaja en el .exe.
 *
 * Uso:  node scripts/build-web.js [--skip-next-build]
 *   --skip-next-build  reutiliza el <dist>/standalone existente (útil para
 *                      iterar sobre el empaquetado sin esperar 10-20 min).
 *
 * Variables de entorno: las lee de process.env y, si faltan, de
 * .env.production y .env.local de la raíz (en ese orden de prioridad).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON_DIR = path.join(__dirname, '..');
/**
 * Directorio de salida de Next para ESTE build. Por defecto `.next-desktop`,
 * distinto del `.next` de siempre: un `next dev` o `next build` que corra a la
 * vez en el mismo árbol (otro desarrollador, otro agente, la verificación de
 * cierre de una tarea) borra `.next/server` y este build muere a mitad con
 * "Cannot find module '../webpack-runtime.js'". next.config.js lee
 * NEXT_DIST_DIR. Se puede fijar a `.next` para reutilizar un build normal.
 */
const DIST_DIR = process.env.NEXT_DIST_DIR || '.next-desktop';
const DIST = path.join(ROOT, DIST_DIR);
const STANDALONE = path.join(DIST, 'standalone');
const DEST = path.join(ELECTRON_DIR, 'resources', 'web');

/**
 * Variables que se empaquetan en resources/web/.env.
 *
 * Solo claves públicas: las NEXT_PUBLIC_* ya van inlinadas en el bundle del
 * navegador que cualquiera puede descargar de app.goadmin.io, así que
 * empaquetarlas no expone nada nuevo. Se incluyen igualmente porque hay código
 * de servidor (middleware, edge-rest.ts, server-user.ts) que las lee de
 * process.env en tiempo de ejecución.
 *
 * PROHIBIDO añadir aquí SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
 * CRON_SECRET, OPENAI_API_KEY ni ninguna otra clave de servidor: el instalador
 * es público y cualquiera puede abrirlo. Las API routes que las necesitan
 * simplemente no funcionan en el servidor local (ver
 * docs/desktop/FASE-3-NEXT-EMBEBIDO.md, sección "Qué no funciona").
 */
const PUBLIC_ENV_ALLOWLIST = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SELLERS_URL',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_META_APP_ID',
  'NEXT_PUBLIC_WHATSAPP_CONFIG_ID',
];

/**
 * Valores que en .env.local suelen apuntar a servicios de desarrollo
 * (localhost:3002, etc.) y que en el desktop deben ser los de producción.
 * Se aplican tanto al `next build` (Next inlina NEXT_PUBLIC_* en el bundle
 * del navegador en tiempo de build) como al .env empaquetado. Una variable
 * definida en el entorno del proceso sigue teniendo prioridad.
 */
const DESKTOP_ENV_DEFAULTS = {
  NEXT_PUBLIC_APP_URL: 'https://app.goadmin.io',
  NEXT_PUBLIC_SELLERS_URL: 'https://sellers.goadmin.io',
};

const args = new Set(process.argv.slice(2));
const skipNextBuild = args.has('--skip-next-build');

function log(msg) {
  console.log(`[build-web] ${msg}`);
}

/** Parser mínimo de .env (KEY=VALUE, comillas simples/dobles, # comentarios). */
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function resolvePublicEnv() {
  const fromFiles = {
    ...parseEnvFile(path.join(ROOT, '.env')),
    ...parseEnvFile(path.join(ROOT, '.env.local')),
    ...parseEnvFile(path.join(ROOT, '.env.production')),
  };
  const result = {};
  const missing = [];
  for (const key of PUBLIC_ENV_ALLOWLIST) {
    const value = process.env[key] || DESKTOP_ENV_DEFAULTS[key] || fromFiles[key];
    if (value) result[key] = value;
    else missing.push(key);
  }
  return { result, missing };
}

function runNextBuild() {
  log('Ejecutando `next build` en la raíz (puede tardar 10-20 min)...');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const res = spawnSync(npx, ['next', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...DESKTOP_ENV_DEFAULTS,
      ...process.env,
      NEXT_DIST_DIR: DIST_DIR,
      // El build de este repo se queda sin heap con el default de Node.
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192',
    },
  });
  if (res.status !== 0) {
    throw new Error(`next build terminó con código ${res.status}`);
  }
}

function copyDir(from, to, label) {
  if (!fs.existsSync(from)) {
    throw new Error(`No existe ${from} (${label}). ¿Falló el next build o falta output: 'standalone'?`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

function main() {
  if (!skipNextBuild) {
    runNextBuild();
  } else {
    log(`--skip-next-build: reutilizando ${DIST_DIR}/standalone existente`);
  }

  const serverJs = path.join(STANDALONE, 'server.js');
  if (!fs.existsSync(serverJs)) {
    throw new Error(`No se encontró ${serverJs}. Comprueba output: 'standalone' en next.config.js (distDir: ${DIST_DIR}).`);
  }

  log(`Limpiando ${DEST}`);
  fs.rmSync(DEST, { recursive: true, force: true });

  log(`Copiando ${DIST_DIR}/standalone → resources/web`);
  copyDir(STANDALONE, DEST, 'standalone');
  log(`Copiando ${DIST_DIR}/static → resources/web/${DIST_DIR}/static`);
  copyDir(path.join(DIST, 'static'), path.join(DEST, DIST_DIR, 'static'), 'static');
  log('Copiando public → resources/web/public');
  copyDir(path.join(ROOT, 'public'), path.join(DEST, 'public'), 'public');

  // Por si alguna vez Next copiara archivos de entorno al standalone: nunca
  // deben viajar en el instalador. Solo vale el .env que se escribe abajo.
  for (const name of fs.readdirSync(DEST)) {
    if (name.startsWith('.env')) fs.rmSync(path.join(DEST, name), { force: true });
  }

  const { result, missing } = resolvePublicEnv();
  if (!result.NEXT_PUBLIC_SUPABASE_URL || !result.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Defínelas en el entorno o en .env.production antes de construir la web del desktop.'
    );
  }
  if (missing.length > 0) {
    log(`Aviso: variables públicas sin valor (se omiten): ${missing.join(', ')}`);
  }
  const envBody =
    '# Generado por electron/scripts/build-web.js. Solo variables públicas.\n' +
    '# Lo lee electron/src/main/webServer.ts al arrancar el servidor local.\n' +
    Object.entries(result)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') +
    '\n';
  fs.writeFileSync(path.join(DEST, '.env'), envBody, 'utf-8');
  log(`resources/web/.env escrito con ${Object.keys(result).length} variables públicas`);

  const mb = (dirSizeBytes(DEST) / (1024 * 1024)).toFixed(1);
  log(`OK — resources/web listo (${mb} MB sin comprimir)`);
}

try {
  main();
} catch (err) {
  console.error(`[build-web] ERROR: ${err.message}`);
  process.exit(1);
}
