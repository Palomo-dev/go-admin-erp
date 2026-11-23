/**
 * Menú inferior del celular v2 en el editor (Encabezado › Celular › Menú inferior). Modelo y
 * lectura en `@/lib/website/menuInferior` (copia idéntica de la tienda).
 *
 * - Sin `v: 2` guardado, el panel muestra los botones que la tienda pinta hoy (`menuInicial`) y no
 *   escribe nada. El primer cambio guarda el menú entero con `v: 2` en `mobile_header.bottom_nav`.
 * - Apagar no borra los botones (`enabled: false`).
 */
import {
  ACCIONES_MENU,
  ANCHOS_FLOTANTE,
  DEFECTO_ACCION,
  EFECTOS_ACTIVO,
  EFECTOS_TOQUE,
  INDICADORES_MENU,
  MAX_BOTONES,
  VELOCIDADES_EFECTO,
  aGuardar,
  barraGuardada,
  contadorMenu,
  efectoActivoMenu,
  indicadorMenu,
  menuInicial,
  temaMenu,
  type AccionMenu,
  type BotonMenu,
  type ContadorMenu,
  type EfectoActivo,
  type EfectoToque,
  type EstiloMenu,
  type FuenteMenu,
  type IndicadorMenu,
  type MenuInferior,
  type TemaMenu,
  type VarianteMenu,
} from '@/lib/website/menuInferior';

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function menuDelEditor(a: Record<string, unknown>, giro?: string | null): { menu: MenuInferior; fuente: FuenteMenu } {
  return menuInicial(a, { restaurante: giro === 'restaurante' });
}

/** Parche: el menú entero con `v: 2` (las demás claves de `mobile_header` se conservan). */
export function cambioMenuV2(a: Record<string, unknown>, menu: MenuInferior): Record<string, unknown> {
  const h = objeto(a.mobile_header) ?? {};
  const cambios: Record<string, unknown> = { mobile_header: { ...h, bottom_nav: aGuardar(menu) } };
  // La lista de antes (`mobile_bottom_bar`) deja de verse con la v2: ya pasó al menú (acciones) o
  // estaba oculta (pestañas). Se limpia para que no quede guardado algo que no se ve.
  if (Array.isArray(barraGuardada(a.mobile_bottom_bar))) cambios.mobile_bottom_bar = 'auto';
  return cambios;
}

/** Datos de la tienda que dan destino a los botones sin destino propio (null = aún no se sabe). */
export interface DatosDestinoTienda { telefono: boolean; whatsapp: boolean; direccion: boolean; pedir: boolean; reservar: boolean }

/** Acciones que la tienda no puede mostrar (sin destino escrito ni dato de la tienda), como en vivo. */
export function accionesSinDestino(d: DatosDestinoTienda | null, restaurante: boolean): ReadonlySet<AccionMenu> {
  const s = new Set<AccionMenu>();
  if (!d) return s;
  if (!d.telefono) s.add('call');
  if (!d.whatsapp) s.add('whatsapp');
  if (!d.direccion) s.add('location');
  if (restaurante && !d.pedir) s.add('order');
  if (restaurante && !d.reservar) s.add('booking');
  return s;
}

/** «Abrir menú» solo funciona si el encabezado del celular tiene botón de menú. */
export function accionesDisponibles(a: Record<string, unknown>): AccionMenu[] {
  const estilo = typeof a.mobile_menu_style === 'string' ? a.mobile_menu_style : 'drawer';
  const sinMenu = estilo === 'tabs' || estilo === 'none';
  return ACCIONES_MENU.filter((x) => !(x === 'menu' && sinMenu));
}

const ORDEN_NUEVO: readonly AccionMenu[] = ['home', 'categories_modal', 'search', 'cart', 'account', 'whatsapp', 'call', 'location', 'page'];

