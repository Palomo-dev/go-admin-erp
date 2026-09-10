/**
 * Piezas de apoyo de `domainsService.ts`: contratos de entrada, normalización de
 * los registros DNS que devuelve Resend, mezcla de los "extras" que viven en
 * `provider_configs.settings` y remitente global de respaldo.
 *
 * Vive aparte por el tope de 300 líneas por módulo (regla 6). NO importa a
 * `domainsService` (dependencia en un solo sentido: service → support).
 */

import { type DnsRecord, type EmailDomain, type EmailDomainExtras, type EmailDomainRegion } from './types';
import { dmarcRecord as buildDmarcRecord } from './domainRules';
import { getEmailOrgSettings, listDomainKeyStates } from './domainStore';

export const REGIONS: EmailDomainRegion[] = ['us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1'];
export const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export interface CreateDomainInput {
  domain: string;
  region?: EmailDomainRegion;
  from_name: string;
  from_email_local?: string;
  from_email?: string;
  reply_to?: string;
  open_tracking?: boolean;
  click_tracking?: boolean;
  receiving_enabled?: boolean;
  is_default?: boolean;
}

export interface UpdateDomainInput {
  from_name?: string;
  from_email?: string;
  reply_to?: string | null;
  open_tracking?: boolean;
  click_tracking?: boolean;
  receiving_enabled?: boolean;
  is_default?: boolean;
  dmarc_configured?: boolean;
}

export const DEFAULT_EXTRAS: EmailDomainExtras = {
  region: 'us-east-1', tracking_subdomain: 'links', open_tracking: false, click_tracking: false,
  receiving_enabled: true, provider_status: null, api_key_id: null, last_checked_at: null,
};

/** Registros DNS del proveedor + el DMARC sugerido por nosotros. */
export function normalizeRecords(records: unknown[] | undefined, domain: string): DnsRecord[] {
  const list = ((records ?? []) as Record<string, unknown>[]).map((r) => ({
    record: String(r.record ?? ''), name: String(r.name ?? ''), type: String(r.type ?? ''), value: String(r.value ?? ''),
    ttl: r.ttl ? String(r.ttl) : undefined, status: r.status ? String(r.status) : undefined, priority: typeof r.priority === 'number' ? r.priority : undefined,
  }));
  return [...list, buildDmarcRecord(domain)];
}

/**
 * Fila de `email_domains` + extras de `provider_configs.settings` + estado real
 * de la credencial.
 *
 * `listDomainKeyStates` distingue "no hay credencial" de "hay una que no se
 * puede descifrar" (tester r2 #4): antes la UI decía "clave configurada" sobre
 * una credencial inservible.
 */
export async function withExtras(orgId: number, rows: Record<string, unknown>[]): Promise<EmailDomain[]> {
  const settings = await getEmailOrgSettings(orgId);
  const keys = await listDomainKeyStates(orgId);
  return rows.map((r) => {
    const id = String(r.id);
    const state = keys.get(id);
    return { ...DEFAULT_EXTRAS, ...(settings.email_domains[id] ?? {}), ...(r as object), dns_records: (r.dns_records as DnsRecord[]) ?? [], has_api_key: state === 'ok', api_key_unreadable: state === 'unreadable' } as EmailDomain;
  });
}

/** Remitente global de respaldo (variables de entorno, no de la org). */
export function globalDomain(): { domain: string | null; fromEmail: string | null; fromName: string } {
  const gd = process.env.EMAIL_GLOBAL_DOMAIN?.trim() || null;
  const legacy = process.env.EMAIL_FROM_ADDRESS?.trim() || null;
  const fromEmail = legacy && legacy.includes('@') ? legacy : gd ? `noreply@${gd}` : null;
  const domain = gd ?? (fromEmail ? fromEmail.split('@')[1] : null);
  return { domain, fromEmail, fromName: process.env.EMAIL_GLOBAL_FROM_NAME?.trim() || process.env.EMAIL_FROM_NAME?.trim() || 'GoAdmin' };
}
