"use client";

import { Plus, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/kit/EmptyState";
import { useRedText } from "@/components/crm/red/useRedText";

interface Props {
  filtered: boolean;
  canRegister?: boolean;
  hasProgram: boolean;
  onRegister: () => void;
  onClearFilters: () => void;
}
export function ReferralsEmptyState({
  filtered,
  canRegister = true,
  hasProgram,
  onRegister,
  onClearFilters,
}: Props) {
  const { tr } = useRedText();
  return (
    <div className="rounded-xl border border-line bg-surface">
      <EmptyState
        variante={filtered ? "search" : "empty"}
        icono={filtered ? undefined : UsersRound}
        titulo={tr(
          filtered
            ? "Ningún referido coincide con los filtros"
            : "Tus mejores leads los traen tus clientes",
        )}
        descripcion={
          filtered
            ? undefined
            : tr(
                "Registra a quién recomendó cada cliente, sigue el contacto hasta convertirlo en lead y deja constancia de la recompensa del programa.",
              ) +
              (!hasProgram
                ? tr(
                    " Aún no hay un programa activo: puedes registrar referidos igual y crear el programa cuando quieras.",
                  )
                : "")
        }
        onLimpiarFiltros={onClearFilters}
        accion={
          !filtered && canRegister
            ? {
                etiqueta: tr("Registrar el primer referido"),
                icono: Plus,
                onClick: onRegister,
              }
            : undefined
        }
      />
    </div>
  );
}
