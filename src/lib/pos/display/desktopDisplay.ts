/**
 * Ventana de la pantalla del cliente en Go Admin Desktop (PLAN
 * pos-doble-pantalla §9 y §5.2, Fase 1): lógica pura sobre el puente
 * `window.goAdminDesktop.posDisplay` (`electron/src/main/posDisplayIpc.ts`).
 *
 * Aquí NO hay React ni acceso directo a `window`: todo recibe el puente, el
 * storage o el reloj como parámetro para poder probarse en Node con un puente
 * falso. Los hooks (`useDesktopDisplayWindow`) y la tarjeta de Configuración
 * solo pintan lo que sale de aquí.
 *
 * Cuatro puntos:
 *
 * 1. CAPACIDAD. Un Desktop anterior a 0.2.1 no expone `listDisplays`,
 *    `open`, `status` ni `setEnabled`: la web debe comportarse como en el
 *    navegador (ventana emergente normal) sin lanzar. `supportsDesktopDisplayPicker`
 *    es el único criterio para mostrar el selector de monitor.
 *
 * 2. MONITOR. El interruptor de la ORGANIZACIÓN (`organization_settings`)
 *    sigue mandando sobre si la pantalla existe; el monitor elegido es de
 *    ESTA máquina y se persiste en el proceso principal con
 *    `setEnabled(enabled, displayId)`. El puente no devuelve el monitor
 *    guardado (solo el de la ventana abierta, en `status()`), así que la
 *    tarjeta guarda además una copia en localStorage
 *    (`pos_display_desktop_display_id`) para preseleccionarlo al volver.
 *    Tres valores distintos, y la distinción importa porque el IPC los trata
 *    distinto: número = ese monitor; `null` = «automático» elegido a
 *    propósito (el secundario si existe, `pickDisplay` del proceso
 *    principal); `undefined` = «no se sabe» (sin copia local: el origen
 *    cambió de puerto, se limpiaron datos) y el proceso principal CONSERVA el
 *    monitor que ya tenía. Por eso la copia local guarda 'auto' de forma
 *    explícita cuando el usuario elige automático (`DisplayChoice.known`).
 *
 * 3. VENTANA ABIERTA SIN SEÑAL. `status().open` dice que la ventana existe;
 *    `display_alive` por el relay dice que la pantalla HABLA. Si la caja
 *    EMITE y la ventana lleva abierta más de STALE_AFTER_MS sin señal, el
 *    canal está roto (la pantalla cargó otro origen, el relay no llega, la
 *    página se quedó en error) y el indicador debe decirlo en vez de «Sin
 *    pantalla». Si la caja NO emite (interruptor de la organización apagado,
 *    o aún cargando) la falta de señal es lo esperado y no se acusa nada:
 *    lo que toca decir es «desactivada» (o nada).
 *
 * 4. SIN SINCRONÍA HACIA ABAJO (decisión de cierre de la Fase 1, ronda 4).
 *    `config.json.enabled` / `displayId` del proceso principal («abrir sola
 *    al arrancar» + monitor) se escriben SOLO cuando el usuario actúa en ESTA
 *    máquina: el interruptor o el selector de monitor de la tarjeta
 *    (`persistDesktopDisplayChoice`) o «Activar y abrir» del indicador
 *    (`enableDesktopDisplayHere`, que sí persiste `enabled = true`). Nunca se
 *    escriben a partir de una LECTURA del interruptor de la organización, y
 *    nunca se cierra una ventana «por sincronía». En las rondas 2 y 3 existió
 *    una sincronía hacia abajo (organización leída en apagado ⇒
 *    `setEnabled(false)` ⇒ cerrar la «ventana huérfana» del arranque) que
 *    confundía «no se pudo leer la fila» (arranque SIN RED, RLS) con «la
 *    organización lo apagó»: un solo arranque sin internet apagaba la
 *    auto-apertura de la máquina de forma permanente y cerraba la pantalla;
 *    además dependía de estado de módulo que una recarga perdía. Se eliminó
 *    por completo. Si la organización apaga la pantalla desde otra máquina,
 *    la ventana abierta aquí simplemente muestra «Conectando… active la
 *    pantalla del cliente en Configuración › POS» y se cierra con «Cerrar»
 *    del indicador o al cerrar la app; y en el siguiente arranque volverá a
 *    abrirse en ese estado hasta que alguien toque el interruptor AQUÍ. Es
 *    un coste asumido a cambio de que un fallo de lectura nunca cambie nada.
 */

