/**
 * Lista de «Métodos de pago» (Figma `1010:85721` escritorio y `1010:86844`
 * móvil): de qué datos sale cada parte de la fila o tarjeta. Sin React ni
 * Supabase; solo PRESENTA lo que ya guardan las tablas, no decide cobros.
 *
 * - Nombre y referencia: `nombreVisibleMetodo` / `requiereReferenciaMetodo`
 *   (lo de la organización en `settings`, si no el catálogo global).
 * - «Entra a»: `settings.account_mapping.bank_account_id` (lo escribe el
 *   formulario del método) → `bank_accounts`; el efectivo entra a la caja del
 *   turno; una pasarela entra según su liquidación (`integration_connection_id`
 *   o `settings.gateway`); el crédito queda en cuenta por cobrar.
 * - Caja abierta: NO es por método. Es `pos_require_cash_session` de la
 *   organización, que el POS exige para cobrar con cualquier método
 *   (`src/lib/pos/venta/requisitosCarrito.ts`). Por eso la fila dice
 *   «Obligatoria» en todo método activo cuando la organización la exige.
 * - Canales: el POS lee los métodos con `is_active` (`posService.getPaymentMethods`)
 *   y la tienda los que tienen `is_active` Y `show_on_website` (checkout de
 *   goadmin-websites). «Activa» = `is_active`.
 * - «Usados y sin configurar»: códigos con pagos (`payments.method`) sin fila
 *   en la organización, o con fila pero sin destino del dinero (ni caja, ni
 *   banco, ni pasarela conectada, ni cuenta por cobrar).
 */
import { nombreVisibleMetodo, ordenarMetodosDeLaOrganizacion, requiereReferenciaMetodo } from './metodosPagoOrganizacion';

export type TipoMetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'billetera' | 'pasarela' | 'credito' | 'otro';

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Tipo del método por su código (el catálogo no guarda un tipo). */
export function tipoMetodoPago(codigo: string | null | undefined): TipoMetodoPago {
  const c = sinTildes(codigo ?? '');
  if (/^(cash|efectivo|contado)$/.test(c)) return 'efectivo';
  if (/(credit.?note|nota)/.test(c)) return 'otro';
  if (/(card|tarjeta|datafono|debit|debito|visa|master)/.test(c)) return 'tarjeta';
  if (/^(credit|credito)$|(sistecredito|addi|fiado|cartera)/.test(c)) return 'credito';
  if (/(nequi|daviplata|movii|yape|plin|billetera|wallet)/.test(c)) return 'billetera';
  if (/(wompi|payu|stripe|^mp$|mercado.?pago|paypal|conekta|bold|epayco|qr|bre.?b|redeban)/.test(c)) return 'pasarela';
  if (/(transfer|transferencia|pse|bank|banco|consignacion|ach|spei)/.test(c)) return 'transferencia';
  return 'otro';
}

/** Métodos que se cobran por una conexión (pasarela) y tienen asistente en Conexiones. */
export const CODIGOS_PASARELA = ['payu', 'stripe', 'mp', 'mercadopago', 'wompi', 'conekta', 'paypal'] as const;

export function esPasarelaConectable(codigo: string): boolean {
  return (CODIGOS_PASARELA as readonly string[]).includes(codigo.toLowerCase());
}

export interface CuentaBancariaBasica {
  id: number;
  name: string | null;
  bank_name: string | null;
  account_number: string | null;
}

export interface ConexionBasica {
  id: string;
  name: string | null;
  status: string | null;
}

/** Fila de `organization_payment_methods` (con su método del catálogo) que usa la lista. */
export interface MetodoOrganizacionLista {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean | null;
  settings?: Record<string, unknown> | null;
  integration_connection_id?: string | null;
  show_on_website?: boolean | null;
  website_display_order?: number | null;
  branch_ids?: number[] | null;
  payment_method?: { name?: string | null; requires_reference?: boolean | null; is_system?: boolean | null } | null;
}

export type DestinoMetodo =
  | { tipo: 'caja' }
  | { tipo: 'banco'; banco: string | null; ultimos: string | null }
  | { tipo: 'pasarela'; conectada: boolean; conexion: string | null }
  | { tipo: 'cxc' }
  | { tipo: 'sinDestino' };

export type ReferenciaMetodo = 'obligatoria' | 'opcional' | 'automatica' | 'noAplica';

