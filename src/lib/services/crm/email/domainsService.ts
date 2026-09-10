/**
 * Dominios de email por organización ↔ Resend Domains API (FASE-07 §4.2, B2).
 *
 * create → resend.domains.create({ name, region, customReturnPath:'send',
 *   openTracking, clickTracking, trackingSubdomain, capabilities:{sending,receiving} })
 *   (nombres camelCase verificados en node_modules/resend/dist/index.d.mts:1369)
 * → fila email_domains (provider_domain_id, dns_records + DMARC sugerido)
 * → resend.apiKeys.create({ name, permission:'sending_access', domain_id })
 *   (snake_case `domain_id` en 6.26, index.d.mts:239) → token en domainStore.
 * verify → domains.verify + domains.get → status. setDefault. update tracking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError, type EmailDomain, type EmailKind } from './types';
import { getMasterResend, getMasterResendKey, getResendClient } from './resendClient';
import { mapProviderStatus } from './domainRules';
import { getDomainApiKey, getDomainExtras, getEmailOrgSettings, removeDomainExtras, setDomainExtras, storeDomainApiKey, getOrgResendKey } from './domainStore';
import { DOMAIN_RE, REGIONS, globalDomain, normalizeRecords, withExtras, type CreateDomainInput, type UpdateDomainInput } from './domainsSupport';

// Contratos, normalización de DNS, extras y remitente global: `domainsSupport.ts`
// (tope de 300 líneas por módulo). Se reexportan los tipos para no romper imports.
export type { CreateDomainInput, UpdateDomainInput } from './domainsSupport';

// Reglas puras en `domainRules.ts`; se reexportan para no romper imports.
export { dmarcRecord, mapProviderStatus, registrableDomain } from './domainRules';

export async function listDomains(orgId: number, supabase: SupabaseClient): Promise<EmailDomain[]> {
  const { data, error } = await supabase.from('email_domains').select('*').eq('organization_id', orgId).order('is_default', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new EmailError('DB', error.message, 500);
  return withExtras(orgId, (data ?? []) as Record<string, unknown>[]);
}

/**
 * ¿`domain` (o un SUBdominio suyo) está registrado y VERIFICADO por la org?
 * Acota el destinatario de `test-send` (tester r1 #8).
 *
 * Ronda 3 (tester r2, fallo nuevo #5): se cierran dos huecos.
 *  1. `status = 'verified'`: dar de alta un dominio solo llama a
 *     `resend.domains.create`, que acepta cualquier nombre; la fila queda
 *     `pending` para siempre si no es tuyo.
 *  2. Se elimina la rama del dominio PADRE (`own.endsWith('.' + d)`): con ella,
 *     registrar `crm.gmail.com` autorizaba el envío de prueba a cualquier
 *     `@gmail.com`, saltándose `fn_can_contact`.
 */
export async function orgOwnsDomain(orgId: number, domain: string, supabase: SupabaseClient): Promise<boolean> {
  const d = (domain ?? '').trim().toLowerCase();
  if (!d) return false;
  const { data } = await supabase.from('email_domains').select('domain').eq('organization_id', orgId).eq('status', 'verified');
  return ((data ?? []) as Array<{ domain: string }>).some((row) => {
    const own = (row.domain ?? '').toLowerCase();
    return !!own && (d === own || d.endsWith(`.${own}`));
  });
}

export async function getDomain(orgId: number, id: string, supabase: SupabaseClient): Promise<EmailDomain | null> {
  const { data, error } = await supabase.from('email_domains').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) throw new EmailError('DB', error.message, 500);
  if (!data) return null;
  return (await withExtras(orgId, [data as Record<string, unknown>]))[0];
}

async function requireDomain(orgId: number, id: string, supabase: SupabaseClient): Promise<EmailDomain> {
  const d = await getDomain(orgId, id, supabase);
  if (!d) throw new EmailError('NOT_FOUND', 'Dominio no encontrado', 404);
  return d;
}

