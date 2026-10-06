/**
 * Operaciones puras sobre los menús del documento V2 (`documento.menus` y las referencias del
 * shell, ADR-002 D3). Las usan Páginas (interruptor «En el menú»), Menú y navegación (Figma
 * A/04c, D/04-09, D/04-10), los route handlers de páginas y, cuando el área editor lo adopte, el
 * panel de menús del editor (D/05-20): una sola implementación.
 *
 * Nunca mutan la entrada. Respetan los límites del contrato (`LIMITES_DOCUMENTO`): profundidad 3,
 * 200 ítems por menú, 20 menús y 10 columnas de pie. Lo que no cabe devuelve un código de error
 * en lugar de un documento inválido.
 */
import {
  LIMITES_DOCUMENTO,
  type DocumentoSitio,
  type ItemMenu,
  type MenuSitio,
} from '@/lib/website/contrato/documentoSitio';

export type GenerarId = () => string;

const clonar = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

// ─── Árbol de ítems ──────────────────────────────────────────────────────────────────────────

export interface NodoMenuPlano {
  item: ItemMenu;
  nivel: number;
  padreId: string | null;
  indice: number;
}

/** Lista en orden de lectura (padre, luego hijos) con su nivel (0 = raíz). */
export function aplanarItems(items: readonly ItemMenu[], nivel = 0, padreId: string | null = null): NodoMenuPlano[] {
  return items.flatMap((item, indice) => [
    { item, nivel, padreId, indice },
    ...aplanarItems(item.hijos ?? [], nivel + 1, item.id),
  ]);
}

export function buscarItem(items: readonly ItemMenu[], id: string): NodoMenuPlano | null {
  return aplanarItems(items).find((n) => n.item.id === id) ?? null;
}

export function contarItems(items: readonly ItemMenu[]): number {
  return aplanarItems(items).length;
}

/** Niveles que ocupa el subárbol (1 = hoja). */
export function alturaItem(item: ItemMenu): number {
  return 1 + Math.max(0, ...(item.hijos ?? []).map(alturaItem));
}

function mapearItems(items: readonly ItemMenu[], fn: (item: ItemMenu) => ItemMenu): ItemMenu[] {
  return items.map((item) => {
    const nuevo = fn(item);
    return nuevo.hijos ? { ...nuevo, hijos: mapearItems(nuevo.hijos, fn) } : nuevo;
  });
}

/** Quita el ítem (con sus hijos) y lo devuelve. */
/** Copia del ítem sin `hijos` (el contrato no admite `hijos: []`). */
function sinHijos(item: ItemMenu): Omit<ItemMenu, 'hijos'> {
  const copia = { ...item };
  delete copia.hijos;
  return copia;
}

export function quitarItem(items: readonly ItemMenu[], id: string): { items: ItemMenu[]; quitado: ItemMenu | null } {
  let quitado: ItemMenu | null = null;
  const recorrer = (lista: readonly ItemMenu[]): ItemMenu[] =>
    lista.flatMap((item) => {
      if (item.id === id) {
        quitado = item;
        return [];
      }
      if (!item.hijos) return [item];
      const hijos = recorrer(item.hijos);
      const resto = sinHijos(item);
      return [(hijos.length > 0 ? { ...resto, hijos } : resto) as ItemMenu];
    });
  const resultado = recorrer(items);
  return { items: resultado, quitado };
}

/** Inserta como hijo de `padreId` (`null` = raíz) en `indice` (por defecto, al final). */
export function insertarItem(items: readonly ItemMenu[], item: ItemMenu, padreId: string | null, indice?: number): ItemMenu[] {
  const poner = (lista: readonly ItemMenu[]) => {
    const copia = [...lista];
    const i = indice === undefined ? copia.length : Math.max(0, Math.min(indice, copia.length));
    copia.splice(i, 0, item);
    return copia;
  };
  if (padreId === null) return poner(items);
  return mapearItems(items, (actual) => (actual.id === padreId ? { ...actual, hijos: poner(actual.hijos ?? []) } : actual));
}

export type MotivoNoAnidar = 'ciclo' | 'profundidad' | 'no_existe';