import { getDesktopBridge, type DesktopDisplayInfo, type DesktopPosDisplayBridge, type DesktopPosDisplayStatus } from '@/lib/utils/desktop';
import type { DisplayPresenceReason } from './presence';
import { STALE_AFTER_MS } from './transport';

/** localStorage: id del monitor elegido en esta máquina, o 'auto'. */
export const DESKTOP_DISPLAY_ID_STORAGE_KEY = 'pos_display_desktop_display_id';

/** Puente con lo que hace falta para elegir monitor y abrir en él (Desktop >= 0.2.1). */
export type DesktopDisplayPickerBridge = DesktopPosDisplayBridge &
  Required<Pick<DesktopPosDisplayBridge, 'listDisplays' | 'open' | 'setEnabled' | 'status'>>;

/** Puente de la pantalla del cliente si la app corre en Go Admin Desktop; null en navegador/SSR. */
export function getDesktopPosDisplayBridge(): DesktopPosDisplayBridge | null {
  const bridge = getDesktopBridge();
  const pos = bridge?.posDisplay;
  return typeof pos === 'object' && pos !== null ? pos : null;
}

/**
 * ¿El escritorio sabe listar monitores y abrir en uno concreto? Falso en el
 * navegador y en un Desktop < 0.2.1 (puente sin `listDisplays`): entonces la
 * UI no pinta selector ni estado y sigue el camino web.
 */
export function supportsDesktopDisplayPicker(bridge: DesktopPosDisplayBridge | null | undefined): bridge is DesktopDisplayPickerBridge {
  return (
    !!bridge &&
    typeof bridge.listDisplays === 'function' &&
    typeof bridge.open === 'function' &&
    typeof bridge.setEnabled === 'function' &&
    typeof bridge.status === 'function'
  );
}

/** ¿El puente informa del estado de la ventana (`status` + `onStatus`)? Independiente del selector. */
export function supportsDesktopDisplayStatus(
  bridge: DesktopPosDisplayBridge | null | undefined,
): bridge is DesktopPosDisplayBridge & Required<Pick<DesktopPosDisplayBridge, 'status' | 'onStatus'>> {
  return !!bridge && typeof bridge.status === 'function' && typeof bridge.onStatus === 'function';
}

// ── Validación de lo que cruza el IPC (se trata como no confiable) ──

export function isDesktopDisplayInfo(value: unknown): value is DesktopDisplayInfo {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Partial<DesktopDisplayInfo>;
  return (
    typeof d.id === 'number' &&
    Number.isInteger(d.id) &&
    typeof d.label === 'string' &&
    typeof d.isPrimary === 'boolean' &&
    typeof d.bounds === 'object' &&
    d.bounds !== null &&
    typeof d.bounds.width === 'number' &&
    typeof d.bounds.height === 'number'
  );
}

export function isDesktopPosDisplayStatus(value: unknown): value is DesktopPosDisplayStatus {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<DesktopPosDisplayStatus>;
  return typeof s.open === 'boolean' && (s.displayId === null || (typeof s.displayId === 'number' && Number.isInteger(s.displayId)));
}

/** Lista de monitores; [] si el puente no la tiene, falla o devuelve basura. Nunca lanza. */
export async function listDesktopDisplays(bridge: DesktopPosDisplayBridge | null | undefined): Promise<DesktopDisplayInfo[]> {
  if (!bridge || typeof bridge.listDisplays !== 'function') return [];
  try {
    const raw: unknown = await bridge.listDisplays();
    return Array.isArray(raw) ? raw.filter(isDesktopDisplayInfo) : [];
  } catch (err) {
    console.warn('[pos-display] el puente de escritorio no pudo listar los monitores', err);
    return [];
  }
}

