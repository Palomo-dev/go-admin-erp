"use client";
import { Briefcase, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable, EmptyState } from "@/components/kit";
import { useRedText } from "../red/useRedText";

export function PartnersDirectoryState({
  state,
  canManage,
  onCreate,
  onTiers,
  onRetry,
}: {
  state: "empty" | "loading" | "error";
  canManage: boolean;
  onCreate: () => void;
  onTiers: () => void;
  onRetry: () => void;
}) {
  const { tr } = useRedText();
  const t = useTranslations("crm.partnersVisual");
  if (state === "loading")
    return (
      <DataTable
        etiqueta={tr("Partners")}
        columnas={Array.from({ length: 8 }, (_, i) => ({
          id: String(i),
          encabezado: "",
          celda: () => null,
        }))}
        filas={[]}
        obtenerId={() => ""}
        estado="cargando"
        filasEsqueleto={5}
        mostrarCabeceraCargando={false}
        altoFilaEsqueleto={48}
        varianteEsqueleto="figma"
        className="[&_thead]:hidden [&_tbody_tr]:h-12"
      />
    );
  return (
    <EmptyState
      variante={state === "error" ? "error" : "empty"}
      icono={state === "empty" ? Briefcase : undefined}
      titulo={t(state === "error" ? "errorTitulo" : "vacioTitulo")}
      descripcion={t(state === "error" ? "errorDetalle" : "vacioDetalle")}
      className="min-h-[412px] rounded-xl border border-line bg-surface"
      accionPrimaria
      onReintentar={state === "error" ? onRetry : undefined}
      accion={
        state === "empty" && canManage
          ? { etiqueta: tr("Nuevo partner"), onClick: onCreate, icono: Plus }
          : undefined
      }
      accionSecundaria={
        state === "empty"
          ? { etiqueta: t("configurarNiveles"), onClick: onTiers }
          : undefined
      }
    />
  );
}
