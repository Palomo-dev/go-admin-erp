'use client';

/**
 * /app/crm/referidos — referidos de la organización (FASE-12, brief UX).
 * Una acción principal («Registrar referido»), sección «Pedir referido» con
 * las tareas de F10, filtros arriba, tarjetas con el estado y las acciones
 * que la máquina permite, y los programas en hoja lateral. Rutas:
 * `/api/crm/referrals/**`; el navegador no escribe en la base.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, Plus } from 'lucide-react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { StaggerList } from '@/components/shared/motion/staggerList';
import { CrmPageHeader } from '@/components/crm/shared/CrmPageHeader';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { ReferralRequest, ReferralView } from '@/lib/services/crm/referralsService';
import { EMPTY_REFERRAL_FILTERS, countByStatus, filterReferrals, type ReferralListFilters } from '@/lib/services/crm/referralModel';
import { ConvertReferralDialog } from './ConvertReferralDialog';
import { ReferralCard, referralActionId } from './ReferralCard';
import { ReferralProgramsSheet } from './ReferralProgramsSheet';
import { ReferralRequestsSection } from './ReferralRequestsSection';
import { ReferralToolbar } from './ReferralToolbar';
import { ReferralsEmptyState } from './ReferralsEmptyState';
import { RegisterReferralDialog } from './RegisterReferralDialog';
import { useReferrals } from './useReferrals';

export function ReferidosPage() {
  const { referrals, programs, requests, currency, canManage, loading, loaded, error, reload, register, transition, markPaid, convert, saveProgram, deleteProgram } = useReferrals();
  const [filters, setFilters] = useState<ReferralListFilters>(EMPTY_REFERRAL_FILTERS);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [preset, setPreset] = useState<{ id: string; name: string } | null>(null);
  const [programsOpen, setProgramsOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<ReferralView | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReferralView | null>(null);
  const [payTarget, setPayTarget] = useState<ReferralView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const registerButtonRef = useRef<HTMLButtonElement>(null);
  const programsButtonRef = useRef<HTMLButtonElement>(null);
  const fallback = () => registerButtonRef.current;
  const onRejectClose = useReturnFocus(rejectTarget !== null, fallback);
  const onPayClose = useReturnFocus(payTarget !== null, fallback);

  const shown = useMemo(() => filterReferrals(referrals, filters), [referrals, filters]);
  const counts = useMemo(() => countByStatus(referrals), [referrals]);
  const hasProgram = programs.some((p) => p.is_active);

  const openRegister = (p: { id: string; name: string } | null) => {
    setPreset(p);
    setRegisterOpen(true);
  };
  const registerFor = (r: ReferralRequest) => {
    if (r.customer) openRegister({ id: r.customer.id, name: r.customer.full_name ?? 'Cliente sin nombre' });
  };

  const fail = (title: string, err: unknown) => toast({ title, description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });

  const onTransition = async (r: ReferralView, to: 'contacted' | 'qualified' | 'rejected') => {
    setBusyId(r.id);
    try {
      await transition(r.id, to);
      toast({ title: `«${r.referred_name}» ${to === 'contacted' ? 'marcado como contactado' : to === 'qualified' ? 'marcado como calificado' : 'rechazado'}` });
      return true;
    } catch (err) {
      fail('No se pudo cambiar el estado', err);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // Tras la transición el botón pulsado desaparece (cambia el estado): tras el
  // commit, el foco va al siguiente botón de la tarjeta o al principal. Efecto,
  // no microtask: el botón nuevo aún no existe cuando resuelve la promesa.
  const [refocusId, setRefocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!refocusId) return;
    (document.getElementById(refocusId) ?? registerButtonRef.current)?.focus();
    setRefocusId(null);
  }, [refocusId]);
  const focusAfter = (r: ReferralView, nextAction: string) => setRefocusId(referralActionId(r.id, nextAction));

  const onPay = async () => {
    if (!payTarget) return;
    setBusyId(payTarget.id);
    try {
      await markPaid(payTarget.id);
      toast({ title: 'Recompensa registrada como pagada', description: `«${payTarget.referred_name}». Es un registro: aquí no se mueve dinero.` });
    } catch (err) {
      fail('No se pudo registrar la recompensa', err);
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-5 p-4 sm:p-6">
        <CrmPageHeader
          title="Referidos"
          description="Quién recomendó a quién, en qué punto va cada uno y qué recompensa toca. Los mejores leads los traen tus clientes."
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          secondary={{ label: `Programas${programs.length ? ` (${programs.length})` : ''}`, icon: Gift, onClick: () => setProgramsOpen(true), buttonRef: programsButtonRef }}
          primary={{ label: 'Registrar referido', icon: Plus, onClick: () => openRegister(null), buttonRef: registerButtonRef }}
        />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{loaded ? 'No se pudo actualizar la lista' : 'No se pudieron cargar los referidos'}</AlertTitle>
            <AlertDescription>{error}. {loaded ? 'Se muestra la última lista conocida; pulsa' : 'Pulsa'} «Actualizar» para reintentar.</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Cargando referidos">
            <Skeleton className="h-9 w-full max-w-md" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}</div>
          </div>
        ) : (
          <>
            <ReferralRequestsSection requests={requests} onRegisterFor={registerFor} />
            {referrals.length === 0 && (loaded || !error) ? (
              <ReferralsEmptyState filtered={false} hasProgram={hasProgram} onRegister={() => openRegister(null)} onClearFilters={() => setFilters(EMPTY_REFERRAL_FILTERS)} />
            ) : referrals.length === 0 ? null : (
              <>
                <ReferralToolbar filters={filters} counts={counts} total={referrals.length} shown={shown.length} onChange={setFilters} />
                {shown.length === 0 ? (
                  <ReferralsEmptyState filtered hasProgram={hasProgram} onRegister={() => openRegister(null)} onClearFilters={() => setFilters(EMPTY_REFERRAL_FILTERS)} />
                ) : (
                  <StaggerList as="ul" aria-label="Referidos" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence initial={false}>
                      {shown.map((r) => (
                        <ReferralCard
                          key={r.id}
                          referral={r}
                          currency={currency}
                          busy={busyId === r.id}
                          onTransition={(x, to) => void onTransition(x, to).then((ok) => ok && focusAfter(x, to === 'contacted' ? 'qualified' : 'converted'))}
                          onReject={(x) => setRejectTarget(x)}
                          onConvert={(x) => setConvertTarget(x)}
                          onMarkPaid={(x) => setPayTarget(x)}
                        />
                      ))}
                    </AnimatePresence>
                  </StaggerList>
                )}
              </>
            )}
          </>
        )}

        <RegisterReferralDialog open={registerOpen} preset={preset} programs={programs} currency={currency} onOpenChange={setRegisterOpen} onRegister={register} returnFocusFallback={fallback} />
        <ConvertReferralDialog open={convertTarget !== null} referral={convertTarget} onOpenChange={(o) => { if (!o) setConvertTarget(null); }} onConvert={convert} returnFocusFallback={fallback} />
        <ReferralProgramsSheet open={programsOpen} programs={programs} currency={currency} canManage={canManage} onOpenChange={setProgramsOpen} onSave={saveProgram} onDelete={deleteProgram} returnFocusFallback={() => programsButtonRef.current} />
        <ConfirmDialog
          open={rejectTarget !== null}
          onOpenChange={(o) => { if (!o) setRejectTarget(null); }}
          title="Rechazar referido"
          description={`«${rejectTarget?.referred_name ?? ''}» quedará como rechazado y no se podrá volver a mover ni registrar recompensa.`}
          confirmLabel="Rechazar"
          variant="destructive"
          onConfirm={async () => { if (rejectTarget) await onTransition(rejectTarget, 'rejected'); }}
          onCloseAutoFocus={onRejectClose}
        />
        <ConfirmDialog
          open={payTarget !== null}
          onOpenChange={(o) => { if (!o) setPayTarget(null); }}
          title="Registrar recompensa pagada"
          description={`Se anotará que la recompensa de «${payTarget?.referred_name ?? ''}» (${payTarget?.program?.name ?? 'programa'}) ya se entregó, con fecha de hoy. Es un registro: aquí no se mueve dinero.`}
          confirmLabel="Registrar"
          onConfirm={onPay}
          onCloseAutoFocus={onPayClose}
        />
      </div>
    </MotionConfig>
  );
}