/** Estado de la ventana; null si el puente no lo tiene, falla o devuelve basura. Nunca lanza. */
export async function readDesktopDisplayStatus(bridge: DesktopPosDisplayBridge | null | undefined): Promise<DesktopPosDisplayStatus | null> {
  if (!bridge || typeof bridge.status !== 'function') return null;
  try {
    const raw: unknown = await bridge.status();
    return isDesktopPosDisplayStatus(raw) ? raw : null;
  } catch (err) {
    console.warn('[pos-display] el puente de escritorio no pudo leer el estado de la pantalla', err);
    return null;
  }
}

/**
 * Suscripción al estado de la ventana (`onStatus`), filtrando payloads mal
 * formados. Devuelve la baja; sin `onStatus` devuelve un no-op.
 */
export function subscribeDesktopDisplayStatus(
  bridge: DesktopPosDisplayBridge | null | undefined,
  handler: (status: DesktopPosDisplayStatus) => void,
): () => void {
  if (!bridge || typeof bridge.onStatus !== 'function') return () => {};
  try {
    const off = bridge.onStatus((raw: unknown) => {
      if (isDesktopPosDisplayStatus(raw)) handler(raw);
    });
    return typeof off === 'function' ? off : () => {};
  } catch (err) {
    console.warn('[pos-display] no se pudo suscribir al estado de la pantalla', err);
    return () => {};
  }
}

// ── Etiqueta del monitor ──

export interface DisplayDescription {
  /** Nombre que da el SO (o `#id` si viene vacío). */
  name: string;
  /** «1920×1080». */
  size: string;
  isPrimary: boolean;
}

export function describeDisplay(display: DesktopDisplayInfo): DisplayDescription {
  const name = display.label.trim() || `#${display.id}`;
  return {
    name,
    size: `${Math.round(display.bounds.width)}×${Math.round(display.bounds.height)}`,
    isPrimary: display.isPrimary,
  };
}

/**
 * Texto de una opción del selector: «Nombre · 1920×1080» y, si es el
 * principal, «· principal» con la palabra traducida que pasa la UI.
 */
export function formatDisplayOption(display: DesktopDisplayInfo, primaryLabel: string): string {
  const { name, size, isPrimary } = describeDisplay(display);
  const base = `${name} · ${size}`;
  return isPrimary && primaryLabel.trim() ? `${base} · ${primaryLabel.trim()}` : base;
}

// ── Monitor elegido ──

/**
 * Monitor que debe mostrar el selector:
 *  1. el guardado en esta máquina, si sigue conectado;
 *  2. si no, el de la ventana abierta ahora mismo (`status.displayId`);
 *  3. si no, «automático» (null): el proceso principal elige el secundario.
 * Nunca se «adivina» un monitor concreto: automático ya hace lo correcto y
 * no deja guardado un id que dejaría de valer al cambiar de sitio el equipo.
 */
export function resolveSelectedDisplayId(
  displays: readonly DesktopDisplayInfo[],
  savedId: number | null,
  status: DesktopPosDisplayStatus | null,
): number | null {
  const exists = (id: number | null | undefined): id is number => typeof id === 'number' && displays.some((d) => d.id === id);
  if (exists(savedId)) return savedId;
  if (status?.open && exists(status.displayId)) return status.displayId;
  return null;
}

/** Monitor de la lista por id; undefined si no está (desconectado o automático). */
export function findDisplay(displays: readonly DesktopDisplayInfo[], id: number | null | undefined): DesktopDisplayInfo | undefined {
  return typeof id === 'number' ? displays.find((d) => d.id === id) : undefined;
}

/**
 * Qué pinta el selector para el monitor elegido:
 *  - 'auto': automático (null);
 *  - 'listed': un monitor que sigue conectado;
 *  - 'missing': el elegido ya no está en la lista (se desconectó, o la lista
 *    llegó vacía). NO se vuelve a automático ni se toca lo guardado: el
 *    selector muestra «Monitor #id (desconectado)» deshabilitado y, cuando el
 *    monitor vuelva, la elección sigue valiendo. Antes el Select de shadcn
 *    pintaba el trigger vacío.
 */
export type SelectedDisplayView =
  | { kind: 'auto' }
  | { kind: 'listed'; display: DesktopDisplayInfo }
  | { kind: 'missing'; id: number };

