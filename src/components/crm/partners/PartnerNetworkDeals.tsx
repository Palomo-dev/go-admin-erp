"use client";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/crm/red/RedButton";
import { Pagination } from "@/components/kit";
import type {
  PartnerDealView,
  PartnerView,
  PartnerTier,
} from "@/lib/services/crm/partnerService";
import type { CommissionStatus } from "@/lib/services/crm/partnerCommission";
import { PartnerDealTable } from "./PartnerDealTable";
import { PartnerCommissions } from "./PartnerCommissions";
import { COMMISSION_META } from "./partnerMeta";
import { useRedText } from "../red/useRedText";

interface Props {
  partners: PartnerView[];
  commissionsOnly: boolean;
  canManage: boolean;
  tiers: PartnerTier[];
  baseCurrency: string | null;
  onTiers: () => void;
  loadDeals: (id: string) => Promise<PartnerDealView[]>;
  transition: (
    partnerId: string,
    dealId: string,
    status: CommissionStatus,
  ) => Promise<PartnerDealView>;
}
export function PartnerNetworkDeals(p: Props) {
  const { tr } = useRedText();
  const [rows, setRows] = useState<PartnerDealView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [pending, setPending] = useState<{
    row: PartnerDealView;
    to: CommissionStatus;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { partners, loadDeals } = p;
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const all: PartnerDealView[] = [];
      // Bound request concurrency while still loading every partner's pages.
      for (let i = 0; i < partners.length; i += 6) {
        const batch = await Promise.all(
          partners.slice(i, i + 6).map((r) => loadDeals(r.id)),
        );
        all.push(...batch.flat());
      }
      if (active)
        setRows(
          all.sort(
            (a, b) =>
              b.created_at.localeCompare(a.created_at) ||
              b.id.localeCompare(a.id),
          ),
        );
    })()
      .catch(() => {
        if (active) setError(tr("No se pudieron cargar los deals"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [partners, loadDeals, reload, tr]);
  const shown = rows;
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(shown.length / size)),
  );
  return (
    <div className="space-y-3">
      {loading ? (
        <p aria-busy="true">{tr("Cargando deals")}</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button variant="outline" onClick={() => setReload((x) => x + 1)}>
              {tr("Actualizar deals")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : p.commissionsOnly ? (
        <PartnerCommissions
          rows={rows}
          partners={partners}
          tiers={p.tiers}
          baseCurrency={p.baseCurrency}
          canManage={p.canManage}
          onTiers={p.onTiers}
        />
      ) : (
        <>
          <PartnerDealTable
            deals={shown.slice((currentPage - 1) * size, currentPage * size)}
            canManage={p.canManage}
            busyId={busy}
            onTransition={(row, to) => setPending({ row, to })}
          />
          <Pagination
            pagina={currentPage}
            tamano={size}
            total={shown.length}
            onPaginaChange={setPage}
            onTamanoChange={(n) => {
              setSize(n);
              setPage(1);
            }}
          />
        </>
      )}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? tr(COMMISSION_META[pending.to].action) : ""}
        description={tr(
          "La comisión es un registro por deal; aprobarla o marcarla pagada no mueve dinero.",
        )}
        confirmLabel={tr("Confirmar")}
        variant={pending?.to === "rejected" ? "destructive" : "default"}
        onConfirm={async () => {
          if (!pending || busy) return;
          setBusy(pending.row.id);
          try {
            const result = await p.transition(
              pending.row.partner_id,
              pending.row.id,
              pending.to,
            );
            setRows((previous) =>
              previous.map((r) => (r.id === result.id ? result : r)),
            );
          } catch {
            setError(tr("No se pudo cambiar la comisión"));
            throw new Error(tr("No se pudo cambiar la comisión"));
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}
