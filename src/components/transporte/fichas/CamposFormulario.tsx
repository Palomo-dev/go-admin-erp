'use client';

/**
 * Campos de los formularios del catálogo común (vehículo y persona): un `Select` con su etiqueta,
 * ayuda y error del kit, y un interruptor con título y explicación (Figma «Vehículo activo»).
 */
import type { ReactNode } from 'react';
import { FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** `Select` no admite valor vacío: «ninguno» viaja con este centinela. */
export const NINGUNO = '__ninguno__';

export interface OpcionCampo {
  valor: string;
  etiqueta: string;
  deshabilitada?: boolean;
}

export function CampoSelect({
  etiqueta,
  valor,
  onValor,
  opciones,
  ninguno,
  ayuda,
  error,
  obligatorio,
  placeholder,
  deshabilitado,
}: {
  etiqueta: string;
  valor: string | null;
  onValor: (v: string | null) => void;
  opciones: readonly OpcionCampo[];
  /** Texto de la opción vacía; sin él no hay opción vacía. */
  ninguno?: string;
  ayuda?: ReactNode;
  error?: string | null;
  obligatorio?: boolean;
  placeholder?: string;
  deshabilitado?: boolean;
}) {
  return (
    <FormField etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={obligatorio}>
      {(cp) => (
        <Select value={valor ?? (ninguno ? NINGUNO : undefined)} onValueChange={(v) => onValor(v === NINGUNO ? null : v)} disabled={deshabilitado}>
          <SelectTrigger
            id={cp.id}
            aria-labelledby={cp.idEtiqueta}
            aria-describedby={cp['aria-describedby']}
            aria-invalid={cp['aria-invalid']}
            className={`h-10 border-line-strong bg-surface ${error ? 'border-danger' : ''}`}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {ninguno && <SelectItem value={NINGUNO}>{ninguno}</SelectItem>}
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor} disabled={o.deshabilitada}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function CampoInterruptor({ id, titulo, descripcion, valor, onValor, deshabilitado }: { id: string; titulo: string; descripcion?: string; valor: boolean; onValor: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={valor} onCheckedChange={onValor} disabled={deshabilitado} aria-describedby={descripcion ? `${id}-descripcion` : undefined} />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {titulo}
        </label>
        {descripcion && (
          <span id={`${id}-descripcion`} className="text-[13px] text-fg-secondary">
            {descripcion}
          </span>
        )}
      </div>
    </div>
  );
}