/** ¿Se puede poner `id` (con su subárbol) bajo `padreId`? */
export function puedeAnidar(items: readonly ItemMenu[], id: string, padreId: string | null): true | MotivoNoAnidar {
  const origen = buscarItem(items, id);
  if (!origen) return 'no_existe';
  if (padreId === null) return true;
  if (padreId === id || aplanarItems(origen.item.hijos ?? []).some((n) => n.item.id === padreId)) return 'ciclo';
  const padre = buscarItem(items, padreId);
  if (!padre) return 'no_existe';
  // nivel del padre (0-based) + 1 = nivel donde queda el origen; su altura no puede pasar de 3.
  return padre.nivel + 1 + alturaItem(origen.item) <= LIMITES_DOCUMENTO.profundidadMenu ? true : 'profundidad';
}

/** ¿Cabe un ítem nuevo (hoja) bajo `padreId`? */
export function cabeHijo(items: readonly ItemMenu[], padreId: string | null): boolean {
  if (padreId === null) return true;
  const padre = buscarItem(items, padreId);
  return !!padre && padre.nivel + 2 <= LIMITES_DOCUMENTO.profundidadMenu;
}

export function moverItem(
  items: readonly ItemMenu[],
  id: string,
  padreId: string | null,
  indice?: number,
): { ok: true; items: ItemMenu[] } | { ok: false; motivo: MotivoNoAnidar } {
  const valido = puedeAnidar(items, id, padreId);
  if (valido !== true) return { ok: false, motivo: valido };
  const { items: sin, quitado } = quitarItem(items, id);
  if (!quitado) return { ok: false, motivo: 'no_existe' };
  return { ok: true, items: insertarItem(sin, quitado, padreId, indice) };
}

/** Sube (-1) o baja (1) un ítem entre sus hermanos. Sin hermano en esa dirección, no cambia. */
export function moverEntreHermanos(items: readonly ItemMenu[], id: string, direccion: -1 | 1): ItemMenu[] {
  const intercambiar = (lista: readonly ItemMenu[]): ItemMenu[] => {
    const i = lista.findIndex((x) => x.id === id);
    if (i >= 0) {
      const j = i + direccion;
      if (j < 0 || j >= lista.length) return [...lista];
      const copia = [...lista];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    }
    return lista.map((x) => (x.hijos ? { ...x, hijos: intercambiar(x.hijos) } : x));
  };
  return intercambiar(items);
}

/** Destinos posibles para «Mover a…»: la raíz y los ítems donde cabe el subárbol. */
export function destinosMover(items: readonly ItemMenu[], id: string): (string | null)[] {
  return [null, ...aplanarItems(items).map((n) => n.item.id)].filter((destino) => puedeAnidar(items, id, destino) === true);
}

/** Cambia el texto del enlace. */
export function renombrarItem(items: readonly ItemMenu[], id: string, etiqueta: string): ItemMenu[] {
  const limpio = etiqueta.slice(0, LIMITES_DOCUMENTO.longitudTextoCorto);
  return mapearItems(items, (item) => (item.id === id ? { ...item, etiqueta: limpio } : item));
}

/** Destino de un enlace (lo que define su tipo), sin id, texto ni hijos. */
export type DestinoEnlace =
  | { tipo: 'page'; paginaId: string }
  | { tipo: 'entity'; entidad: 'category' | 'product' | 'space'; entidadId: string }
  | { tipo: 'custom'; url: string; nuevaPestana?: boolean };

/** Cambia a dónde lleva el enlace conservando id, texto e hijos. */
export function fijarDestino(items: readonly ItemMenu[], id: string, destino: DestinoEnlace): ItemMenu[] {
  return mapearItems(items, (item) => {
    if (item.id !== id) return item;
    const base = { id: item.id, etiqueta: item.etiqueta, ...(item.hijos ? { hijos: item.hijos } : {}) };
    return { ...base, ...destino } as ItemMenu;
  });
}

export function nuevoItem(destino: DestinoEnlace, etiqueta: string, generarId: GenerarId): ItemMenu {
  return { id: generarId(), etiqueta: etiqueta.slice(0, LIMITES_DOCUMENTO.longitudTextoCorto) || 'Enlace', ...destino } as ItemMenu;
}

/** URL de WhatsApp o teléfono para un enlace «WhatsApp o teléfono» (D/04-10). */
export function urlContacto(tipo: 'whatsapp' | 'telefono', numero: string): string {
  const digitos = numero.replace(/[^\d+]/g, '');
  return tipo === 'whatsapp' ? `https://wa.me/${digitos.replace(/^\+/, '')}` : `tel:${digitos}`;
}

