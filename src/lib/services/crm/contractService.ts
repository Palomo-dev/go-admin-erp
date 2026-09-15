import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEsignReadiness, type EsignReadiness, type ProviderConfigRow } from '@/lib/services/crm/providerReadiness';
import { documensoAdapter, EsignProviderError, type EsignAdapter } from '@/lib/services/crm/esignAdapter';
import {
  applyWebhookEvent,
  canTransition,
  isContractStatus,
  parseDocumensoPayload,
  verifyDocumensoSignature,
  type ContractStatus,
  type ContractSigner,
} from '@/lib/services/crm/contractStateMachine';

/**
 * Servicio CRM - Contratos y firmas digitales (Fase 10).
 *
 * Tabla: contract_signatures
 *   id, organization_id, opportunity_id, quotation_id, provider,
 *   provider_document_id, status (pending|sent|viewed|signed|declined|expired),
 *   signers (jsonb), signed_pdf_path, sent_at, signed_at, expires_at, created_at
 *
 * Reglas F10:
 *  - Sin proveedor configurado (organización o plataforma, sin placeholders)
 *    no se crea nada: `EsignNotConfiguredError` con qué falta.
 *  - El proveedor se llama por `EsignAdapter` (doblado en pruebas).
 *  - El webhook verifica la firma con el secreto de la organización DE LA FILA
 *    (resuelta por `provider_document_id`), nunca del body; fallo cerrado.
 *  - Las transiciones las decide `contractStateMachine`.
 */

export type { ContractStatus, ContractSigner };

export interface ContractSignature {
  id: string;
  organization_id: number;
  opportunity_id: string;
  quotation_id: string | null;
  provider: string;
  provider_document_id: string | null;
  status: ContractStatus;
  signers: ContractSigner[];
  signed_pdf_path: string | null;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface CreateContractInput {
  opportunity_id: string;
  quotation_id?: string | null;
  signers: ContractSigner[];
  expires_at?: string | null;
  document_url?: string;
  document_title?: string;
  document_html?: string;
}

export interface ContractFilters {
  opportunity_id?: string;
  status?: ContractStatus;
  limit?: number;
}

export class EsignNotConfiguredError extends Error {
  constructor(readonly missing: string[]) {
    super('Firma electrónica no configurada');
    this.name = 'EsignNotConfiguredError';
  }
}

export class ContractSendError extends Error {
  constructor(message: string, readonly contractId: string) {
    super(message);
    this.name = 'ContractSendError';
  }
}

// ─── Disponibilidad del proveedor ────────────────────────────────────────────

/** Lee `provider_configs` (categoría esign) de la organización y resuelve la disponibilidad. */
export async function getEsignReadiness(orgId: number, supabase: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<EsignReadiness> {
  const { data, error } = await supabase
    .from('provider_configs')
    .select('provider, is_active, credentials, settings, priority')
    .eq('organization_id', orgId)
    .eq('category', 'esign');
  if (error) console.warn('contractService.getEsignReadiness - error:', error.message);
  return resolveEsignReadiness({ orgConfigs: ((data ?? []) as ProviderConfigRow[]), env });
}

/** Lo que puede ver una organización cliente (sin claves). */
export function publicReadiness(r: EsignReadiness): { configured: boolean; provider: string | null; source: string | null; missing: string[] } {
  return { configured: r.configured, provider: r.provider, source: r.source, missing: r.missing };
}

// ─── Lecturas ────────────────────────────────────────────────────────────────

export async function getContracts(orgId: number, supabase: SupabaseClient, filters?: ContractFilters): Promise<ContractSignature[]> {
  let query = supabase.from('contract_signatures').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  if (filters?.opportunity_id) query = query.eq('opportunity_id', filters.opportunity_id);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.limit) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error) {
    console.warn('contractService.getContracts - error:', error.message);
    return [];
  }
  return (data || []) as ContractSignature[];
}

export async function getContract(id: string, orgId: number, supabase: SupabaseClient): Promise<ContractSignature | null> {
  const { data, error } = await supabase.from('contract_signatures').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) {
    console.warn('contractService.getContract - error:', error.message);
    return null;
  }
  return (data as ContractSignature) || null;
}

// ─── Creación y envío ────────────────────────────────────────────────────────

export interface CreateContractDeps {
  adapter?: EsignAdapter;
  readiness?: EsignReadiness;
  now?: () => string;
}

/**
 * Crea el contrato y lo envía a firma. Devuelve null si la oportunidad no es
 * de la organización. Lanza `EsignNotConfiguredError` (sin escribir nada) si
 * no hay proveedor, y `ContractSendError` (fila queda `pending`) si el
 * proveedor rechaza el documento.
 */