export function describeSelectedDisplay(displays: readonly DesktopDisplayInfo[], selectedId: number | null): SelectedDisplayView {
  if (selectedId === null) return { kind: 'auto' };
  const display = findDisplay(displays, selectedId);
  return display ? { kind: 'listed', display } : { kind: 'missing', id: selectedId };
}

/**
 * Qué dice la tarjeta de la VENTANA según `status()` del puente:
 *  - 'closed': no hay ventana;
 *  - 'windowed': abierta en modo ventana normal. El puente devuelve
 *    `displayId: null` SOLO en ese caso (un solo monitor);
 *  - 'on-listed': abierta en un monitor que está en la lista;
 *  - 'on-unknown': abierta en un monitor (id numérico) que NO está en la
 *    lista: se desconectó, la lista está desactualizada o el id es ajeno.
 *    Antes se etiquetaba como «ventana normal», que es otra cosa.
 */
export type WindowStatusView =
  | { kind: 'closed' }
  | { kind: 'windowed' }
  | { kind: 'on-listed'; display: DesktopDisplayInfo }
  | { kind: 'on-unknown'; id: number };

export function describeWindowStatus(status: DesktopPosDisplayStatus, displays: readonly DesktopDisplayInfo[]): WindowStatusView {
  if (!status.open) return { kind: 'closed' };
  if (status.displayId === null) return { kind: 'windowed' };
  const display = findDisplay(displays, status.displayId);
  return display ? { kind: 'on-listed', display } : { kind: 'on-unknown', id: status.displayId };
}

export interface DisplayIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Elección de monitor de ESTA máquina tal y como la conoce la web:
 * `known: false` = no hay copia local (nunca se eligió aquí, o la copia se
 * perdió: es por origen y el servidor embebido rota puertos); `known: true`
 * con `id: null` = el usuario eligió «Automático» a propósito; con número =
 * ese monitor. Al persistir en el proceso principal, «desconocido» viaja como
 * `undefined` (conserva lo guardado) y nunca como `null` (que lo pisaría).
 */
export interface DisplayChoice {
  known: boolean;
  id: number | null;
}

export const UNKNOWN_DISPLAY_CHOICE: Readonly<DisplayChoice> = Object.freeze({ known: false, id: null });

/** Lo que se manda a `setEnabled` por esta elección: undefined si no se conoce, si no el id (null = automático). */
export function displayChoiceToPersist(choice: DisplayChoice): number | null | undefined {
  return choice.known ? choice.id : undefined;
}

/**
 * Elección guardada en esta máquina. 'auto' explícito → conocida y
 * automática; un entero decimal estricto y no negativo (`/^\d+$/`,
 * `Number.parseInt` y vuelta idéntica: sin exponente, base, espacios, signo
 * ni ceros a la izquierda) → conocida y ese monitor; ausente, basura ('',
 * ' ', '1e3', '0x10', '02', '-1') o storage roto → desconocida (no se
 * distingue «nunca eligió» de «copia perdida»: en ambos casos lo correcto es
 * no pisar el monitor del proceso principal). Se exige >= 0 porque es lo que
 * acepta `parseDisplayId` en electron/src/main/posDisplayIpc.ts: un id que
 * el IPC rechazaría haría que «Abrir ahora» cayera en silencio a la web.
 */
export function readSavedDisplayChoice(storage: DisplayIdStorage | null | undefined): DisplayChoice {
  if (!storage) return { ...UNKNOWN_DISPLAY_CHOICE };
  try {
    const raw = storage.getItem(DESKTOP_DISPLAY_ID_STORAGE_KEY);
    if (raw === null) return { ...UNKNOWN_DISPLAY_CHOICE };
    if (raw === 'auto') return { known: true, id: null };
    // Solo dígitos: `Number('')` y `Number(' ')` valen 0, y `Number('1e3')` / `Number('0x10')` convierten;
    // un 0 «conocido» viajaba a setEnabled y pisaba el monitor guardado con uno inexistente.
    if (!/^\d+$/.test(raw)) return { ...UNKNOWN_DISPLAY_CHOICE };
    const id = Number.parseInt(raw, 10);
    // `String(id) === raw` rechaza '02' y lo que exceda el rango seguro (se «normalizaría» a otro id).
    return Number.isSafeInteger(id) && String(id) === raw ? { known: true, id } : { ...UNKNOWN_DISPLAY_CHOICE };
  } catch {
    return { ...UNKNOWN_DISPLAY_CHOICE };
  }
}

