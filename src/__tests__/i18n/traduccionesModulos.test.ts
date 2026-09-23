/**
 * Traducciones del kit compartido y de las pantallas rediseñadas (proveedores,
 * categorías, clientes, cajas y productos) en los 4 idiomas.
 *
 * 1. Cada namespace tiene exactamente las mismas claves en es, en, fr y pt,
 *    sin mensajes vacíos, con llaves balanceadas y sin variables que el
 *    español no pase.
 * 2. Toda clave literal que el código pide (`t('clave')`) existe en español:
 *    next-intl no tipa las claves y un error de dedo saldría como texto crudo.
 * 3. Todo estado de la tabla de badges tiene su etiqueta en `kit.estados`.
 *
 * El shell (nav, header, session) lo cubre src/lib/navigation/__tests__/traducciones.test.ts.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createContext, runInContext } from 'vm';
import { CLAVES_ETIQUETA_ESTADO } from '@/components/kit/estadoTono';

/**
 * `intl-messageformat` (el motor ICU de next-intl) es solo ESM y jest corre en
 * CommonJS: se carga su build IIFE en un contexto aislado para validar sintaxis.
 */
type FormatoIcu = new (mensaje: string, locale: string) => unknown;
const IntlMessageFormat: FormatoIcu = (() => {
  const contexto = createContext({ Intl }) as { IntlMessageFormat?: { IntlMessageFormat: FormatoIcu } };
  runInContext(readFileSync(join(process.cwd(), 'node_modules/intl-messageformat/intl-messageformat.iife.js'), 'utf-8'), contexto);
  if (!contexto.IntlMessageFormat) throw new Error('No se pudo cargar intl-messageformat');
  return contexto.IntlMessageFormat.IntlMessageFormat;
})();

const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
type Idioma = (typeof IDIOMAS)[number];

/** Namespace → carpetas cuyo código lo usa. */
const MODULOS: Record<string, string[]> = {
  kit: ['src/components/kit'],
  proveedores: ['src/components/inventario/proveedores', 'src/app/app/inventario/proveedores'],
  categorias: ['src/components/inventario/categorias', 'src/app/app/inventario/categorias'],
  clientes: ['src/components/clientes', 'src/app/app/clientes'],
  cajas: ['src/components/pos/cajas', 'src/app/app/pos/cajas'],
  productos: ['src/components/inventario/productos', 'src/app/app/inventario/productos'],
};

type Arbol = { [clave: string]: string | Arbol };

const mensajes = Object.fromEntries(
  IDIOMAS.map((l) => [l, JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf-8')) as Arbol]),
) as Record<Idioma, Arbol>;

function aplanar(arbol: Arbol, prefijo = ''): Record<string, string> {
  const plano: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(arbol)) {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    if (typeof valor === 'string') plano[ruta] = valor;
    else Object.assign(plano, aplanar(valor, ruta));
  }
  return plano;
}

function hijo(arbol: Arbol, clave: string): Arbol {
  const valor = arbol[clave];
  return typeof valor === 'object' && valor !== null ? valor : {};
}

/** Nombres de variable ICU de un mensaje: `{n, plural, …}` → n; `{email}` → email. */
function variables(mensaje: string): Set<string> {
  return new Set(Array.from(mensaje.matchAll(/\{\s*([A-Za-z_][\w]*)\s*[,}]/g), (m) => m[1]));
}

function archivos(carpeta: string): string[] {
  const ruta = join(process.cwd(), carpeta);
  return readdirSync(ruta).flatMap((nombre) => {
    const completo = join(ruta, nombre);
    if (statSync(completo).isDirectory()) return nombre === '__tests__' ? [] : archivos(join(carpeta, nombre));
    return /\.(ts|tsx)$/.test(nombre) ? [completo] : [];
  });
}

/**
 * Claves literales pedidas en un archivo: `const t = useTranslations('ns.sub')`
 * (o `useKitT()`, o `getTranslations`) y luego `t('clave')`. Una clave con
 * plantilla (`t(\`rango.${id}\`)`) se comprueba por su prefijo fijo.
 */
function clavesPedidas(codigo: string): { ns: string; clave: string; prefijo: boolean }[] {
  const vinculos = new Map<string, string>();
  for (const m of codigo.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*'([\w.]+)'\s*\)/g)) {
    vinculos.set(m[1], m[2]);
  }
  for (const m of codigo.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useKitT\(\)/g)) vinculos.set(m[1], 'kit');
  const salida: { ns: string; clave: string; prefijo: boolean }[] = [];
  vinculos.forEach((ns, variable) => {
    const llamada = new RegExp(`(?<![\\w.])${variable}(?:\\.rich|\\.markup)?\\(\\s*(?:'([^']+)'|\`([^\`$]*)\\$\\{)`, 'g');
    for (const m of codigo.matchAll(llamada)) {
      if (m[1] !== undefined) salida.push({ ns, clave: m[1], prefijo: false });
      else if (m[2]) salida.push({ ns, clave: m[2].replace(/\.$/, ''), prefijo: true });
    }
  });
  return salida;
}