/** Tipo visible de un enlace (icono de MenuLinkRow). */
export function tipoEnlace(item: ItemMenu): 'pagina' | 'categoria' | 'externo' | 'whatsapp' | 'telefono' {
  if (item.tipo === 'page' || item.tipo === 'anchor') return 'pagina';
  if (item.tipo === 'entity') return 'categoria';
  if (item.tipo === 'custom') {
    if (item.url.startsWith('https://wa.me/') || item.url.startsWith('https://api.whatsapp.com/')) return 'whatsapp';
    if (item.url.startsWith('tel:')) return 'telefono';
  }
  return 'externo';
}

// ─── Categorías del Inventario como submenú (A/04c, D/04-09) ────────────────────────────────

export interface CategoriaMenu {
  id: number;
  nombre: string;
}

/** Categorías que ya son hijas directas del ítem. */
export function categoriasDeItem(item: ItemMenu): Set<string> {
  return new Set((item.hijos ?? []).filter((h) => h.tipo === 'entity' && h.entidad === 'category').map((h) => (h as { entidadId: string }).entidadId));
}

/**
 * Activa o desactiva «Mostrar categorías … como submenú»: al activar añade como hijos las
 * categorías que falten (en el orden del Inventario); al desactivar quita las hijas de categoría
 * y conserva los demás hijos.
 */
export function categoriasComoSubmenu(
  items: readonly ItemMenu[],
  id: string,
  categorias: readonly CategoriaMenu[],
  activar: boolean,
  generarId: GenerarId,
): ItemMenu[] {
  return mapearItems(items, (item) => {
    if (item.id !== id) return item;
    const hijos = item.hijos ?? [];
    if (!activar) {
      const restantes = hijos.filter((h) => !(h.tipo === 'entity' && h.entidad === 'category'));
      const resto = sinHijos(item);
      return (restantes.length > 0 ? { ...resto, hijos: restantes } : resto) as ItemMenu;
    }
    const ya = categoriasDeItem(item);
    const nuevas = categorias
      .filter((c) => !ya.has(String(c.id)))
      .map((c) => nuevoItem({ tipo: 'entity', entidad: 'category', entidadId: String(c.id) }, c.nombre, generarId));
    return { ...item, hijos: [...hijos, ...nuevas].slice(0, 50) };
  });
}

// ─── Menús del documento y shell ─────────────────────────────────────────────────────────────

export type UbicacionMenu =
  | { tipo: 'encabezado' }
  | { tipo: 'megamenu' }
  | { tipo: 'pie'; columna: number }
  | { tipo: 'sin' };

export function ubicacionDeMenu(documento: DocumentoSitio, menuId: string): UbicacionMenu {
  if (documento.shell.header.menuPrincipalId === menuId) return { tipo: 'encabezado' };
  if (documento.shell.header.menuMegaId === menuId) return { tipo: 'megamenu' };
  const i = documento.shell.footer.menuIds.indexOf(menuId);
  if (i >= 0) return { tipo: 'pie', columna: i + 1 };
  return { tipo: 'sin' };
}

export function menuEncabezado(documento: DocumentoSitio): MenuSitio | null {
  const id = documento.shell.header.menuPrincipalId;
  return (id && documento.menus.find((m) => m.id === id)) || null;
}

export function menusPie(documento: DocumentoSitio): MenuSitio[] {
  return documento.shell.footer.menuIds
    .map((id) => documento.menus.find((m) => m.id === id))
    .filter((m): m is MenuSitio => Boolean(m));
}

/** Ids de páginas que enlaza un menú (a cualquier nivel). */
export function paginasEnMenu(menu: MenuSitio | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const n of aplanarItems(menu?.items ?? [])) if (n.item.tipo === 'page') ids.add(n.item.paginaId);
  return ids;
}

function sinReferenciaMenu(documento: DocumentoSitio, menuId: string): DocumentoSitio {
  const doc = clonar(documento);
  if (doc.shell.header.menuPrincipalId === menuId) doc.shell.header.menuPrincipalId = null;
  if (doc.shell.header.menuMegaId === menuId) doc.shell.header.menuMegaId = null;
  doc.shell.footer.menuIds = doc.shell.footer.menuIds.filter((id) => id !== menuId);
  return doc;
}

