/**
 * Número del pedido web configurable por organización (POS › Pedidos online › Número de pedido).
 * PURO: sin base ni red. Lo usan el ERP (pedido manual, reconstrucción, pagos sin pedido, la
 * pantalla de ajustes) y sus pruebas; la tienda (goadmin-websites) tiene su propia copia de
 * `numeroLegado` y del manejo del choque, y ambos llaman al mismo RPC.
 *
 * Formatos:
 * - `actual` (por defecto): `WO-{orgId}-{Date.now() base 36}-{4 al azar}`, el de siempre.
 * - `consecutivo`: `PREFIJO-0001`. El RPC `siguiente_numero_pedido_web` lo entrega de forma
 *   atómica (bloquea la fila de ajustes de la organización); un pedido que falla al guardarse
 *   deja un hueco en la serie, nunca un repetido.
 * - `corto`: `PREFIJO-XXXXXX`, seis caracteres sin los que se confunden (0/O, 1/I).
 *
 * El número es la referencia que viaja a la pasarela, y la tienda y el ERP encuentran el pedido
 * de un cobro buscándolo por `order_number` en `web_orders`. Por eso el número es ÚNICO en toda la
 * base (no solo en la organización): las organizaciones 333 y 339 comparten el comercio de Wompi,
 * y dos pedidos «PED-0001» de tiendas distintas serían el mismo cobro para la pasarela. Lo
 * garantizan dos cosas: el prefijo es de una sola organización (índice único) y `order_number`
 * tiene índice único.
 */

export type FormatoNumeroPedido = 'actual' | 'consecutivo' | 'corto';

export const FORMATOS_NUMERO_PEDIDO: readonly FormatoNumeroPedido[] = ['actual', 'consecutivo', 'corto'];

export interface AjustesNumeroPedido {
  formato: FormatoNumeroPedido;
  /** null en el formato `actual` (el prefijo se libera para otra tienda). */
  prefijo: string | null;
}

export const AJUSTES_NUMERO_POR_DEFECTO: AjustesNumeroPedido = { formato: 'actual', prefijo: null };

/**
 * Prefijos que ya significan otra cosa en las referencias de pago. El webhook de la tienda enruta
 * por ellos ANTES de buscar el pedido (`RES-` reservas, `MEM-` membresías, `TKT-` tiquetes, `PKP-`
 * parqueadero, `INV-` facturas, `MESA-` depósitos, `CQR-` abonos de mesa) y el ERP arma con ellos
 * sus propios cobros (`CHG-` cambios de productos, `PAGO-`, `POS-`, `PMS-`, `GO-`, envíos `DEL-`…).
 * `WO` es el del formato actual: `WO-5-0001` se leería como un pedido viejo de la organización 5.
 * Basta con mirar el primer tramo: `startsWith('RES-')` acierta justo cuando ese tramo es `RES`.
 */
export const PREFIJOS_RESERVADOS: readonly string[] = [
  'WO', 'RES', 'MEM', 'TKT', 'PKP', 'INV', 'MESA', 'CQR', 'CHG', 'PAGO', 'POS', 'PMS', 'GO', 'DEL',
  'INST', 'SP', 'TEST', 'WEB', 'COMP', 'VEND',
];

/** 2–10 caracteres A-Z, 0-9 y guion; sin guion al principio, al final ni doble. */
const RE_PREFIJO_VALIDO = /^[A-Z0-9][A-Z0-9-]{0,8}[A-Z0-9]$/;

/** Sin 0/O ni 1/I: el cliente lo dicta por teléfono o lo copia de un pantallazo. */
export const ALFABETO_CORTO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO_CORTO = 6;

const RE_LEGADO_ORG = /^WO-(\d+)-/i;
const RE_LEGADO_NUMERO = /^WO-\d+-[A-Z0-9]+-[A-Z0-9]{4}$/i;

export function normalizarPrefijo(valor: unknown): string {
  return String(valor ?? '').trim().toUpperCase();
}

export type ErrorPrefijo = 'formato' | 'reservado';

/** null si el prefijo sirve. Recibe el prefijo ya normalizado. */
export function validarPrefijo(prefijo: string): ErrorPrefijo | null {
  if (!RE_PREFIJO_VALIDO.test(prefijo) || prefijo.includes('--')) return 'formato';
  if (PREFIJOS_RESERVADOS.includes(prefijo.split('-')[0])) return 'reservado';
  return null;
}

export type ErrorAjustes = ErrorPrefijo | 'formato_desconocido' | 'sin_prefijo';

/** Valida y normaliza lo que llega de la pantalla. En `actual` el prefijo se descarta. */
export function normalizarAjustesNumero(entrada: { formato?: unknown; prefijo?: unknown }):
  | { ok: true; ajustes: AjustesNumeroPedido }
  | { ok: false; error: ErrorAjustes } {
  const formato = String(entrada.formato ?? '') as FormatoNumeroPedido;
  if (!FORMATOS_NUMERO_PEDIDO.includes(formato)) return { ok: false, error: 'formato_desconocido' };
  if (formato === 'actual') return { ok: true, ajustes: { formato, prefijo: null } };
  const prefijo = normalizarPrefijo(entrada.prefijo);
  if (!prefijo) return { ok: false, error: 'sin_prefijo' };
  const error = validarPrefijo(prefijo);
  return error ? { ok: false, error } : { ok: true, ajustes: { formato, prefijo } };
}

// ─── Generación ─────────────────────────────────────────────────────────────

