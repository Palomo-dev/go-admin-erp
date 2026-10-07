/**
 * Guardarraíl: el servidor de voz (ws-server, Railway) instala SUS dependencias,
 * no las de la web. Ver docs/hallazgos/F-78.md.
 *
 * Por qué existe: el Dockerfile hacía `COPY package.json package-lock.json` +
 * `npm ci` con el package.json raíz de la aplicación Next (~1.600 paquetes:
 * next, puppeteer, antd, sharp, xlsx…). Railway empezó a bloquear la imagen
 * por avisos de seguridad en ese árbol («Your dependencies matched 3 known
 * security advisories», failureStage BUILD_IMAGE) y el servidor quedó caído.
 *
 * Qué exige:
 *  1. El Dockerfile no copia el package.json/lockfile raíz (ni el contexto
 *     entero) y sí `ws-server/package.json` + `ws-server/package-lock.json`.
 *  2. `ws-server/package.json` y su lockfile no contienen paquetes de la web.
 *  3. `ws-server/package.json` declara EXACTAMENTE el cierre de ejecución de
 *     ws-server.ts (grafo de esbuild, `scripts/ws-server-cierre-dependencias.mjs`)
 *     más `tsx`, que es el runtime. Si alguien añade un import de un paquete
 *     nuevo en algo que el servidor alcanza, este test lo detecta antes de que
 *     el contenedor falle con `Cannot find module` en Railway.
 *     El script deja fuera el `import()` dinámico de `@sentry/react`: solo
 *     corre en el navegador y su peer `react` no puede entrar en la imagen.
 *  4. El lockfile está sincronizado con el package.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCKERFILE = path.join(REPO_ROOT, 'ws-server.Dockerfile');
const WS_PKG = path.join(REPO_ROOT, 'ws-server', 'package.json');
const WS_LOCK = path.join(REPO_ROOT, 'ws-server', 'package-lock.json');
const SCRIPT_CIERRE = path.join(REPO_ROOT, 'scripts', 'ws-server-cierre-dependencias.mjs');

/** Paquetes de la web que no pueden llegar al servidor de voz. */
const PROHIBIDOS = ['next', 'react', 'react-dom', 'puppeteer', 'puppeteer-core', 'xlsx', 'sharp', 'antd'];

/** Paquetes declarados que el grafo de imports no ve porque son el runtime. */
const RUNTIME = ['tsx'];

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface Lockfile {
  packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
}

function leerJson<T>(archivo: string): T {
  return JSON.parse(fs.readFileSync(archivo, 'utf-8')) as T;
}

