/**
 * Cobro QR / link de pago desde el POS y el folio del PMS: todo lo que decide
 * el SERVIDOR antes de llamar al proveedor (GO-sec, auditoría del POS
 * 2026-09-24).
 *
 * Antes, las rutas `/api/integrations/{redeban,breb,bancolombia,bold}/…`
 * comprobaban solo `auth.getSession()` (cookie sin validar el JWT), tomaban la
 * organización del body y usaban el `connectionId` del body para leer las
 * credenciales con service role: cualquier sesión cobraba con la conexión de
 * otra organización y registraba la sesión QR a nombre de otra. Y como el POS
 * manda `connectionId: ''`, en la práctica respondían 400 siempre.
 *
 * Aquí, con la organización YA resuelta por la sesión (`withOrg` +
 * `readOrgBody` en la ruta):
 *  1. `source` es `pos` o `folio` y el permiso sale de él: `pos.create` para el
 *     POS, `pms.checkout` para el folio (o administración). Resuelto con
 *     `hasOrgAdminOrPermission`, nunca por nombre de rol ni valor del cliente.
 *  2. Importe > 0 con 2 decimales como máximo, moneda del riel (solo COP),
 *     referencia con formato y sin repetir en la organización.
 *  3. La sucursal es de la organización (404 si no).
 *  4. El recurso referenciado es de la organización: el folio (o la reserva)
 *     del PMS → 404 si no. Del POS no hay recurso en el servidor: el carrito
 *     vive en el navegador (`carts` está vacía) y la venta se crea DESPUÉS de
 *     confirmar el pago; ver «Riesgo del importe» abajo.
 *  5. La conexión de cobro se resuelve aquí (`resolverConexionDeCobro`), nunca
 *     del body: conexiones `connected` de la organización con el conector del
 *     método; gana la de la sucursal, luego la vinculada al método de pago
 *     (`organization_payment_methods.integration_connection_id`), luego la
 *     única general. Ninguna → 412 con mensaje claro; varias sin desempate →
 *     409.
 *
 * Riesgo del importe (documentado, no cerrado): en el POS el importe lo declara
 * el cajero autenticado con `pos.create`; no hay venta ni carrito en el
 * servidor contra el que compararlo en el momento de generar el QR. Lo que se
 * valida es forma (positivo, 2 decimales, tope) y se deja rastro (`created_by`
 * en la sesión QR). El cliente ve el importe en el QR/pantalla antes de pagar
 * y `confirmQrPayment` registra exactamente `payment_qr_sessions.amount`. En el
 * PMS el folio sí existe, pero el diálogo suma impuestos calculados en el
 * cliente sobre `folios.balance`, así que un tope estricto rompería cobros
 * legítimos: se valida la pertenencia, no el importe.
 *
 * Datos del riel que ya no salen del cliente:
 *  - Bre-B: la llave (a dónde va el dinero) sale de
 *    `integration_connections.settings.breb_key_value` / `breb_key_type`
 *    (o `key_value` / `key_type`). Antes el POS mandaba `@org<id>`.
 *  - Bold datáfono: `settings.terminals` (`[{ serial, model, branch_id }]`, se
 *    elige el de la sucursal) o `settings.terminal_serial` /
 *    `terminal_model`; el correo del operador, `settings.user_email` o el de la
 *    sesión.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';

// ─── Error con estado HTTP ───────────────────────────────────────────────────

/**
 * Error de cobro con su estado HTTP. Extiende `OrgContextError` para que
 * `withOrg` lo convierta en `{ error, code }` con su estado sin código extra en
 * cada ruta; el mensaje es el que ve el cajero en el aviso del POS.
 */
export class CobroQrError extends OrgContextError {
  constructor(statusCode: number, code: string, message: string) {
    super(message, statusCode, code);
    this.name = 'CobroQrError';
  }
}

// ─── Métodos y conectores ────────────────────────────────────────────────────

export type MetodoCobroQr =
  | 'redeban_qr'
  | 'breb_qr'
  | 'bancolombia_qr'
  | 'bancolombia_qr_wompi'
  | 'bold_link'
  | 'bold_qr';