export function reemplazarItemsMenu(documento: DocumentoSitio, menuId: string, items: ItemMenu[]): DocumentoSitio {
  return { ...documento, menus: documento.menus.map((m) => (m.id === menuId ? { ...m, items } : m)) };
}

export type ErrorMenu = 'limite_menus' | 'limite_items' | 'limite_columnas_pie' | 'menu_no_existe' | 'nombre_vacio';

/** Fija dónde se muestra el menú; quita su referencia anterior. El pie admite 10 columnas. */
export function cambiarUbicacion(
  documento: DocumentoSitio,
  menuId: string,
  ubicacion: UbicacionMenu,
): { ok: true; documento: DocumentoSitio } | { ok: false; error: ErrorMenu } {
  if (!documento.menus.some((m) => m.id === menuId)) return { ok: false, error: 'menu_no_existe' };
  const doc = sinReferenciaMenu(documento, menuId);
  if (ubicacion.tipo === 'encabezado') doc.shell.header.menuPrincipalId = menuId;
  if (ubicacion.tipo === 'megamenu') doc.shell.header.menuMegaId = menuId;
  if (ubicacion.tipo === 'pie') {
    if (doc.shell.footer.menuIds.length >= 10) return { ok: false, error: 'limite_columnas_pie' };
    const i = Math.max(0, Math.min(ubicacion.columna - 1, doc.shell.footer.menuIds.length));
    doc.shell.footer.menuIds.splice(i, 0, menuId);
  }
  return { ok: true, documento: doc };
}

export function crearMenu(
  documento: DocumentoSitio,
  datos: { nombre: string; ubicacion: UbicacionMenu; items?: ItemMenu[] },
  generarId: GenerarId,
): { ok: true; documento: DocumentoSitio; menuId: string } | { ok: false; error: ErrorMenu } {
  const nombre = datos.nombre.trim().slice(0, LIMITES_DOCUMENTO.longitudTextoCorto);
  if (!nombre) return { ok: false, error: 'nombre_vacio' };
  if (documento.menus.length >= LIMITES_DOCUMENTO.menusMaximos) return { ok: false, error: 'limite_menus' };
  const id = generarId();
  const conMenu: DocumentoSitio = { ...clonar(documento), menus: [...documento.menus.map(clonar), { id, nombre, items: datos.items ?? [] }] };
  if (datos.ubicacion.tipo === 'sin') return { ok: true, documento: conMenu, menuId: id };
  const r = cambiarUbicacion(conMenu, id, datos.ubicacion);
  return r.ok ? { ok: true, documento: r.documento, menuId: id } : r;
}

export function renombrarMenu(documento: DocumentoSitio, menuId: string, nombre: string): DocumentoSitio {
  const limpio = nombre.trim().slice(0, LIMITES_DOCUMENTO.longitudTextoCorto);
  if (!limpio) return documento;
  return { ...documento, menus: documento.menus.map((m) => (m.id === menuId ? { ...m, nombre: limpio } : m)) };
}

export function eliminarMenu(documento: DocumentoSitio, menuId: string): DocumentoSitio {
  const doc = sinReferenciaMenu(documento, menuId);
  return { ...doc, menus: doc.menus.filter((m) => m.id !== menuId) };
}

function conIdsNuevos(items: readonly ItemMenu[], generarId: GenerarId): ItemMenu[] {
  return items.map((item) => ({ ...item, id: generarId(), ...(item.hijos ? { hijos: conIdsNuevos(item.hijos, generarId) } : {}) }) as ItemMenu);
}

export function duplicarMenu(
  documento: DocumentoSitio,
  menuId: string,
  nombre: string,
  generarId: GenerarId,
): { ok: true; documento: DocumentoSitio; menuId: string } | { ok: false; error: ErrorMenu } {
  const original = documento.menus.find((m) => m.id === menuId);
  if (!original) return { ok: false, error: 'menu_no_existe' };
  return crearMenu(documento, { nombre, ubicacion: { tipo: 'sin' }, items: conIdsNuevos(original.items, generarId) }, generarId);
}

/**
 * «Restablecer desde el principal» (D/04-10): la sede vuelve a tener los menús del sitio
 * principal y las mismas referencias del shell. Los enlaces a páginas que la sede no tiene se
 * descartan (el contrato exige que existan).
 */
