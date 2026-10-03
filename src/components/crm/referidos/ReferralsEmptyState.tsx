"use client";

import { Plus, Upload, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/kit/EmptyState";
import { useRedText } from "@/components/crm/red/useRedText";

interface Props {
  filtered: boolean;
  canRegister?: boolean;
  hasProgram: boolean;
  onRegister: () => void;
  onClearFilters: () => void;
  onCreateProgram?: () => void;
}
export function ReferralsEmptyState({
  filtered,
  canRegister = true,
  hasProgram,
  onRegister,
  onClearFilters,
  onCreateProgram,
}: Props) {
  const { tr } = useRedText();
  return (
    <div>
      <EmptyState
        variante={filtered ? "search" : "empty"}
        icono={filtered ? undefined : UserPlus}
        className="pt-12 [&>div]:gap-3 [&_p]:max-w-[400px]"
        titulo={tr(
          filtered
            ? "Ningún referido coincide con los filtros"
            : "Aún no hay referidos",
        )}
        descripcion={
          filtered
            ? undefined
            : tr(
                "Cuando un cliente te recomiende a alguien, regístralo aquí.",
              ) +
              (!hasProgram
                ? tr(
                    " Define primero un programa para saber qué recompensa se debe.",
                  )
                : "")
        }
        onLimpiarFiltros={onClearFilters}
        accionSecundaria={
          !filtered && onCreateProgram
            ? {
                etiqueta: tr("Crear programa"),
                icono: Upload,
                onClick: onCreateProgram,
              }
            : undefined
        }
        accion={
          !filtered && canRegister
            ? {
                etiqueta: tr("Registrar referido"),
                icono: Plus,
                onClick: onRegister,
              }
            : undefined
        }
      />
    </div>
  );
}
