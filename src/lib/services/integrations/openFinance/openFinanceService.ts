/**
 * Servicio principal de Open Finance.
 * Proveedor principal: Prometeo (docs.prometeoapi.com).
 * Autenticacion via header X-API-Key. Sesion dura 5 minutos.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getPrometeoWebhookToken, getProviderApiKey, getProviderConfig, isProviderConfigured } from './openFinanceConfig';
import type {
  AccountBalance,
  AccountValidationRequest,
  AccountValidationResponse,
  CreateLinkInput,
  Institution,
  Movement,
  OpenFinanceAccount,
  OpenFinanceLink,
  PrometeoLoginRequest,
  PrometeoLoginResponse,
  TransferRequest,
  TransferResponse,
} from './openFinanceTypes';

/** Instituciones bancarias principales de Colombia (hardcodeadas) */
const COLOMBIA_INSTITUTIONS: Institution[] = [
  { code: 'bancolombia', name: 'Bancolombia', country: 'CO', provider: 'prometeo' },
  { code: 'davivienda', name: 'Davivienda', country: 'CO', provider: 'prometeo' },
  { code: 'bbva', name: 'BBVA Colombia', country: 'CO', provider: 'prometeo' },
  { code: 'banco_de_bogota', name: 'Banco de Bogota', country: 'CO', provider: 'prometeo' },
  { code: 'scotiabank_colpatria', name: 'Scotiabank Colpatria', country: 'CO', provider: 'prometeo' },
  { code: 'banco_av_villas', name: 'Banco AV Villas', country: 'CO', provider: 'prometeo' },
];

/** Headers estandar para llamadas a Prometeo */
function buildPrometeoHeaders(apiKey: string, sessionKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  if (sessionKey) headers['X-Session-Key'] = sessionKey;
  return headers;
}

/** Maneja errores de respuesta HTTP de Prometeo */
async function handlePrometeoError(response: Response): Promise<never> {
  let detail = `Prometeo API error: ${response.status} ${response.statusText}`;
  try {
    const body = await response.json() as { message?: string; detail?: string };
    if (body?.message) detail = body.message;
    else if (body?.detail) detail = body.detail;
  } catch {
    // Si el cuerpo no es JSON, se mantiene el mensaje por defecto
  }
  throw new Error(detail);
}

export class OpenFinanceService {
  /**
   * Lista instituciones disponibles para un proveedor.
   * Para Prometeo en Colombia se usan las instituciones hardcodeadas.
   * @param provider Codigo del proveedor (default: 'prometeo')
   */
  static async getInstitutions(provider: string = 'prometeo'): Promise<Institution[]> {
    if (provider === 'prometeo') {
      return COLOMBIA_INSTITUTIONS;
    }
    // Otros proveedores se implementaran en el futuro
    return [];
  }

