'use client';
import { useCallback, useEffect, useState } from 'react';
import { Target, User } from 'lucide-react';
import { SelectorEntidad } from '@/components/kit/SelectorEntidad';
import { Button } from '@/components/ui/button';
import type { TemplateContextIds } from './useTemplatePreview';
import { useTemplateText } from './useTemplateText';
type Choice = { id: string; name: string; customer_id?: string | null };
async function search(kind: 'customers' | 'opportunities', query: string, signal: AbortSignal, customerId?: string) {
  const params = new URLSearchParams({ q: query, limit: '20' });
  if (kind === 'opportunities' && customerId) params.set('customer_id', customerId);
  const response = await fetch(`/api/crm/${kind === 'customers' ? 'customers/search' : 'opportunities'}?${params}`, { credentials: 'include', cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(body.error ?? 'No se pudo cargar el contexto seleccionado.');
  return (body.data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id), name: String(row.name ?? [row.first_name, row.last_name].filter(Boolean).join(' ')),
    customer_id: typeof row.customer_id === 'string' ? row.customer_id : null,
  })) as Choice[];
}
export function TemplateContextPicker({ ids, onChange, disabled }: { ids: TemplateContextIds; onChange(ids: TemplateContextIds): void; disabled?: boolean }) {
  const tr = useTemplateText();
  const [customer, setCustomer] = useState<Choice | null>(null);
  const [opportunity, setOpportunity] = useState<Choice | null>(null);
  useEffect(() => { if (!ids.customer_id) setCustomer(null); if (!ids.opportunity_id) setOpportunity(null); }, [ids]);
  const customers = useCallback((q: string, signal: AbortSignal) => search('customers', q, signal), []);
  const opportunities = useCallback((q: string, signal: AbortSignal) => search('opportunities', q, signal, ids.customer_id), [ids.customer_id]);
  const option = (choice: Choice) => ({ id: choice.id, titulo: choice.name });
  return <section aria-label={tr('Contexto de vista previa')} className="rounded-xl border border-line bg-surface p-3">
    <p className="mb-2 text-sm font-medium text-fg">{tr('Contexto de vista previa')}</p>
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <SelectorEntidad valor={customer} aOpcion={option} buscar={customers} icono={User} etiqueta={tr('Cliente')} deshabilitado={disabled}
        textos={{ placeholder: tr('Cliente'), vacio: tr('Busca un cliente por nombre o teléfono.') }}
        onCambiar={c => { setCustomer(c); setOpportunity(null); onChange({ customer_id: c.id }); }}
        onQuitar={() => { setCustomer(null); setOpportunity(null); onChange({}); }} />
      <SelectorEntidad valor={opportunity} aOpcion={option} buscar={opportunities} icono={Target} etiqueta={tr('Oportunidad')} deshabilitado={disabled}
        textos={{ placeholder: tr('Oportunidad') }} onCambiar={o => { setOpportunity(o); onChange({ ...ids, opportunity_id: o.id }); }}
        onQuitar={() => { setOpportunity(null); onChange({ customer_id: ids.customer_id }); }} />
      <Button variant="outline" disabled={disabled} onClick={() => { setCustomer(null); setOpportunity(null); onChange({}); }}>{tr('Usar contexto de ejemplo')}</Button>
    </div>
  </section>;
}
