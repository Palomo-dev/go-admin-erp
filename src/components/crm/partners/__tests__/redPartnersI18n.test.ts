/// <reference types="jest" />
/**
 * `crm.redPartners` (pantalla Partners, Figma «CRM · Red y gestión»): mismas
 * claves en es/en/fr/pt, sin mensajes vacíos, mismas variables que el español,
 * y toda clave literal que pide el código existe en español (next-intl no tipa
 * las claves: un error de dedo saldría como texto crudo).
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

type Arbol = { [k: string]: string | Arbol };
const RAIZ = process.cwd();
const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
const ns = Object.fromEntries(
  IDIOMAS.map((l) => [l, (JSON.parse(readFileSync(join(RAIZ, 'messages', `${l}.json`), 'utf8')) as { crm: { redPartners: Arbol } }).crm.redPartners]),
) as Record<(typeof IDIOMAS)[number], Arbol>;

function hojas(o: Arbol, p = ''): Array<[string, string]> {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : hojas(v, `${p}${k}.`)));
}
/** Variables de primer nivel: `{nombre}` y el argumento de `{n, plural, …}`. */
function variables(msg: string): string[] {
  const out = new Set<string>();
  let nivel = 0;
  for (let i = 0; i < msg.length; i += 1) {
    if (msg[i] === '{') {
      if (nivel === 0) {
        const m = /^\{\s*([A-Za-z_][\w]*)\s*[,}]/.exec(msg.slice(i));
        if (m) out.add(m[1]);
      }
      nivel += 1;
    } else if (msg[i] === '}') nivel -= 1;
  }
  return [...out].sort();
}

const es = new Map(hojas(ns.es));

describe('crm.redPartners en los 4 idiomas', () => {
  it.each(IDIOMAS.filter((l) => l !== 'es'))('%s tiene exactamente las claves del español, con sus mismas variables y sin vacíos', (l) => {
    const otro = new Map(hojas(ns[l]));
    expect([...otro.keys()].sort()).toEqual([...es.keys()].sort());
    for (const [k, v] of otro) {
      expect({ k, vacio: v.trim() === '' }).toEqual({ k, vacio: false });
      expect({ k, vars: variables(v) }).toEqual({ k, vars: variables(es.get(k)!) });
    }
  });

  it('llaves balanceadas en español', () => {
    for (const [k, v] of es) {
      let n = 0;
      for (const c of v) {
        if (c === '{') n += 1;
        if (c === '}') n -= 1;
        expect({ k, negativo: n < 0 }).toEqual({ k, negativo: false });
      }
      expect({ k, n }).toEqual({ k, n: 0 });
    }
  });
});

describe('las claves literales que pide el código existen en español', () => {
  const dir = join(RAIZ, 'src/components/crm/partners');
  const archivos = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
  it.each(archivos)('%s', (archivo) => {
    const src = readFileSync(join(dir, archivo), 'utf8');
    // const t = useTranslations('crm.redPartners.registrar') → t('titulo') = registrar.titulo
    const prefijos = new Map<string, string>();
    for (const m of src.matchAll(/const (\w+) = useTranslations\('crm\.redPartners(?:\.([\w.]+))?'\)/g)) prefijos.set(m[1], m[2] ? `${m[2]}.` : '');
    for (const [variable, prefijo] of prefijos) {
      for (const m of src.matchAll(new RegExp(`\\b${variable}\\('([\\w.]+)'`, 'g'))) {
        const clave = `${prefijo}${m[1]}`;
        expect({ archivo, clave, existe: es.has(clave) }).toEqual({ archivo, clave, existe: true });
      }
    }
  });
});
