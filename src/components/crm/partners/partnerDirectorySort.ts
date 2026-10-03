import type { OrdenListado } from "@/components/kit/listadoUrl";
import type { PartnerView } from "@/lib/services/crm/partnerService";

/** Ordena el DTO completo antes de paginar, dejando cifras desconocidas al final. */
export function sortPartnerDirectory(
  rows: PartnerView[],
  order: OrdenListado | null,
  locale: string,
) {
  if (!order) return rows;
  const value = (row: PartnerView): string | number | null =>
    order.campo === "name"
      ? row.name
      : order.campo === "deals"
        ? row.deals_count
        : row.revenue && !row.revenue.sinTasa.length
          ? row.revenue.total
          : null;
  return [...rows].sort((a, b) => {
    const av = value(a),
      bv = value(b);
    if (av === null || bv === null)
      return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1;
    const delta =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv, locale)
        : Number(av) - Number(bv);
    return (
      (order.direccion === "asc" ? delta : -delta) || a.id.localeCompare(b.id)
    );
  });
}
