// ============================================================
// Modelo B (PayFac/Agregador) — Credenciales maestras del ERP
// ============================================================
// Gestiona credenciales maestras que el ERP admin usa para operar
// como PayFac/Agregador en nombre de las organizaciones.
//
// Las credenciales se almacenan en variables de entorno (.env.local
// o Vercel env vars), NO en una tabla de Supabase. Esto es mas seguro
// porque:
// - Son credenciales del ERP admin, no de las organizaciones
// - No cambian frecuentemente
// - Vercel gestiona env vars de forma segura
// - No necesita UI para gestionarlas
// ============================================================

/** Credenciales maestras resueltas desde env vars */
export interface MasterCredentials {
  providerCode: string;
  environment: 'sandbox' | 'production';
  secretRef: Record<string, string>;
}

/** Datos de entrada para guardar credenciales maestras (no usado con env vars) */
export interface MasterCredentialsInput {
  providerCode: string;
  connectorCode: string;
  environment: string;
  secretRef: Record<string, unknown>;
  userId: string;
}

/** Fila de credenciales maestras (compatibilidad con codigo existente) */
export interface MasterCredentialRow {
  id: string;
  provider_code: string;
  connector_code: string;
  environment: string;
  secret_ref: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// --------------------------------------------------------
// Mapeo de variables de entorno por proveedor
// --------------------------------------------------------

/** Variables de entorno requeridas por proveedor */
const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  wompi: ['WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY', 'WOMPI_EVENTS_SECRET', 'WOMPI_INTEGRITY_SECRET'],
  bancolombia: ['BANCOLOMBIA_CLIENT_ID', 'BANCOLOMBIA_CLIENT_SECRET', 'BANCOLOMBIA_COMMERCE_TRANSFER_BUTTON_ID'],
  breb: ['BREB_MONO_CLIENT_ID', 'BREB_MONO_CLIENT_SECRET'],
  redeban: ['REDEBAN_SERVER_APP_CODE', 'REDEBAN_SERVER_APP_KEY'],
};

/** Mapeo de env var → clave del secretRef */
const ENV_TO_KEY: Record<string, string> = {
  WOMPI_PUBLIC_KEY: 'public_key',
  WOMPI_PRIVATE_KEY: 'private_key',
  WOMPI_EVENTS_SECRET: 'events_secret',
  WOMPI_INTEGRITY_SECRET: 'integrity_secret',
  BANCOLOMBIA_CLIENT_ID: 'client_id',
  BANCOLOMBIA_CLIENT_SECRET: 'client_secret',
  BANCOLOMBIA_COMMERCE_TRANSFER_BUTTON_ID: 'commerce_transfer_button_id',
  BREB_MONO_CLIENT_ID: 'client_id',
  BREB_MONO_CLIENT_SECRET: 'client_secret',
  REDEBAN_SERVER_APP_CODE: 'server_app_code',
  REDEBAN_SERVER_APP_KEY: 'server_app_key',
};

/** Determina el ambiente segun el entorno de ejecucion */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectEnvironment(_providerCode?: string): 'sandbox' | 'production' {
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
  return env;
}

/** Resuelve las env vars para un proveedor considerando ambiente */
function resolveEnvKeys(providerCode: string, environment: 'sandbox' | 'production'): string[] {
  const baseKeys = PROVIDER_ENV_KEYS[providerCode] ?? [];
  if (environment === 'sandbox') {
    // En sandbox, buscar primero _SANDBOX_ y luego sin prefijo
    return baseKeys.map((k) => {
      const sandboxKey = k.replace(/_/, '_SANDBOX_');
      return process.env[sandboxKey] ? sandboxKey : k;
    });
  }
  return baseKeys;
}

class MasterCredentialsService {
  /**
   * Busca credenciales maestras activas por provider_code y environment.
   * Lee desde variables de entorno.
   */
  static async getMasterCredentials(
    providerCode: string,
    environment?: string,
  ): Promise<{ secretRef: Record<string, unknown> } | null> {
    try {
      const env = (environment as 'sandbox' | 'production') || detectEnvironment(providerCode);
      const envKeys = resolveEnvKeys(providerCode, env);

      const secretRef: Record<string, string> = {};
      let hasAny = false;

      for (const envKey of envKeys) {
        const value = process.env[envKey];
        const secretKey = ENV_TO_KEY[envKey] ?? envKey.toLowerCase();
        if (value) {
          secretRef[secretKey] = value;
          hasAny = true;
        }
      }

      if (!hasAny) return null;

      return { secretRef };
    } catch (err) {
      console.error('[MasterCredentials] Excepcion en getMasterCredentials:', err);
      return null;
    }
  }

