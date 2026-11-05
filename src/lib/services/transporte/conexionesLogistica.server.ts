/**
 * Conexiones de logística (transportadoras y dropshipping): un solo flujo para crear la conexión,
 * guardar credenciales (secretos al Vault) y probarla contra el proveedor.
 *
 * - La organización llega de la sesión (ctx), nunca del body; toda consulta filtra por ella.
 * - Se usa el cliente service_role SOLO después de verificar que la conexión es de la
 *   organización.
 * - Una conexión queda `connected` únicamente cuando `validateCredentials` del adaptador responde
 *   bien. Si el adaptador no está disponible (NotConfiguredError) queda en `draft` con el motivo.
 * - Cambiar credenciales devuelve la conexión a `draft`: hay que probarla otra vez.
 * - Transportadoras: al crear la conexión se crea su fila en transport_carriers (service_type
 *   'cargo', inactiva hasta que la conexión quede `connected`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { entradaRegistro, puedeConectarLogistica } from '@/lib/integrations/core/registro';
import { leerEsquema, validarValores, faltanRequeridos, type EsquemaConexion } from '@/lib/integrations/core/esquemaConexion';
import { errorParaUI, esErrorIntegracion } from '@/lib/integrations/core/errores';
import { registrarEvento } from '@/lib/integrations/core/eventos.server';
import type { Ambiente, ContextoIntegracion } from '@/lib/integrations/core/tipos';
import { estadoSecretos, guardarSecretos, leerSecretos } from '@/lib/services/integrations/integrationCredentials.server';

export class ConexionLogisticaError extends Error {
  constructor(message: string, readonly status: number, readonly errores?: Record<string, string>) {
    super(message);
    this.name = 'ConexionLogisticaError';
  }
}

interface FilaConector {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  settings_schema: unknown;
  capabilities: Record<string, unknown> | null;
  integration_providers: { code: string; name: string; category: string; metadata: Record<string, unknown> | null } | null;
}

interface FilaConexion {
  id: string;
  organization_id: number;
  connector_id: string;
  name: string;
  environment: Ambiente | 'test';
  status: string;
  settings: Record<string, unknown> | null;
  last_error_message: string | null;
  last_health_check_at: string | null;
  connected_at: string | null;
}

const SELECT_CONECTOR = 'id, code, name, is_active, settings_schema, capabilities, integration_providers!inner(code, name, category, metadata)';

async function conectorPorCodigo(db: SupabaseClient, code: string): Promise<FilaConector> {
  const { data, error } = await db.from('integration_connectors').select(SELECT_CONECTOR).eq('code', code).maybeSingle();
  if (error) throw new Error(`integration_connectors: ${error.message}`);
  const fila = data as unknown as FilaConector | null;
  if (!fila || !fila.is_active || fila.integration_providers?.category !== 'delivery') {
    throw new ConexionLogisticaError('Proveedor de logística no encontrado.', 404);
  }
  return fila;
}

async function conexionDeLaOrganizacion(db: SupabaseClient, organizationId: number, connectionId: string): Promise<{ conexion: FilaConexion; conector: FilaConector }> {
  const { data, error } = await db
    .from('integration_connections')
    .select('id, organization_id, connector_id, name, environment, status, settings, last_error_message, last_health_check_at, connected_at')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`integration_connections: ${error.message}`);
  const conexion = data as FilaConexion | null;
  if (!conexion) throw new ConexionLogisticaError('Conexión no encontrada.', 404);
  const { data: c, error: errC } = await db.from('integration_connectors').select(SELECT_CONECTOR).eq('id', conexion.connector_id).maybeSingle();
  if (errC) throw new Error(`integration_connectors: ${errC.message}`);
  const conector = c as unknown as FilaConector | null;
  if (!conector || conector.integration_providers?.category !== 'delivery' || !entradaRegistro(conector.integration_providers.code)) {
    throw new ConexionLogisticaError('Conexión no encontrada.', 404);
  }
  return { conexion, conector };
}

function esquemaDe(conector: FilaConector): EsquemaConexion {
  const esquema = leerEsquema(conector.settings_schema);
  if (!esquema) throw new ConexionLogisticaError('Este proveedor todavía no tiene formulario de conexión.', 409);
  return esquema;
}

/** Crea (o devuelve) la conexión de la organización con ese proveedor y ambiente. */
export async function crearConexionLogistica(
  db: SupabaseClient,
  ctx: { organizationId: number; userId: string },
  connectorCode: string,
  environment: Ambiente,
): Promise<{ connectionId: string; creada: boolean }> {
  const conector = await conectorPorCodigo(db, connectorCode);
  const proveedor = conector.integration_providers!;
  if (!puedeConectarLogistica(proveedor.code, proveedor.metadata)) {
    throw new ConexionLogisticaError('Este proveedor todavía no se puede conectar.', 409);
  }
  const esquema = esquemaDe(conector);
  if (!esquema.ambientes.includes(environment)) throw new ConexionLogisticaError('Ambiente no disponible para este proveedor.', 400);

  const { data: existente, error: errExistente } = await db
    .from('integration_connections')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('connector_id', conector.id)
    .eq('environment', environment)
    .neq('status', 'revoked')
    .limit(1)
    .maybeSingle();
  if (errExistente) throw new Error(`integration_connections: ${errExistente.message}`);
  if (existente) return { connectionId: (existente as { id: string }).id, creada: false };

  const nombre = `${proveedor.name}${environment === 'sandbox' ? ' (sandbox)' : ''}`;
  const { data: nueva, error } = await db
    .from('integration_connections')
    .insert({
      organization_id: ctx.organizationId,
      connector_id: conector.id,
      name: nombre,
      environment,
      country_code: 'CO',
      status: 'draft',
      settings: {},
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error || !nueva) {
    if (error?.code === '23505') throw new ConexionLogisticaError(`Ya existe una conexión llamada «${nombre}» en la organización.`, 409);
    throw new Error(`integration_connections: ${error?.message ?? 'sin fila'}`);
  }
  const connectionId = (nueva as { id: string }).id;

  const entrada = entradaRegistro(proveedor.code)!;
  if (entrada.creaTransportadora && entrada.apiProvider) {
    await asegurarTransportadora(db, ctx.organizationId, entrada.apiProvider, entrada.nombre, connectionId);
  }
  return { connectionId, creada: true };
}

/** Fila de transport_carriers de la organización para ese proveedor (cargo, inactiva hasta conectar). */
async function asegurarTransportadora(db: SupabaseClient, organizationId: number, apiProvider: string, nombre: string, connectionId: string): Promise<void> {
  const { data: actual, error } = await db
    .from('transport_carriers')
    .select('id, service_type')
    .eq('organization_id', organizationId)
    .eq('api_provider', apiProvider)
    .neq('service_type', 'passenger')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`transport_carriers: ${error.message}`);
  if (actual) {
    const { error: e } = await db.from('transport_carriers').update({ api_credentials_ref: connectionId, updated_at: new Date().toISOString() })
      .eq('id', (actual as { id: string }).id).eq('organization_id', organizationId);
    if (e) throw new Error(`transport_carriers: ${e.message}`);
    return;
  }
  const { error: e } = await db.from('transport_carriers').insert({
    organization_id: organizationId,
    name: nombre,
    code: apiProvider,
    carrier_type: 'third_party',
    service_type: 'cargo',
    api_provider: apiProvider,
    api_credentials_ref: connectionId,
    is_active: false,
    metadata: { creada_por: 'conexion_logistica' },
  });
  if (e) throw new Error(`transport_carriers: ${e.message}`);
}

