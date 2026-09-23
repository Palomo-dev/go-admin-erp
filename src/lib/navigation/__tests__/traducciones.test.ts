/**
 * Traducciones del shell (sidebar, header y panel de sesión) en los 4 idiomas.
 *
 * 1. Cada página y cada grupo del catálogo de navegación tiene su nombre en
 *    `nav.paginas.<clavePagina(href)>` y `nav.grupos.<claveGrupo(grupo)>` en
 *    es, en, fr y pt. Una página nueva sin traducir rompe este test en vez de
 *    salir en español (o como clave cruda) a quien usa la app en otro idioma.
 * 2. Los namespaces `nav`, `header` y `session` tienen exactamente las mismas
 *    claves en los 4 idiomas, y ninguna traducción usa una variable que el
 *    español no pase.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CATALOGO_NAV, claveGrupo, clavePagina } from '../catalog';
import { CRM_NAV } from '@/config/crmNav';

const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
const NAMESPACES_SHELL = ['nav', 'header', 'session'] as const;

type Arbol = { [clave: string]: string | Arbol };

const mensajes: Record<(typeof IDIOMAS)[number], Arbol> = Object.fromEntries(
  IDIOMAS.map((l) => [l, JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf-8')) as Arbol])
) as Record<(typeof IDIOMAS)[number], Arbol>;

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

const paginas = [
  ...CATALOGO_NAV.flatMap((m) => m.paginas),
  // Las del CRM que aún no están activas también: activarlas no debe dejar
  // la entrada sin traducir.
  ...CRM_NAV.map((p) => ({ href: p.href, nombre: p.name, grupo: undefined as string | undefined })),
];
const grupos = Array.from(new Set(CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.grupo)).filter((g): g is string => !!g)));

describe('claves i18n del catálogo', () => {
  test('clavePagina es determinística, sin puntos y sin el prefijo /app', () => {
    expect(clavePagina('/app/finanzas/facturas-venta')).toBe('finanzas_facturas-venta');
    expect(clavePagina('/app/inicio')).toBe('inicio');
    expect(clavePagina('/app/pm/tareas?taskId=1')).toBe('pm_tareas');
    for (const p of paginas) expect(clavePagina(p.href)).not.toMatch(/[./]/);
  });

  test('claveGrupo quita tildes y mayúsculas', () => {
    expect(claveGrupo('Tesorería')).toBe('tesoreria');
    expect(claveGrupo('Recepción')).toBe('recepcion');
    for (const g of grupos) expect(claveGrupo(g)).toMatch(/^[a-z0-9-]+$/);
  });

  test('dos páginas distintas nunca comparten clave', () => {
    const porClave = new Map<string, string>();
    for (const p of paginas) {
      const clave = clavePagina(p.href);
      const otra = porClave.get(clave);
      if (otra !== undefined) expect(otra).toBe(p.href);
      porClave.set(clave, p.href);
    }
  });

  test.each(IDIOMAS)('%s: toda página del catálogo tiene nombre traducido', (idioma) => {
    const nombres = hijo(hijo(mensajes[idioma], 'nav'), 'paginas');
    const faltan = paginas
      .map((p) => clavePagina(p.href))
      .filter((clave) => typeof nombres[clave] !== 'string' || (nombres[clave] as string).trim() === '');
    expect(faltan).toEqual([]);
  });

  test.each(IDIOMAS)('%s: todo grupo del catálogo tiene nombre traducido', (idioma) => {
    const nombres = hijo(hijo(mensajes[idioma], 'nav'), 'grupos');
    const faltan = grupos.map(claveGrupo).filter((clave) => typeof nombres[clave] !== 'string' || (nombres[clave] as string).trim() === '');
    expect(faltan).toEqual([]);
  });

  test('el nombre en español de cada página coincide con el del catálogo', () => {
    // El catálogo sigue siendo el valor canónico (lo usan modulePages.ts y la
    // configuración de páginas): si se renombra una página, se renombra en los dos.
    const nombres = hijo(hijo(mensajes.es, 'nav'), 'paginas');
    const distintas = paginas.filter((p) => nombres[clavePagina(p.href)] !== p.nombre).map((p) => p.href);
    expect(distintas).toEqual([]);
  });
});

describe.each(NAMESPACES_SHELL)('namespace %s en los 4 idiomas', (ns) => {
  const planos = Object.fromEntries(IDIOMAS.map((l) => [l, aplanar(hijo(mensajes[l], ns))])) as Record<
    (typeof IDIOMAS)[number],
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
});
