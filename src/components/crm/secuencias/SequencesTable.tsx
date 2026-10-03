"use client";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { DataTable, type ColumnaTabla } from "@/components/kit/DataTable";
import { Switch } from "@/components/ui/switch";
import { StepMiniTimeline } from "./StepMiniTimeline";
import {
  enrollBlockReason,
  responseSummary,
  triggerLabel,
} from "./sequenceOptions";
import { totalDurationLabel } from "@/lib/services/crm/sequenceTimeline";
import { useSequenceText } from "./useSequenceText";
import type { SequenceView } from "./useSequences";
interface Props {
  sequences: SequenceView[];
  canManage: boolean;
  busy: boolean;
  loading?: boolean;
  onToggle(s: SequenceView): void;
  onEdit(s: SequenceView): void;
  onDelete(s: SequenceView): void;
  onEnroll(s: SequenceView): void;
  onEnrollments(s: SequenceView): void;
}
export function SequencesTable({
  sequences,
  canManage,
  busy,
  loading = false,
  onToggle,
  onEdit,
  onDelete,
  onEnroll,
  onEnrollments,
}: Props) {
  const tr = useSequenceText();
  const columns: ColumnaTabla<SequenceView>[] = [
    {
      id: "name",
      encabezado: tr("Secuencia"),
      celda: (s) => (
        <div className="min-w-44">
          <button
            disabled={!canManage || busy}
            className="block max-w-full truncate text-left text-sm font-medium text-fg disabled:opacity-100"
            onClick={() => onEdit(s)}
          >
            {s.name}
          </button>
          <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">
            {(s.steps ?? []).length} {tr("pasos")} ·{" "}
            {totalDurationLabel(s.steps ?? [], tr)}
          </p>
        </div>
      ),
    },
    {
      id: "trigger",
      encabezado: tr("Se inscribe cuando"),
      celda: (s) => (
        <span className="text-[13px] leading-[18px] text-fg-secondary">
          {tr(triggerLabel(s.trigger_type))}
        </span>
      ),
    },
    {
      id: "steps",
      encabezado: tr("Pasos"),
      celda: (s) => <StepMiniTimeline compacto steps={s.steps ?? []} />,
    },
    {
      id: "activeCount",
      encabezado: tr("Activos"),
      variante: "importe",
      celda: (s) => s.enrollment_stats?.active ?? "—",
    },
    {
      id: "response",
      encabezado: tr("Respuesta"),
      celda: (s) => (
        <span className="block max-w-48 text-[13px] leading-[18px] text-fg-secondary">
          {s.enrollment_stats
            ? responseSummary(s.enrollment_stats, s.pause_on_reply, tr)
            : "—"}
        </span>
      ),
    },
    {
      id: "active",
      encabezado: tr("Activa"),
      ancho: 70,
      celda: (s) => (
        <Switch
          checked={s.is_active}
          disabled={!canManage || busy}
          aria-label={tr("Activar la secuencia {p0}", { p0: s.name })}
          onCheckedChange={() => onToggle(s)}
        />
      ),
    },
  ];
  return (
    <DataTable
      columnas={columns}
      filas={sequences}
      obtenerId={(s) => s.id}
      etiqueta={tr("Secuencias")}
      etiquetaFila={(s) => s.name}
      densidad="compacta"
      estado={loading ? "cargando" : "listo"}
      filasEsqueleto={5}
      mostrarCabeceraCargando={false}
      altoFilaEsqueleto={48}
      varianteEsqueleto="figma"
      className="[&_thead_th]:h-9 [&_thead_th]:font-semibold"
      acciones={(s) => [
        {
          id: "enrollments",
          etiqueta: tr("Inscripciones"),
          icono: Users,
          onSelect: () => onEnrollments(s),
        },
        {
          id: "enroll",
          etiqueta: tr("Inscribir"),
          icono: UserPlus,
          onSelect: () => onEnroll(s),
          deshabilitada:
            !canManage || busy || enrollBlockReason(s, tr) !== null,
        },
        {
          id: "edit",
          etiqueta: tr("Editar"),
          icono: Pencil,
          onSelect: () => onEdit(s),
          deshabilitada: !canManage || busy,
        },
        {
          id: "delete",
          etiqueta: tr("Eliminar"),
          icono: Trash2,
          onSelect: () => onDelete(s),
          deshabilitada: !canManage || busy,
          destructiva: true,
        },
      ]}
    />
  );
}
