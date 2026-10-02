"use client";

import { useRedText } from "@/components/crm/red/useRedText";

/**
 * /app/crm/referidos — referidos de la organización (FASE-12, brief UX).
 * Una acción principal («Registrar referido»), sección «Pedir referido» con
 * las tareas de F10, filtros arriba, tarjetas con el estado y las acciones
 * que la máquina permite, y los programas en hoja lateral. Rutas:
 * `/api/crm/referrals/**`; el navegador no escribe en la base.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Gift, Plus, RefreshCw, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/crm/red/RedButton";
import { PageHeader, EmptyState } from "@/components/kit";
import { RedStats } from "../red/RedStats";
import { ReferralTable } from "./ReferralTable";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import type {
  ReferralRequest,
  ReferralView,
} from "@/lib/services/crm/referralsService";
import {
  EMPTY_REFERRAL_FILTERS,
  countByStatus,
  filterReferrals,
  type ReferralListFilters,
} from "@/lib/services/crm/referralModel";
import { ConvertReferralDialog } from "./ConvertReferralDialog";
import { referralActionId } from "./ReferralCard";
import { ReferralProgramsSheet } from "./ReferralProgramsSheet";
import { ReferralRequestsSection } from "./ReferralRequestsSection";
import { ReferralToolbar } from "./ReferralToolbar";
import { ReferralsEmptyState } from "./ReferralsEmptyState";
import { RegisterReferralDialog } from "./RegisterReferralDialog";
import { useReferrals } from "./useReferrals";

export function ReferidosPage() {
  const { tr } = useRedText();
  const {
    referrals,
    programs,
    requests,
    currency,
    canManage,
    canRegister,
    stats,
    statsError,
    requestsError,
    loading,
    loaded,
    error,
    reload,
    register,
    transition,
    markPaid,
    convert,
    saveProgram,
    deleteProgram,
  } = useReferrals();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [programFilter, setProgramFilter] = useState("all");
  const [filters, setFilters] = useState<ReferralListFilters>(
    EMPTY_REFERRAL_FILTERS,
  );
  const [registerOpen, setRegisterOpen] = useState(false);
  const [preset, setPreset] = useState<{ id: string; name: string } | null>(
    null,
  );
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

  const shown = useMemo(
    () =>
      filterReferrals(referrals, filters).filter(
        (r) => programFilter === "all" || r.program_id === programFilter,
      ),
    [referrals, filters, programFilter],
  );
  useEffect(() => {
    setPage(1);
  }, [filters, programFilter, size]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(shown.length / size)),
  );
  const counts = useMemo(() => countByStatus(referrals), [referrals]);
  const hasProgram = programs.some((p) => p.is_active);

  const openRegister = (p: { id: string; name: string } | null) => {
    setPreset(p);
    setRegisterOpen(true);
  };
  const registerFor = (r: ReferralRequest) => {
    if (r.customer)
      openRegister({
        id: r.customer.id,
        name: r.customer.full_name ?? tr("Cliente sin nombre"),
      });
  };

  const fail = (title: string, err: unknown) =>
    toast({
      title,
      description: err instanceof Error ? err.message : tr("Error desconocido"),
      variant: "destructive",
    });

  const onTransition = async (
    r: ReferralView,
    to: "contacted" | "qualified" | "rejected",
  ) => {
    setBusyId(r.id);
    try {
      await transition(r.id, to);
      toast({
        title: tr("«{p0}» {p1}", {
          p0: r.referred_name,
          p1:
            to === "contacted"
              ? tr("marcado como contactado")
              : to === "qualified"
                ? tr("marcado como calificado")
                : tr("rechazado"),
        }),
      });
      return true;
    } catch (err) {
      fail(tr("No se pudo cambiar el estado"), err);
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
    const row = document.getElementById(
      refocusId.replace("referral-", "referral-row-"),
    );
    const card = document.getElementById(refocusId);
    (row?.offsetParent
      ? row
      : card?.offsetParent
        ? card
        : registerButtonRef.current
    )?.focus();
    setRefocusId(null);
  }, [refocusId]);
  const focusAfter = (r: ReferralView, nextAction: string) =>
    setRefocusId(referralActionId(r.id, nextAction));

  const onPay = async () => {
    if (!payTarget) return;
    setBusyId(payTarget.id);
    try {
      await markPaid(payTarget.id);
      toast({
        title: tr("Recompensa registrada como pagada"),
        description: tr("«{p0}». Es un registro: aquí no se mueve dinero.", {
          p0: payTarget.referred_name,
        }),
      });
    } catch (err) {
      fail(tr("No se pudo registrar la recompensa"), err);
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
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        titulo={tr("Referidos")}
        migas={[
          { etiqueta: "CRM", href: "/app/crm" },
          { etiqueta: tr("Referidos") },
        ]}
        cargando={loading || refreshing}
        subtitulo={tr(
          "Clientes que recomiendan a otros y la recompensa que se les debe",
        )}
        movil={{
          accion: canRegister ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={tr("Registrar referido")}
              onClick={() => openRegister(null)}
            >
              <Plus className="size-5" />
            </Button>
          ) : undefined,
        }}
        acciones={
          <div className="flex gap-2">
            <Button
              variant="outline"
              aria-label={tr("Actualizar")}
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="outline"
              ref={programsButtonRef}
              onClick={() => setProgramsOpen(true)}
            >
              <Gift className="size-4" />
              {tr("Programas")}
            </Button>
            {canRegister && (
              <Button
                ref={registerButtonRef}
                onClick={() => openRegister(null)}
              >
                <UserPlus className="size-4" />
                {tr("Registrar referido")}
              </Button>
            )}
          </div>
        }
      />
      <RedStats
        kind="referrals"
        stats={stats}
        loading={loading}
        error={statsError}
      />
      {statsError && (
        <Alert variant="destructive">
          <AlertDescription>
            {tr("No se pudieron cargar las cifras")}
          </AlertDescription>
        </Alert>
      )}
      {requestsError && (
        <Alert variant="destructive">
          <AlertDescription>
            {tr("No se pudieron cargar las solicitudes")}
          </AlertDescription>
        </Alert>
      )}

      {error &&
        (!loaded ? (
          <EmptyState
            variante="error"
            titulo={tr("No se pudieron cargar los referidos")}
            descripcion={error}
            onReintentar={() => void refresh()}
          />
        ) : (
          <Alert variant="destructive">
            <AlertTitle>
              {loaded
                ? tr("No se pudo actualizar la lista")
                : tr("No se pudieron cargar los referidos")}
            </AlertTitle>
            <AlertDescription>
              {error}.{" "}
              {loaded
                ? tr("Se muestra la última lista conocida; pulsa")
                : tr("Pulsa")}{" "}
              {tr("«Actualizar» para reintentar.")}
            </AlertDescription>
          </Alert>
        ))}

      {loading ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label={tr("Cargando referidos")}
        >
          <Skeleton className="h-9 w-full max-w-md" />
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <Skeleton className="h-10 w-full rounded-none" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="grid h-16 grid-cols-3 items-center gap-6 border-t border-line px-4"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {canRegister && (
            <ReferralRequestsSection
              requests={requests}
              onRegisterFor={registerFor}
            />
          )}
          {referrals.length === 0 && (loaded || !error) ? (
            <ReferralsEmptyState
              filtered={false}
              canRegister={canRegister}
              hasProgram={hasProgram}
              onRegister={() => openRegister(null)}
              onClearFilters={() => {
                setFilters(EMPTY_REFERRAL_FILTERS);
                setProgramFilter("all");
              }}
            />
          ) : referrals.length === 0 ? null : (
            <>
              <ReferralToolbar
                filters={filters}
                counts={counts}
                total={referrals.length}
                shown={shown.length}
                onChange={setFilters}
                programa={
                  <select
                    className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm sm:w-64"
                    aria-label={tr("Programa")}
                    value={programFilter}
                    onChange={(e) => setProgramFilter(e.target.value)}
                  >
                    <option value="all">{tr("Todos los programas")}</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                }
              />
              <div
                role="tabpanel"
                id={`referrals-panel-${filters.status}`}
                aria-labelledby={`referrals-tab-${filters.status}`}
              >
                {shown.length === 0 ? (
                  <ReferralsEmptyState
                    filtered
                    canRegister={canRegister}
                    hasProgram={hasProgram}
                    onRegister={() => openRegister(null)}
                    onClearFilters={() => {
                      setFilters(EMPTY_REFERRAL_FILTERS);
                      setProgramFilter("all");
                    }}
                  />
                ) : (
                  <ReferralTable
                    rows={shown.slice(
                      (currentPage - 1) * size,
                      currentPage * size,
                    )}
                    total={shown.length}
                    page={currentPage}
                    size={size}
                    onPage={setPage}
                    onSize={setSize}
                    currency={currency}
                    canManage={canManage}
                    canRegister={canRegister}
                    busyId={busyId}
                    onTransition={(x, to) =>
                      void onTransition(x, to).then(
                        (ok) =>
                          ok &&
                          focusAfter(
                            x,
                            to === "contacted" ? "qualified" : "converted",
                          ),
                      )
                    }
                    onReject={setRejectTarget}
                    onConvert={setConvertTarget}
                    onPay={setPayTarget}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}

      <RegisterReferralDialog
        open={registerOpen}
        preset={preset}
        programs={programs}
        currency={currency}
        onOpenChange={setRegisterOpen}
        onRegister={register}
        returnFocusFallback={fallback}
      />
      <ConvertReferralDialog
        open={convertTarget !== null}
        referral={convertTarget}
        onOpenChange={(o) => {
          if (!o) setConvertTarget(null);
        }}
        onConvert={convert}
        returnFocusFallback={fallback}
      />
      <ReferralProgramsSheet
        open={programsOpen}
        programs={programs}
        currency={currency}
        canManage={canManage}
        onOpenChange={setProgramsOpen}
        onSave={saveProgram}
        onDelete={deleteProgram}
        returnFocusFallback={() => programsButtonRef.current}
      />
      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRejectTarget(null);
        }}
        title={tr("Rechazar referido")}
        description={tr(
          "«{p0}» quedará como rechazado y no se podrá volver a mover ni registrar recompensa.",
          { p0: rejectTarget?.referred_name ?? "" },
        )}
        confirmLabel={tr("Rechazar")}
        variant="destructive"
        onConfirm={async () => {
          if (rejectTarget) await onTransition(rejectTarget, "rejected");
        }}
        onCloseAutoFocus={onRejectClose}
      />
      <ConfirmDialog
        open={payTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPayTarget(null);
        }}
        title={tr("Registrar recompensa pagada")}
        description={tr(
          "Se anotará que la recompensa de «{p0}» ({p1}) ya se entregó, con fecha de hoy. Es un registro: aquí no se mueve dinero.",
          {
            p0: payTarget?.referred_name ?? "",
            p1: payTarget?.program?.name ?? "programa",
          },
        )}
        confirmLabel={tr("Registrar")}
        onConfirm={onPay}
        onCloseAutoFocus={onPayClose}
      />
    </div>
  );
}