export function botonNuevo(items: readonly BotonMenu[], disponibles: readonly AccionMenu[] = ACCIONES_MENU): BotonMenu {
  const usadas = new Set(items.map((i) => i.action));
  const action = ORDEN_NUEVO.find((x) => !usadas.has(x) && disponibles.includes(x)) ?? 'page';
  let id: string = action;
  for (let n = 2; items.some((i) => i.id === id); n++) id = `${action}-${n}`;
  return { id, action, ...DEFECTO_ACCION[action], visible: true, ...(action === 'page' ? { target: '/' } : {}) };
}

/** Cambia la acción: texto e ícono pasan a los de la acción nueva si seguían los de la anterior. */
export function botonConAccion(b: BotonMenu, action: AccionMenu): BotonMenu {
  const antes = DEFECTO_ACCION[b.action];
  const ahora = DEFECTO_ACCION[action];
  return {
    id: b.id,
    action,
    label: b.label === antes.label || !b.label.trim() ? ahora.label : b.label,
    icon: b.icon === antes.icon ? ahora.icon : b.icon,
    visible: b.visible,
    ...(action === 'page' ? { target: '/' } : {}),
  };
}

export function mover<T>(lista: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return [...lista];
  const l = [...lista];
  [l[i], l[j]] = [l[j], l[i]];
  return l;
}

/**
 * El botón destacado de pestañas y de la píldora flotante es `centerId`; el de acciones,
 * `primaryId`. Solo íconos no tiene destacado y la Isla tiene su botón aparte (`splitId`).
 */
export function usaCentro(variant: VarianteMenu): boolean {
  return variant === 'tabs' || variant === 'floating';
}

/** Estilos con marca del activo (`indicator`): Pestañas, Píldora flotante e Isla. */
export function usaMarca(variant: VarianteMenu): boolean {
  return variant === 'tabs' || variant === 'floating' || variant === 'split';
}

/** Píldora flotante e Isla comparten vidrio, separación y ancho. */
export function esFlotante(variant: VarianteMenu): boolean {
  return variant === 'floating' || variant === 'split';
}

/**
 * Cambiar de variante: si hay más botones que el máximo, se quedan los primeros. Las opciones de la
 * píldora flotante (vidrio, separación, ancho, indicador) solo valen en `floating`: al salir se
 * quitan para no guardar de más.
 */
export function conVariante(m: MenuInferior, variant: VarianteMenu): MenuInferior {
  const items = m.items.slice(0, MAX_BOTONES[variant]);
  const ids = items.map((i) => i.id);
  const style = { ...m.style };
  if (style.centerId && (!usaCentro(variant) || !ids.includes(style.centerId))) delete style.centerId;
  if (style.primaryId && (variant !== 'actions' || !ids.includes(style.primaryId))) delete style.primaryId;
  if (!esFlotante(variant)) for (const k of ['glass', 'offset', 'width'] as const) delete style[k];
  if (!usaMarca(variant)) delete style.indicator;
  // La marca de hoy de cada estilo (Pestañas sin marca, Píldora con relleno) no se escribe.
  if (style.indicator && style.indicator === indicadorMenu({ ...m, variant, style: { ...style, indicator: undefined } })) delete style.indicator;
  if (variant !== 'tabs') delete style.centerShape;
  if (variant !== 'split' || (style.splitId && !ids.includes(style.splitId))) delete style.splitId;
  const resultado = { ...m, variant, items, style };
  // El tema sin clave cambia con el estilo: si coincide con el nuevo de hoy, no se escribe.
  if (resultado.style.theme && resultado.style.theme === temaMenu({ ...resultado, style: { ...resultado.style, theme: undefined } })) delete resultado.style.theme;
  return resultado;
}

// ─── Píldora flotante (P4) ─────────────────────────────────────────────────────────────────────