/** Monitor guardado en esta máquina; null si no hay, es 'auto' o el storage falla. Atajo de `readSavedDisplayChoice(...).id`. */
export function readSavedDisplayId(storage: DisplayIdStorage | null | undefined): number | null {
  return readSavedDisplayChoice(storage).id;
}

/**
 * Guarda la elección: número → ese monitor; `known` con `null` → 'auto'
 * explícito; desconocida → se borra la copia. Nunca lanza.
 */
export function saveDisplayChoice(storage: DisplayIdStorage | null | undefined, choice: DisplayChoice): void {
  if (!storage) return;
  try {
    if (!choice.known) storage.removeItem(DESKTOP_DISPLAY_ID_STORAGE_KEY);
    else storage.setItem(DESKTOP_DISPLAY_ID_STORAGE_KEY, choice.id === null ? 'auto' : String(choice.id));
  } catch {
    // Storage bloqueado o lleno: el proceso principal ya lo guardó; solo se pierde la preselección.
  }
}

/**
 * Guarda el monitor elegido; `null` OLVIDA la copia local (vuelve a
 * «desconocido»), no marca automático. Para «automático elegido a propósito»
 * usar `saveDisplayChoice(storage, { known: true, id: null })`.
 */
export function saveDisplayId(storage: DisplayIdStorage | null | undefined, id: number | null): void {
  saveDisplayChoice(storage, id === null ? { ...UNKNOWN_DISPLAY_CHOICE } : { known: true, id });
}

function defaultStorage(): DisplayIdStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Atajos con el localStorage real (navegador); en Node devuelven null / desconocido / no hacen nada. */
export function readSavedDisplayIdFromBrowser(): number | null {
  return readSavedDisplayId(defaultStorage());
}
export function readSavedDisplayChoiceFromBrowser(): DisplayChoice {
  return readSavedDisplayChoice(defaultStorage());
}
export function saveDisplayIdInBrowser(id: number | null): void {
  saveDisplayId(defaultStorage(), id);
}
export function saveDisplayChoiceInBrowser(choice: DisplayChoice): void {
  saveDisplayChoice(defaultStorage(), choice);
}

/**
 * Persiste en el proceso principal «abrir sola al arrancar» + monitor. Es el
 * ÚNICO camino por el que la web escribe `config.json` (cabecera, punto 4) y
 * solo se llama desde una acción del usuario en esta máquina: interruptor o
 * selector de la tarjeta, o «Activar y abrir» (`enableDesktopDisplayHere`).
 * `enabled` es el interruptor de la organización que el usuario acaba de
 * GUARDAR (o el que la tarjeta leyó con éxito, al cambiar solo el monitor);
 * `displayId` el de esta máquina: número = ese monitor, `null` = automático
 * elegido a propósito, `undefined` = no se conoce y el proceso principal
 * conserva el que tenía (posDisplayIpc.ts). Sin memo ni deduplicación: cada
 * acción del usuario manda exactamente una escritura. Devuelve false si el
 * puente no lo soporta o falla; nunca lanza: el ajuste de la organización ya
 * quedó guardado y eso es lo que manda.
 */
export async function persistDesktopDisplayChoice(
  bridge: DesktopPosDisplayBridge | null | undefined,
  enabled: boolean,
  displayId: number | null | undefined,
): Promise<boolean> {
  if (!bridge || typeof bridge.setEnabled !== 'function') return false;
  try {
    await bridge.setEnabled(enabled, displayId);
    return true;
  } catch (err) {
    console.warn('[pos-display] el puente de escritorio no pudo guardar el monitor', err);
    return false;
  }
}

// ── Ventana abierta sin señal ──

export type DesktopWindowSignal =
  /** Sin puente con `status`, o la ventana está cerrada: no hay nada que decir. */
  | 'none'
  /** La ventana está abierta y la pantalla habla (o aún está en el periodo de gracia). */
  | 'open'
  /** La ventana lleva abierta ≥ gracia sin `display_alive`: canal roto. */
  | 'open-no-signal';

