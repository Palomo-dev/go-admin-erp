/**
 * Namespaces de B5 en los cuatro idiomas: mismas claves y mismos placeholders.
 * (inventarioProduccion, inventarioRecetas y subseccion; `receta` lo cubre
 * recetaRender.test.tsx del kit.)
 */
import { readFileSync } from 'fs';
import { join } from 'path';

type Arbol = { [k: string]: string | Arbol };
const leer = (l: string) => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), 'utf8')) as Record<string, Arbol>;
const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
const NAMESPACES = ['inventarioProduccion', 'inventarioRecetas'] as const;

function hojas(a: Arbol, prefijo = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'string') out[`${prefijo}${k}`] = v;
    else Object.assign(out, hojas(v, `${prefijo}${k}.`));
  }
  return out;
}
const variables = (s: string) =>
  // Argumentos ICU ({x} o {x, plural, …}); no el texto de una rama («one {Confirmar}»).
  [...s.matchAll(/(=\d+|zero|one|two|few|many|other)?\s?\{(\w+)(?:,|\})/g)]
    .filter((m) => !m[1])
    .map((m) => m[2])
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();

const mensajes = Object.fromEntries(IDIOMAS.map((l) => [l, leer(l)]));

describe.each(NAMESPACES)('%s', (ns) => {
  const es = hojas(mensajes.es[ns] ?? {});
  it('existe en español', () => {
    expect(Object.keys(es).length).toBeGreaterThan(0);
  });
  it.each(IDIOMAS.filter((l) => l !== 'es'))('%s: mismas claves y placeholders que es', (l) => {
    const otro = hojas(mensajes[l][ns] ?? {});
    expect(Object.keys(otro).sort()).toEqual(Object.keys(es).sort());
    for (const [k, v] of Object.entries(es)) expect([k, variables(otro[k])]).toEqual([k, variables(v)]);
  });
});