  /**
   * Crea un link Open Finance en la BD.
   * @param input Datos del link a crear
   * @returns ID del link creado
   */
  static async createLinkInternal(input: CreateLinkInput): Promise<{ linkId: string }> {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('open_finance_links')
        .insert({
          organization_id: input.organizationId,
          provider: input.provider,
          institution_code: input.institutionCode,
          institution_name: input.institutionName,
          session_key: null,
          status: 'active',
          consent_id: input.consentId || null,
          last_sync_at: null,
          sync_frequency: 'daily',
          metadata: input.metadata || null,
        })
        .select('id')
        .single();

      if (error) throw new Error(`Error al crear link: ${error.message}`);
      return { linkId: data.id };
    } catch (err) {
      throw new Error(`Error al crear link Open Finance: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Realiza login a un banco via Prometeo (POST /login/).
   * La sesion dura 5 minutos.
   * @param provider Codigo del proveedor ('prometeo')
   * @param credentials Credenciales bancarias del usuario
   */
  static async loginToBankInternal(provider: string, credentials: PrometeoLoginRequest): Promise<PrometeoLoginResponse> {
    try {
      if (!isProviderConfigured(provider)) {
        throw new Error(`Proveedor ${provider} no esta configurado`);
      }
      const config = getProviderConfig(provider);
      const apiKey = getProviderApiKey(provider);
      const response = await fetch(`${config.baseUrl}/login/`, {
        method: 'POST',
        headers: buildPrometeoHeaders(apiKey),
        body: JSON.stringify(credentials),
      });

      if (!response.ok) await handlePrometeoError(response);

      const data = await response.json() as PrometeoLoginResponse;
      return {
        status: data.status || 'success',
        session_key: data.session_key,
        message: data.message,
      };
    } catch (err) {
      throw new Error(`Error en login bancario: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Obtiene las cuentas de un link desde la BD.
   * Si el link tiene sesion activa, refresca las cuentas desde Prometeo (GET /account/).
   * @param linkId ID del link
   */
  static async getAccountsInternal(linkId: string): Promise<OpenFinanceAccount[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener el link desde BD
      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('*')
        .eq('id', linkId)
        .single();

      if (linkError) throw new Error(`Link no encontrado: ${linkError.message}`);
      if (!link) throw new Error('Link no encontrado');

      // Si hay sesion activa, refrescar cuentas desde Prometeo
      if (link.session_key && link.provider === 'prometeo') {
        await this.refreshAccountsFromPrometeo(link as OpenFinanceLink);
      }

      // Retornar cuentas desde BD
      const { data: accounts, error: accountsError } = await supabase
        .from('open_finance_accounts')
        .select('*')
        .eq('link_id', linkId)
        .eq('is_active', true);

      if (accountsError) throw new Error(`Error al obtener cuentas: ${accountsError.message}`);
      return (accounts || []) as OpenFinanceAccount[];
    } catch (err) {
      throw new Error(`Error al obtener cuentas: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Refresca las cuentas de un link desde Prometeo y las guarda en BD.
   * @param link Link con sesion activa
   */
  private static async refreshAccountsFromPrometeo(link: OpenFinanceLink): Promise<void> {
    try {
      const config = getProviderConfig(link.provider);
      const apiKey = getProviderApiKey(link.provider);
      const response = await fetch(`${config.baseUrl}/account/`, {
        method: 'GET',
        headers: buildPrometeoHeaders(apiKey, link.session_key || undefined),
      });

      if (!response.ok) {
        // Si la sesion expiro, no se lanza error, solo se usan las cuentas en BD
        if (response.status === 401) return;
        await handlePrometeoError(response);
      }

      const data = await response.json() as { accounts?: Array<Record<string, unknown>> };
      const accounts = data.accounts || [];
      const supabase = getSupabaseAdmin();

      for (const account of accounts) {
        const externalId = String(account.id || account.account_id || '');
        const accountNumber = String(account.number || account.account_number || '');
        if (!externalId && !accountNumber) continue;

        // Upsert de la cuenta
        await supabase
          .from('open_finance_accounts')
          .upsert({
            link_id: link.id,
            organization_id: link.organization_id,
            external_account_id: externalId || null,
            account_number: accountNumber || null,
            account_type: String(account.type || account.account_type || 'checking'),
            currency: String(account.currency || 'COP'),
            holder_name: String(account.holder || account.holder_name || ''),
            is_active: true,
          }, { onConflict: 'link_id,external_account_id' });
      }
    } catch (err) {
      // Error al refrescar no es fatal; se usan las cuentas en BD
      console.error('Error al refrescar cuentas desde Prometeo:', err);
    }
  }

  /**
   * Obtiene los saldos de las cuentas de un link desde Prometeo (GET /balance/).
   * @param linkId ID del link
   * @param accountId ID opcional de cuenta especifica
   */
  static async getBalancesInternal(linkId: string, accountId?: string): Promise<AccountBalance[]> {
    try {
      const supabase = getSupabaseAdmin();

      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('*')
        .eq('id', linkId)
        .single();

      if (linkError) throw new Error(`Link no encontrado: ${linkError.message}`);
      if (!link.session_key) throw new Error('El link no tiene sesion activa');

      const config = getProviderConfig(link.provider);
      const apiKey = getProviderApiKey(link.provider);
      const url = new URL(`${config.baseUrl}/balance/`);
      if (accountId) url.searchParams.set('account_id', accountId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: buildPrometeoHeaders(apiKey, link.session_key),
      });

      if (!response.ok) await handlePrometeoError(response);

      const data = await response.json() as { balances?: AccountBalance[] };
      return data.balances || [];
    } catch (err) {
      throw new Error(`Error al obtener saldos: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Obtiene movimientos de una cuenta desde Prometeo (GET /movement/).
   * @param linkId ID del link
   * @param accountId ID de la cuenta
   * @param dateFrom Fecha inicial (YYYY-MM-DD)
   * @param dateTo Fecha final (YYYY-MM-DD)
   */
  static async getMovementsInternal(
    linkId: string,
    accountId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Movement[]> {
    try {
      const supabase = getSupabaseAdmin();

      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('*')
        .eq('id', linkId)
        .single();

      if (linkError) throw new Error(`Link no encontrado: ${linkError.message}`);
      if (!link.session_key) throw new Error('El link no tiene sesion activa');

      const config = getProviderConfig(link.provider);
      const apiKey = getProviderApiKey(link.provider);
      const url = new URL(`${config.baseUrl}/movement/`);
      url.searchParams.set('account_id', accountId);
      url.searchParams.set('date_from', dateFrom);
      url.searchParams.set('date_to', dateTo);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: buildPrometeoHeaders(apiKey, link.session_key),
      });

      if (!response.ok) await handlePrometeoError(response);

      const data = await response.json() as { movements?: Movement[] };
      return data.movements || [];
    } catch (err) {
      throw new Error(`Error al obtener movimientos: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Valida una cuenta bancaria via Prometeo (POST /validate_account/).
   * @param input Datos de la cuenta a validar
   */
  static async validateAccount(input: AccountValidationRequest): Promise<AccountValidationResponse> {
    try {
      if (!isProviderConfigured('prometeo')) {
        throw new Error('Prometeo no esta configurado');
      }
      const config = getProviderConfig('prometeo');
      const apiKey = getProviderApiKey('prometeo');
      const response = await fetch(`${config.baseUrl}/validate_account/`, {
        method: 'POST',
        headers: buildPrometeoHeaders(apiKey),
        body: JSON.stringify(input),
      });

      if (!response.ok) await handlePrometeoError(response);

      const data = await response.json() as AccountValidationResponse;
      return data;
    } catch (err) {
      throw new Error(`Error al validar cuenta: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Inicia una transferencia via Prometeo (POST /payout/).
   * @param input Datos de la transferencia
   */
  static async initiateTransferInternal(input: TransferRequest): Promise<TransferResponse> {
    try {
      if (!isProviderConfigured('prometeo')) {
        throw new Error('Prometeo no esta configurado');
      }
      const config = getProviderConfig('prometeo');
      const apiKey = getProviderApiKey('prometeo');
      const response = await fetch(`${config.baseUrl}/payout/`, {
        method: 'POST',
        headers: buildPrometeoHeaders(apiKey),
        body: JSON.stringify(input),
      });

      if (!response.ok) await handlePrometeoError(response);

      const data = await response.json() as TransferResponse;
      return data;
    } catch (err) {
      throw new Error(`Error al iniciar transferencia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Consulta el estado de una transferencia (GET /payout/{id}/).
   * @param transferId ID de la transferencia
   */
  static async getTransferStatus(transferId: string): Promise<TransferResponse> {
    try {
      if (!isProviderConfigured('prometeo')) {
        throw new Error('Prometeo no esta configurado');
      }
      const config = getProviderConfig('prometeo');
      const apiKey = getProviderApiKey('prometeo');
      const response = await fetch(`${config.baseUrl}/payout/${transferId}/`, {
        method: 'GET',
        headers: buildPrometeoHeaders(apiKey),
      });

      if (!response.ok) await handlePrometeoError(response);

      const data = await response.json() as TransferResponse;
      return data;
    } catch (err) {
      throw new Error(`Error al consultar transferencia: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Guarda movimientos en open_finance_transactions.
   * Evita duplicados usando external_transaction_id.
   * @param linkId ID del link
   * @param accountId ID de la cuenta
   * @param movements Movimientos a guardar
   * @returns Cantidad de movimientos importados
   */
  static async saveTransactionsInternal(
    linkId: string,
    accountId: string,
    movements: Movement[],
  ): Promise<{ imported: number }> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener organization_id del link
      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('organization_id')
        .eq('id', linkId)
        .single();

      if (linkError) throw new Error(`Link no encontrado: ${linkError.message}`);

      let imported = 0;

      for (const movement of movements) {
        const externalId = movement.id;
        if (!externalId) continue;

        // Verificar si ya existe (evitar duplicados)
        const { data: existing } = await supabase
          .from('open_finance_transactions')
          .select('id')
          .eq('link_id', linkId)
          .eq('account_id', accountId)
          .eq('external_transaction_id', externalId)
          .maybeSingle();

        if (existing) continue;

        const { error: insertError } = await supabase
          .from('open_finance_transactions')
          .insert({
            link_id: linkId,
            account_id: accountId,
            organization_id: link.organization_id,
            external_transaction_id: externalId,
            transaction_date: movement.date,
            description: movement.description,
            amount: movement.amount,
            currency: movement.currency,
            category: movement.category,
            counterparty: movement.counterparty,
            reference: movement.reference,
            transaction_type: movement.amount >= 0 ? 'credit' : 'debit',
            is_imported: true,
            imported_at: new Date().toISOString(),
            metadata: null,
          });

        if (insertError) {
          console.error(`Error al guardar transaccion ${externalId}:`, insertError.message);
          continue;
        }
        imported++;
      }

      // Actualizar last_sync_at del link
      await supabase
        .from('open_finance_links')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', linkId);

      return { imported };
    } catch (err) {
      throw new Error(`Error al guardar transacciones: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Lista los links de una organizacion.
   * @param organizationId ID de la organizacion
   */
  static async listLinks(organizationId: number): Promise<OpenFinanceLink[]> {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('open_finance_links')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Error al listar links: ${error.message}`);
      return (data || []) as OpenFinanceLink[];
    } catch (err) {
      throw new Error(`Error al listar links: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Revoca un link Open Finance.
   * Marca el link como revocado y desactiva sus cuentas.
   * @param linkId ID del link a revocar
   */
  static async revokeLink(linkId: string): Promise<{ success: boolean }> {
    try {
      const supabase = getSupabaseAdmin();

      // Marcar link como revocado
      const { error: linkError } = await supabase
        .from('open_finance_links')
        .update({
          status: 'revoked',
          session_key: null,
        })
        .eq('id', linkId);

      if (linkError) throw new Error(`Error al revocar link: ${linkError.message}`);

      // Desactivar cuentas asociadas
      const { error: accountsError } = await supabase
        .from('open_finance_accounts')
        .update({ is_active: false })
        .eq('link_id', linkId);

      if (accountsError) {
        console.error('Error al desactivar cuentas:', accountsError.message);
      }

      // Revocar consentimientos asociados
      const { error: consentError } = await supabase
        .from('open_finance_consents')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_reason: 'Link revocado por el usuario',
        })
        .eq('link_id', linkId)
        .eq('status', 'active');

      if (consentError) {
        console.error('Error al revocar consentimientos:', consentError.message);
      }

      return { success: true };
    } catch (err) {
      throw new Error(`Error al revocar link: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Verifica el token de un webhook de Prometeo.
   * @param verifyToken Token recibido en el webhook
   */
  static verifyWebhookSignatureInternal(verifyToken: string): boolean {
    try {
      const expectedToken = getPrometeoWebhookToken();
      if (!expectedToken) return false;
      return verifyToken === expectedToken;
    } catch {
      return false;
    }
  }
  // --------------------------------------------------------
  // Metodos alias compatibles con API routes (reciben supabase)
  // --------------------------------------------------------

  /** Lista links de una organizacion (alias para API routes) */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  static async getLinks(_supabase: unknown, organizationId: number): Promise<OpenFinanceLink[]> {
    return OpenFinanceService.listLinks(organizationId);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /** Crea un link (alias para API routes) — sobrecarga con supabase */
  static async createLink(
    _supabase: unknown,
    input: CreateLinkInput,
    _userId?: string,
  ): Promise<{ linkId: string }>;
  static async createLink(input: CreateLinkInput): Promise<{ linkId: string }>;
  static async createLink(
    arg1: unknown | CreateLinkInput,
    arg2?: CreateLinkInput,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _arg3?: string,
  ): Promise<{ linkId: string }> {
    // Si arg2 existe, arg1 es supabase y arg2 es input
    const input = (arg2 ?? arg1) as CreateLinkInput;
    return OpenFinanceService.createLinkInternal(input);
  }

  /** Login al banco (alias para API routes) — sobrecarga con supabase + linkId */
  static async loginToBank(
    _supabase: unknown,
    linkId: string,
    provider: string,
    credentials: PrometeoLoginRequest,
  ): Promise<PrometeoLoginResponse>;
  static async loginToBank(provider: string, credentials: PrometeoLoginRequest): Promise<PrometeoLoginResponse>;
  static async loginToBank(
    arg1: unknown | string,
    arg2: string | PrometeoLoginRequest,
    arg3?: string,
    arg4?: PrometeoLoginRequest,
  ): Promise<PrometeoLoginResponse> {
    if (arg3 && arg4) {
      // Forma con supabase: (supabase, linkId, provider, credentials)
      const linkId = arg1 as string;
      const provider = arg2 as string;
      const credentials = arg4;
      const result = await OpenFinanceService.loginToBankInternal(provider, credentials);
      if (result.session_key) {
        const supabase = getSupabaseAdmin();
        await supabase
          .from('open_finance_links')
          .update({ session_key: result.session_key, status: 'active', updated_at: new Date().toISOString() })
          .eq('id', linkId);
      }
      return result;
    }
    // Forma sin supabase: (provider, credentials)
    const provider = arg1 as string;
    const credentials = arg2 as PrometeoLoginRequest;
    return OpenFinanceService.loginToBankInternal(provider, credentials);
  }

  /** Obtiene cuentas (alias para API routes) — sobrecarga con supabase */
  static async getAccounts(_supabase: unknown, linkId: string): Promise<OpenFinanceAccount[]>;
  static async getAccounts(linkId: string): Promise<OpenFinanceAccount[]>;
  static async getAccounts(arg1: unknown, arg2?: string): Promise<OpenFinanceAccount[]> {
    const linkId = (arg2 ?? arg1) as string;
    return OpenFinanceService.getAccountsInternal(linkId);
  }

  /** Obtiene saldos (alias para API routes) — sobrecarga con supabase */
  static async getBalances(_supabase: unknown, linkId: string, accountId?: string): Promise<AccountBalance[]>;
  static async getBalances(linkId: string, accountId?: string): Promise<AccountBalance[]>;
  static async getBalances(arg1: unknown, arg2?: string, arg3?: string): Promise<AccountBalance[]> {
    if (arg2) {
      // Forma con supabase: (supabase, linkId, accountId?)
      return OpenFinanceService.getBalancesInternal(arg2, arg3);
    }
    // Forma sin supabase: (linkId, accountId?)
    return OpenFinanceService.getBalancesInternal(arg1 as string, arg2 ?? undefined);
  }

  /** Obtiene movimientos (alias para API routes) — sobrecarga con supabase */
  static async getMovements(
    _supabase: unknown,
    linkId: string,
    accountId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Movement[]>;
  static async getMovements(
    linkId: string,
    accountId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Movement[]>;
  static async getMovements(
    arg1: unknown,
    arg2: string,
    arg3: string,
    arg4: string,
    arg5?: string,
  ): Promise<Movement[]> {
    if (arg5) {
      // Forma con supabase: (supabase, linkId, accountId, dateFrom, dateTo)
      return OpenFinanceService.getMovementsInternal(arg2, arg3, arg4, arg5);
    }
    // Forma sin supabase: (linkId, accountId, dateFrom, dateTo)
    return OpenFinanceService.getMovementsInternal(arg1 as string, arg2, arg3, arg4);
  }

  /** Guarda transacciones (alias para API routes) */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  static async saveTransactions(
    _supabase: unknown,
    linkId: string,
    accountIdOrMovements: string | Movement[],
    movementsArg?: Movement[],
  ): Promise<{ imported: number }> {
    // Soporta 2 firmas: (supabase, linkId, movements) y (supabase, linkId, accountId, movements)
    const accountId = typeof accountIdOrMovements === 'string' ? accountIdOrMovements : '';
    const movements = typeof accountIdOrMovements === 'string' ? (movementsArg ?? []) : accountIdOrMovements;
    return OpenFinanceService.saveTransactionsInternal(linkId, accountId, movements);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /** Inicia transferencia (alias para API routes) — sobrecarga con supabase */
  static async initiateTransfer(
    _supabase: unknown,
    input: TransferRequest,
    _userId: string,
  ): Promise<TransferResponse>;
  static async initiateTransfer(input: TransferRequest): Promise<TransferResponse>;
  static async initiateTransfer(
    arg1: unknown | TransferRequest,
    arg2?: TransferRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _arg3?: string,
  ): Promise<TransferResponse> {
    const input = (arg2 ?? arg1) as TransferRequest;
    return OpenFinanceService.initiateTransferInternal(input);
  }

  /** Verifica webhook (alias para API routes) */
  static async verifyWebhookSignature(
    _rawBody: unknown,
    verifyToken: string,
  ): Promise<boolean>;
  static async verifyWebhookSignature(verifyToken: string): Promise<boolean>;
  static async verifyWebhookSignature(arg1: unknown, arg2?: string): Promise<boolean> {
    const token = (arg2 ?? arg1) as string;
    return Promise.resolve(OpenFinanceService.verifyWebhookSignatureInternal(token));
  }

  /** Procesa evento de webhook */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  static async processWebhookEvent(
    _supabase: unknown,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    console.log('[OpenFinance] Webhook event:', event, 'payload keys:', Object.keys(payload));
    // TODO: implementar procesamiento por tipo de evento
    return { success: true };
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

/** Instancia singleton del servicio */
export const openFinanceService = OpenFinanceService;
