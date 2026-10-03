"use client";
import { Pencil, Trash2 } from "lucide-react";
import { DataTable, Pagination, StatusBadge } from "@/components/kit";
import { Button } from "@/components/crm/red/RedButton";
import type {
  PartnerView,
  PartnerTier,
} from "@/lib/services/crm/partnerService";
import type { OrdenListado } from "@/components/kit/listadoUrl";
import { partnerTierTone } from "./partnerTierTone";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "../red/useRedText";
import { PartnerList } from "./PartnerList";

interface Props {
  rows: PartnerView[];
  tiers: PartnerTier[];
  order: OrdenListado | null;
  onSort: (field: string) => void;
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  canManage: boolean;
  canRegister: boolean;
  onRegisterDeal?: (p: PartnerView) => void;
  onEdit: (p: PartnerView) => void;
  onDeals: (p: PartnerView) => void;
  onDelete: (p: PartnerView) => void;
}
export function PartnerTable(p: Props) {
  const { tr } = useRedText();
  const locale = useLocaleIntl();
  return (
    <DataTable
      etiqueta={tr("Partners")}
      orden={p.order}
      onOrdenar={p.onSort}
      className="[&_tbody_td]:py-5"
      filas={p.rows}
      obtenerId={(r) => r.id}
      etiquetaFila={(r) => r.name}
      onFilaClick={p.onDeals}
      columnas={[
        {
          id: "name",
          encabezado: tr("Partner"),
          ordenable: true,
          celda: (r) => (
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-fg-muted">
                {r.company_name ?? r.email}
              </p>
            </div>
          ),
        },
        {
          id: "tier",
          encabezado: tr("Nivel"),
          celda: (r) => (
            <StatusBadge
              estado={r.tier?.name}
              etiqueta={r.tier?.name ?? tr("Sin tier")}
              tono={partnerTierTone(r.tier_id, p.tiers)}
            />
          ),
        },
        {
          id: "rate",
          encabezado: tr("Comisión"),
          variante: "importe",
          celda: (r) => (
            <div>
              <p>{formatRate(r.effective_rate, locale)}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {tr(r.commission_rate === 0 ? "Del nivel" : "Propia")}
              </p>
            </div>
          ),
        },
        {
          id: "deals",
          encabezado: tr("Deals"),
          ordenable: true,
          variante: "importe",
          celda: (r) => r.deals_count,
        },
        {
          id: "revenue",
          encabezado: tr("Revenue atribuido"),
          ordenable: true,
          variante: "importe",
          celda: (r) =>
            r.revenue && !r.revenue.sinTasa.length
              ? formatMoney(r.revenue.total, r.revenue.base, locale)
              : "—",
        },
        {
          id: "outstanding",
          encabezado: tr("Por pagar"),
          variante: "importe",
          celda: (r) =>
            !r.currency_mixed && r.commissions_currency
              ? formatMoney(
                  r.commissions.outstanding,
                  r.commissions_currency,
                  locale,
                )
              : "—",
        },
        {
          id: "status",
          encabezado: tr("Estado"),
          celda: (r) => (
            <StatusBadge
              estado={r.is_active ? "active" : "inactive"}
              etiqueta={tr(r.is_active ? "Activo" : "Inactivo")}
              tono={r.is_active ? "exito" : "neutro"}
            />
          ),
        },
        {
          id: "next",
          encabezado: "",
          celda: (r) => (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                if (p.canRegister && r.is_active && p.onRegisterDeal)
                  p.onRegisterDeal(r);
                else p.onDeals(r);
              }}
            >
              {tr(
                p.canRegister && r.is_active && p.onRegisterDeal
                  ? "Registrar deal"
                  : "Deals y comisiones",
              )}
            </Button>
          ),
        },
      ]}
      acciones={(r) => [
        {
          id: "edit",
          etiqueta: tr("Editar"),
          icono: Pencil,
          onSelect: () => p.onEdit(r),
          oculta: !p.canManage,
        },
        {
          id: "delete",
          etiqueta: tr("Eliminar partner"),
          icono: Trash2,
          destructiva: true,
          onSelect: () => p.onDelete(r),
          oculta: !p.canManage,
        },
      ]}
      tarjetaMovil={(r) => (
        <PartnerList
          partners={[r]}
          canManage={p.canManage}
          onEdit={p.onEdit}
          onDeals={p.onDeals}
          onDelete={p.onDelete}
        />
      )}
      pie={
        <Pagination
          pagina={p.page}
          tamano={p.size}
          total={p.total}
          onPaginaChange={p.onPage}
          onTamanoChange={p.onSize}
        />
      }
    />
  );
}
