#!/usr/bin/env node
// ============================================================================
// Cierre de dependencias npm en tiempo de ejecución de ws-server.ts
// ============================================================================
// Recorre el grafo de imports de `ws-server.ts` con esbuild (el mismo motor que
// usa tsx para ejecutarlo), resolviendo los alias `@/…` por tsconfig y
// sustituyendo `@/lib/supabase/config` por `ws-config.ts`, igual que hace
// `ws-server.Dockerfile`. Todo especificador «desnudo» (paquete npm o builtin
// de Node) se marca externo y se anota con el archivo que lo importa.
//
// Los imports solo de tipos (`import type`) desaparecen al compilar y no
// cuentan, igual que en tsx.
//
// Uso:
//
//   node scripts/ws-server-cierre-dependencias.mjs          # resumen legible
//   node scripts/ws-server-cierre-dependencias.mjs --json   # para el test
//
// Lo usa `src/__tests__/infra/wsServerDependencias.test.ts` para exigir que
// `ws-server/package.json` declare exactamente este cierre (más `tsx`).
// No escribe nada ni hace red.
// ============================================================================

import { builtinModules, createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = createRequire(join(RAIZ, 'package.json'))('esbuild');

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const WS_CONFIG = join(RAIZ, 'src/lib/supabase/ws-config.ts');

/** `@scope/pkg/sub` → `@scope/pkg`; `pkg/sub` → `pkg`. */
function nombrePaquete(especificador) {
  const partes = especificador.split('/');
  return especificador.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0];
}

const paquetes = new Map(); // nombre → Set("archivo [tipo]")
const builtins = new Set();

const registrarExternos = {
  name: 'registrar-externos',
  setup(build) {
    // Sustitución del Dockerfile: config.ts (navegador) → ws-config.ts (Node).
    build.onResolve({ filter: /^@\/lib\/supabase\/config$/ }, () => ({ path: WS_CONFIG }));

    build.onResolve({ filter: /.*/ }, (args) => {
      const p = args.path;
      if (args.kind === 'entry-point') return undefined;
      const esLocal = p.startsWith('.') || p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
      const esAlias = p.startsWith('@/') || p === '@printing' || p.startsWith('@printing/');
      if (esLocal || esAlias) return undefined;
      const importador = relative(RAIZ, args.importer).replace(/\\/g, '/');
      if (BUILTINS.has(p) || BUILTINS.has(p.split('/')[0])) {
        builtins.add(p.replace(/^node:/, ''));
      } else {
        const nombre = nombrePaquete(p);
        if (!paquetes.has(nombre)) paquetes.set(nombre, new Set());
        paquetes.get(nombre).add(`${importador} [${args.kind}]`);
      }
      return { path: p, external: true };
    });
  },
};

const resultado = await esbuild.build({
  absWorkingDir: RAIZ,
  entryPoints: ['ws-server.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  tsconfig: join(RAIZ, 'tsconfig.json'),
  metafile: true,
  logLevel: 'silent',
  plugins: [registrarExternos],
});

const salida = {
  archivosLocales: Object.keys(resultado.metafile.inputs).sort(),
  paquetes: Object.fromEntries(
    [...paquetes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([n, s]) => [n, [...s].sort()]),
  ),
  builtins: [...builtins].sort(),
  avisos: resultado.warnings.map((w) => w.text),
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(salida));
} else {
  console.log(`Archivos locales alcanzados: ${salida.archivosLocales.length}`);
  for (const f of salida.archivosLocales) console.log(`  ${f}`);
  console.log('\nPaquetes npm (y quién los importa):');
  for (const [n, desde] of Object.entries(salida.paquetes)) {
    console.log(`  ${n}`);
    for (const d of desde) console.log(`      ← ${d}`);
  }
  console.log(`\nBuiltins de Node: ${salida.builtins.join(', ')}`);
  if (salida.avisos.length) console.log(`\nAvisos de esbuild: ${salida.avisos.length}`);
}
