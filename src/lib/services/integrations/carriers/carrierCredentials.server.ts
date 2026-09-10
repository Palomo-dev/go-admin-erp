/**
 * Credenciales de transportadora — SOLO SERVIDOR.
 *
 * Sustituye al camino anterior, en el que `ApiCredentialsDialog` escribía la `api_key`
 * en claro dentro de `transport_carriers.metadata` desde el navegador, mientras el
 * diálogo prometía que "se almacenan de forma segura".
 *
 * Reparto de responsabilidades:
 *
 *   integration_connections            → la conexión de esa organización con el proveedor,
 *                                        su entorno y su configuración NO secreta
 *   integration_connections.settings   → usuario, número de cuenta… datos que no son secretos
 *   integration_credentials.secret_ref → uuid de vault.secrets, nunca el secreto
 *   vault.secrets                      → el valor, cifrado en reposo
 *   transport_carriers.api_credentials_ref → uuid de la conexión, para enlazarlas
 *
 * Los secretos entran y salen sólo por `fn_set_provider_secret` / `fn_get_provider_secret`,
 * que son SECURITY DEFINER con EXECUTE únicamente para `service_role`. Este módulo es el
 * único sitio del ERP que los llama para transportadoras.
 *
 * Alcance honesto: Vault protege contra dumps, backups, el panel de Supabase y errores de
 * RLS. NO protege contra quien tenga la `service_role` key.
 */

// Nota: el repo no usa el paquete `server-only`; la protección es `assertServerOnly()`
// en cada acceso al cliente, igual que en `providerCredentials.server.ts`.
import { getServiceClient, assertServerOnly } from '@/lib/supabase/server-service';

/** Propósitos que usamos para transportadoras, de los admitidos por el CHECK de la tabla. */
export const CARRIER_SECRET_PURPOSES = ['primary', 'webhook_secret'] as const;
export type CarrierSecretPurpose = (typeof CARRIER_SECRET_PURPOSES)[number];

export type CarrierEnvironment = 'production' | 'sandbox';

export interface SaveCarrierCredentialsInput {
  environment: CarrierEnvironment;
  /** Configuración NO secreta; se guarda en `integration_connections.settings`. */
  username?: string | null;
  accountNumber?: string | null;
  /** Secretos. Ausente o vacío = no se toca. */
  apiKey?: string | null;
  webhookSecret?: string | null;
}

/** Lo que se puede devolver al navegador. Nunca incluye un secreto. */
export interface CarrierCredentialsSafe {
  connectionId: string | null;
  environment: CarrierEnvironment | null;
  status: string | null;
  username: string | null;
  accountNumber: string | null;
  lastHealthCheckAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  secrets: Array<{
    purpose: CarrierSecretPurpose;
    keyPrefix: string | null;
    status: string;
    rotatedAt: string | null;
    /** true si `secret_ref` ya es una referencia a Vault y no un valor en claro heredado. */
    inVault: boolean;
  }>;
}

export class CarrierCredentialsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'CarrierCredentialsError';
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function client() {
  assertServerOnly();
  return getServiceClient();
}

interface CarrierRow {
  id: string;
  organization_id: number;
  name: string;
  code: string;
  api_provider: string | null;
  api_credentials_ref: string | null;
}

/**
 * Carga la transportadora comprobando que pertenece a la organización del contexto.
 * El id viene del cliente, así que esta comprobación no es opcional.
 */
async function loadCarrier(organizationId: number, carrierId: string): Promise<CarrierRow> {
  const { data, error } = await client()
    .from('transport_carriers')
    .select('id, organization_id, name, code, api_provider, api_credentials_ref')
    .eq('id', carrierId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('[carrierCredentials] error cargando transportadora:', error);
    throw new CarrierCredentialsError('No se pudo cargar la transportadora', 500);
  }
  if (!data) {
    // 404 y no 403: no confirmamos que el id exista en otra organización.
    throw new CarrierCredentialsError('Transportadora no encontrada', 404);
  }
  return data as CarrierRow;
}