interface ConfigMetodo {
  /** Nombre para los mensajes. */
  nombre: string;
  /** `integration_connectors.code` que sirven para este método. */
  conectores: readonly string[];
  /** `organization_payment_methods.payment_method_code` que pueden vincular la conexión. */
  metodosPago: readonly string[];
}

export const METODOS_COBRO_QR: Record<MetodoCobroQr, ConfigMetodo> = {
  redeban_qr: { nombre: 'Redeban QR', conectores: ['redeban_qr'], metodosPago: ['redeban_qr'] },
  breb_qr: { nombre: 'Bre-B (Mono)', conectores: ['breb_mono'], metodosPago: ['breb_qr'] },
  bancolombia_qr: { nombre: 'Bancolombia QR', conectores: ['bancolombia_qr'], metodosPago: ['bancolombia_qr'] },
  bancolombia_qr_wompi: {
    nombre: 'Bancolombia QR (Wompi)',
    conectores: ['wompi_co'],
    metodosPago: ['bancolombia_qr_wompi', 'wompi'],
  },
  bold_link: { nombre: 'Bold (link de pago)', conectores: ['bold_link'], metodosPago: ['bold_link'] },
  bold_qr: { nombre: 'Bold QR (datáfono)', conectores: ['bold_pos'], metodosPago: ['bold_qr'] },
};

/** Los rieles QR de esta familia son colombianos: liquidan solo en pesos. */
export const MONEDA_RIELES_QR = 'COP';

/** Quién cobra y con qué permiso. */
export const PERMISO_POR_FUENTE = {
  pos: 'pos.create',
  folio: 'pms.checkout',
} as const;
export type FuenteCobroQr = keyof typeof PERMISO_POR_FUENTE;

const IMPORTE_MAXIMO = 1_000_000_000;
const EXPIRA_POR_DEFECTO = 900;
const EXPIRA_MIN = 60;
const EXPIRA_MAX = 3600;
const REFERENCIA_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,79}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Tipos de salida ─────────────────────────────────────────────────────────

export interface ConexionCobro {
  id: string;
  organizationId: number;
  branchId: number | null;
  connectorCode: string;
  environment: string;
  settings: Record<string, unknown>;
}

export interface CobroQrPreparado {
  conexion: ConexionCobro;
  amount: number;
  currency: string;
  reference: string;
  description: string;
  source: FuenteCobroQr;
  sourceId: string | null;
  branchId: number;
  expiresInSeconds: number;
  organizationId: number;
  userId: string;
  userEmail: string | null;
}

type Fila = Record<string, unknown>;