export async function createContract(orgId: number, data: CreateContractInput, supabase: SupabaseClient, deps: CreateContractDeps = {}): Promise<ContractSignature | null> {
  const readiness = deps.readiness ?? (await getEsignReadiness(orgId, supabase));
  if (!readiness.configured || !readiness.apiKey) throw new EsignNotConfiguredError(readiness.missing);

  const { data: opp } = await supabase.from('opportunities').select('id, name').eq('id', data.opportunity_id).eq('organization_id', orgId).maybeSingle();
  if (!opp) return null;
  if (data.quotation_id) {
    const { data: quot } = await supabase.from('quotations').select('id').eq('id', data.quotation_id).eq('organization_id', orgId).maybeSingle();
    if (!quot) return null;
  }

  const { data: contractRow, error: dbError } = await supabase
    .from('contract_signatures')
    .insert({
      organization_id: orgId,
      opportunity_id: data.opportunity_id,
      quotation_id: data.quotation_id ?? null,
      provider: 'documenso',
      provider_document_id: null,
      status: 'pending',
      signers: data.signers,
      signed_pdf_path: null,
      sent_at: null,
      signed_at: null,
      expires_at: data.expires_at ?? null,
    })
    .select('*')
    .single();
  if (dbError || !contractRow) throw new Error(`Error creando contrato: ${dbError?.message ?? 'sin datos'}`);
  const contract = contractRow as ContractSignature;

  const adapter = deps.adapter ?? documensoAdapter;
  let providerDocumentId: string;
  try {
    const result = await adapter.createDocument(
      {
        title: data.document_title || `Contrato — ${String((opp as { name?: string }).name ?? contract.id)}`,
        document_url: data.document_url,
        document_html: data.document_html,
        signers: data.signers.map((s) => ({ name: s.name, email: s.email })),
        meta: { contract_id: contract.id, organization_id: orgId },
      },
      { apiKey: readiness.apiKey, apiUrl: readiness.apiUrl },
    );
    providerDocumentId = result.providerDocumentId;
  } catch (err) {
    const msg = err instanceof EsignProviderError ? err.message : 'No se pudo enviar el contrato al proveedor de firma';
    console.error('contractService.createContract - proveedor:', err instanceof Error ? err.message : err);
    throw new ContractSendError(msg, contract.id);
  }

  const now = deps.now ? deps.now() : new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('contract_signatures')
    .update({ provider_document_id: providerDocumentId, status: 'sent', sent_at: now })
    .eq('id', contract.id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();
  if (updateError) throw new ContractSendError(`El documento se envió pero no se pudo registrar: ${updateError.message}`, contract.id);
  return (updated as ContractSignature) ?? { ...contract, provider_document_id: providerDocumentId, status: 'sent', sent_at: now };
}

export class ContractConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractConflictError';
  }
}

export interface ManualStatusOptions {
  /** Usuario de la sesión que hace el cambio a mano (va a la actividad). */
  userId: string | null;
}

/**
 * Cambio manual de estado desde la app (respeta la máquina de estados). El
 * UPDATE va condicionado al estado leído: 0 filas afectadas = otro proceso
 * (webhook o compañero) lo cambió entre medias → `ContractConflictError`.
 * «signed» a mano deja actividad `system` con `manual_signed_by` en la
 * oportunidad (`contract_signatures` no tiene `metadata`, verificado por MCP);
 * quién puede hacerlo lo decide la ruta por id de rol.
 */