/** Busca el connector del proveedor de esa transportadora. */
async function findConnectorId(apiProvider: string): Promise<string> {
  const { data, error } = await client()
    .from('integration_connectors')
    .select('id, integration_providers!inner(code)')
    .eq('integration_providers.code', apiProvider)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[carrierCredentials] error buscando connector:', error);
    throw new CarrierCredentialsError('No se pudo resolver el proveedor', 500);
  }
  if (!data) {
    throw new CarrierCredentialsError(
      `El proveedor "${apiProvider}" no está registrado como integración. Regístralo antes de guardar credenciales.`,
      409
    );
  }
  return (data as { id: string }).id;
}

/**
 * Devuelve la conexión de la transportadora, creándola si hace falta.
 * Deja `transport_carriers.api_credentials_ref` apuntando a ella.
 */
async function ensureConnection(
  carrier: CarrierRow,
  environment: CarrierEnvironment
): Promise<string> {
  if (!carrier.api_provider) {
    throw new CarrierCredentialsError(
      'La transportadora no tiene proveedor de API asignado. Elige uno antes de guardar credenciales.',
      409
    );
  }

  const supabase = client();
  const connectorId = await findConnectorId(carrier.api_provider);

  // ¿Ya hay conexión para esta organización, connector y entorno?
  const { data: existing, error: findError } = await supabase
    .from('integration_connections')
    .select('id')
    .eq('organization_id', carrier.organization_id)
    .eq('connector_id', connectorId)
    .eq('environment', environment)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.error('[carrierCredentials] error buscando conexión:', findError);
    throw new CarrierCredentialsError('No se pudo resolver la conexión', 500);
  }

  let connectionId = (existing as { id: string } | null)?.id ?? null;

  if (!connectionId) {
    const { data: created, error: createError } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: carrier.organization_id,
        connector_id: connectorId,
        name: `${carrier.name} (${environment})`,
        environment,
        country_code: 'CO',
        status: 'draft',
        settings: {},
      })
      .select('id')
      .single();

    if (createError || !created) {
      console.error('[carrierCredentials] error creando conexión:', createError);
      throw new CarrierCredentialsError('No se pudo crear la conexión', 500);
    }
    connectionId = (created as { id: string }).id;
  }

  if (carrier.api_credentials_ref !== connectionId) {
    const { error: linkError } = await supabase
      .from('transport_carriers')
      .update({ api_credentials_ref: connectionId, updated_at: new Date().toISOString() })
      .eq('id', carrier.id)
      .eq('organization_id', carrier.organization_id);

    if (linkError) {
      console.error('[carrierCredentials] error enlazando carrier con conexión:', linkError);
      throw new CarrierCredentialsError('No se pudo enlazar la transportadora con la conexión', 500);
    }
  }

  return connectionId;
}

/**
 * Guarda configuración y secretos de una transportadora.
 * Sólo se escribe lo que venga con valor: un campo ausente o vacío no borra nada.
 */