export interface EstadoConexionLogistica {
  connectionId: string;
  proveedor: { code: string; nombre: string };
  estadoAdaptador: string;
  notaAdaptador: string;
  environment: string;
  status: string;
  esquema: EsquemaConexion;
  /** Ajustes no secretos guardados. */
  ajustes: Record<string, unknown>;
  /** Secretos guardados: solo prefijo y fecha. */
  secretos: Record<string, { prefijo: string | null; enVault: boolean; actualizado: string | null }>;
  faltantes: string[];
  ultimoError: string | null;
  ultimaPrueba: string | null;
  conectadaDesde: string | null;
  /** El proveedor envía avisos (webhooks) según su documentación. */
  avisos: boolean;
}

/** Datos del proveedor para iniciar una conexión: estado del adaptador y ambientes disponibles. */
export async function catalogoProveedorLogistica(db: SupabaseClient, connectorCode: string) {
  const conector = await conectorPorCodigo(db, connectorCode);
  const proveedor = conector.integration_providers!;
  const entrada = entradaRegistro(proveedor.code);
  if (!entrada) throw new ConexionLogisticaError('Proveedor de logística no encontrado.', 404);
  const esquema = leerEsquema(conector.settings_schema);
  return {
    code: proveedor.code,
    nombre: entrada.nombre,
    estadoAdaptador: entrada.estado,
    notaAdaptador: entrada.nota,
    conectable: puedeConectarLogistica(proveedor.code, proveedor.metadata) && !!esquema,
    ambientes: esquema?.ambientes ?? [],
    docPendiente: esquema?.doc_pendiente === true,
    fuente: esquema?.fuente ?? null,
  };
}