export function restablecerMenusDesde(documento: DocumentoSitio, base: DocumentoSitio): DocumentoSitio {
  const paginas = new Set(documento.paginas.map((p) => p.id));
  const filtrar = (items: readonly ItemMenu[]): ItemMenu[] =>
    items
      .filter((i) => i.tipo !== 'page' || paginas.has(i.paginaId))
      .map((i) => (i.hijos ? ({ ...i, hijos: filtrar(i.hijos) } as ItemMenu) : i));
  const doc = clonar(documento);
  doc.menus = base.menus.map((m) => ({ ...clonar(m), items: filtrar(m.items) }));
  doc.shell.header.menuPrincipalId = base.shell.header.menuPrincipalId;
  doc.shell.header.menuMegaId = base.shell.header.menuMegaId ?? null;
  doc.shell.footer.menuIds = [...base.shell.footer.menuIds];
  return doc;
}

/** ¿El menú de la sede es igual al del principal? («copiado del principal» vs «editado en …»). */
export function menuIgualABase(menu: MenuSitio, base: DocumentoSitio | null | undefined): 'copiado' | 'editado' | 'propio' {
  const enBase = base?.menus.find((m) => m.id === menu.id);
  if (!enBase) return 'propio';
  return JSON.stringify(enBase) === JSON.stringify(menu) ? 'copiado' : 'editado';
}

// ─── Páginas en el menú del encabezado (interruptor «En el menú», A/04a) ────────────────────

export const ID_MENU_ENCABEZADO = 'encabezado';

/**
 * Pone o quita una página del menú del encabezado. Si el sitio aún no tiene menú de encabezado,
 * lo crea («Encabezado»). Al quitar, sus subenlaces suben al lugar del enlace quitado: nunca se
 * pierde un enlace sin que la persona lo pida.
 */
export function alternarPaginaEnMenu(
  documento: DocumentoSitio,
  paginaId: string,
  enMenu: boolean,
  generarId: GenerarId,
): { ok: true; documento: DocumentoSitio } | { ok: false; error: ErrorMenu | 'pagina_no_existe' } {
  const pagina = documento.paginas.find((p) => p.id === paginaId);
  if (!pagina) return { ok: false, error: 'pagina_no_existe' };
  let doc = clonar(documento);
  let menu = menuEncabezado(doc);
  if (!menu) {
    if (!enMenu) return { ok: true, documento: doc };
    const id = doc.menus.some((m) => m.id === ID_MENU_ENCABEZADO) ? generarId() : ID_MENU_ENCABEZADO;
    const r = crearMenu(doc, { nombre: 'Encabezado', ubicacion: { tipo: 'sin' } }, () => id);
    if (!r.ok) return r;
    doc = r.documento;
    doc.shell.header.menuPrincipalId = id;
    menu = doc.menus.find((m) => m.id === id)!;
  }
  const yaEsta = paginasEnMenu(menu).has(paginaId);
  if (enMenu === yaEsta) return { ok: true, documento: doc };
  if (enMenu) {
    if (contarItems(menu.items) >= LIMITES_DOCUMENTO.itemsPorMenu) return { ok: false, error: 'limite_items' };
    const item = nuevoItem({ tipo: 'page', paginaId }, pagina.titulo || 'Página', generarId);
    return { ok: true, documento: reemplazarItemsMenu(doc, menu.id, [...menu.items, item]) };
  }
  return { ok: true, documento: reemplazarItemsMenu(doc, menu.id, quitarEnlacesAPagina(menu.items, paginaId)) };
}

/** Quita los enlaces a una página; sus hijos ocupan su lugar. */
export function quitarEnlacesAPagina(items: readonly ItemMenu[], paginaId: string): ItemMenu[] {
  return items.flatMap((item) => {
    const hijos = item.hijos ? quitarEnlacesAPagina(item.hijos, paginaId) : undefined;
    if (item.tipo === 'page' && item.paginaId === paginaId) return hijos ?? [];
    if (!item.hijos) return [item];
    const resto = sinHijos(item);
    return [(hijos && hijos.length > 0 ? { ...resto, hijos } : resto) as ItemMenu];
  });
}

/** Quita la página de TODOS los menús (al eliminarla: el contrato exige que el destino exista). */
export function quitarPaginaDeMenus(documento: DocumentoSitio, paginaId: string): DocumentoSitio {
  return { ...documento, menus: documento.menus.map((m) => ({ ...m, items: quitarEnlacesAPagina(m.items, paginaId) })) };
}
