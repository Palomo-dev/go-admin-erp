/**
 * F10 — máquina de estados de `contract_signatures` y verificación del webhook
 * de Documenso. Puro (solo `crypto` de Node); lo consumen `contractService` y
 * la ruta `api/crm/webhooks/documenso`.
 *
 * Estados (CHECK en BD): pending | sent | viewed | signed | declined | expired.
 * `signed`, `declined` y `expired` son terminales. Un webhook nunca puede
 * retroceder un contrato firmado ni firmar uno que no se envió.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';

export type ContractStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';

export const CONTRACT_STATUSES: readonly ContractStatus[] = ['pending', 'sent', 'viewed', 'signed', 'declined', 'expired'];

const TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  pending: ['sent', 'expired', 'declined'],
  sent: ['viewed', 'signed', 'declined', 'expired'],
  viewed: ['signed', 'declined', 'expired'],
  signed: [],
  declined: [],
  expired: [],
};

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  if (!isContractStatus(from) || !isContractStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/** Evento del proveedor → estado interno. Desconocido → null (nunca se acepta `status` libre). */
export function mapProviderEvent(event: string): ContractStatus | null {
  const e = String(event ?? '').toLowerCase().replace(/_/g, '.');
  switch (e) {
    case 'document.sent':
      return 'sent';
    case 'document.opened':
    case 'document.viewed':
      return 'viewed';
    case 'document.signed':
    case 'document.completed':
      return 'signed';
    case 'document.rejected':
    case 'document.declined':
    case 'document.cancelled':
    case 'document.canceled':
      return 'declined';
    case 'document.expired':
      return 'expired';
    default:
      return null;
  }
}

export interface ContractSigner {
  name: string;
  email: string;
  signed_at?: string | null;
  status?: string;
}

export interface WebhookSigner {
  email: string;
  status: string;
  signed_at?: string | null;
}

export interface NormalizedWebhookPayload {
  event: string;
  document_id: string;
  status?: string;
  signed_pdf_url?: string;
  signers?: WebhookSigner[];
}

export interface ContractRowLite {
  id: string;
  status: ContractStatus;
  signers: ContractSigner[];
  quotation_id: string | null;
}

export type WebhookApplyResult =
  | { ok: true; status: ContractStatus; update: Record<string, unknown>; linkQuotation: boolean }
  | { ok: false; reason: string };

/** Actualiza firmantes por email (case-insensitive) sin admitir firmantes nuevos del webhook. */
export function mergeSigners(existing: ContractSigner[], incoming: WebhookSigner[] | undefined): ContractSigner[] {
  if (!incoming?.length) return existing;
  return existing.map((s) => {
    const match = incoming.find((i) => typeof i.email === 'string' && i.email.toLowerCase() === s.email.toLowerCase());
    if (!match) return s;
    return { ...s, status: match.status, signed_at: match.signed_at ?? s.signed_at ?? null };
  });
}

/** Calcula la escritura que corresponde a un evento; no toca la BD. */
export function applyWebhookEvent(row: ContractRowLite, payload: NormalizedWebhookPayload, nowIso: string): WebhookApplyResult {
  const target = mapProviderEvent(payload.event);
  if (!target) return { ok: false, reason: `Evento no reconocido: ${payload.event}` };
  if (!canTransition(row.status, target)) return { ok: false, reason: `Transición no permitida: ${row.status} → ${target}` };
  const update: Record<string, unknown> = { status: target };
  if (target === 'sent') update.sent_at = nowIso;
  if (target === 'signed') {
    update.signed_at = nowIso;
    if (typeof payload.signed_pdf_url === 'string' && /^https:\/\//i.test(payload.signed_pdf_url) && payload.signed_pdf_url.length <= 2048) {
      update.signed_pdf_path = payload.signed_pdf_url;
    }
  }
  if (payload.signers?.length) update.signers = mergeSigners(row.signers ?? [], payload.signers);
  return { ok: true, status: target, update, linkQuotation: target === 'signed' && !!row.quotation_id };
}

// ─── Firma del webhook (fallo cerrado) ───────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface VerifyDocumensoInput {
  rawBody: string;
  headers: Record<string, string | null | undefined>;
  secret: string | null | undefined;
}

/**
 * Acepta dos mecanismos, ambos en tiempo constante:
 *  - `X-Documenso-Signature`: HMAC-SHA256(secret, raw body) en hex.
 *  - `X-Documenso-Secret`: el secreto compartido tal cual (mecanismo nativo).
 * Sin secreto (o con placeholder), sin cabecera o sin coincidencia → false.
 */
export function verifyDocumensoSignature(input: VerifyDocumensoInput): boolean {
  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  if (!secret || secret.length < 16 || isPlaceholderCredential(secret)) return false;
  const h = (name: string) => {
    const v = input.headers[name] ?? input.headers[name.toLowerCase()];
    return typeof v === 'string' ? v.trim() : '';
  };
  const sig = h('x-documenso-signature');
  if (sig) {
    const expected = createHmac('sha256', secret).update(input.rawBody, 'utf8').digest('hex');
    const provided = sig.replace(/^sha256=/i, '').toLowerCase();
    return safeEqual(provided, expected);
  }
  const shared = h('x-documenso-secret');
  if (shared) return safeEqual(shared, secret);
  return false;
}

function normalizeSignerStatus(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('sign')) return s.includes('not') ? 'pending' : 'signed';
  if (s.includes('reject') || s.includes('declin')) return 'declined';
  if (s.includes('open') || s.includes('view')) return 'viewed';
  return s || 'pending';
}

/**
 * Normaliza el cuerpo del webhook. Documenso envía
 * `{ event: 'DOCUMENT_COMPLETED', payload: { id, recipients: [...] } }`;
 * se admite también el formato plano `{ event, document_id }` de la primera
 * versión de la ruta. Sin evento o sin id → null.
 */
export function parseDocumensoPayload(body: unknown): NormalizedWebhookPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const eventRaw = typeof b.event === 'string' ? b.event : typeof b.type === 'string' ? b.type : '';
  if (!eventRaw) return null;
  const event = eventRaw.toLowerCase().replace(/_/g, '.');
  const payload = b.payload && typeof b.payload === 'object' ? (b.payload as Record<string, unknown>) : null;
  const rawId = b.document_id ?? b.documentId ?? payload?.id ?? payload?.documentId;
  if (rawId === undefined || rawId === null || rawId === '') return null;
  const document_id = String(rawId);
  if (document_id.length > 200) return null;
  const recipients = Array.isArray(payload?.recipients) ? (payload!.recipients as Record<string, unknown>[]) : Array.isArray(b.signers) ? (b.signers as Record<string, unknown>[]) : [];
  const signers: WebhookSigner[] = recipients
    .filter((r) => r && typeof r.email === 'string')
    .map((r) => ({ email: String(r.email), status: normalizeSignerStatus(r.status ?? r.signingStatus), signed_at: typeof (r.signed_at ?? r.signedAt) === 'string' ? String(r.signed_at ?? r.signedAt) : null }));
  const pdf = b.signed_pdf_url ?? (payload?.documentData as Record<string, unknown> | undefined)?.url ?? payload?.downloadUrl;
  return {
    event,
    document_id,
    status: typeof b.status === 'string' ? b.status : undefined,
    signed_pdf_url: typeof pdf === 'string' ? pdf : undefined,
    signers: signers.length ? signers : undefined,
  };
}