export async function estadoConexionLogistica(db: SupabaseClient, organizationId: number, connectionId: string): Promise<EstadoConexionLogistica> {
  const { conexion, conector } = await conexionDeLaOrganizacion(db, organizationId, connectionId);
  const esquema = esquemaDe(conector);
  const entrada = entradaRegistro(conector.integration_providers!.code)!;
  const secretos = await estadoSecretos(db, connectionId);
  const ajustes = conexion.settings ?? {};
  const conValor = new Set<string>([
    ...Object.entries(secretos).filter(([, s]) => s.enVault).map(([k]) => k),
    ...Object.entries(ajustes).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k]) => k),
  ]);
  const clavesSecretas = new Set(esquema.campos.filter((c) => c.secreto).map((c) => c.clave));
  return {
    connectionId,
    proveedor: { code: conector.integration_providers!.code, nombre: entrada.nombre },
    estadoAdaptador: entrada.estado,
    notaAdaptador: entrada.nota,
    environment: conexion.environment,
    status: conexion.status,
    esquema,
    ajustes: Object.fromEntries(Object.entries(ajustes).filter(([k]) => !clavesSecretas.has(k))),
    secretos: Object.fromEntries(Object.entries(secretos).filter(([k]) => clavesSecretas.has(k))),
    faltantes: faltanRequeridos(esquema, conValor),
    ultimoError: conexion.last_error_message,
    ultimaPrueba: conexion.last_health_check_at,
    conectadaDesde: conexion.connected_at,
    avisos: conector.capabilities?.webhook === true,
  };
}

