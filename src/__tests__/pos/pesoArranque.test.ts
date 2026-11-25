/**
 * Peso de arranque del POS.
 *
 * `/app/pos` cargaba 4,08 MB de JavaScript al abrir (las demás pantallas rondan
 * 0,5 MB) y en celular tardaba varios segundos en dejar vender. La causa era UN
 * import: `CustomerSelector` traía el diálogo de cliente desde el barril
 * `@/components/shared/form-dialogs`, que reexporta también los formularios de
 * producto y de proveedor. Con ellos entraban al arranque:
 *
 * - `react-icons/gi`: 4.040 iconos (2,6 MB comprimido) del selector de iconos
 *   de categoría;
 * - `xlsx`, `jspdf` y `jspdf-autotable`: exportar proveedores.
 *
 * Nada de eso se usa para vender. Esta prueba recorre los imports ESTÁTICOS
 * desde las tres pantallas afectadas (los `import()` y `next/dynamic` no
 * cuentan: se cargan al usarse) y falla si alguno vuelve a alcanzar esos
 * paquetes, diciendo por qué cadena de archivos.
 *
 * Si falla: importa el componente directo desde su archivo, o cárgalo con
 * `next/dynamic` si solo se abre al pulsar algo. No amplíes la lista sin medir
 * el bundle (`npx next build`, columna «First Load JS»).
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../..');
const SRC = path.join(RAIZ, 'src');

const PANTALLAS = ['src/app/app/pos/page.tsx', 'src/app/app/pos/mesas/page.tsx', 'src/app/app/pos/mesas/[id]/page.tsx'];

/** Paquetes que no se usan para vender y pesan: no pueden estar en el arranque. */
const PROHIBIDOS = ['react-icons/gi', 'xlsx', 'jspdf', 'jspdf-autotable'];

const EXTENSIONES = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js'];

function resolver(desde: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(desde), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONES) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

/** Especificadores de los imports y reexports estáticos que cargan código (los de solo tipos no). */
function importsEstaticos(archivo: string): string[] {
  const fuente = fs
    .readFileSync(archivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const specs: string[] = [];
  const patron = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = patron.exec(fuente))) {
    const [, palabra, soloTipo, clausula = '', spec] = m;
    if (soloTipo) continue;
    if (palabra === 'export' && !clausula) continue;
    const llaves = clausula.match(/\{([^}]*)\}/);
    if (llaves && !/^\s*\w+\s*,/.test(clausula) && !clausula.includes('*')) {
      const nombres = llaves[1].split(',').map((n) => n.trim()).filter(Boolean);
      if (nombres.length > 0 && nombres.every((n) => n.startsWith('type '))) continue;
    }
    specs.push(spec);
  }
  return specs;
}

/** Recorre el grafo y devuelve, por paquete externo, la cadena de archivos más corta que llega a él. */
function paquetesAlcanzados(entrada: string): { archivos: number; cadenas: Map<string, string[]> } {
  const inicio = path.join(RAIZ, entrada);
  const padre = new Map<string, string | null>([[inicio, null]]);
  const llegaPor = new Map<string, string>();
  const cola = [inicio];
  while (cola.length > 0) {
    const archivo = cola.shift() as string;
    for (const spec of importsEstaticos(archivo)) {
      const destino = resolver(archivo, spec);
      if (destino) {
        if (!padre.has(destino)) {
          padre.set(destino, archivo);
          cola.push(destino);
        }
      } else if (!spec.startsWith('.') && !spec.startsWith('@/') && !llegaPor.has(spec)) {
        llegaPor.set(spec, archivo);
      }
    }
  }
  const cadenas = new Map<string, string[]>();
  for (const [spec, archivo] of llegaPor) {
    const cadena: string[] = [];
    for (let a: string | null | undefined = archivo; a; a = padre.get(a)) cadena.unshift(path.relative(RAIZ, a));
    cadenas.set(spec, cadena);
  }
  return { archivos: padre.size, cadenas };
}

const esProhibido = (spec: string) => PROHIBIDOS.some((p) => spec === p || spec.startsWith(`${p}/`));

describe('POS · peso de arranque', () => {
  test.each(PANTALLAS)('%s no carga al abrir iconos, Excel ni PDF', (pantalla) => {
    const { archivos, cadenas } = paquetesAlcanzados(pantalla);
    // Si el recorrido se queda corto, la prueba dejó de leer bien los imports y no protege nada.
    expect(archivos).toBeGreaterThan(100);
    const culpables = [...cadenas].filter(([spec]) => esProhibido(spec)).map(([spec, cadena]) => `${spec}\n    ${cadena.join('\n  → ')}`);
    expect(culpables).toEqual([]);
  });

  test('el recorrido sí detecta el barril de formularios (la prueba no es ciega)', () => {
    const barril = 'src/components/shared/form-dialogs/index.ts';
    const { cadenas } = paquetesAlcanzados(barril);
    expect([...cadenas.keys()].some(esProhibido)).toBe(true);
  });

  test('los imports de solo tipos y los dinámicos no cuentan', () => {
    const tmp = path.join(__dirname, '__peso_arranque_tmp__.ts');
    fs.writeFileSync(
      tmp,
      [
        "import type { A } from 'xlsx';",
        "import { type B, type C } from 'jspdf';",
        "const perezoso = () => import('react-icons/gi');",
        "import { d, type E } from 'jspdf-autotable';",
        "export { f } from 'sonner';",
      ].join('\n'),
    );
    try {
      expect(importsEstaticos(tmp)).toEqual(['jspdf-autotable', 'sonner']);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