/** Instrucciones del Dockerfile (une continuaciones `\` y quita comentarios). */
function instrucciones(dockerfile: string): { op: string; args: string[] }[] {
  const logicas: string[] = [];
  let actual = '';
  for (const linea of dockerfile.split(/\r?\n/)) {
    if (/^\s*#/.test(linea)) continue;
    if (/\\\s*$/.test(linea)) {
      actual += linea.replace(/\\\s*$/, ' ');
      continue;
    }
    actual += linea;
    if (actual.trim()) logicas.push(actual.trim());
    actual = '';
  }
  if (actual.trim()) logicas.push(actual.trim());
  return logicas.map((l) => {
    const [op, ...args] = l.split(/\s+/);
    return { op: op.toUpperCase(), args };
  });
}

/** Orígenes de un COPY/ADD (sin flags `--from=`, `--chown=`… ni el destino). */
function origenesDeCopy(args: string[]): string[] {
  const sinFlags = args.filter((a) => !a.startsWith('--'));
  if (sinFlags[0]?.startsWith('[')) {
    const lista = JSON.parse(sinFlags.join(' ')) as string[];
    return lista.slice(0, -1);
  }
  return sinFlags.slice(0, -1);
}

function normalizar(origen: string): string {
  return origen.replace(/^\.\//, '').replace(/\/+$/, '') || '.';
}

function todasLasDependencias(pkg: PackageJson): Record<string, string> {
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  };
}

describe('ws-server: dependencias propias, separadas de las de la web (F-78)', () => {
  const dockerfile = fs.readFileSync(DOCKERFILE, 'utf-8');
  const pasos = instrucciones(dockerfile);
  const copias = pasos.filter((p) => p.op === 'COPY' || p.op === 'ADD');

  test('el Dockerfile no copia el package.json ni el lockfile raíz, ni el contexto entero', () => {
    const vetados = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', '.', '*']);
    const infractores = copias.flatMap((c) => origenesDeCopy(c.args).map(normalizar)).filter((o) => vetados.has(o));
    expect(infractores).toEqual([]);
  });

  test('el Dockerfile copia ws-server/package.json y su lockfile antes de instalar con npm ci', () => {
    const iCopia = copias.findIndex((c) => {
      const o = origenesDeCopy(c.args).map(normalizar);
      return o.includes('ws-server/package.json') && o.includes('ws-server/package-lock.json');
    });
    expect(iCopia).toBeGreaterThanOrEqual(0);

    const posCopia = pasos.indexOf(copias[iCopia]);
    const iNpm = pasos.findIndex((p) => p.op === 'RUN' && /\bnpm\s+(ci|install|i)\b/.test(p.args.join(' ')));
    expect(iNpm).toBeGreaterThan(posCopia);
    // `npm ci` (lockfile exacto), nunca `npm install`, que puede mover versiones.
    expect(pasos[iNpm].args.join(' ')).toMatch(/\bnpm\s+ci\b/);
  });

  test('el runtime del contenedor sigue siendo tsx sobre ws-server.ts', () => {
    const cmd = pasos.filter((p) => p.op === 'CMD').pop();
    expect(cmd?.args.join(' ')).toMatch(/tsx.*ws-server\.ts/);
  });

  test('ws-server/package.json no declara paquetes de la web', () => {
    const declarados = Object.keys(todasLasDependencias(leerJson<PackageJson>(WS_PKG)));
    expect(declarados.filter((d) => PROHIBIDOS.includes(d))).toEqual([]);
  });

  test('ws-server/package-lock.json no trae paquetes de la web ni de forma transitiva', () => {
    const lock = leerJson<Lockfile>(WS_LOCK);
    const nombres = Object.keys(lock.packages)
      .filter(Boolean)
      .map((k) => k.split('node_modules/').pop() as string);
    expect(nombres.filter((n) => PROHIBIDOS.includes(n))).toEqual([]);
  });

  test('el lockfile del servidor está sincronizado con su package.json', () => {
    const pkg = leerJson<PackageJson>(WS_PKG);
    const lock = leerJson<Lockfile>(WS_LOCK);
    expect(lock.packages['']?.dependencies ?? {}).toEqual(pkg.dependencies ?? {});
    for (const [nombre, version] of Object.entries(pkg.dependencies ?? {})) {
      expect({ nombre, version: lock.packages[`node_modules/${nombre}`]?.version }).toEqual({ nombre, version });
    }
  });

  test('el runtime (tsx) es dependencia de ejecución, no de desarrollo', () => {
    const pkg = leerJson<PackageJson>(WS_PKG);
    for (const r of RUNTIME) expect(Object.keys(pkg.dependencies ?? {})).toContain(r);
    expect(pkg.devDependencies ?? {}).toEqual({});
  });

  test('ws-server/package.json declara exactamente el cierre de imports de ws-server.ts (+ tsx)', () => {
    // esbuild corre en un proceso aparte, el mismo comando que usaría una
    // persona: así no depende de los realms de Uint8Array/TextEncoder del
    // entorno de jest, con los que esbuild tiene incompatibilidades conocidas.
    const salida = execFileSync(process.execPath, [SCRIPT_CIERRE, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    const cierre = JSON.parse(salida) as { paquetes: Record<string, string[]>; archivosLocales: string[] };
    const alcanzados = Object.keys(cierre.paquetes).sort();
    const declarados = Object.keys(leerJson<PackageJson>(WS_PKG).dependencies ?? {})
      .filter((d) => !RUNTIME.includes(d))
      .sort();

    // Sanidad: el grafo de verdad recorrió el servidor y su manejador.
    expect(cierre.archivosLocales).toContain('ws-server.ts');
    expect(cierre.archivosLocales).toContain('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');

    // Si falla con un paquete de más en `alcanzados`: añádelo a ws-server/package.json
    // (versión del package-lock.json raíz) y regenera ws-server/package-lock.json.
    // Si sobra en `declarados`: ya nadie lo importa; quítalo.
    expect({ declarados }).toEqual({ declarados: alcanzados });
  });

  test('cada archivo local que alcanza ws-server.ts está en una ruta que el Dockerfile copia', () => {
    // 2026-10-07: desinteresConfig.ts importaba `@/components/crm/kit/monedaCrm`; la imagen
    // solo copia src/lib y src/types y el contenedor murió con `Cannot find module` en Railway.
    const copiadas = pasos
      .filter((p) => p.op === 'COPY' && !p.args.some((a) => a.startsWith('--from')))
      .map((p) => p.args[0].replace(/^\.\//, ''))
      .filter((origen) => origen && !origen.includes('package'));
    const salida = execFileSync(process.execPath, [SCRIPT_CIERRE, '--json'], { cwd: REPO_ROOT, encoding: 'utf-8' });
    const { archivosLocales } = JSON.parse(salida) as { archivosLocales: string[] };
    const fuera = archivosLocales.filter(
      (f) => !copiadas.some((c) => (c.endsWith('/') ? f.startsWith(c) : f === c)),
    );
    // Si falla: mueve el módulo a src/lib (y deja una reexportación donde estaba), no amplíes la imagen.
    expect({ fuera, copiadas }).toEqual({ fuera: [], copiadas });
  });
});