/**
 * Criterio puro de «Pantalla abierta, sin señal»: ventana abierta según el
 * puente, la caja EMITIENDO (`emitting` de la presencia: interruptor de la
 * organización encendido y transporte abierto), sin presencia por el relay y
 * con más de `graceMs` (STALE_AFTER_MS, 3 s: lo que tarda la pantalla en
 * cargar y anunciarse) desde que se supo que abrió. `openedAt` es el instante
 * en que `status.open` pasó a true (o en que se leyó abierto por primera
 * vez); null si nunca se vio abierta.
 *
 * Con `emitting === false` (interruptor apagado, o aún cargando) devuelve
 * 'open' sin acusar: no hay señal porque la caja no habla, no porque el canal
 * esté roto; el indicador dirá «desactivada» (o nada mientras carga). El
 * valor por defecto (true) solo existe para llamadas antiguas; el hook lo
 * pasa siempre. `emittingSince` es el instante en que `emitting` pasó a true
 * (null si no emite o no se sabe): la gracia corre desde
 * `max(openedAt, emittingSince)`, no solo desde la apertura.
 */
export function resolveDesktopWindowSignal(
  status: DesktopPosDisplayStatus | null,
  connected: boolean,
  openedAt: number | null,
  now: number,
  graceMs: number = STALE_AFTER_MS,
  emitting: boolean = true,
  emittingSince: number | null = null,
): DesktopWindowSignal {
  if (!status?.open) return 'none';
  if (connected) return 'open';
  if (!emitting) return 'open';
  if (openedAt === null) return 'open';
  // La gracia se cuenta desde lo ÚLTIMO que pasó: abrir la ventana o empezar a emitir. Si la
  // caja empieza a emitir con la ventana ya abierta (auto-apertura al arrancar + «Activar y
  // abrir»; o el emisor de /app/pos arranca después de resolver moneda e interruptor), el
  // display_alive tarda hasta 1 s en llegar y contar solo desde la apertura pintaba ámbar.
  const sinceAt = emittingSince === null ? openedAt : Math.max(openedAt, emittingSince);
  if (now - sinceAt < graceMs) return 'open';
  return 'open-no-signal';
}

/**
 * ¿«Cerrar» del indicador no tiene nada que cerrar? Se deshabilita solo
 * cuando no hay presencia, ni ventana propia de esta pestaña, ni un puente
 * que sepa cerrar CON ventana abierta confirmada. `windowOpen` es
 * `status().open` del puente; `undefined` (el puente aún no respondió, o no
 * tiene `status`) NO cuenta como ventana: entre el montaje de /app/pos y la
 * respuesta de `status()` «Cerrar» queda deshabilitado en vez de ofrecer un
 * no-op, y en cuanto `status()` responde se habilita si procede. Antes, en
 * escritorio, «Cerrar» estaba siempre habilitado aunque no hubiera ventana.
 */
export function resolveNothingToClose(input: {
  connected: boolean;
  hasOwnWindow: boolean;
  bridgeCanClose: boolean;
  windowOpen: boolean | undefined;
}): boolean {
  const bridgeHasWindow = input.bridgeCanClose && input.windowOpen === true;
  return !input.connected && !input.hasOwnWindow && !bridgeHasWindow;
}

/**
 * De dónde viene un estado de ventana:
 *  - 'read': respuesta a `status()` (lectura a demanda; puede repetir el
 *    mismo estado muchas veces);
 *  - 'event': `onStatus` (el proceso principal solo lo emite al ABRIR y al
 *    CERRAR la ventana, `posDisplayWindow.ts` `emitStatus`; traer al frente
 *    no emite). Un evento con `open: true` es siempre una apertura real.
 */
export type DesktopStatusSource = 'read' | 'event';

/**
 * Instante de apertura tras un cambio de estado: se fija cuando la ventana
 * pasa de cerrada (o desconocida) a abierta, se conserva mientras siga
 * abierta en el MISMO monitor y se borra al cerrarse. Se REINICIA (vuelve a
 * ser `now`) cuando hubo una reapertura: «Abrir ahora» con la ventana en otro
 * monitor la cierra y reabre tan rápido que la caja puede ver open→open; se
 * detecta por un `displayId` distinto o porque el estado llegó por `onStatus`
 * (`source: 'event'`, que solo se emite al abrir o cerrar). Sin el reinicio,
 * la gracia de «sin señal» ya habría vencido para la ventana nueva y el
 * indicador pintaría ámbar mientras la pantalla aún carga. Puro para que el
 * hook no tenga que razonar.
 */
