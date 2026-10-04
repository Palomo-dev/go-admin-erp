'use client';

import { useEffect, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { ActiveCallInfo } from '../softphoneTypes';
import type { PhoneContactData } from './PhoneContact';
import { loadOrgDefaultCountry } from '@/components/crm/shared/useOrgDefaultCountry';
import { normalizePhone } from '@/components/crm/shared/quickActionsConfig';

interface PhoneLine { e164: string; label?: string | null }
interface CustomerHit { id: string; first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null }
interface CallContextRow { customer?: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; company?: string | null }; opportunity?: { id: string; name: string }; metadata?: { live_note?: string }; from_number?: string; to_number?: string }
const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/** Reutiliza las lecturas autorizadas del CRM; respuestas tardías nunca cruzan una organización o un número. */
export function usePhoneContext(number: string, active: ActiveCallInfo | null, enabled: boolean) {
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const key = `${organizationId}:${number}:${active?.callSid ?? ''}`;
  const [result, setResult] = useState<{ key: string; contact: PhoneContactData | null; line: PhoneLine | null }>({ key: '', contact: null, line: null });
  useEffect(() => {
    if (!enabled || !organizationId || !number.trim()) return;
    const controller = new AbortController();
    const read = async () => {
      let contact: PhoneContactData | null = active ? { id: active.customerId, name: active.displayName, number } : null;
      let line: PhoneLine | null = null;
      const requests = await Promise.allSettled([
        fetch(active?.callSid ? `/api/crm/calls?provider_call_sid=${encodeURIComponent(active.callSid)}&limit=1` : `/api/crm/customers/search?q=${encodeURIComponent(number)}&limit=8`, { signal: controller.signal }).then(async response => response.ok ? response.json() : null),
        active?.callSid ? Promise.resolve(null) : loadOrgDefaultCountry(organizationId),
      ]);
      if (controller.signal.aborted) return;
      const rows = requests[0].status === 'fulfilled' ? requests[0].value?.data : null;
      if (Array.isArray(rows)) {
        if (active?.callSid) {
          const row = rows[0] as CallContextRow | undefined;
          const actualLine = active.direction === 'inbound' ? row?.to_number : row?.from_number;
          if (actualLine && /^\+[1-9]\d{6,14}$/.test(actualLine)) line = { e164: actualLine };
          if (row) contact = { id: row.customer?.id ?? active.customerId, name: row.customer?.full_name ?? ([row.customer?.first_name, row.customer?.last_name].filter(Boolean).join(' ') || active.displayName), number,
            email: row.customer?.email, company: row.customer?.company, opportunity: row.opportunity, note: row.metadata?.live_note };
        } else {
          const country = requests[1].status === 'fulfilled' ? requests[1].value : null;
          const matches = rows.filter((row: CustomerHit) => digits(row.phone) === digits(number) || normalizePhone(row.phone, country ?? undefined) === number);
          // Una coincidencia ambigua no atribuye el teléfono a la primera ficha.
          if (matches.length === 1) { const row = matches[0] as CustomerHit; contact = { id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null, number, email: row.email }; }
        }
      }
      setResult({ key, contact, line });
    };
    const timer = window.setTimeout(() => { void read(); }, active ? 0 : 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [organizationId, number, active, enabled, key]);
  return result.key === key ? result : { key, contact: active ? { id: active.customerId, name: active.displayName, number } : null, line: null };
}