// ─── Lecturas ────────────────────────────────────────────────────────────────

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function enteroPositivo(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

function registroDe(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ─── Resolución de la conexión ───────────────────────────────────────────────

/**
 * Conexión de cobro de la organización para `metodo` en `branchId`. Nunca del
 * cliente. 412 si no hay ninguna activa; 409 si hay varias y nada desempata.
 */
export async function resolverConexionDeCobro(
  db: SupabaseClient,
  organizationId: number,
  metodo: MetodoCobroQr,
  branchId: number | null,
): Promise<ConexionCobro> {
  const cfg = METODOS_COBRO_QR[metodo];
  const sinConexion = () =>
    new CobroQrError(
      412,
      'CONEXION_NO_CONFIGURADA',
      `La organización no tiene una conexión activa de ${cfg.nombre} para esta sucursal. Configúrela en Integraciones → Conexiones.`,
    );

  const { data: conectores, error: errConectores } = await db
    .from('integration_connectors')
    .select('id, code')
    .in('code', [...cfg.conectores]);
  if (errConectores) throw new Error(`integration_connectors: ${errConectores.message}`);
  const codigoPorConector = new Map<string, string>(
    ((conectores as Fila[] | null) ?? []).map((c) => [String(c.id), String(c.code)]),
  );
  if (codigoPorConector.size === 0) throw sinConexion();

  const { data: filas, error: errConexiones } = await db
    .from('integration_connections')
    .select('id, organization_id, branch_id, connector_id, environment, settings, status')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .in('connector_id', [...codigoPorConector.keys()]);
  if (errConexiones) throw new Error(`integration_connections: ${errConexiones.message}`);

  // Defensa en profundidad: aunque la consulta ya filtra, nada ajeno pasa.
  const candidatas: ConexionCobro[] = ((filas as Fila[] | null) ?? [])
    .filter((f) => Number(f.organization_id) === organizationId && f.status === 'connected')
    .map((f) => ({
      id: String(f.id),
      organizationId: Number(f.organization_id),
      branchId: f.branch_id == null ? null : Number(f.branch_id),
      connectorCode: codigoPorConector.get(String(f.connector_id)) ?? '',
      environment: texto(f.environment) || 'production',
      settings: registroDe(f.settings),
    }));
  if (candidatas.length === 0) throw sinConexion();

  const { data: vinculos, error: errVinculos } = await db
    .from('organization_payment_methods')
    .select('payment_method_code, integration_connection_id, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('payment_method_code', [...cfg.metodosPago]);
  if (errVinculos) throw new Error(`organization_payment_methods: ${errVinculos.message}`);
  const vinculadas = new Set(
    ((vinculos as Fila[] | null) ?? [])
      .map((v) => v.integration_connection_id)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  );

  const elegir = (grupo: ConexionCobro[]): ConexionCobro | null => {
    if (grupo.length === 1) return grupo[0];
    const porVinculo = grupo.filter((c) => vinculadas.has(c.id));
    return porVinculo.length === 1 ? porVinculo[0] : null;
  };
  const ambigua = () =>
    new CobroQrError(
      409,
      'CONEXION_AMBIGUA',
      `Hay varias conexiones activas de ${cfg.nombre} y ninguna está vinculada al método de pago. Vincule una en Finanzas → Métodos de pago.`,
    );

  // 1. La de la sucursal.
  if (branchId != null) {
    const deLaSucursal = candidatas.filter((c) => c.branchId === branchId);
    if (deLaSucursal.length > 0) {
      const elegida = elegir(deLaSucursal);
      if (!elegida) throw ambigua();
      return elegida;
    }
  }
  // 2. Las generales (sin sucursal). Las de OTRA sucursal no sirven aquí.
  const generales = candidatas.filter((c) => c.branchId == null);
  if (generales.length === 0) throw sinConexion();
  const elegida = elegir(generales);
  if (!elegida) throw ambigua();
  return elegida;
}

/**
 * Conexión `connectionId` de la organización con uno de los conectores de
 * `metodo` (health-check). 404 si no existe o es de otra organización: no se
 * distingue, para no revelar ids ajenos.
 */
export async function conexionDeLaOrganizacion(
  db: SupabaseClient,
  organizationId: number,
  connectionId: string,
  conectores: readonly string[],
): Promise<ConexionCobro> {
  const noEncontrada = () => new CobroQrError(404, 'CONEXION_NO_ENCONTRADA', 'Conexión no encontrada');
  if (!UUID_RE.test(connectionId)) throw noEncontrada();

  const { data: fila, error } = await db
    .from('integration_connections')
    .select('id, organization_id, branch_id, connector_id, environment, settings, status')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`integration_connections: ${error.message}`);
  const f = fila as Fila | null;
  if (!f || Number(f.organization_id) !== organizationId) throw noEncontrada();

  const { data: conector } = await db
    .from('integration_connectors')
    .select('id, code')
    .eq('id', String(f.connector_id))
    .maybeSingle();
  const code = texto((conector as Fila | null)?.code);
  if (!conectores.includes(code)) throw noEncontrada();

  return {
    id: String(f.id),
    organizationId,
    branchId: f.branch_id == null ? null : Number(f.branch_id),
    connectorCode: code,
    environment: texto(f.environment) || 'production',
    settings: registroDe(f.settings),
  };
}

// ─── Validación del cobro ────────────────────────────────────────────────────

async function exigirPermiso(ctx: ServerOrgContext, fuente: FuenteCobroQr, ruta: string): Promise<void> {
  const permiso = PERMISO_POR_FUENTE[fuente];
  if (await hasOrgAdminOrPermission(ctx, permiso)) return;
  console.warn('[cobroQr] cobro sin permiso → 403', {
    ruta,
    permiso,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  throw new CobroQrError(403, 'PERMISO_REQUERIDO', `No tiene permiso para cobrar (${permiso}).`);
}

function leerImporte(v: unknown): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  // Tolerancia de coma flotante: 1.15 * 100 = 114.99999999999999.
  const conMasDeDosDecimales = typeof n === 'number' && Math.abs(Math.round(n * 100) - n * 100) > 1e-6;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > IMPORTE_MAXIMO || conMasDeDosDecimales) {
    throw new CobroQrError(400, 'IMPORTE_INVALIDO', 'El importe debe ser mayor que cero y con dos decimales como máximo.');
  }
  return n;
}

function leerExpiracion(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : EXPIRA_POR_DEFECTO;
  return Math.min(EXPIRA_MAX, Math.max(EXPIRA_MIN, n));
}

async function exigirSucursal(db: SupabaseClient, organizationId: number, branchId: number): Promise<void> {
  const { data, error } = await db
    .from('branches')
    .select('id, organization_id')
    .eq('id', branchId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`branches: ${error.message}`);
  if (!data) throw new CobroQrError(404, 'SUCURSAL_NO_ENCONTRADA', 'Sucursal no encontrada');
}

/** Folio (o reserva, cuando el folio aún no existe) de la organización; 404 si no. */
async function exigirFolio(db: SupabaseClient, organizationId: number, sourceId: string): Promise<void> {
  const noEncontrado = () => new CobroQrError(404, 'FOLIO_NO_ENCONTRADO', 'Folio no encontrado');
  if (!UUID_RE.test(sourceId)) throw noEncontrado();

  const { data: folio, error: errFolio } = await db
    .from('folios')
    .select('id, reservation_id')
    .eq('id', sourceId)
    .maybeSingle();
  if (errFolio) throw new Error(`folios: ${errFolio.message}`);
  const reservaId = folio ? String((folio as Fila).reservation_id ?? '') : sourceId;
  if (!reservaId) throw noEncontrado();

  const { data: reserva, error: errReserva } = await db
    .from('reservations')
    .select('id, organization_id')
    .eq('id', reservaId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (errReserva) throw new Error(`reservations: ${errReserva.message}`);
  if (!reserva) throw noEncontrado();
}

async function exigirReferenciaNueva(db: SupabaseClient, organizationId: number, reference: string): Promise<void> {
  const { data, error } = await db
    .from('payment_qr_sessions')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('reference', reference)
    .limit(1);
  if (error) throw new Error(`payment_qr_sessions: ${error.message}`);
  if (((data as Fila[] | null) ?? []).length > 0) {
    throw new CobroQrError(409, 'REFERENCIA_DUPLICADA', 'Ya existe un cobro QR con esa referencia.');
  }
}

/**
 * Valida el cobro con la organización de la sesión y resuelve la conexión.
 * `body` es el que devolvió `readOrgBody` (la organización ajena ya dio 403).
 * Todo fallo es un `CobroQrError` con su estado; `withOrg` lo responde.
 */
export async function prepararCobroQr(
  ctx: ServerOrgContext,
  body: unknown,
  metodo: MetodoCobroQr,
  ruta: string,
  db: SupabaseClient = getServiceClient(),
): Promise<CobroQrPreparado> {
  const b = registroDe(body);

  const fuente = texto(b.source);
  if (fuente !== 'pos' && fuente !== 'folio') {
    throw new CobroQrError(400, 'FUENTE_INVALIDA', 'El cobro debe venir del POS (source: pos) o de un folio (source: folio).');
  }
  await exigirPermiso(ctx, fuente, ruta);

  const amount = leerImporte(b.amount);
  const currency = (texto(b.currency) || MONEDA_RIELES_QR).toUpperCase();
  if (currency !== MONEDA_RIELES_QR) {
    throw new CobroQrError(400, 'MONEDA_NO_SOPORTADA', `${METODOS_COBRO_QR[metodo].nombre} solo cobra en ${MONEDA_RIELES_QR}.`);
  }

  const reference = texto(b.reference);
  if (!REFERENCIA_RE.test(reference)) {
    throw new CobroQrError(400, 'REFERENCIA_INVALIDA', 'Referencia inválida (6 a 80 caracteres: letras, números, «.», «_», «:» o «-»).');
  }

  const branchId = enteroPositivo(b.branchId);
  if (branchId == null) throw new CobroQrError(400, 'SUCURSAL_REQUERIDA', 'Se requiere una sucursal para cobrar.');
  await exigirSucursal(db, ctx.organizationId, branchId);

  const sourceId = texto(b.sourceId).slice(0, 64) || null;
  if (fuente === 'folio') {
    if (!sourceId) throw new CobroQrError(404, 'FOLIO_NO_ENCONTRADO', 'Folio no encontrado');
    await exigirFolio(db, ctx.organizationId, sourceId);
  }

  await exigirReferenciaNueva(db, ctx.organizationId, reference);
  const conexion = await resolverConexionDeCobro(db, ctx.organizationId, metodo, branchId);

  return {
    conexion,
    amount,
    currency,
    reference,
    description: (texto(b.description) || reference).slice(0, 140),
    source: fuente,
    sourceId,
    branchId,
    expiresInSeconds: leerExpiracion(b.expiresInSeconds),
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
  };
}

// ─── Datos del riel que viven en la conexión ─────────────────────────────────

const TIPOS_LLAVE_BREB = ['PHONE', 'EMAIL', 'ID', 'ALPHA', 'BCODE'] as const;
export type TipoLlaveBreb = (typeof TIPOS_LLAVE_BREB)[number];

/** Llave Bre-B a la que llega el dinero: de la conexión, nunca del cliente. */
export function llaveBrebDeConexion(conexion: ConexionCobro): { keyValue: string; keyType: TipoLlaveBreb } {
  const s = conexion.settings;
  const keyValue = texto(s.breb_key_value) || texto(s.key_value);
  if (!keyValue) {
    throw new CobroQrError(
      412,
      'LLAVE_BREB_NO_CONFIGURADA',
      'La conexión de Bre-B no tiene llave de cobro configurada. Configúrela en Integraciones → Conexiones.',
    );
  }
  const tipo = (texto(s.breb_key_type) || texto(s.key_type) || 'ALPHA').toUpperCase();
  const keyType = (TIPOS_LLAVE_BREB as readonly string[]).includes(tipo) ? (tipo as TipoLlaveBreb) : 'ALPHA';
  return { keyValue, keyType };
}

/** Datáfono Bold de la sucursal (o el único de la conexión) y correo del operador. */
export function datafonoBoldDeConexion(
  conexion: ConexionCobro,
  branchId: number,
  userEmail: string | null,
): { terminalSerial: string; terminalModel: string | undefined; userEmail: string } {
  const s = conexion.settings;
  const terminales = Array.isArray(s.terminals) ? (s.terminals as unknown[]).map(registroDe) : [];
  const deLaSucursal = terminales.filter((t) => enteroPositivo(t.branch_id) === branchId && texto(t.serial));
  const elegido = deLaSucursal.length === 1 ? deLaSucursal[0] : null;
  const terminalSerial = texto(elegido?.serial) || (terminales.length === 0 ? texto(s.terminal_serial) : '');
  const terminalModel = texto(elegido?.model) || texto(s.terminal_model) || undefined;
  const correo = texto(s.user_email) || texto(userEmail);
  if (!terminalSerial || !correo) {
    throw new CobroQrError(
      412,
      'DATAFONO_NO_CONFIGURADO',
      'La conexión de Bold no tiene un datáfono configurado para esta sucursal. Configúrelo en Integraciones → Conexiones.',
    );
  }
  return { terminalSerial, terminalModel, userEmail: correo };
}
