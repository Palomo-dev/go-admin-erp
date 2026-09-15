"use client";

/**
 * Discovery / calificación de la oportunidad (FASE-09 drawer; F2 le añade el
 * progreso). Usa la plantilla activa de la organización —la sembrada
 * «Discovery General/Ventas» o la que el usuario configure— como lista plana
 * de campos (`DiscoveryField`). El progreso sale de `discoveryProgress` y se
 * expone como `progressbar`; las obligatorias que faltan se nombran. Cada
 * campo lo pinta `FieldRenderer` (label, aria-required y pista).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import {
  getActiveDiscoveryTemplate,
  type DiscoveryField,
} from "@/lib/services/crm/discoveryTemplateService";
import { discoveryProgress, missingRequired } from "@/lib/services/crm/discoveryProgress";
import { cn } from "@/utils/Utils";
import { CheckCircle2, ChevronDown, Loader2, Save, Settings, UserSearch } from "lucide-react";
import { FieldRenderer } from "./FieldRenderer";

interface DiscoverySectionProps {
  opportunityId: string;
  initialData?: Record<string, unknown> | null;
  onUpdated?: () => void;
  onConfigure?: () => void;
}

export function DiscoverySection({
  opportunityId,
  initialData,
  onUpdated,
  onConfigure,
}: DiscoverySectionProps) {
  const [fields, setFields] = useState<DiscoveryField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const panelId = `discovery-panel-${opportunityId}`;

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const { fields: templateFields } = await getActiveDiscoveryTemplate();
      setFields(templateFields);
    } catch {
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const [key, val] of Object.entries(initialData ?? {}))
      loaded[key] = typeof val === "string" ? val : String(val ?? "");
    setValues(loaded);
  }, [initialData, opportunityId]);

  const progress = useMemo(() => discoveryProgress(fields, values), [fields, values]);
  const missing = useMemo(() => missingRequired(fields, values), [fields, values]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await opportunitiesService.updateOpportunity(opportunityId, {
        discovery_data: values as unknown as Record<string, unknown>,
      });
      toast({
        title: "Discovery guardado",
        description: progress.complete
          ? "Todas las obligatorias respondidas."
          : `${progress.answered} de ${progress.total} campos.`,
      });
      onUpdated?.();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <UserSearch className="h-4 w-4 text-blue-500" aria-hidden="true" />
            Discovery / Calificación
            {!loading &&
              fields.length > 0 &&
              (progress.complete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Completo
                </span>
              ) : (
                <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
                  {progress.answered} de {progress.total}
                </span>
              ))}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {onConfigure && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-blue-700 dark:text-blue-300"
            onClick={onConfigure}
          >
            <Settings className="mr-1 h-3 w-3" aria-hidden="true" /> Configurar
          </Button>
        )}
      </div>

      {!loading && fields.length > 0 && (
        <div className="space-y-1">
          {/* Contraste no-texto (WCAG 1.4.11) en oscuro: pista gray-800 y relleno 500 → azul 3,99:1, esmeralda 5,79:1 (gray-700 + 600 daba 1,99 y 2,74). */}
          <div
            role="progressbar"
            aria-label="Progreso del discovery"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-valuetext={`${progress.answered} de ${progress.total} campos respondidos`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] motion-reduce:transition-none",
                progress.complete
                  ? "bg-emerald-600 dark:bg-emerald-500"
                  : "bg-blue-600 dark:bg-blue-500",
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Falta: {missing.map((f) => f.label).join(", ")}
            </p>
          )}
        </div>
      )}

      <div id={panelId} hidden={!expanded} className="space-y-3">
        {loading ? (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            aria-busy="true"
            aria-label="Cargando plantilla de discovery"
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <p className="py-2 text-xs italic text-gray-600 dark:text-gray-400">
            No hay campos de discovery configurados. Usa «Configurar» para definirlos.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <FieldRenderer
                key={field.id}
                id={`discovery-${opportunityId}-${field.id}`}
                field={field}
                value={values[field.id] || ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
              />
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 w-full bg-blue-600 text-xs text-white hover:bg-blue-700"
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Guardar discovery
          </Button>
        )}
      </div>
    </div>
  );
}