/** `WO-{orgId}-{ts36}-{rand4}`, el formato de siempre. `ahora` y `azar` existen para las pruebas. */
export function numeroLegado(organizationId: number, ahora: number = Date.now(), azar: () => number = Math.random): string {
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error('organizationId inválido');
  const ts = ahora.toString(36).toUpperCase();
  const rand = azar().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0');
  return `WO-${organizationId}-${ts}-${rand}`;
}

/** `PREFIJO-0001`; desde el 10000 sigue sin recortar (`PREFIJO-10000`). Igual que el RPC. */
export function numeroConsecutivo(prefijo: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error('consecutivo inválido');
  return `${prefijo}-${String(n).padStart(4, '0')}`;
}

export function codigoCorto(azar: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < LARGO_CODIGO_CORTO; i++) s += ALFABETO_CORTO[Math.floor(azar() * ALFABETO_CORTO.length) % ALFABETO_CORTO.length];
  return s;
}

/** Ejemplo para la pantalla de ajustes («Así se verá»). */
export function ejemploNumero(ajustes: AjustesNumeroPedido, organizationId: number): string {
  if (ajustes.formato === 'actual' || !ajustes.prefijo) return numeroLegado(organizationId, 1_763_000_000_000, () => 0.5);
  return ajustes.formato === 'consecutivo' ? numeroConsecutivo(ajustes.prefijo, 1) : `${ajustes.prefijo}-K7M2QX`;
}

// ─── ¿De qué organización es una referencia de pago? ────────────────────────

/** Organización del prefijo viejo `WO-{orgId}-`; null si la referencia no lo trae. */
export function organizacionLegado(referencia: string | null | undefined): number | null {
  const m = RE_LEGADO_ORG.exec(String(referencia ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ¿Tiene la forma completa de un número de la tienda en el formato viejo? */
export function esNumeroLegado(referencia: string | null | undefined): boolean {
  return RE_LEGADO_NUMERO.test(String(referencia ?? '').trim());
}

/** ¿Es `PREFIJO-0001` o `PREFIJO-XXXXXX` de ese prefijo? */
export function esNumeroDelPrefijo(referencia: string | null | undefined, prefijo: string): boolean {
  const ref = String(referencia ?? '').trim().toUpperCase();
  if (!ref.startsWith(`${prefijo}-`)) return false;
  const resto = ref.slice(prefijo.length + 1);
  return /^\d{4,}$/.test(resto) || new RegExp(`^[${ALFABETO_CORTO}]{${LARGO_CODIGO_CORTO}}$`).test(resto);
}

/**
 * Prefijos que podría tener una referencia: cada tramo antes de un guion
 * (`MI-TIENDA-0001` → `MI`, `MI-TIENDA`), solo los que pasan la validación.
 */
export function prefijosCandidatos(referencia: string | null | undefined): string[] {
  const ref = String(referencia ?? '').trim().toUpperCase();
  const salida: string[] = [];
  for (let i = ref.indexOf('-'); i > 0; i = ref.indexOf('-', i + 1)) {
    const p = ref.slice(0, i);
    if (p.length > 10) break;
    if (validarPrefijo(p) === null) salida.push(p);
  }
  return salida;
}

export interface ReferenciaResuelta {
  /** null: no se sabe de qué tienda es (o la base tiene el número en dos, lo que no debería pasar). */
  organizacion: number | null;
  fuente: 'pedido' | 'legado' | 'prefijo' | null;
  /** Tiene la forma de un número de pedido de esa tienda: se puede crear el pedido con ese número. */
  numeroDeTienda: boolean;
}

/**
 * Organización de una referencia de pago, en este orden:
 *  1. el pedido que ya tiene ese `order_number` (cualquier formato, viejo o nuevo);
 *  2. el prefijo viejo `WO-{orgId}-` (pedidos que la tienda perdió, números de antes);
 *  3. la tienda dueña del prefijo configurado, si la referencia tiene su forma.
 * @param pedidos pedidos que la base devolvió para ese número (de cualquier organización).
 * @param prefijos ajustes de numeración cuyos prefijos están en `prefijosCandidatos(referencia)`.
 */
export function resolverOrganizacionReferencia(entrada: {
  referencia: string | null | undefined;
  pedidos?: ReadonlyArray<{ organization_id: number; order_number: string }>;
  prefijos?: ReadonlyArray<{ organization_id: number; prefix: string | null }>;
}): ReferenciaResuelta {
  const ref = String(entrada.referencia ?? '').trim();
  if (!ref) return { organizacion: null, fuente: null, numeroDeTienda: false };
  const mismos = (entrada.pedidos ?? []).filter((p) => String(p.order_number).trim().toUpperCase() === ref.toUpperCase());
  const orgs = Array.from(new Set(mismos.map((p) => Number(p.organization_id))));
  if (orgs.length === 1) return { organizacion: orgs[0], fuente: 'pedido', numeroDeTienda: true };
  if (orgs.length > 1) return { organizacion: null, fuente: null, numeroDeTienda: false };

  const legado = organizacionLegado(ref);
  if (legado !== null) return { organizacion: legado, fuente: 'legado', numeroDeTienda: esNumeroLegado(ref) };

  const duenos = (entrada.prefijos ?? []).filter((p) => p.prefix && esNumeroDelPrefijo(ref, p.prefix));
  // El prefijo más largo gana (`MI-TIENDA` antes que `MI`), aunque con prefijos únicos y números
  // que terminan en dígitos o en el código corto no deberían coincidir dos.
  duenos.sort((a, b) => String(b.prefix).length - String(a.prefix).length);
  if (duenos[0]) return { organizacion: Number(duenos[0].organization_id), fuente: 'prefijo', numeroDeTienda: true };
  return { organizacion: null, fuente: null, numeroDeTienda: false };
}