  /**
   * Guarda o actualiza credenciales maestras.
   * Con env vars, esto no aplica — las credenciales se configuran en Vercel/.env
   */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  static async saveMasterCredentials(
    _providerCode: string,
    _connectorCode: string,
    _environment: string,
    _secretRef: Record<string, unknown>,
    _userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Las credenciales maestras se configuran via variables de entorno (.env.local o Vercel), no via API.',
    };
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /**
   * Lista todas las credenciales maestras configuradas.
   * Lee desde env vars y retorna solo metadata (sin secretos).
   */
  static async listMasterCredentials(): Promise<MasterCredentialRow[]> {
    try {
      const providers = Object.keys(PROVIDER_ENV_KEYS);
      const rows: MasterCredentialRow[] = [];

      for (const providerCode of providers) {
        const envKeys = PROVIDER_ENV_KEYS[providerCode];
        const hasAll = envKeys.every((k) => process.env[k]);
        if (!hasAll) continue;

        rows.push({
          id: `env-${providerCode}`,
          provider_code: providerCode,
          connector_code: providerCode === 'breb' ? 'breb_mono' : `${providerCode}_qr`,
          environment: detectEnvironment(providerCode),
          secret_ref: {}, // No exponer secretos
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: null,
        });
      }

      return rows;
    } catch (err) {
      console.error('[MasterCredentials] Excepcion en listMasterCredentials:', err);
      return [];
    }
  }

  /**
   * Desactiva credenciales maestras.
   * Con env vars, esto no aplica.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async deleteMasterCredentials(_id: string): Promise<{ success: boolean }> {
    return { success: false };
  }

  /**
   * Determina si una organizacion usa credenciales maestras (Modelo B)
   * o credenciales propias (Modelo A).
   * Retorna useMaster=true si existen env vars configuradas para el provider.
   */
  static async getActiveProviderForOrganization(
    _organizationId: number,
    providerCode: string,
  ): Promise<{ useMaster: boolean; secretRef: Record<string, unknown> } | null> {
    try {
      const envKeys = PROVIDER_ENV_KEYS[providerCode] ?? [];
      if (envKeys.length === 0) return null;

      const hasAll = envKeys.every((k) => process.env[k]);
      if (!hasAll) {
        // No hay env vars maestras -> Modelo A (credenciales propias)
        return { useMaster: false, secretRef: {} };
      }

      // Hay env vars maestras -> Modelo B
      const secretRef: Record<string, string> = {};
      for (const envKey of envKeys) {
        const value = process.env[envKey];
        const secretKey = ENV_TO_KEY[envKey] ?? envKey.toLowerCase();
        if (value) secretRef[secretKey] = value;
      }

      return { useMaster: true, secretRef };
    } catch (err) {
      console.error('[MasterCredentials] Excepcion en getActiveProviderForOrganization:', err);
      return null;
    }
  }

  // --------------------------------------------------------
  // Metodos alias compatibles con API routes
  // --------------------------------------------------------

  /** Lista todas las credenciales maestras (alias para API routes) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async listAll(_supabase?: unknown): Promise<MasterCredentialRow[]> {
    return MasterCredentialsService.listMasterCredentials();
  }

  /** Guarda credenciales maestras (no aplica con env vars) */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  static async save(
    _supabase: unknown,
    _input: { providerCode: string; connectorCode: string; environment: string; secretRef: Record<string, unknown> },
    _userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Las credenciales maestras se configuran via variables de entorno, no via API.',
    };
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /** Desactiva credenciales maestras (no aplica con env vars) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async deactivate(_supabase: unknown, _id: string): Promise<{ success: boolean }> {
    return { success: false };
  }
}

export const masterCredentialsService = MasterCredentialsService;
export default masterCredentialsService;
