/**
 * Lógica pura de los paneles «Encabezado» y «Pie de página» del editor (Figma 2058:40377 y
 * 2064:102). Sin React: la prueban `__tests__/zonaGlobalLogica.test.ts`.
 *
 * Un solo origen para los valores por defecto: el contrato (`OPCIONES_SHELL` de
 * `mapeoAjustes.ts`), el mismo que usan el sitio público y la base. Antes el inspector decía
 * `show_header_cart ?? false` y `show_header_auth ?? false` mientras el sitio y la columna los
 * traían encendidos: el panel mostraba apagado algo que el sitio pintaba.
 */
import {
  ACCIONES_BARRA_MOVIL,
  COLUMNAS_NUEVAS_SHELL,
  OPCIONES_SHELL,
  barraMovilAColumna,
  normalizarOpcionShell,
} from '@/lib/website/v2/mapeoAjustes';
import { VIEWPORT_DISPOSITIVO, type DispositivoVista } from '@/components/sitio-web/ui/dispositivos';

/**
 * Ancho desde el que el sitio pinta el encabezado de computador (`SiteHeader` de goadmin-websites:
 * `mobile_breakpoint || 1024`). El editor usa el MISMO: la tableta (768) ve el menú del celular.
 */
export const BREAKPOINT_MOVIL_SITIO = 1024;

/** ¿El sitio pinta el encabezado y el pie del celular en este dispositivo del editor? */
export function esVistaMovil(dispositivo: DispositivoVista, breakpoint: number = BREAKPOINT_MOVIL_SITIO): boolean {
  return VIEWPORT_DISPOSITIVO[dispositivo].ancho < breakpoint;
}

export type ZonaShell = 'header' | 'footer';

/** Valor efectivo de una opción del shell: el guardado si es válido; si no, el del contrato. */
export function valorOpcion<T = unknown>(ajustes: Record<string, unknown> | null | undefined, columna: string): T {
  return normalizarOpcionShell(columna, ajustes?.[columna]) as T;
}

/** Booleano efectivo de una opción del shell (default del contrato). */
export function opcionBooleana(ajustes: Record<string, unknown> | null | undefined, columna: string): boolean {
  const v = valorOpcion(ajustes, columna);
  return typeof v === 'boolean' ? v : Boolean(OPCIONES_SHELL[columna]?.porDefecto);
}

// ─── Anuncios de la barra superior (`topbar_announcement`: JSON con la lista, o un texto) ──────

export function leerAnuncios(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const lista = JSON.parse(raw);
    if (Array.isArray(lista) && lista.every((x) => typeof x === 'string')) return lista;
  } catch {
    return [raw];
  }
  return [];
}

/** Lista → columna. Vacía (o solo espacios) → `null`, que apaga el anuncio. */
export function escribirAnuncios(lista: readonly string[]): string | null {
  const llenos = lista.filter((x) => x.trim() !== '');
  return llenos.length > 0 ? JSON.stringify(llenos) : null;
}

// ─── Barra fija del celular (`mobile_bottom_bar`) ─────────────────────────────────────────────

export type AccionBarraMovil = (typeof ACCIONES_BARRA_MOVIL)[number];
export type ModoBarraMovil = 'auto' | 'ninguna' | 'lista';

export function leerBarraMovil(ajustes: Record<string, unknown> | null | undefined): { modo: ModoBarraMovil; acciones: AccionBarraMovil[] } {
  // Una sola acción en la columna legacy llega como texto sin coma («reservar»).
  const crudo = ajustes?.mobile_bottom_bar;
  if (typeof crudo === 'string' && (ACCIONES_BARRA_MOVIL as readonly string[]).includes(crudo)) {
    return { modo: 'lista', acciones: [crudo as AccionBarraMovil] };
  }
  const v = valorOpcion(ajustes, 'mobile_bottom_bar');
  if (Array.isArray(v)) return { modo: 'lista', acciones: v as AccionBarraMovil[] };
  return { modo: v === 'ninguna' ? 'ninguna' : 'auto', acciones: [] };
}

/** Acciones que sugiere cada giro al pasar a «Elegir acciones» (las de las plantillas). */
export const ACCIONES_SUGERIDAS: Readonly<Record<string, readonly AccionBarraMovil[]>> = {
  restaurante: ['reservar', 'llamar', 'como_llegar', 'pedir'],
  servicios: ['agendar', 'whatsapp', 'llamar'],
  gimnasio: ['prueba', 'como_llegar', 'llamar'],
  hotel: ['reservar', 'llamar', 'como_llegar'],
  tienda: ['whatsapp', 'llamar', 'como_llegar'],
  parqueadero: ['reservar', 'como_llegar', 'llamar'],
  transporte: ['whatsapp', 'llamar'],
};

