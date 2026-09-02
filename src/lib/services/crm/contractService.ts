import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/**
 * Servicio CRM - Contratos y firmas digitales (Fase 10).
 *
 * Tabla: contract_signatures
 *   id, organization_id, opportunity_id, quotation_id, provider,
 *   provider_document_id, status (pending|sent|viewed|signed|declined|expired),
 *   signers (jsonb), signed_pdf_path, sent_at, signed_at, expires_at, created_at
 *
 * Integración con Documenso (firma digital):
 *   - createContract envía el documento a Documenso via API
 *   - handleContractWebhook procesa los eventos de Documenso
 *   - Variables de entorno: DOCUMENSO_API_KEY, DOCUMENSO_API_URL
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ContractStatus =
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'expired';

export interface ContractSigner {
  name: string;
  email: string;
  signed_at?: string | null;
  status?: string;
}

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
  // Datos del documento a firmar (PDF o HTML)
  document_url?: string;
  document_title?: string;
  document_html?: string;
}

export interface ContractFilters {
  opportunity_id?: string;
  status?: ContractStatus;
  limit?: number;
}

export interface DocumensoWebhookPayload {
  event: string;
  document_id: string;
  status?: string;
  signed_pdf_url?: string;
  signers?: Array<{
    email: string;
    status: string;
    signed_at?: string;
  }>;
}

// ─── Cliente Documenso ───────────────────────────────────────────────────────

function getDocumensoConfig() {
  const apiKey = process.env.DOCUMENSO_API_KEY;
  const apiUrl = process.env.DOCUMENSO_API_URL || 'https://app.documenso.com/api/v1';
  return { apiKey, apiUrl };
}

function createServiceSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // Service-role client sin cookies; @supabase/ssr exige el campo `cookies`
    // en sus overloads, por eso se castea el options.
    { auth: { persistSession: false } } as any
  );
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista contratos (firmas) de una organización con filtros opcionales.
 */
export async function getContracts(
  orgId: number,
  supabase: SupabaseClient,
  filters?: ContractFilters
): Promise<ContractSignature[]> {
  let query = supabase
    .from('contract_signatures')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.opportunity_id) {
    query = query.eq('opportunity_id', filters.opportunity_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('contractService.getContracts - error:', error.message);
    return [];
  }

  return (data || []) as ContractSignature[];
}

/**
 * Crea un contrato y lo envía a Documenso para firma digital.
 *
 * 1. Crea el registro en contract_signatures con status='pending'.
 * 2. Si DOCUMENSO_API_KEY está configurada, envía el documento a Documenso.
 * 3. Actualiza el registro con provider_document_id y status='sent'.
 * 4. Si no hay API key, queda en status='pending' (modo offline).
 */