async function clearDefault(orgId: number, supabase: SupabaseClient, exceptId?: string): Promise<void> {
  let q = supabase.from('email_domains').update({ is_default: false }).eq('organization_id', orgId).eq('is_default', true);
  if (exceptId) q = q.neq('id', exceptId);
  await q;
}

export async function createDomain(orgId: number, input: CreateDomainInput, supabase: SupabaseClient): Promise<EmailDomain> {
  const domain = (input.domain ?? '').trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) throw new EmailError('INVALID_DOMAIN', 'Dominio inválido (ej. crm.tuempresa.com)', 400);
  const region = input.region && REGIONS.includes(input.region) ? input.region : 'us-east-1';
  const local = (input.from_email_local ?? input.from_email?.split('@')[0] ?? 'ventas').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!local) throw new EmailError('VALIDATION', 'Remitente inválido', 400);
  const fromEmail = `${local}@${domain}`;
  const { data: dup } = await supabase.from('email_domains').select('id').eq('organization_id', orgId).eq('domain', domain).maybeSingle();
  if (dup) throw new EmailError('DOMAIN_EXISTS', 'Ese dominio ya está registrado', 409);

  const master = getMasterResend();
  const { data: dom, error } = await master.domains.create({
    name: domain, region, customReturnPath: 'send',
    openTracking: !!input.open_tracking, clickTracking: !!input.click_tracking, trackingSubdomain: 'links',
    capabilities: { sending: 'enabled', receiving: input.receiving_enabled === false ? 'disabled' : 'enabled' },
  });
  if (error || !dom) throw new EmailError('PROVIDER', `Resend: ${error?.message ?? 'no se pudo crear el dominio'}`, 502, error);

  const { data: existingCount } = await supabase.from('email_domains').select('id').eq('organization_id', orgId).limit(1);
  const makeDefault = input.is_default ?? (existingCount?.length ?? 0) === 0;
  if (makeDefault) await clearDefault(orgId, supabase);

  const { data: row, error: insErr } = await supabase.from('email_domains').insert({
    organization_id: orgId, domain, provider: 'resend', provider_domain_id: dom.id, status: mapProviderStatus(dom.status),
    dns_records: normalizeRecords(dom.records as unknown[], domain), from_name: input.from_name?.trim() || null, from_email: fromEmail,
    reply_to: input.reply_to?.trim() || null, is_default: makeDefault,
  }).select('*').single();
  if (insErr || !row) throw new EmailError('DB', insErr?.message ?? 'No se pudo guardar el dominio', 500);
  const id = String((row as { id: string }).id);

  let apiKeyId: string | null = null;
  const { data: key, error: keyErr } = await master.apiKeys.create({ name: `org-${orgId}-${domain}`.slice(0, 50), permission: 'sending_access', domain_id: dom.id });
  if (!keyErr && key?.token) {
    apiKeyId = key.id;
    await storeDomainApiKey(orgId, id, key.token);
  } else {
    console.warn('[emailDomains] No se pudo crear API key por dominio:', keyErr?.message);
  }
  await setDomainExtras(orgId, id, {
    region, tracking_subdomain: 'links', open_tracking: !!input.open_tracking, click_tracking: !!input.click_tracking,
    receiving_enabled: input.receiving_enabled !== false, provider_status: dom.status ?? null, api_key_id: apiKeyId, last_checked_at: new Date().toISOString(),
  });
  return requireDomain(orgId, id, supabase);
}

/** domains.verify + domains.get → actualiza status/dns_records/verified_at. */
export async function verifyDomain(orgId: number, id: string, supabase: SupabaseClient): Promise<EmailDomain> {
  const d = await requireDomain(orgId, id, supabase);
  if (!d.provider_domain_id) throw new EmailError('PROVIDER', 'El dominio no está registrado en Resend', 422);
  const master = getMasterResend();
  const { error: vErr } = await master.domains.verify(d.provider_domain_id);
  if (vErr) throw new EmailError('PROVIDER', `Resend verify: ${vErr.message}`, 502);
  return refreshDomainFromProvider(orgId, id, supabase, true);
}