describe.each(Object.keys(MODULOS))('namespace %s en los 4 idiomas', (ns) => {
  const planos = Object.fromEntries(IDIOMAS.map((l) => [l, aplanar(hijo(mensajes[l], ns))])) as Record<
    Idioma,
    Record<string, string>
  >;
  const clavesEs = Object.keys(planos.es).sort();

  test('tiene claves', () => {
    expect(clavesEs.length).toBeGreaterThan(0);
  });

  test.each(IDIOMAS.filter((l) => l !== 'es'))('%s tiene exactamente las mismas claves que es', (idioma) => {
    const claves = Object.keys(planos[idioma]).sort();
    expect({ faltan: clavesEs.filter((c) => !(c in planos[idioma])), sobran: claves.filter((c) => !(c in planos.es)) }).toEqual({
      faltan: [],
      sobran: [],
    });
  });

  test.each(IDIOMAS)('%s: ningún mensaje vacío y llaves balanceadas', (idioma) => {
    const malos = Object.entries(planos[idioma])
      .filter(([, texto]) => {
        if (texto.trim() === '') return true;
        let nivel = 0;
        for (const c of texto) {
          if (c === '{') nivel += 1;
          if (c === '}') nivel -= 1;
          if (nivel < 0) return true;
        }
        return nivel !== 0;
      })
      .map(([clave]) => clave);
    expect(malos).toEqual([]);
  });

  test.each(IDIOMAS)('%s: todo mensaje es ICU válido', (idioma) => {
    const invalidos = Object.entries(planos[idioma]).flatMap(([clave, texto]) => {
      try {
        new IntlMessageFormat(texto, idioma);
        return [];
      } catch {
        return [clave];
      }
    });
    expect(invalidos).toEqual([]);
  });

  test.each(IDIOMAS.filter((l) => l !== 'es'))('%s no usa variables que el español no pasa', (idioma) => {
    const ajenas = Object.entries(planos[idioma])
      .filter(([clave]) => clave in planos.es)
      .flatMap(([clave, texto]) => {
        const permitidas = variables(planos.es[clave]);
        return Array.from(variables(texto))
          .filter((v) => !permitidas.has(v))
          .map((v) => `${clave}: {${v}}`);
      });
    expect(ajenas).toEqual([]);
  });

  test('toda clave que pide el código existe en español', () => {
    const faltan = MODULOS[ns]
      .flatMap(archivos)
      .flatMap((archivo) =>
        clavesPedidas(readFileSync(archivo, 'utf-8'))
          .filter((c) => c.ns === ns || c.ns.startsWith(`${ns}.`))
          .map((c) => ({ ...c, completa: [c.ns.slice(ns.length + 1), c.clave].filter(Boolean).join('.'), archivo })),
      )
      .filter((c) =>
        c.prefijo
          ? !Object.keys(planos.es).some((k) => k.startsWith(`${c.completa}.`) || k === c.completa)
          : !(c.completa in planos.es),
      )
      .map((c) => `${c.archivo.replace(process.cwd(), '')}: ${ns}.${c.completa}`);
    expect(faltan).toEqual([]);
  });
});

describe('estados de la tabla de badges', () => {
  test.each(IDIOMAS)('%s: todo estado conocido tiene etiqueta en kit.estados', (idioma) => {
    const estados = hijo(hijo(mensajes[idioma], 'kit'), 'estados');
    const faltan = CLAVES_ETIQUETA_ESTADO.filter((c) => typeof estados[c] !== 'string');
    expect(faltan).toEqual([]);
  });
});