export interface FilaMetodoPago {
  /** `org-<id>` para las configuradas, `uso-<código>` para las usadas sin configurar. */
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoMetodoPago;
  destino: DestinoMetodo;
  referencia: ReferenciaMetodo;
  cajaObligatoria: boolean;
  canales: { pos: boolean; web: boolean };
  activo: boolean;
  esSistema: boolean;
  /** Pagos registrados con el código; `null` si no se pudieron contar. */
  pagos: number | null;
  /** Usada y sin configuración completa: entra al filtro «Revisar». */
  incompleta: boolean;
  /** No tiene fila en la organización (solo aparece por sus pagos). */
  sinConfigurar: boolean;
  /** Fila original (las sin configurar no tienen). */
  original: MetodoOrganizacionLista | null;
}

function ajustes(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
}

function mapeoContable(settings: unknown): Record<string, unknown> {
  return ajustes(ajustes(settings).account_mapping);
}

/** Últimos 4 dígitos de un número de cuenta («··4321»). */
export function ultimosDigitos(numero: string | null | undefined): string | null {
  const solo = (numero ?? '').replace(/\D/g, '');
  return solo.length > 0 ? solo.slice(-4) : null;
}

export function destinoDelMetodo(
  m: MetodoOrganizacionLista,
  bancos: ReadonlyMap<number, CuentaBancariaBasica>,
  conexiones: ReadonlyMap<string, ConexionBasica>,
): DestinoMetodo {
  const tipo = tipoMetodoPago(m.payment_method_code);
  const mapeo = mapeoContable(m.settings);
  const idBanco = Number(mapeo.bank_account_id);
  if (Number.isInteger(idBanco) && idBanco > 0) {
    const b = bancos.get(idBanco);
    return { tipo: 'banco', banco: b ? (b.bank_name || b.name || null) : null, ultimos: b ? ultimosDigitos(b.account_number) : null };
  }
  if (tipo === 'efectivo') return { tipo: 'caja' };
  const pasarela = typeof ajustes(m.settings).gateway === 'string' && (ajustes(m.settings).gateway as string).trim() !== '';
  if (m.integration_connection_id) {
    const c = conexiones.get(m.integration_connection_id);
    return { tipo: 'pasarela', conectada: true, conexion: c?.name ?? null };
  }
  if (pasarela) return { tipo: 'pasarela', conectada: true, conexion: null };
  if (tipo === 'pasarela') return { tipo: 'pasarela', conectada: false, conexion: null };
  if (tipo === 'credito' || (typeof mapeo.receivable_account === 'string' && mapeo.receivable_account !== '')) return { tipo: 'cxc' };
  return { tipo: 'sinDestino' };
}

/** Sin destino conocido o pasarela sin conectar: el dinero no tiene a dónde entrar. */
export function destinoIncompleto(d: DestinoMetodo): boolean {
  return d.tipo === 'sinDestino' || (d.tipo === 'pasarela' && !d.conectada);
}

export interface EntradaFilas {
  metodos: readonly MetodoOrganizacionLista[];
  bancos: readonly CuentaBancariaBasica[];
  conexiones: readonly ConexionBasica[];
  /** `pos_require_cash_session` de la organización (por defecto el POS la exige). */
  exigeCaja: boolean;
  /** Pagos por código (`payments.method`); `null` si no se pudieron contar. */
  usoPorMetodo: Readonly<Record<string, number>> | null;
  /** Nombres del catálogo para los códigos usados sin fila. */
  catalogo?: ReadonlyArray<{ code: string; name: string }>;
}

/**
 * Filas de la lista en el orden de la organización (`website_display_order`,
 * el mismo que lee el POS) y, al final, los códigos usados sin configurar,
 * de más a menos pagos.
 */
