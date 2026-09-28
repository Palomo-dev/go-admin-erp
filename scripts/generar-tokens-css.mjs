#!/usr/bin/env node
/**
 * Genera src/styles/tokens.css a partir de src/styles/figma-tokens.json.
 *
 * El JSON es la instantánea de las variables de Figma; el CSS no se edita a
 * mano. Flujo cuando cambia un token en Figma:
 *
 *   1. Se vuelve a exportar figma-tokens.json.
 *   2. node scripts/generar-tokens-css.mjs
 *   3. Se commitean los dos archivos juntos.
 *
 * El guardarraíl 24 (src/__tests__/guardrails.test.ts) falla si tokens.css no
 * es exactamente lo que este script produce, así que un cambio a mano en el
 * CSS o un JSON actualizado sin regenerar se detectan antes de llegar a main.
 *
 * Cada token se declara como canales «R G B» para que Tailwind pueda aplicar
 * opacidad: `bg-brand/10` → rgb(var(--brand-primary) / 0.1).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origen = resolve(raiz, 'src/styles/figma-tokens.json');
const destino = resolve(raiz, 'src/styles/tokens.css');

export function hexACanales(hex) {
  const limpio = hex.replace('#', '');
  const r = parseInt(limpio.slice(0, 2), 16);
  const g = parseInt(limpio.slice(2, 4), 16);
  const b = parseInt(limpio.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** `bg/canvas` → `--bg-canvas`; `text/on-brand` → `--text-on-brand`. */
export function nombreVariable(token) {
  return `--${token.replace(/\//g, '-')}`;
}

export function generarCss(tokens) {
  const semanticos = Object.entries(tokens.semanticos);
  const claro = semanticos.map(([t, v]) => `  ${nombreVariable(t)}: ${hexACanales(v.light)};`);
  const oscuro = semanticos.map(([t, v]) => `  ${nombreVariable(t)}: ${hexACanales(v.dark)};`);
  const radios = Object.entries(tokens.radios).map(([k, v]) => `  --radius-${k}: ${v}px;`);
  const tamanos = Object.entries(tokens.tamanos).map(
    ([k, v]) => `  --size-${k.replace(/\//g, '-')}: ${v}px;`
  );

  return [
    '/*',
    ' * ARCHIVO GENERADO — no se edita a mano.',
    ' * Origen: src/styles/figma-tokens.json (variables del archivo de Figma).',
    ' * Regenerar: node scripts/generar-tokens-css.mjs',
    ' *',
    ' * Tokens semánticos del sistema de diseño en modo claro (:root) y oscuro',
    ' * (.dark, que pone next-themes en <html>). Los componentes usan los nombres',
    ' * de Tailwind definidos en tailwind.config.js (bg-surface, text-fg, border-line…),',
    ' * nunca estas variables directamente ni clases dark: sueltas.',
    ' */',
    '',
    ':root {',
    ...claro,
    '',
    ...radios,
    '',
    ...tamanos,
    '}',
    '',
    '.dark {',
    ...oscuro,
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tokens = JSON.parse(readFileSync(origen, 'utf8'));
  if (process.argv.includes('--stdout')) {
    // Lo usa el guardarraíl 24 para comparar sin escribir nada.
    process.stdout.write(generarCss(tokens));
  } else {
    writeFileSync(destino, generarCss(tokens), 'utf8');
    console.log(`tokens.css generado: ${Object.keys(tokens.semanticos).length} tokens semánticos.`);
  }
}