export function nextOpenedAt(
  previous: DesktopPosDisplayStatus | null,
  next: DesktopPosDisplayStatus | null,
  openedAt: number | null,
  now: number,
  source: DesktopStatusSource = 'read',
): number | null {
  if (!next?.open) return null;
  if (source === 'event') return now;
  if (previous?.open && openedAt !== null && previous.displayId === next.displayId) return openedAt;
  return now;
}

/** Qué pinta el indicador de la caja, en orden de prioridad. */
export type CustomerDisplayIndicatorState =
  /** Hay `display_alive` por el relay: la pantalla refleja la caja. */
  | 'connected'
  /** El interruptor de la organización está leído y APAGADO. */
  | 'disabled'
  /** La caja emite, la ventana existe según el puente y lleva ≥ gracia sin señal. */
  | 'open-no-signal'
  /** Nada de lo anterior: sin pantalla (o aún cargando). */
  | 'disconnected';

/**
 * Orden canónico del indicador: conectada → desactivada → abierta sin señal
 * → sin pantalla. «Abierta sin señal» NUNCA se antepone a `reason`
 * 'disabled' ni 'loading' (ni a 'unsupported'): solo cuenta con la caja
 * emitiendo (`reason === null`). Con la organización apagada y la ventana
 * abierta (auto-apertura al arrancar, «Abrir ahora» para probarla) el
 * indicador dice «Pantalla desactivada» con «Activar y abrir»; mientras el
 * interruptor carga, «Sin pantalla». Puro; el indicador solo lo pinta.
 */
export function resolveIndicatorState(input: {
  connected: boolean;
  reason: DisplayPresenceReason;
  signal: DesktopWindowSignal;
}): CustomerDisplayIndicatorState {
  if (input.connected) return 'connected';
  if (input.reason === 'disabled') return 'disabled';
  if (input.reason === null && input.signal === 'open-no-signal') return 'open-no-signal';
  return 'disconnected';
}

/**
 * «Activar y abrir» desde el indicador del POS: además de encender la
 * organización, persiste `enabled = true` en config.json de ESTA máquina
 * (abrir sola al arrancar) con el monitor que ya estuviera elegido aquí
 * (copia local; sin copia viaja `undefined` y el proceso principal conserva
 * el suyo). Es una acción explícita del usuario en esta máquina, igual que el
 * interruptor de la tarjeta: la regla «nunca se enciende por sincronía» no
 * aplica. Devuelve si el puente lo guardó; nunca lanza ni bloquea la apertura.
 */
export async function enableDesktopDisplayHere(
  bridge: DesktopPosDisplayBridge | null | undefined,
  storage: DisplayIdStorage | null | undefined,
): Promise<boolean> {
  return persistDesktopDisplayChoice(bridge, true, displayChoiceToPersist(readSavedDisplayChoice(storage)));
}

/**
 * «Abrir ahora» con la ventana YA abierta: el proceso principal solo la trae
 * al frente (`openPosDisplay` → `bringToFront`, ignora el `displayId`
 * pedido), así que para moverla hay que cerrarla y reabrirla. Devuelve true
 * cuando toca cerrar y reabrir: hay ventana abierta, la elección es conocida
 * y NUMÉRICA, y la ventana no está ya en ese monitor. Una ventana en modo
 * normal (`displayId: null`: al abrirla había un solo monitor) con un monitor
 * numérico elegido SÍ se cierra y reabre: el monitor pudo conectarse después
 * y la ventana debe poder reubicarse a pantalla completa en él. Solo
 * «Automático» (`id: null`) o una elección desconocida no mueven nada, porque
 * no piden ningún monitor concreto.
 */
export function needsReopenForDisplayChange(status: DesktopPosDisplayStatus | null | undefined, choice: DisplayChoice): boolean {
  if (!status?.open) return false;
  if (!choice.known || typeof choice.id !== 'number') return false;
  return status.displayId !== choice.id;
}
