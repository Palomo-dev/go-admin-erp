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

const POS = ['src/components/pos', 'src/app/app/pos', 'src/lib/pos', 'src/components/shared'];
const PRODUCTOS = ['src/components/inventario/productos', 'src/app/app/inventario/productos', 'src/components/inventario/garantias'];
const FINANZAS = ['src/components/finanzas', 'src/app/app/finanzas', 'src/lib/finanzas', 'src/components/shared'];
const SERIALES_B4 = [
  'src/components/inventario/seriales',
  'src/components/inventario/garantias',
  'src/components/inventario/reportes/trazabilidad',
  'src/app/app/inventario/seriales',
  'src/app/app/inventario/garantias',
  'src/app/app/inventario/reportes/trazabilidad',
];

/** Namespace → carpetas (o archivos) cuyo código lo usa. */
const MODULOS: Record<string, string[]> = {
  // El kit y la ficha de clientes se usan desde muchos módulos: se revisa todo src/.
  kit: ['src'],
  proveedores: ['src/components/inventario/proveedores', 'src/app/app/inventario/proveedores', 'src/components/shared'],
  categorias: ['src/components/inventario/categorias', 'src/app/app/inventario/categorias'],
  clientes: ['src'],
  cajas: ['src/components/pos/cajas', 'src/app/app/pos/cajas'],
  productos: ['src/components/inventario/productos', 'src/app/app/inventario/productos'],
  posVentas: ['src/components/pos/ventas', 'src/app/app/pos/ventas'],
  // Rediseño desde Figma (2026-09-23 en adelante): POS, productos, finanzas y motor de documentos.
  documentos: ['src/lib/documents', 'src/components/kit/documento', 'src/app/imprimir'],
  arranque: ['src/components/shell'],
  posVenta: POS,
  posCobro: POS,
  posCobroServidor: POS,
  posPropinas: POS,
  posCargosServicio: POS,
  posDevoluciones: POS,
  posComandas: POS,
  posCocina: POS,
  posNotasRapidas: POS,
  posNotasLinea: POS,
  posMesaAjuste: POS,
  posDisplay: [...POS, 'src/app/pos-display'],
  posCustomerDisplay: [...POS, 'src/app/pos-display'],
  productoDetalle: PRODUCTOS,
  productoForm: PRODUCTOS,
  productosImportar: [...PRODUCTOS, 'src/lib/inventario/importacion'],
  inventarioEtiquetas: [...PRODUCTOS, 'src/components/inventario/etiquetas', 'src/app/app/inventario/etiquetas'],
  facturasVenta: FINANZAS,
  facturasCompra: FINANZAS,
  cartera: FINANZAS,
  cuentasPorPagar: FINANZAS,
  pagos: FINANZAS,
  saldosAFavor: ['src/components/finanzas/saldos-a-favor', 'src/app/app/finanzas/saldos-a-favor'],
  facturacionElectronica: [...FINANZAS, 'src/components/configuracion'],
  notasCredito: FINANZAS,
  documentosSoporte: FINANZAS,
  // Inventario B4 (2026-09-28): seriales, garantías y trazabilidad.
  inventarioSeriales: SERIALES_B4,
  inventarioGarantias: SERIALES_B4,
  inventarioTrazabilidad: SERIALES_B4,
  // Inventario B2 (2026-09-29): ajustes y ajuste por conteo.
  inventarioAjustes: ['src/components/inventario/ajustes', 'src/app/app/inventario/ajustes'],
  // GO Asistente, panel del header (Figma «GO Asistente — escritorio», 2026-09-29).
  asistente: ['src/components/app-layout/Header', 'src/lib/ai/assistant'],
  // Kit CRM, ola 2 (Figma «CRM (Nuevo)» 759:20897, 2026-09-30). Namespace anidado: el resto de
  // `crm` todavía no tiene fr ni pt, así que solo se exige paridad en `crm.kit`.
  'crm.kit': ['src/components/crm/kit'],
  // CRM ola 3A (Figma «CRM — Leads, actividades y acciones rápidas» 765:446568, 2026-09-30):
  // pantallas de Leads y Actividades, acciones rápidas y bloque CRM de la ficha del cliente.
  'crm.accionesRapidas': ['src/components/crm/acciones', 'src/components/crm/leads/pantalla', 'src/components/crm/actividades/pantalla', 'src/components/crm/ficha'],
  'crm.pantallaLeads': ['src/components/crm/leads/pantalla'],
  'crm.pantallaActividades': ['src/components/crm/actividades/pantalla'],
  'crm.fichaCliente': ['src/components/crm/ficha', 'src/components/clientes/id', 'src/app/app/clientes'],
  // Analítica web (Figma 03 › 464:237482, 2026-09-30), con los mapas de «De dónde entran».
  analiticaWeb: ['src/components/analiticaWeb', 'src/app/app/inicio/analitica-web'],
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

/** Nodo del AST de intl-messageformat: 0 = literal y 7 = `#` (no nombran variables). */
type NodoIcu = { type: number; value?: string; options?: Record<string, { value: NodoIcu[] }>; children?: NodoIcu[] };

/**
 * Nombres de variable ICU de un mensaje: `{n, plural, …}` → n; `{email}` → email.
 * Se leen del AST y no con una expresión regular: el texto de una rama
 * (`one {Apply}`) no es una variable.
 */
function variables(mensaje: string, idioma: Idioma): Set<string> {
  const nombres = new Set<string>();
  const recorrer = (nodos: NodoIcu[]) => {
    for (const nodo of nodos) {
      if (typeof nodo.value === 'string' && nodo.type !== 0 && nodo.type !== 7) nombres.add(nodo.value);
      for (const opcion of Object.values(nodo.options ?? {})) recorrer(opcion.value);
      if (nodo.children) recorrer(nodo.children);
    }
  };
  recorrer((new IntlMessageFormat(mensaje, idioma) as { getAst(): NodoIcu[] }).getAst());
  return nombres;
}

function archivos(carpeta: string): string[] {
  const ruta = join(process.cwd(), carpeta);
  if (!statSync(ruta).isDirectory()) return /\.(ts|tsx)$/.test(ruta) ? [ruta] : [];
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
  // Un archivo puede declarar varios componentes, cada uno con su `const t`:
  // cada llamada usa el vínculo más cercano que la precede.
  const vinculos: { variable: string; ns: string; posicion: number }[] = [];
  for (const m of codigo.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*'([\w.]+)'\s*\)/g)) {
    vinculos.push({ variable: m[1], ns: m[2], posicion: m.index ?? 0 });
  }
  for (const m of codigo.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useKitT\(\)/g)) {
    vinculos.push({ variable: m[1], ns: 'kit', posicion: m.index ?? 0 });
  }
  const salida: { ns: string; clave: string; prefijo: boolean }[] = [];
  new Set(vinculos.map((v) => v.variable)).forEach((variable) => {
    const propios = vinculos.filter((v) => v.variable === variable).sort((a, b) => a.posicion - b.posicion);
    const llamada = new RegExp(`(?<![\\w.])${variable}(?:\\.rich|\\.markup)?\\(\\s*(?:'([^']+)'|\`([^\`$]*)\\$\\{)`, 'g');
    for (const m of codigo.matchAll(llamada)) {
      const vinculo = propios.filter((v) => v.posicion < (m.index ?? 0)).pop();
      if (!vinculo) continue;
      if (m[1] !== undefined) salida.push({ ns: vinculo.ns, clave: m[1], prefijo: false });
      // `rango.${id}` → alguna clave bajo «rango.»; `conceptosDian.c${codigo}` → alguna que empiece por «conceptosDian.c».
      else if (m[2]) salida.push({ ns: vinculo.ns, clave: m[2], prefijo: true });
    }
  });
  return salida;
}

describe.each(Object.keys(MODULOS))('namespace %s en los 4 idiomas', (ns) => {
  // `ns` puede ser una ruta («crm.kit»): se baja nivel a nivel.
  const planos = Object.fromEntries(IDIOMAS.map((l) => [l, aplanar(ns.split('.').reduce(hijo, mensajes[l]))])) as Record<
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
        const permitidas = variables(planos.es[clave], 'es');
        return Array.from(variables(texto, idioma))
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
        c.prefijo ? !Object.keys(planos.es).some((k) => k.startsWith(c.completa)) : !(c.completa in planos.es),
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