export async function updateContractStatus(id: string, orgId: number, status: ContractStatus, supabase: SupabaseClient, opts: ManualStatusOptions = { userId: null }): Promise<ContractSignature | null> {
  if (!isContractStatus(status)) throw new Error('Estado inválido');
  const current = await getContract(id, orgId, supabase);
  if (!current) return null;
  if (!canTransition(current.status, status)) throw new Error(`Transición no permitida: ${current.status} → ${status}`);
  const updateData: Record<string, unknown> = { status };
  const now = new Date().toISOString();
  if (status === 'signed') updateData.signed_at = now;
  const { data: result, error } = await supabase.from('contract_signatures').update(updateData).eq('id', id).eq('organization_id', orgId).eq('status', current.status).select('*');
  if (error) throw new Error(`Error actualizando estado del contrato: ${error.message}`);
  const rows = (result ?? []) as ContractSignature[];
  if (rows.length === 0) throw new ContractConflictError(`El contrato cambió de estado mientras tanto (ya no está en ${current.status}); recarga y vuelve a intentarlo`);
  if (status === 'signed') {
    const { error: actError } = await supabase.from('activities').insert({
      organization_id: orgId,
      activity_type: 'system',
      user_id: opts.userId,
      notes: `Contrato marcado como firmado a mano (sin proveedor de firma)${opts.userId ? '' : ' por un proceso sin usuario'}`,
      related_type: 'opportunity',
      related_id: current.opportunity_id,
      occurred_at: now,
      metadata: { source: 'contract', auto_generated: true, action: 'contract_manual_signed', contract_id: id, manual_signed_by: opts.userId },
    });
    if (actError) console.warn('contractService.updateContractStatus - actividad no registrada:', actError.message);
  }
  return rows[0];
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

export interface ProcessWebhookDeps {
  serviceClient: SupabaseClient;
  env?: Record<string, string | undefined>;
  now?: () => string;
}

/**
 * Procesa un webhook de Documenso con fallo cerrado:
 *  1. parsea el cuerpo; 2. localiza la fila por `provider_document_id`
 *  (service role: no hay sesión); 3. resuelve el secreto de ESA organización
 *  (o plataforma); 4. verifica la firma; 5. aplica la transición y actualiza
 *  SOLO esa fila (id + organization_id + status leído: 0 filas → 409).
 * Nada se escribe antes de verificar. Reenvíos → 409 (transición inválida).
 * Documento desconocido: 404 SOLO si la firma verifica con el secreto de
 * plataforma; si no, 401 (sin oráculo de existencia para un remitente no
 * autenticado).
 */
export async function processDocumensoWebhook(rawBody: string, headers: Record<string, string | null | undefined>, deps: ProcessWebhookDeps): Promise<WebhookOutcome> {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { success: false, error: 'JSON inválido' } };
  }
  const payload = parseDocumensoPayload(parsedBody);
  if (!payload) return { status: 400, body: { success: false, error: 'Faltan event o document_id' } };

  const { data: row, error } = await deps.serviceClient
    .from('contract_signatures')
    .select('id, organization_id, status, signers, quotation_id, provider')
    .eq('provider_document_id', payload.document_id)
    .eq('provider', 'documenso')
    .maybeSingle();
  if (error) return { status: 500, body: { success: false, error: 'No se pudo consultar el contrato' } };
  if (!row) {
    const platform = resolveEsignReadiness({ orgConfigs: [], env: deps.env ?? process.env });
    if (!verifyDocumensoSignature({ rawBody, headers, secret: platform.webhookSecret })) {
      console.warn('[contracts webhook] documento desconocido con firma no verificada', { document: payload.document_id });
      return { status: 401, body: { success: false, error: 'Firma del webhook inválida' } };
    }
    return { status: 404, body: { success: false, error: 'Contrato no encontrado' } };
  }
  const contract = row as { id: string; organization_id: number; status: ContractStatus; signers: ContractSigner[]; quotation_id: string | null };

  const readiness = await getEsignReadiness(contract.organization_id, deps.serviceClient, deps.env ?? process.env);
  if (!verifyDocumensoSignature({ rawBody, headers, secret: readiness.webhookSecret })) {
    console.warn('[contracts webhook] firma inválida o secreto no configurado', { organization: contract.organization_id, document: payload.document_id });
    return { status: 401, body: { success: false, error: 'Firma del webhook inválida' } };
  }

  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const applied = applyWebhookEvent({ id: contract.id, status: contract.status, signers: contract.signers ?? [], quotation_id: contract.quotation_id }, payload, nowIso);
  if (!applied.ok) return { status: 409, body: { success: false, error: applied.reason, contract_id: contract.id } };

  const { data: updatedRows, error: updateError } = await deps.serviceClient
    .from('contract_signatures')
    .update(applied.update)
    .eq('id', contract.id)
    .eq('organization_id', contract.organization_id)
    .eq('status', contract.status)
    .select('id');
  if (updateError) return { status: 500, body: { success: false, error: 'No se pudo actualizar el contrato', contract_id: contract.id } };
  if (!updatedRows || (updatedRows as unknown[]).length === 0) {
    // Otro webhook cambió el estado entre la lectura y el UPDATE: no se vincula nada.
    return { status: 409, body: { success: false, error: `El contrato ya no está en ${contract.status}`, contract_id: contract.id } };
  }

  if (applied.linkQuotation && contract.quotation_id) {
    const { error: quotError } = await deps.serviceClient
      .from('quotations')
      .update({ signature_id: contract.id })
      .eq('id', contract.quotation_id)
      .eq('organization_id', contract.organization_id);
    if (quotError) console.warn('[contracts webhook] cotización no vinculada:', quotError.message);
  }
  return { status: 200, body: { success: true, contract_id: contract.id, status: applied.status } };
}