/** Lo que pinta la píldora flotante sin la clave (contrato de `menuInferior.ts`). */
export const FLOTANTE_SIN_CLAVE = { glass: true, offset: 16, width: 'content', indicator: 'fill' } as const;
const CLAVES_FLOTANTE = ['glass', 'offset', 'width', 'indicator'] as const;
export type AnchoFlotante = (typeof ANCHOS_FLOTANTE)[number];
/** Desde 2026-11-23 la marca del activo también puede ser «Ninguna» o «Desliza» (INDICADORES_MENU). */
export type IndicadorFlotante = IndicadorMenu;
export interface EstiloFlotante { glass: boolean; offset: number; width: AnchoFlotante; indicator: IndicadorFlotante }

/** Valores efectivos de la píldora flotante (los guardados o los de hoy). */
export function estiloFlotante(m: MenuInferior): EstiloFlotante {
  return {
    glass: m.style.glass ?? FLOTANTE_SIN_CLAVE.glass,
    offset: m.style.offset ?? FLOTANTE_SIN_CLAVE.offset,
    width: m.style.width ?? FLOTANTE_SIN_CLAVE.width,
    indicator: m.style.indicator ?? FLOTANTE_SIN_CLAVE.indicator,
  };
}

/**
 * Cambia opciones de la píldora flotante. Elegir el valor de hoy quita la clave; la separación se
 * redondea y se lleva a 0–32; un ancho o indicador fuera de la lista no se escribe.
 */
export function conEstiloFlotante(m: MenuInferior, cambios: Partial<EstiloFlotante>): MenuInferior {
  const style = { ...m.style };
  for (const k of CLAVES_FLOTANTE) {
    if (!(k in cambios)) continue;
    let v: unknown = cambios[k];
    if (k === 'offset') v = typeof v === 'number' && Number.isFinite(v) ? Math.min(32, Math.max(0, Math.round(v))) : undefined;
    if (k === 'glass' && typeof v !== 'boolean') v = undefined;
    if (k === 'width' && !(ANCHOS_FLOTANTE as readonly unknown[]).includes(v)) v = undefined;
    if (k === 'indicator' && !(INDICADORES_MENU as readonly unknown[]).includes(v)) v = undefined;
    if (v === undefined || v === FLOTANTE_SIN_CLAVE[k]) delete style[k];
    else (style as Record<string, unknown>)[k] = v;
  }
  return { ...m, style };
}

/** Qué falta para que el botón se vea en la tienda (null = nada). */
export type AvisoBoton = 'destinoPagina' | 'destinoUrl' | 'sinDestino' | null;
export function avisoBoton(b: BotonMenu, sinDestino: ReadonlySet<AccionMenu> = new Set()): AvisoBoton {
  const t = b.target?.trim() ?? '';
  if (!t && sinDestino.has(b.action)) return 'sinDestino';
  if (b.action === 'page' && !t.startsWith('/')) return 'destinoPagina';
  if (b.action === 'url' && !/^(https?:\/\/|mailto:|tel:)/i.test(t)) return 'destinoUrl';
  return null;
}

/** Tipo de destino que se escribe en cada acción (null = no lleva). */
export type CampoDestino = 'telefono' | 'whatsapp' | 'direccion' | 'ruta' | 'url' | 'rutaOpcional' | null;
export function campoDestino(action: AccionMenu): CampoDestino {
  switch (action) {
    case 'call': return 'telefono';
    case 'whatsapp': return 'whatsapp';
    case 'location': return 'direccion';
    case 'page': return 'ruta';
    case 'url': return 'url';
    case 'booking': case 'order': case 'account': return 'rutaOpcional';
    default: return null;
  }
}

// ─── Propuestas de mejora (2026-11-23, Figma 2836:69391, E1/E2 y efectos 2861:71749) ───────────

/** Marca del activo efectiva y su cambio: la de hoy de cada estilo quita la clave. */
export function conIndicador(m: MenuInferior, v: IndicadorMenu): MenuInferior {
  if (!(INDICADORES_MENU as readonly string[]).includes(v)) return m;
  const style = { ...m.style };
  delete style.indicator;
  if (v !== indicadorMenu({ ...m, style })) style.indicator = v;
  return { ...m, style };
}