export async function saveCarrierCredentials(
  organizationId: number,
  carrierId: string,
  input: SaveCarrierCredentialsInput
): Promise<CarrierCredentialsSafe> {
  const supabase = client();
  const carrier = await loadCarrier(organizationId, carrierId);
  const connectionId = await ensureConnection(carrier, input.environment);

  // 1. Configuración no secreta. Se fusiona para no perder claves de otros flujos.
  const settingsPatch: Record<string, string> = {};
  if (input.username && input.username.trim() !== '') settingsPatch.username = input.username.trim();
  if (input.accountNumber && input.accountNumber.trim() !== '') {
    settingsPatch.account_number = input.accountNumber.trim();
  }

  if (Object.keys(settingsPatch).length > 0) {
    const { data: current } = await supabase
      .from('integration_connections')
      .select('settings')
      .eq('id', connectionId)
      .maybeSingle();

    const merged = {
      ...(((current as { settings?: Record<string, unknown> } | null)?.settings) ?? {}),
      ...settingsPatch,
    };

    const { error } = await supabase
      .from('integration_connections')
      .update({ settings: merged, updated_at: new Date().toISOString() })
      .eq('id', connectionId);

    if (error) {
      console.error('[carrierCredentials] error guardando settings:', error);
      throw new CarrierCredentialsError('No se pudo guardar la configuración', 500);
    }
  }

  // 2. Secretos, uno por uno, siempre por la función del vault.
  const aGuardar: Array<[CarrierSecretPurpose, string]> = [];
  if (input.apiKey && input.apiKey.trim() !== '') aGuardar.push(['primary', input.apiKey.trim()]);
  if (input.webhookSecret && input.webhookSecret.trim() !== '') {
    aGuardar.push(['webhook_secret', input.webhookSecret.trim()]);
  }

  for (const [purpose, value] of aGuardar) {
    const { error } = await supabase.rpc('fn_set_provider_secret', {
      p_connection_id: connectionId,
      p_purpose: purpose,
      p_value: value,
      p_credential_type: purpose === 'webhook_secret' ? 'webhook_secret' : 'api_key',
    });

    if (error) {
      // El mensaje del RPC puede contener contexto, pero nunca el valor.
      console.error(`[carrierCredentials] error guardando secreto ${purpose}:`, error.message);
      throw new CarrierCredentialsError(`No se pudo guardar el secreto "${purpose}"`, 500);
    }
  }

  // 3. Con al menos un secreto guardado, la conexión deja de ser un borrador.
  if (aGuardar.length > 0) {
    await supabase
      .from('integration_connections')
      .update({
        status: 'connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);
  }

  return getCarrierCredentialsSafe(organizationId, carrierId);
}

/**
 * Estado de las credenciales para pintarlo en la UI.
 * Nunca devuelve un secreto: sólo prefijo, estado y fechas.
 */
export async function getCarrierCredentialsSafe(
  organizationId: number,
  carrierId: string
): Promise<CarrierCredentialsSafe> {
  const supabase = client();
  const carrier = await loadCarrier(organizationId, carrierId);

  const vacio: CarrierCredentialsSafe = {
    connectionId: null,
    environment: null,
    status: null,
    username: null,
    accountNumber: null,
    lastHealthCheckAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    secrets: [],
  };

  if (!carrier.api_credentials_ref) return vacio;

  const { data: connection, error } = await supabase
    .from('integration_connections')
    .select(
      'id, environment, status, settings, last_health_check_at, last_error_at, last_error_message'
    )
    .eq('id', carrier.api_credentials_ref)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('[carrierCredentials] error cargando conexión:', error);
    throw new CarrierCredentialsError('No se pudo cargar el estado de la conexión', 500);
  }
  if (!connection) return vacio;

  const conn = connection as {
    id: string;
    environment: CarrierEnvironment;
    status: string;
    settings: Record<string, unknown> | null;
    last_health_check_at: string | null;
    last_error_at: string | null;
    last_error_message: string | null;
  };

  const { data: creds } = await supabase
    .from('integration_credentials')
    .select('purpose, key_prefix, status, rotated_at, secret_ref')
    .eq('connection_id', conn.id)
    .in('purpose', CARRIER_SECRET_PURPOSES as unknown as string[]);

  const filas = (creds ?? []) as Array<{
    purpose: CarrierSecretPurpose;
    key_prefix: string | null;
    status: string;
    rotated_at: string | null;
    secret_ref: string | null;
  }>;

  return {
    connectionId: conn.id,
    environment: conn.environment,
    status: conn.status,
    username: (conn.settings?.username as string | undefined) ?? null,
    accountNumber: (conn.settings?.account_number as string | undefined) ?? null,
    lastHealthCheckAt: conn.last_health_check_at,
    lastErrorAt: conn.last_error_at,
    lastErrorMessage: conn.last_error_message,
    secrets: filas.map((f) => ({
      purpose: f.purpose,
      keyPrefix: f.key_prefix,
      status: f.status,
      rotatedAt: f.rotated_at,
      inVault: !!f.secret_ref && UUID_RE.test(f.secret_ref),
    })),
  };
}
