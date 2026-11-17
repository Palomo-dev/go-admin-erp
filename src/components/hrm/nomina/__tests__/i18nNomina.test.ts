/**
 * Textos de Nómina en los 4 idiomas (es, en, fr, pt), namespace `hrmNomina`.
 *
 * El proveedor de idiomas no tiene respaldo: una clave que falte se pinta cruda.
 * 1. Los cuatro idiomas tienen exactamente las mismas claves.
 * 2. Cada `t('clave')` literal de las pantallas de nómina existe (con su
 *    namespace de `useTranslations`), y de `t(\`prefijo.${x}\`)` existe el prefijo.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

type Arbol = { [k: string]: string | Arbol };

function aplanar(o: Arbol, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [`${p}${k}`] : aplanar(v, `${p}${k}.`)));
}

function buscar(o: Arbol, ruta: string): string | Arbol | undefined {
  return ruta.split('.').reduce<string | Arbol | undefined>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), o);
}

const IDIOMAS = { es, en, fr, pt } as unknown as Record<string, Arbol>;
const CARPETA = join(__dirname, '..');

test('es, en, fr y pt tienen las mismas claves de hrmNomina', () => {
  const base = aplanar(IDIOMAS.es.hrmNomina as Arbol).sort();
  expect(base.length).toBeGreaterThan(300);
  for (const l of ['en', 'fr', 'pt']) expect(aplanar(IDIOMAS[l].hrmNomina as Arbol).sort()).toEqual(base);
});

test('cada clave que usan las pantallas de nómina existe', () => {
  const faltan: string[] = [];
  const archivos = readdirSync(CARPETA).filter((f) => f.endsWith('.tsx'));
  for (const f of archivos) {
    const codigo = readFileSync(join(CARPETA, f), 'utf8');
    // Cada traductor vale desde su declaración hasta la siguiente con el mismo nombre (una por componente).
    const decls = Array.from(codigo.matchAll(/const (\w+) = useTranslations\('([^']+)'\)/g)).map((m) => ({ variable: m[1], ns: m[2], desde: m.index ?? 0 }));
    for (const [i, d] of decls.entries()) {
      const siguiente = decls.slice(i + 1).find((o) => o.variable === d.variable);
      const tramo = codigo.slice(d.desde, siguiente ? siguiente.desde : codigo.length);
      for (const c of tramo.matchAll(new RegExp(`\\b${d.variable}\\(\\s*'([^']+)'`, 'g'))) {
        const ruta = `${d.ns}.${c[1]}`;
        if (typeof buscar(IDIOMAS.es, ruta) !== 'string') faltan.push(`${f}: ${ruta}`);
      }
      for (const c of tramo.matchAll(new RegExp(`\\b${d.variable}\\(\\s*\`([^\`$]+)\\$\\{`, 'g'))) {
        const prefijo = c[1].replace(/\.$/, '');
        const ruta = prefijo ? `${d.ns}.${prefijo}` : d.ns;
        if (typeof buscar(IDIOMAS.es, ruta) !== 'object') faltan.push(`${f}: ${ruta}.*`);
      }
    }
  }
  expect(faltan).toEqual([]);
});