/** Guarda lo enviado: secretos al Vault y ajustes en la conexión. Deja la conexión en `draft`. */
export async function guardarCredencialesLogistica(
  db: SupabaseClient,
  organizationId: number,
  connectionId: string,
  valores: Record<string, unknown>,
): Promise<{ guardados: string[] }> {
  const { conexion, conector } = await conexionDeLaOrganizacion(db, organizationId, connectionId);
  const esquema = esquemaDe(conector);
  const secretosActuales = await estadoSecretos(db, connectionId);
  const existentes = new Set<string>([
    ...Object.entries(secretosActuales).filter(([, s]) => s.enVault).map(([k]) => k),
    ...Object.keys(conexion.settings ?? {}),
  ]);
  const r = validarValores(esquema, valores, existentes);
  if (!r.ok) throw new ConexionLogisticaError('Revisa los datos de la conexión.', 400, r.errores);

  const guardados = await guardarSecretos(db, connectionId, r.valores.secretos);
  const ajustes = { ...(conexion.settings ?? {}), ...r.valores.ajustes };
  const { error } = await db
    .from('integration_connections')
    .update({ settings: ajustes, status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('organization_id', organizationId);
  if (error) throw new Error(`integration_connections: ${error.message}`);
  await db.from('transport_carriers').update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId).eq('api_credentials_ref', connectionId);
  return { guardados: [...guardados, ...Object.keys(r.valores.ajustes)] };
}

/** Prueba real contra el proveedor. Solo así la conexión queda `connected`. */
export async function probarConexionLogistica(
  db: SupabaseClient,
  organizationId: number,
  connectionId: string,
): Promise<{ ok: true } | { ok: false; codigo: string; mensaje: string; faltantes?: string[] }> {
  const { conexion, conector } = await conexionDeLaOrganizacion(db, organizationId, connectionId);
  const esquema = esquemaDe(conector);
  const code = conector.integration_providers!.code;
  const entrada = entradaRegistro(code)!;

  const clavesSecretas = esquema.campos.filter((c) => c.secreto).map((c) => c.clave);
  const secretos = await leerSecretos(db, connectionId, clavesSecretas);
  const ajustes = Object.fromEntries(Object.entries(conexion.settings ?? {}).map(([k, v]) => [k, String(v)]));
  const credenciales: Record<string, string> = { ...ajustes, ...secretos };
  const faltantes = faltanRequeridos(esquema, new Set(Object.keys(credenciales).filter((k) => credenciales[k] !== '')));
  if (faltantes.length > 0) return { ok: false, codigo: 'VALIDATION', mensaje: 'Faltan datos obligatorios de la conexión.', faltantes };

  const ctxIntegracion: ContextoIntegracion = {
    organizationId,
    connectionId,
    environment: conexion.environment === 'sandbox' ? 'sandbox' : 'production',
    credenciales,
  };
  const ahora = new Date().toISOString();
  const valoresSecretos = Object.values(secretos);
  try {
    const { adaptador } = entrada.crear();
    await adaptador.validateCredentials(ctxIntegracion);
    const { error } = await db.from('integration_connections')
      .update({ status: 'connected', connected_at: ahora, last_health_check_at: ahora, last_error_message: null, updated_at: ahora })
      .eq('id', connectionId).eq('organization_id', organizationId);
    if (error) throw new Error(`integration_connections: ${error.message}`);
    await db.from('transport_carriers').update({ is_active: true, updated_at: ahora })
      .eq('organization_id', organizationId).eq('api_credentials_ref', connectionId);
    await registrarEvento(db, {
      connectionId, organizationId, eventType: 'connection.test', source: 'manual', direction: 'outbound', status: 'processed',
      payload: { resultado: 'ok' }, secretos: valoresSecretos,
    });
    return { ok: true };
  } catch (err) {
    const ui = errorParaUI(err);
    const { error } = await db.from('integration_connections')
      .update({
        status: esErrorIntegracion(err) && err.codigo === 'NOT_CONFIGURED' ? 'draft' : 'error',
        last_health_check_at: ahora,
        last_error_at: ahora,
        last_error_message: ui.mensaje,
        updated_at: ahora,
      })
      .eq('id', connectionId).eq('organization_id', organizationId);
    if (error) console.error('[conexionesLogistica] estado tras la prueba:', error.message);
    await registrarEvento(db, {
      connectionId, organizationId, eventType: 'connection.test', source: 'manual', direction: 'outbound', status: 'error',
      payload: { codigo: ui.codigo }, errorMessage: ui.mensaje, secretos: valoresSecretos,
    }).catch((e) => console.error('[conexionesLogistica] integration_events:', e instanceof Error ? e.message : e));
    return { ok: false, codigo: ui.codigo, mensaje: ui.mensaje };
  }
}

/** Conexiones de logística de la organización (para la pantalla de transportadoras). */
export async function listarConexionesLogistica(db: SupabaseClient, organizationId: number) {
  const { data, error } = await db
    .from('integration_connections')
    .select('id, name, environment, status, last_error_message, connected_at, integration_connectors!inner(code, integration_providers!inner(code, category))')
    .eq('organization_id', organizationId)
    .eq('integration_connectors.integration_providers.category', 'delivery');
  if (error) throw new Error(`integration_connections: ${error.message}`);
  return ((data ?? []) as unknown as { id: string; name: string; environment: string; status: string; last_error_message: string | null; connected_at: string | null; integration_connectors: { code: string; integration_providers: { code: string } } }[])
    .filter((c) => entradaRegistro(c.integration_connectors.integration_providers.code))
    .map((c) => ({
      connectionId: c.id,
      nombre: c.name,
      proveedor: c.integration_connectors.integration_providers.code,
      environment: c.environment,
      status: c.status,
      ultimoError: c.last_error_message,
      conectadaDesde: c.connected_at,
    }));
}
