/**
 * Guardarraíl — rutas de servidor sin el cliente Supabase del NAVEGADOR.
 *
 * `@/lib/supabase/config` crea el cliente browser (clave anon + sesión en
 * localStorage). Dentro de un route handler no hay sesión: todo lo que pase
 * por él corre como `anon`, sin RLS de usuario y sin comprobar la
 * organización. Al cerrar las políticas `USING (true)` esas rutas se rompen, y
 * mientras tanto son un agujero.
 *
 * Casos:
 * 1. Ningún `src/app/**\/route.ts` importa `@/lib/supabase/config` (import
 *    estático, `export … from`, `import()` o `require()`). Sin allow-list.
 * 2. Ningún `route.ts` importa un módulo de
 *    `src/lib/services/integrations/{booking,expedia}/` que (directamente o a
 *    través de otros módulos de esas mismas carpetas, p. ej. su `index.ts`)
 *    importe `@/lib/supabase/config`. Los servicios del channel manager reciben
 *    el cliente por inyección (`ChannelManagerClients`).
 *
 * Complementa el caso 6 de `guardrails.test.ts` (que tiene allow-list de
 * deuda); este archivo es estricto para las rutas.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(SRC_ROOT, 'app');
const CHANNEL_MANAGER_DIRS = ['booking', 'expedia'].map((d) =>
  path.join(SRC_ROOT, 'lib', 'services', 'integrations', d)
);
const BROWSER_CLIENT = '@/lib/supabase/config';

function walkDir(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '__tests__') walkDir(full, files);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function rel(file: string): string {
  return path.relative(SRC_ROOT, file).replace(/\\/g, '/');
}

/** Quita comentarios de bloque y de línea (sin tocar `//` dentro de URLs entre comillas). */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((l) => (l.trim().startsWith('//') ? '' : l.replace(/(^|[^:'"`])\/\/.*$/, '$1')))
    .join('\n');
}

/** Especificadores importados: `import … from`, `import '…'`, `export … from`, `import()`, `require()`. */
function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specs = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) specs.add(m[1]);
  }
  return [...specs];
}

/** `import type` no arrastra el módulo en tiempo de ejecución: no cuenta. */
function runtimeImportSpecifiers(source: string): string[] {
  const code = stripComments(source).replace(/\bimport\s+type\s+[^;]*?from\s*['"][^'"]+['"]\s*;?/g, '');
  return importSpecifiers(code);
}

function resolveModule(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC_ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

function isChannelManagerFile(file: string): boolean {
  return CHANNEL_MANAGER_DIRS.some((d) => file === d || file.startsWith(d + path.sep));
}

const cache = new Map<string, boolean>();

/**
 * ¿El módulo del channel manager importa (en tiempo de ejecución) el cliente
 * browser, directamente o vía otros módulos de las mismas carpetas?
 */
function channelManagerModuleUsesBrowserClient(file: string, seen = new Set<string>()): boolean {
  if (cache.has(file)) return cache.get(file)!;
  if (seen.has(file)) return false;
  seen.add(file);
  const specs = runtimeImportSpecifiers(fs.readFileSync(file, 'utf-8'));
  let uses = specs.includes(BROWSER_CLIENT);
  if (!uses) {
    for (const spec of specs) {
      const target = resolveModule(spec, file);
      if (target && isChannelManagerFile(target) && channelManagerModuleUsesBrowserClient(target, seen)) {
        uses = true;
        break;
      }
    }
  }
  cache.set(file, uses);
  return uses;
}

describe('Guardarraíl: rutas de servidor sin cliente Supabase del navegador', () => {
  const routes = walkDir(APP_ROOT).filter((f) => /[\\/]route\.tsx?$/.test(f));

  test('hay rutas que revisar (el recorrido no está vacío)', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  test('el detector de imports reconoce todas las formas', () => {
    const sample = [
      "import { supabase } from '@/lib/supabase/config';",
      "export { x } from './a';",
      "const m = await import('./b');",
      "const r = require('./c');",
      "// import { y } from './comentado';",
    ].join('\n');
    expect(importSpecifiers(sample).sort()).toEqual(['./a', './b', './c', '@/lib/supabase/config']);
    expect(runtimeImportSpecifiers("import type { T } from '@/lib/supabase/config';")).toEqual([]);
  });

  test('ningún route.ts importa @/lib/supabase/config', () => {
    const offenders = routes
      .filter((f) => importSpecifiers(fs.readFileSync(f, 'utf-8')).includes(BROWSER_CLIENT))
      .map(rel);
    if (offenders.length > 0) {
      console.error(
        'Rutas que importan el cliente browser (usa withOrg → ctx.supabase, getServerUserClient o getServiceClient):\n' +
          offenders.join('\n')
      );
    }
    expect(offenders).toEqual([]);
  });

  test('ningún route.ts importa un servicio de booking/expedia que use el cliente browser', () => {
    const offenders: string[] = [];
    for (const route of routes) {
      for (const spec of runtimeImportSpecifiers(fs.readFileSync(route, 'utf-8'))) {
        const target = resolveModule(spec, route);
        if (!target || !isChannelManagerFile(target)) continue;
        if (channelManagerModuleUsesBrowserClient(target)) offenders.push(`${rel(route)} → ${rel(target)}`);
      }
    }
    if (offenders.length > 0) {
      console.error(
        'Rutas que llegan al cliente browser a través del channel manager (inyecta ChannelManagerClients):\n' +
          offenders.join('\n')
      );
    }
    expect(offenders).toEqual([]);
  });
});