export async function refreshDomainFromProvider(orgId: number, id: string, supabase: SupabaseClient, requestedVerify = false): Promise<EmailDomain> {
  const d = await requireDomain(orgId, id, supabase);
  if (!d.provider_domain_id) return d;
  const { data: dom, error } = await getMasterResend().domains.get(d.provider_domain_id);
  if (error || !dom) throw new EmailError('PROVIDER', `Resend get: ${error?.message ?? 'sin datos'}`, 502);
  const status = mapProviderStatus(dom.status, requestedVerify || d.status === 'verifying');
  await supabase.from('email_domains').update({
    status, dns_records: normalizeRecords(dom.records as unknown[], d.domain),
    verified_at: status === 'verified' ? (d.verified_at ?? new Date().toISOString()) : d.verified_at, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('organization_id', orgId);
  await setDomainExtras(orgId, id, { provider_status: dom.status ?? null, last_checked_at: new Date().toISOString(), open_tracking: !!dom.open_tracking, click_tracking: !!dom.click_tracking });
  return requireDomain(orgId, id, supabase);
}

/** Webhook domain.updated (sin sesión): resuelve la fila por provider_domain_id. */
export async function refreshDomainByProviderId(providerDomainId: string, service: SupabaseClient): Promise<void> {
  const { data } = await service.from('email_domains').select('id, organization_id').eq('provider_domain_id', providerDomainId).maybeSingle();
  if (!data) return;
  const r = data as { id: string; organization_id: number };
  await refreshDomainFromProvider(r.organization_id, r.id, service);
}

export async function updateDomain(orgId: number, id: string, patch: UpdateDomainInput, supabase: SupabaseClient): Promise<EmailDomain> {
  const d = await requireDomain(orgId, id, supabase);
  const cols: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.from_name !== undefined) cols.from_name = patch.from_name?.trim() || null;
  if (patch.reply_to !== undefined) cols.reply_to = patch.reply_to?.trim() || null;
  if (patch.dmarc_configured !== undefined) cols.dmarc_configured = patch.dmarc_configured;
  if (patch.from_email !== undefined) {
    const fe = patch.from_email.trim().toLowerCase();
    if (!fe.endsWith(`@${d.domain}`)) throw new EmailError('VALIDATION', `El remitente debe pertenecer a ${d.domain}`, 400);
    cols.from_email = fe;
  }
  if (patch.is_default) {
    await clearDefault(orgId, supabase, id);
    cols.is_default = true;
  }
  const trackingChanged = patch.open_tracking !== undefined || patch.click_tracking !== undefined || patch.receiving_enabled !== undefined;
  if (trackingChanged && d.provider_domain_id) {
    const { error } = await getMasterResend().domains.update({
      id: d.provider_domain_id,
      ...(patch.open_tracking !== undefined ? { openTracking: patch.open_tracking } : {}),
      ...(patch.click_tracking !== undefined ? { clickTracking: patch.click_tracking } : {}),
      ...(patch.receiving_enabled !== undefined ? { capabilities: { receiving: patch.receiving_enabled ? 'enabled' : 'disabled' } } : {}),
    });
    if (error) throw new EmailError('PROVIDER', `Resend update: ${error.message}`, 502);
  }
  if (trackingChanged) {
    await setDomainExtras(orgId, id, {
      ...(patch.open_tracking !== undefined ? { open_tracking: patch.open_tracking } : {}),
      ...(patch.click_tracking !== undefined ? { click_tracking: patch.click_tracking } : {}),
      ...(patch.receiving_enabled !== undefined ? { receiving_enabled: patch.receiving_enabled } : {}),
    });
  }
  const { error } = await supabase.from('email_domains').update(cols).eq('id', id).eq('organization_id', orgId);
  if (error) throw new EmailError('DB', error.message, 500);
  return requireDomain(orgId, id, supabase);
}

export async function setDefaultDomain(orgId: number, id: string, supabase: SupabaseClient): Promise<EmailDomain> {
  return updateDomain(orgId, id, { is_default: true }, supabase);
}

export async function deleteDomain(orgId: number, id: string, supabase: SupabaseClient): Promise<void> {
  const d = await requireDomain(orgId, id, supabase);
  if (getMasterResendKey()) {
    const master = getMasterResend();
    if (d.api_key_id) await master.apiKeys.remove(d.api_key_id).catch(() => undefined);
    if (d.provider_domain_id) await master.domains.remove(d.provider_domain_id).catch(() => undefined);
  }
  await removeDomainExtras(orgId, id);
  const { error } = await supabase.from('email_domains').delete().eq('id', id).eq('organization_id', orgId);
  if (error) throw new EmailError('DB', error.message, 500);
}

// ─── Resolución del remitente ────────────────────────────────────────────────

export interface ResolvedSender {
  mode: 'org' | 'global';
  domain: EmailDomain | null;
  from: string;
  fromEmail: string;
  replyTo: string | null;
  apiKey: string;
  notice: string | null;
  /** Dominio con receiving para `crm+{id}@…` (null si no hay). */
  receivingDomain: string | null;
  tracking: boolean;
}

/**
 * 1) dominio verificado de la org (`domainId` pedido o `is_default`) con su
 *    API key (o key BYOK/global); 2) política de fallback de la org
 *    (`block` → 422 NO_SENDER; `global_*` → dominio global con from_name de
 *    la org y reply_to del usuario).
 */
export async function resolveSender(orgId: number, opts: { domainId?: string | null; userId?: string | null; kind: EmailKind; orgName?: string; userEmail?: string | null }, supabase: SupabaseClient): Promise<ResolvedSender> {
  const domains = await listDomains(orgId, supabase);
  const verified = domains.filter((d) => d.status === 'verified');
  const chosen = (opts.domainId ? verified.find((d) => d.id === opts.domainId) : null) ?? verified.find((d) => d.is_default) ?? verified[0] ?? null;
  const settings = await getEmailOrgSettings(orgId);
  const trackingFor = (d: EmailDomain | null) => (opts.kind === 'marketing' || opts.kind === 'sequence' ? !!(d?.open_tracking || d?.click_tracking) : settings.email_tracking_transactional);

  if (chosen) {
    const apiKey = (await getDomainApiKey(orgId, chosen.id)) ?? (await getOrgResendKey(orgId)) ?? getMasterResendKey();
    if (!apiKey) throw new EmailError('NO_SENDER', 'No hay API key de Resend disponible', 422);
    const extras = await getDomainExtras(orgId, chosen.id);
    return {
      mode: 'org', domain: chosen, fromEmail: chosen.from_email,
      from: chosen.from_name ? `${chosen.from_name} <${chosen.from_email}>` : chosen.from_email,
      replyTo: chosen.reply_to ?? opts.userEmail ?? null, apiKey, notice: null,
      receivingDomain: extras.receiving_enabled !== false ? chosen.domain : null, tracking: trackingFor(chosen),
    };
  }
  if (settings.email_fallback_policy === 'block') throw new EmailError('NO_SENDER', 'La organización exige dominio propio verificado para enviar correos', 422);
  const g = globalDomain();
  const apiKey = (await getOrgResendKey(orgId)) ?? getMasterResendKey();
  if (!g.fromEmail || !apiKey) throw new EmailError('NO_SENDER', 'No hay dominio verificado ni remitente global configurado (EMAIL_GLOBAL_DOMAIN / EMAIL_FROM_ADDRESS)', 422);
  const orgName = opts.orgName?.trim() || g.fromName;
  const notice = settings.email_fallback_policy === 'global_silent' ? null : `Enviado vía ${g.fromName} en nombre de ${orgName}`;
  return {
    mode: 'global', domain: null, fromEmail: g.fromEmail, from: `${orgName} vía ${g.fromName} <${g.fromEmail}>`,
    replyTo: opts.userEmail ?? null, apiKey, notice, receivingDomain: process.env.EMAIL_GLOBAL_DOMAIN?.trim() || null, tracking: trackingFor(null),
  };
}

export { getResendClient };