/** Colores en el editor: la clave, o «Propio» si hay colores fijados, o el de cada estilo. */
export function temaEditor(m: MenuInferior): TemaMenu {
  if (m.style.theme) return m.style.theme;
  if (m.style.background || m.style.active || m.style.inactive) return 'custom';
  return temaMenu(m);
}

/**
 * Elegir colores: «Encabezado» o «Claro» quitan los colores propios; «Propio» los conserva y los
 * abre. El de hoy del estilo (sin colores propios) no escribe la clave.
 */
export function conTema(m: MenuInferior, tema: TemaMenu): MenuInferior {
  const style: EstiloMenu = { ...m.style };
  delete style.theme;
  if (tema !== 'custom') {
    delete style.background;
    delete style.active;
    delete style.inactive;
    if (tema !== temaMenu({ ...m, style })) style.theme = tema;
  } else {
    style.theme = 'custom';
  }
  return { ...m, style };
}

/** Contador de Carrito o Favoritos: el de hoy de cada uno quita la clave. */
export function conContador(m: MenuInferior, cual: 'cart' | 'favorites', v: ContadorMenu): MenuInferior {
  const badges = { ...(m.style.badges ?? {}) };
  delete badges[cual];
  const sin = { ...m, style: { ...m.style, badges } };
  if (v !== contadorMenu(sin, cual)) badges[cual] = v;
  const style = { ...m.style };
  if (Object.keys(badges).length) style.badges = badges;
  else delete style.badges;
  return { ...m, style };
}

/** «Al bajar»: `always` (hoy) quita la clave. */
export function conAlBajar(m: MenuInferior, v: 'always' | 'hide'): MenuInferior {
  const style = { ...m.style };
  if (v === 'hide') style.scroll = 'hide';
  else delete style.scroll;
  return { ...m, style };
}

/** Ficha de producto: `hide` (por defecto) quita la clave. */
export function conFicha(m: MenuInferior, v: 'hide' | 'stack'): MenuInferior {
  const style = { ...m.style };
  if (v === 'stack') style.pages = { product: 'stack' };
  else delete style.pages;
  return { ...m, style };
}

/** «No repetir en la cabecera»: solo se guarda encendido. */
export function conNoRepetir(m: MenuInferior, v: boolean): MenuInferior {
  const style = { ...m.style };
  if (v) style.dedupeHeader = true;
  else delete style.dedupeHeader;
  return { ...m, style };
}

/** Efecto del activo: el que ya daba la marca (o la etiqueta de Solo íconos) quita la clave. */
export function conEfectoActivo(m: MenuInferior, v: EfectoActivo): MenuInferior {
  if (!(EFECTOS_ACTIVO as readonly string[]).includes(v)) return m;
  const style = { ...m.style };
  delete style.activeEffect;
  if (v !== efectoActivoMenu({ ...m, style })) style.activeEffect = v;
  return { ...m, style };
}

/** Al tocar: `none` (hoy) quita la clave. */
export function conEfectoToque(m: MenuInferior, v: EfectoToque): MenuInferior {
  const style = { ...m.style };
  if (v !== 'none' && (EFECTOS_TOQUE as readonly string[]).includes(v)) style.pressEffect = v;
  else delete style.pressEffect;
  return { ...m, style };
}

/** Velocidad de los efectos: `normal` quita la clave. */
export function conVelocidad(m: MenuInferior, v: (typeof VELOCIDADES_EFECTO)[number]): MenuInferior {
  const style = { ...m.style };
  if (v !== 'normal' && (VELOCIDADES_EFECTO as readonly string[]).includes(v)) style.fxSpeed = v;
  else delete style.fxSpeed;
  return { ...m, style };
}

/** Mueve el botón `desde` al lugar de `hasta` (arrastre del kit). */
export function moverA<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return [...lista];
  const l = [...lista];
  const [x] = l.splice(desde, 1);
  l.splice(hasta, 0, x);
  return l;
}
