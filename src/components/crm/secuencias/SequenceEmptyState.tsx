"use client";
import { GitBranch, Plus } from "lucide-react";
import { EmptyState } from "@/components/kit/EmptyState";
import { useSequenceText } from "./useSequenceText";
interface Props {
  canManage?: boolean;
  filtered: boolean;
  onCreate(): void;
  onClearFilters(): void;
}
export function SequenceEmptyState({
  filtered,
  onCreate,
  onClearFilters,
  canManage = false,
}: Props) {
  const tr = useSequenceText();
  return (
    <EmptyState
      className="min-h-[390px] justify-start rounded-xl border border-line bg-surface pt-24 pb-8 [&>div:nth-child(2)]:gap-3 [&>div:last-child:not(:nth-child(2))]:mt-12"
      variante={filtered ? "search" : "empty"}
      titulo={tr(
        filtered
          ? "Ninguna secuencia coincide con el filtro"
          : "Aún no tienes secuencias",
      )}
      descripcion={tr(
        filtered
          ? "Prueba con otro nombre o quita los filtros."
          : "Una secuencia hace el seguimiento por ti: envía, espera, vuelve a intentar y se detiene cuando el cliente responde, si así se configura.",
      )}
      icono={GitBranch}
      onLimpiarFiltros={filtered ? onClearFilters : undefined}
      accion={
        !filtered && canManage
          ? { etiqueta: tr("Nueva secuencia"), icono: Plus, onClick: onCreate }
          : undefined
      }
    />
  );
}