export function construirFilasMetodos(e: EntradaFilas): FilaMetodoPago[] {
  const bancos = new Map(e.bancos.map((b) => [b.id, b]));
  const conexiones = new Map(e.conexiones.map((c) => [c.id, c]));
  const pagosDe = (codigo: string): number | null => (e.usoPorMetodo ? e.usoPorMetodo[codigo] ?? 0 : null);

  const configuradas: FilaMetodoPago[] = ordenarMetodosDeLaOrganizacion([...e.metodos]).map((m) => {
    const tipo = tipoMetodoPago(m.payment_method_code);
    const destino = destinoDelMetodo(m, bancos, conexiones);
    const activo = m.is_active !== false;
    const pagos = pagosDe(m.payment_method_code);
    const pideReferencia = requiereReferenciaMetodo(m.settings, m.payment_method?.requires_reference);
    const referencia: ReferenciaMetodo =
      destino.tipo === 'pasarela' ? 'automatica' : pideReferencia ? 'obligatoria' : tipo === 'efectivo' ? 'noAplica' : 'opcional';
    return {
      id: `org-${m.id}`,
      codigo: m.payment_method_code,
      nombre: nombreVisibleMetodo(m.settings, m.payment_method?.name, m.payment_method_code),
      tipo,
      destino,
      referencia,
      cajaObligatoria: activo && e.exigeCaja,
      canales: { pos: activo, web: activo && m.show_on_website === true },
      activo,
      esSistema: Boolean(m.payment_method?.is_system),
      pagos,
      incompleta: (pagos ?? 0) > 0 && destinoIncompleto(destino),
      sinConfigurar: false,
      original: m,
    };
  });

  const propios = new Set(e.metodos.map((m) => m.payment_method_code));
  const nombres = new Map((e.catalogo ?? []).map((c) => [c.code, c.name]));
  const usadas: FilaMetodoPago[] = Object.entries(e.usoPorMetodo ?? {})
    .filter(([codigo, n]) => n > 0 && codigo.trim() !== '' && !propios.has(codigo))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([codigo, n]) => ({
      id: `uso-${codigo}`,
      codigo,
      nombre: nombres.get(codigo)?.trim() || codigo,
      tipo: tipoMetodoPago(codigo),
      destino: { tipo: 'sinDestino' } as const,
      referencia: 'noAplica' as const,
      cajaObligatoria: false,
      canales: { pos: false, web: false },
      activo: false,
      esSistema: false,
      pagos: n,
      incompleta: true,
      sinConfigurar: true,
      original: null,
    }));

  return [...configuradas, ...usadas];
}

export interface ResumenMetodos {
  activos: number;
  /** Métodos usados y sin configurar (los del aviso y del filtro «Revisar»). */
  incompletos: number;
  pagosIncompletos: number;
  /** «Nequi (590), Daviplata (66)» — hasta 4 nombres. */
  detalle: Array<{ nombre: string; pagos: number }>;
}

export function resumirMetodos(filas: readonly FilaMetodoPago[]): ResumenMetodos {
  const incompletas = filas.filter((f) => f.incompleta);
  return {
    activos: filas.filter((f) => !f.sinConfigurar && f.activo).length,
    incompletos: incompletas.length,
    pagosIncompletos: incompletas.reduce((s, f) => s + (f.pagos ?? 0), 0),
    detalle: incompletas.slice(0, 4).map((f) => ({ nombre: f.nombre, pagos: f.pagos ?? 0 })),
  };
}

export function filtrarFilasMetodos(filas: readonly FilaMetodoPago[], soloRevisar: boolean): FilaMetodoPago[] {
  return soloRevisar ? filas.filter((f) => f.incompleta) : [...filas];
}

/**
 * Nuevo orden al subir o bajar una fila configurada (las sin configurar no se
 * ordenan). Devuelve los ids de `organization_payment_methods` en su nuevo
 * orden, o `null` si no se mueve.
 */
export function moverMetodo(filas: readonly FilaMetodoPago[], id: string, direccion: -1 | 1): number[] | null {
  const configuradas = filas.filter((f) => f.original);
  const i = configuradas.findIndex((f) => f.id === id);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= configuradas.length) return null;
  const orden = configuradas.map((f) => f.original!.id);
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return orden;
}

/** Estado de la lista: un error de carga no es «no hay métodos». */
export function estadoListaMetodos(m: {
  cargando: boolean;
  error: boolean;
  sinPermiso: boolean;
  total: number;
  visibles: number;
}): 'cargando' | 'error' | 'sinPermiso' | 'vacio' | 'sinResultados' | 'listo' {
  if (m.sinPermiso) return 'sinPermiso';
  if (m.error) return 'error';
  if (m.cargando) return 'cargando';
  if (m.total === 0) return 'vacio';
  if (m.visibles === 0) return 'sinResultados';
  return 'listo';
}
