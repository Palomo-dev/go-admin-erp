'use client';

/**
 * Deals de un partner en hoja lateral: tabla (datos tabulares reales, brief
 * §3) con oportunidad, tipo, comisión y estado, más las transiciones que la
 * máquina permite (`pending → approved → paid | rejected`), solo para
 * admin/manager (`can_manage` lo decide el servidor; el botón oculto no es la
 * barrera). «Registrar pago» es un registro: no se mueve dinero.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { nextCommissionStatuses, summarizeCommissions, type CommissionStatus } from '@/lib/services/crm/partnerCommission';
import type { PartnerDealView, PartnerView, RegisterDealResult } from '@/lib/services/crm/partnerService';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { cn } from '@/utils/Utils';
import { PartnerDealTable, dealActionId } from './PartnerDealTable';
import { RegisterDealDialog } from './RegisterDealDialog';
import { COMMISSION_META } from './partnerMeta';

interface Props {
  open: boolean;
  partner: PartnerView | null;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  loadDeals: (partnerId: string) => Promise<PartnerDealView[]>;
  onRegister: (partnerId: string, payload: { opportunity_id: string; deal_type: string }) => Promise<RegisterDealResult>;
  onTransition: (partnerId: string, dealId: string, status: CommissionStatus) => Promise<PartnerDealView>;
  returnFocusFallback: () => HTMLElement | null;
}

export function PartnerDealList({ open, partner, canManage, onOpenChange, loadDeals, onRegister, onTransition, returnFocusFallback }: Props) {
  const [deals, setDeals] = useState<PartnerDealView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ deal: PartnerDealView; to: CommissionStatus } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const registerButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  // Tras confirmar, el botón pulsado desaparece (cambia el estado): el foco va al
  // siguiente botón de la misma fila y, si no hay (terminal), a «Registrar deal».
  const nextActionId = useRef<string | null>(null);
  const onConfirmClose = useReturnFocus(confirm !== null, () => (nextActionId.current ? document.getElementById(nextActionId.current) : null) ?? registerButtonRef.current);

  const load = useCallback(async () => {
    if (!partner) return;
    setLoading(true);
    setError(null);
    try {
      setDeals(await loadDeals(partner.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [partner, loadDeals]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const apply = async () => {
    if (!partner || !confirm) return;
    setBusyId(confirm.deal.id);
    try {
      const row = await onTransition(partner.id, confirm.deal.id, confirm.to);
      setDeals((prev) => prev.map((d) => (d.id === row.id ? row : d)));
      const next = nextCommissionStatuses(row.commission_status)[0];
      nextActionId.current = next ? dealActionId(row.id, next) : null;
      toast({ title: `Comisión ${COMMISSION_META[confirm.to].label.toLowerCase()}`, description: `${confirm.deal.opportunity?.name ?? 'Deal'} · ${formatMoney(confirm.deal.commission_amount, confirm.deal.opportunity?.currency ?? null)}${confirm.to === 'paid' ? '. Es un registro: aquí no se mueve dinero.' : ''}` });
    } catch (err) {
      toast({ title: 'No se pudo cambiar la comisión', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const currencies = Array.from(new Set(deals.map((d) => d.opportunity?.currency).filter((c): c is string => !!c)));
  const summary = summarizeCommissions(deals);
  const summaryCurrency = currencies.length === 1 ? currencies[0] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 overflow-y-auto bg-gray-50 p-0 dark:bg-gray-950 sm:max-w-2xl">
        <SheetHeader className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
          <SheetTitle className="text-gray-900 dark:text-gray-100">Deals de {partner?.name}</SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            {partner?.tier ? `Tier ${partner.tier.name} · ` : ''}comisión {partner ? formatRate(partner.effective_rate) : ''}. La comisión es un registro por deal; aprobarla o marcarla pagada no mueve dinero.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-700 dark:text-gray-300" aria-live="polite">
              {deals.length} deal{deals.length === 1 ? '' : 's'}
              {deals.length > 0 && (currencies.length > 1
                ? ' · comisiones en varias monedas (sin sumar)'
                : ` · pendiente ${formatMoney(summary.outstanding, summaryCurrency)} · pagada ${formatMoney(summary.paid, summaryCurrency)}`)}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="icon" aria-label="Actualizar deals" disabled={loading} onClick={() => void load()}>
                <RefreshCw className={cn('h-4 w-4', loading && 'motion-safe:animate-spin')} aria-hidden="true" />
              </Button>
              <Button ref={registerButtonRef} type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setRegisterOpen(true)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Registrar deal
              </Button>
            </div>
          </div>
          {error && (
            <Alert variant="destructive"><AlertTitle>No se pudieron cargar los deals</AlertTitle><AlertDescription>{error}. Pulsa «Actualizar deals» para reintentar.</AlertDescription></Alert>
          )}
          {loading && deals.length === 0 ? (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando deals">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : deals.length === 0 && !error ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-gray-100">Este partner aún no tiene deals</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Registra la oportunidad que trajo o ayudó a cerrar y la comisión quedará calculada.</p>
            </div>
          ) : (
            <PartnerDealTable deals={deals} canManage={canManage} busyId={busyId} onTransition={(deal, to) => setConfirm({ deal, to })} />
          )}
        </div>
        <RegisterDealDialog open={registerOpen} partner={partner} onOpenChange={setRegisterOpen} onRegister={async (id, payload) => { const r = await onRegister(id, payload); await load(); return r; }} returnFocusFallback={() => registerButtonRef.current} />
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(o) => { if (!o) setConfirm(null); }}
          title={confirm ? `${COMMISSION_META[confirm.to].action} la comisión` : ''}
          description={confirm ? `${confirm.deal.opportunity?.name ?? 'Deal'} · ${formatMoney(confirm.deal.commission_amount, confirm.deal.opportunity?.currency ?? null)}. ${confirm.to === 'paid' ? 'Se anota como pagada con fecha de hoy; no se mueve dinero.' : confirm.to === 'rejected' ? 'Quedará rechazada y no contará para el tier.' : 'Quedará aprobada, pendiente de registrar el pago.'}` : ''}
          confirmLabel={confirm ? COMMISSION_META[confirm.to].action : ''}
          variant={confirm?.to === 'rejected' ? 'destructive' : 'default'}
          onConfirm={apply}
          onCloseAutoFocus={onConfirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}
