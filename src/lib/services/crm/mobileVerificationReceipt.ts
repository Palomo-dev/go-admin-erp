import { randomUUID } from 'node:crypto';
import { signConsentToken, verifyConsentToken } from './bridgeTokens';

export interface ApprovedMobileProof { proof_key: string; provider_ref: string; approved_at: string }
interface ReceiptPayload extends ApprovedMobileProof { org: number; actor: string; phone: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prueba de un OTP ya aprobado: permite persistirlo de nuevo sin volver a consumir el código. */
export function mobileApprovalReceipt(org: number, actor: string, phone: string, providerRef: string, now = Date.now()): string {
  if (!Number.isSafeInteger(org) || org <= 0 || !UUID.test(actor) || !/^\+[1-9]\d{6,14}$/.test(phone)
    || !/^VE[0-9a-f]{32}$/i.test(providerRef)) throw new Error('La aprobación del proveedor no es válida');
  const payload: ReceiptPayload = { org, actor, phone, proof_key: randomUUID(), provider_ref: providerRef, approved_at: new Date(now).toISOString() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signConsentToken(`mobile-approved:${encoded}`, now)}`;
}

export function readMobileApprovalReceipt(receipt: unknown, org: number, actor: string, phone: string, now = Date.now()): ApprovedMobileProof | null {
  if (typeof receipt !== 'string' || receipt.length > 1500) return null;
  const separator = receipt.indexOf('.');
  if (separator <= 0) return null;
  const encoded = receipt.slice(0, separator);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !verifyConsentToken(`mobile-approved:${encoded}`, receipt.slice(separator + 1), now)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ReceiptPayload;
    const approved = Date.parse(payload.approved_at);
    if (payload.org !== org || payload.actor !== actor || payload.phone !== phone || !UUID.test(payload.proof_key)
      || !/^VE[0-9a-f]{32}$/i.test(payload.provider_ref) || !Number.isFinite(approved)
      || approved > now + 15000 || now - approved > 600000) return null;
    return { proof_key: payload.proof_key, provider_ref: payload.provider_ref, approved_at: payload.approved_at };
  } catch { return null; }
}