/** Valor de `mobile_bottom_bar` para un modo y unas acciones (máximo 4, sin repetir). */
export function valorBarraMovil(modo: ModoBarraMovil, acciones: readonly AccionBarraMovil[], giro: string | null): unknown {
  if (modo !== 'lista') return modo;
  const elegidas = [...new Set(acciones)].slice(0, 4);
  if (elegidas.length > 0) return elegidas;
  return [...(ACCIONES_SUGERIDAS[giro ?? ''] ?? ['llamar', 'como_llegar'])];
}

// ─── Destino de los botones del encabezado ─────────────────────────────────────────────────────

export interface DestinoOpcion {
  valor: string;
  etiqueta: string;
}

/** Rutas del sitio público que existen en toda organización (las de `shellPorPlantilla.ts`). */
const RUTAS_SITIO: readonly DestinoOpcion[] = [
  { valor: '/reservas', etiqueta: 'Reservas en línea' },
  { valor: '/agendar', etiqueta: 'Agendar cita' },
  { valor: '/consultar-pedido', etiqueta: 'Consultar pedido' },
  { valor: '/mi-cuenta', etiqueta: 'Mi cuenta' },
];

export const DESTINO_PROPIO = '__propio';

/**
 * Opciones del selector «Enlace» de un botón: las páginas del sitio, rutas del sitio público,
 * WhatsApp y «Cómo llegar». `actual` se agrega si no está (enlace propio guardado antes).
 */
export function opcionesDestino(
  paginas: readonly { slug: string; titulo: string }[],
  textos: { pagina: (titulo: string) => string; whatsapp: string; maps: string },
): DestinoOpcion[] {
  const vistas = new Set<string>();
  const lista: DestinoOpcion[] = [];
  const agregar = (o: DestinoOpcion) => {
    if (vistas.has(o.valor)) return;
    vistas.add(o.valor);
    lista.push(o);
  };
  for (const p of paginas) {
    if (p.slug.startsWith('plantillas/')) continue;
    agregar({ valor: p.slug === 'home' || p.slug === 'inicio' || p.slug === '' ? '/' : `/${p.slug}`, etiqueta: textos.pagina(p.titulo) });
  }
  for (const r of RUTAS_SITIO) agregar(r);
  agregar({ valor: 'whatsapp', etiqueta: textos.whatsapp });
  agregar({ valor: 'maps', etiqueta: textos.maps });
  return lista;
}

/** ¿El enlace guardado es uno de la lista o uno propio (que se edita a mano)? */
export function esDestinoDeLista(url: string | null | undefined, opciones: readonly DestinoOpcion[]): boolean {
  return !url || opciones.some((o) => o.valor === url);
}

// ─── Restablecer a la plantilla ────────────────────────────────────────────────────────────────

/**
 * Cambios para dejar la zona como la trae la plantilla: cada opción del contrato de esa zona vale
 * lo de la plantilla o, si la plantilla no la fija, su default. Más la composición.
 */
export function cambiosRestablecer(
  zona: ZonaShell,
  porDefecto: { composicion: string; opciones: Record<string, unknown> },
): Record<string, unknown> {
  const cambios: Record<string, unknown> = { [zona === 'header' ? 'header_style' : 'footer_style']: porDefecto.composicion };
  for (const [columna, def] of Object.entries(OPCIONES_SHELL)) {
    if (def.zona !== zona) continue;
    cambios[columna] = columna in porDefecto.opciones ? porDefecto.opciones[columna] : def.porDefecto;
  }
  return cambios;
}

// ─── Guardado legacy (`website_settings`) ──────────────────────────────────────────────────────

/**
 * Cambios del panel para la fila legacy. Degrada si una columna nueva aún no existe en la base
 * (la fila cargada no la trae): no se envía (el lienzo la muestra igual, en vivo). La barra móvil
 * va como texto «a,b» (columna `text`).
 */
export function cambiosParaFilaLegacy(
  cambios: Record<string, unknown>,
  filaCargada: Record<string, unknown> | null,
): { enviar: Record<string, unknown>; omitidas: string[] } {
  const enviar: Record<string, unknown> = {};
  const omitidas: string[] = [];
  for (const [columna, valor] of Object.entries(cambios)) {
    if (COLUMNAS_NUEVAS_SHELL.includes(columna) && filaCargada && !(columna in filaCargada)) {
      omitidas.push(columna);
      continue;
    }
    enviar[columna] = columna === 'mobile_bottom_bar' ? barraMovilAColumna(valor) : valor;
  }
  return { enviar, omitidas };
}
