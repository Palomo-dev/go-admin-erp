"use client";

/**
 * Un campo de la plantilla de discovery (`DiscoveryField`) como control con
 * su etiqueta (`htmlFor`), `aria-required` y una pista enlazada por
 * `aria-describedby`: el ejemplo (`placeholder`) desaparece al escribir y un
 * lector de pantalla nunca lo lee como descripción, así que la pista lo
 * conserva en `sr-only`; sin ejemplo, dice si el campo es obligatorio.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DiscoveryField } from "@/lib/services/crm/discoveryTemplateService";

interface Props {
  /** Id del control (único por oportunidad y campo). */
  id: string;
  field: DiscoveryField;
  value: string;
  onChange: (value: string) => void;
}

/** Texto de la pista: ejemplo si lo hay; si no, obligatorio/opcional. Puro, para probarlo. */
export function fieldHint(field: Pick<DiscoveryField, "placeholder" | "required">): string {
  if (field.placeholder) return `Ejemplo: ${field.placeholder}`;
  return field.required ? "Campo obligatorio" : "Campo opcional";
}

function FieldLabel({ id, field }: { id: string; field: DiscoveryField }) {
  return (
    <Label htmlFor={id} className="text-xs text-gray-700 dark:text-gray-300">
      {field.label}
      {field.required && (
        <span className="ml-0.5 text-red-700 dark:text-red-300" aria-hidden="true">
          *
        </span>
      )}
    </Label>
  );
}

export function FieldRenderer({ id, field, value, onChange }: Props) {
  const hintId = `${id}-hint`;
  const required = field.required || undefined;
  const hint = (
    <p id={hintId} className="sr-only">
      {fieldHint(field)}
    </p>
  );

  if (field.type === "textarea") {
    return (
      <div className="space-y-1 sm:col-span-2">
        <FieldLabel id={id} field={field} />
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="text-sm"
          aria-required={required}
          aria-describedby={hintId}
        />
        {hint}
      </div>
    );
  }
  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-1">
        <FieldLabel id={id} field={field} />
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-required={required}
          aria-describedby={hintId}
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Seleccionar...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {hint}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <FieldLabel id={id} field={field} />
      <Input
        id={id}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="h-9 text-sm"
        aria-required={required}
        aria-describedby={hintId}
      />
      {hint}
    </div>
  );
}
