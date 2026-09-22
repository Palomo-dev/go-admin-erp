'use client';

/**
 * Registrar un deal de partner: oportunidad de la organización (buscador con
 * RLS, reutiliza `useOpportunitySearch` de Automatizaciones) y tipo. La
 * comisión la calcula el servidor; aquí solo se anticipa cuánto sería.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { DEAL_TYPES, DEAL_TYPE_LABELS, computePartnerCommission, type DealType } from '@/lib/services/crm/partnerCommission';
import type { PartnerView, RegisterDealResult } from '@/lib/services/crm/partnerService';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { EntitySearchList } from '@/components/crm/shared/EntitySearchList';
import { useOpportunitySearch, type OpportunityHit } from '@/components/crm/automatizaciones/useOpportunitySearch';

interface Props {
  open: boolean;
  partner: PartnerView | null;
  onOpenChange: (open: boolean) => void;
  onRegister: (partnerId: string, payload: { opportunity_id: string; deal_type: string }) => Promise<RegisterDealResult>;
  returnFocusFallback: () => HTMLElement | null;
}

export function RegisterDealDialog({ open, partner, onOpenChange, onRegister, returnFocusFallback }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OpportunityHit | null>(null);
  const [dealType, setDealType] = useState<DealType>('referral');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const { hits, loading, error: searchError } = useOpportunitySearch(query, open);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setDealType('referral');
    setError(null);
    setFieldError(undefined);
  }, [open, partner?.id]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const preview = selected && partner ? computePartnerCommission(selected.amount, partner.effective_rate) : null;

  const submit = async () => {
    if (!partner) return;
    if (!selected) {
      setFieldError('Elige la oportunidad del deal');
      setFocusId('deal-opportunity');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onRegister(partner.id, { opportunity_id: selected.id, deal_type: dealType });
      toast({
        title: 'Deal registrado',
        description: `Comisión ${formatMoney(result.deal.commission_amount, result.deal.opportunity?.currency ?? null)} (${formatRate(result.commission_rate)}), pendiente de aprobar.${result.promoted_to ? ` ${partner.name} sube al tier ${result.promoted_to.name}.` : ''}`,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusId('deal-error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[90vh] max-w-lg overflow-y-auto bg-white dark:bg-gray-950">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-gray-900 dark:text-gray-100">Registrar deal de {partner?.name}</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            La comisión se calcula con el monto de la oportunidad y la tasa {partner && Number(partner.commission_rate) > 0 ? 'propia del partner' : 'de su tier'} ({partner ? formatRate(partner.effective_rate) : ''}). Queda pendiente de aprobar; no se paga nada aquí.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <EntitySearchList
            id="deal-opportunity"
            label="Oportunidad"
            placeholder="Buscar por nombre…"
            query={query}
            onQueryChange={setQuery}
            hits={hits.map((h) => ({ id: h.id, title: h.name, subtitle: [h.customer_name, h.stage_name, h.amount != null ? formatMoney(h.amount, h.currency) : null].filter(Boolean).join(' · ') || null }))}
            loading={loading}
            error={searchError}
            selectedId={selected?.id ?? null}
            onSelect={(h) => { setSelected(hits.find((x) => x.id === h.id) ?? null); setFieldError(undefined); }}
            hint={selected ? `Elegida: ${selected.name}${preview !== null ? ` · comisión estimada ${formatMoney(preview, selected.currency)}` : ''}` : 'Escribe para buscar entre las oportunidades de la organización.'}
            fieldError={fieldError}
          />
          <div>
            <Label htmlFor="deal-type" className="text-xs text-gray-700 dark:text-gray-300">Tipo de deal</Label>
            <Select value={dealType} onValueChange={(v) => setDealType(v as DealType)}>
              <SelectTrigger id="deal-type" className="text-left [&>span]:line-clamp-1"><SelectValue /></SelectTrigger>
              <SelectContent>{DEAL_TYPES.map((t) => <SelectItem key={t} value={t}>{DEAL_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && (
            <Alert id="deal-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>No se pudo registrar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Registrar</button>
        </form>
        <DialogFooter className="gap-2 [&>button]:h-11 sm:[&>button]:h-9">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void submit()}>{saving ? 'Registrando…' : 'Registrar deal'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