export async function createContract(
  orgId: number,
  data: CreateContractInput,
  supabase: SupabaseClient
): Promise<ContractSignature | null> {
  // 1. Crear registro inicial con status='pending'
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

  if (dbError) {
    console.error('contractService.createContract - insert error:', dbError.message);
    throw new Error(`Error creando contrato: ${dbError.message}`);
  }

  const contract = contractRow as ContractSignature;

  // 2. Intentar envío a Documenso si hay API key configurada
  const { apiKey, apiUrl } = getDocumensoConfig();

  if (!apiKey) {
    // Modo offline: el contrato queda en 'pending' hasta configurar Documenso
    console.warn('contractService.createContract - DOCUMENSO_API_KEY no configurada, contrato creado en modo offline');
    return contract;
  }

  try {
    // 3. Crear documento en Documenso
    const documensoResponse = await fetch(`${apiUrl}/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: data.document_title || `Contrato - ${contract.id}`,
        document_url: data.document_url,
        document_html: data.document_html,
        signers: data.signers.map((s) => ({
          name: s.name,
          email: s.email,
        })),
        meta: {
          contract_id: contract.id,
          organization_id: orgId,
        },
      }),
    });

    if (!documensoResponse.ok) {
      const errText = await documensoResponse.text();
      console.error('contractService.createContract - Documenso API error:', errText);
      return contract; // Queda en pending
    }

    const documensoData = await documensoResponse.json() as {
      document_id?: string;
      id?: string;
    };
    const providerDocumentId = documensoData.document_id || documensoData.id || null;

    // 4. Actualizar registro con provider_document_id y status='sent'
    const { data: updated, error: updateError } = await supabase
      .from('contract_signatures')
      .update({
        provider_document_id: providerDocumentId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', contract.id)
      .select('*')
      .single();

    if (updateError) {
      console.warn('contractService.createContract - update error:', updateError.message);
      return contract;
    }

    return updated as ContractSignature;
  } catch (err) {
    console.error('contractService.createContract - Documenso error:', err);
    return contract; // Queda en pending
  }
}

/**
 * Obtiene un contrato por ID.
 */
export async function getContract(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<ContractSignature | null> {
  const { data, error } = await supabase
    .from('contract_signatures')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.warn('contractService.getContract - error:', error.message);
    return null;
  }

  return (data as ContractSignature) || null;
}

/**
 * Actualiza el estado de un contrato.
 */
export async function updateContractStatus(
  id: string,
  orgId: number,
  status: ContractStatus,
  supabase: SupabaseClient
): Promise<ContractSignature | null> {
  const updateData: Record<string, unknown> = {
    status,
  };

  if (status === 'signed') {
    updateData.signed_at = new Date().toISOString();
  }

  const { data: result, error } = await supabase
    .from('contract_signatures')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('contractService.updateContractStatus - error:', error.message);
    throw new Error(`Error actualizando estado del contrato: ${error.message}`);
  }

  return (result as ContractSignature) || null;
}

/**
 * Procesa un webhook de Documenso.
 *
 * Recibe el payload del webhook, identifica el contrato por provider_document_id,
 * y actualiza el estado según el evento recibido.
 *
 * Usa service role client para bypass de RLS (el webhook no tiene sesión de usuario).
 */
export async function handleContractWebhook(
  payload: DocumensoWebhookPayload,
  _supabase: SupabaseClient
): Promise<{ success: boolean; contract_id: string | null }> {
  const serviceSupabase = createServiceSupabase();

  const { document_id, event, status, signed_pdf_url, signers } = payload;

  if (!document_id) {
    console.warn('contractService.handleContractWebhook - document_id faltante');
    return { success: false, contract_id: null };
  }

  // 1. Buscar el contrato por provider_document_id
  const { data: contract, error: findError } = await serviceSupabase
    .from('contract_signatures')
    .select('*')
    .eq('provider_document_id', document_id)
    .maybeSingle();

  if (findError || !contract) {
    console.warn('contractService.handleContractWebhook - contrato no encontrado para document_id:', document_id);
    return { success: false, contract_id: null };
  }

  const contractRow = contract as ContractSignature;

  // 2. Mapear evento de Documenso a estado interno
  const updateData: Record<string, unknown> = {};

  switch (event) {
    case 'document.sent':
      updateData.status = 'sent';
      updateData.sent_at = new Date().toISOString();
      break;
    case 'document.viewed':
      updateData.status = 'viewed';
      break;
    case 'document.signed':
    case 'document.completed':
      updateData.status = 'signed';
      updateData.signed_at = new Date().toISOString();
      if (signed_pdf_url) {
        updateData.signed_pdf_path = signed_pdf_url;
      }
      break;
    case 'document.declined':
      updateData.status = 'declined';
      break;
    case 'document.expired':
      updateData.status = 'expired';
      break;
    default:
      if (status) {
        updateData.status = status;
      }
  }

  // 3. Actualizar signers si vienen en el payload
  if (signers && signers.length > 0) {
    const updatedSigners: ContractSigner[] = contractRow.signers.map((existing) => {
      const match = signers.find((s) => s.email === existing.email);
      if (match) {
        return {
          ...existing,
          status: match.status,
          signed_at: match.signed_at ?? existing.signed_at,
        };
      }
      return existing;
    });
    updateData.signers = updatedSigners;
  }

  // 4. Actualizar el registro
  const { error: updateError } = await serviceSupabase
    .from('contract_signatures')
    .update(updateData)
    .eq('id', contractRow.id);

  if (updateError) {
    console.error('contractService.handleContractWebhook - update error:', updateError.message);
    return { success: false, contract_id: contractRow.id };
  }

  // 5. Si el contrato se firmó y hay quotation_id, vincular el signature_id en quotations
  if (updateData.status === 'signed' && contractRow.quotation_id) {
    await serviceSupabase
      .from('quotations')
      .update({ signature_id: contractRow.id })
      .eq('id', contractRow.quotation_id);
  }

  return { success: true, contract_id: contractRow.id };
}
