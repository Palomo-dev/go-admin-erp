"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import {
  getActiveDiscoveryTemplate,
  type DiscoveryField,
} from "@/lib/services/crm/discoveryTemplateService";
import { Loader2, Save, UserSearch, ChevronDown, ChevronUp, Settings } from "lucide-react";

interface DiscoverySectionProps {
  opportunityId: string;
  initialData?: Record<string, unknown> | null;
  onUpdated?: () => void;
  onConfigure?: () => void;
}

export function DiscoverySection({ opportunityId, initialData, onUpdated, onConfigure }: DiscoverySectionProps) {
  const [fields, setFields] = useState<DiscoveryField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Cargar template de discovery de la organización
  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const { fields: templateFields } = await getActiveDiscoveryTemplate();
      setFields(templateFields);
    } catch {
      // Si falla, usar campos por defecto
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  // Cargar valores desde initialData
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      const loaded: Record<string, string> = {};
      for (const [key, val] of Object.entries(initialData)) {
        loaded[key] = typeof val === "string" ? val : String(val ?? "");
      }
      setValues(loaded);
    } else {
      setValues({});
    }
  }, [initialData, opportunityId]);

  const update = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await opportunitiesService.updateOpportunity(opportunityId, {
        discovery_data: values as unknown as Record<string, unknown>,
      });
      toast({ title: "Discovery guardado" });
      onUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasData = Object.values(values).some((v) => v?.trim() !== "");

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <UserSearch className="h-4 w-4 text-blue-500" />
          Discovery / Calificación
          {hasData && (
            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
              Completado
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {onConfigure && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onConfigure();
              }}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <Settings className="h-3 w-3" />
              Configurar
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : fields.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic py-2">
              No hay campos de discovery configurados. Usa el botón "Configurar" para definirlos.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={values[field.id] || ""}
                  onChange={(v) => update(field.id, v)}
                />
              ))}
            </div>
          )}

          {fields.length > 0 && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="w-full h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Guardar discovery
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: DiscoveryField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs text-gray-600 dark:text-gray-400">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="text-sm"
        />
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-600 dark:text-gray-400">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Seleccionar...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-400">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="h-9 text-sm"
      />
    </div>
  );
}
