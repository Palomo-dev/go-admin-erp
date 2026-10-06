'use client';

/**
 * Campos de lista del inspector (lámina 17 de la Carta QR, «Cuenta de la mesa»):
 * - `checklist`: casillas («Todo junto», «Partes iguales», «Por lo que pidió cada uno»); guarda
 *   los `value` marcados en el orden del catálogo. Siempre deja al menos uno.
 * - `chips`: valores cortos en chips con «×» y un campo para añadir («Sin propina», «10 %»,
 *   «15 %»; o textos como «La comida»). Números con `min`/`max` y sin repetir; `maxItems`.
 */
import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { cn } from '@/utils/Utils';

interface CampoListaProps {
  campo: ContentFieldDef;
  valor: unknown;
  onCambiar: (valor: unknown) => void;
  deshabilitado?: boolean;
}

function listaPorDefecto(campo: ContentFieldDef): unknown[] {
  return Array.isArray(campo.defaultValue) ? [...campo.defaultValue] : [];
}

/** Valor actual del checklist (sin valor guardado: el default del catálogo). */
export function marcadosDe(campo: ContentFieldDef, valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : listaPorDefecto(campo);
  const validos = new Set((campo.options ?? []).map((o) => o.value));
  return lista.map(String).filter((v) => validos.has(v));
}

/** Alterna una opción conservando el orden del catálogo; nunca deja la lista vacía. */
export function alternarMarcado(campo: ContentFieldDef, actuales: readonly string[], valor: string): string[] {
  const set = new Set(actuales);
  if (set.has(valor)) {
    if (set.size === 1) return [...actuales];
    set.delete(valor);
  } else set.add(valor);
  return (campo.options ?? []).map((o) => o.value).filter((v) => set.has(v));
}

export function CampoChecklist({ campo, valor, onCambiar, deshabilitado }: CampoListaProps) {
  const id = useId();
  const marcados = marcadosDe(campo, valor);
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={campo.helpText ? `${id}-ayuda` : undefined}>
      <legend className="sr-only">{campo.label}</legend>
      {(campo.options ?? []).map((o) => {
        const marcado = marcados.includes(o.value);
        const idOpcion = `${id}-${o.value}`;
        return (
          <label key={o.value} htmlFor={idOpcion} className="flex min-h-8 cursor-pointer items-center gap-3 text-sm text-fg">
            <Checkbox
              id={idOpcion}
              checked={marcado}
              disabled={deshabilitado || (marcado && marcados.length === 1)}
              onCheckedChange={() => onCambiar(alternarMarcado(campo, marcados, o.value))}
            />
            {o.label}
          </label>
        );
      })}
      {campo.helpText && (
        <p id={`${id}-ayuda`} className="text-xs leading-4 text-fg-secondary">
          {campo.helpText}
        </p>
      )}
    </fieldset>
  );
}

/** Valores actuales de los chips (sin valor guardado: el default del catálogo). */
export function chipsDe(campo: ContentFieldDef, valor: unknown): Array<string | number> {
  const lista = Array.isArray(valor) ? valor : listaPorDefecto(campo);
  return lista.filter((v): v is string | number => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''));
}

/** Añade un chip si es válido (número en rango o texto no vacío), sin repetir y con tope. */
export function anadirChip(campo: ContentFieldDef, actuales: ReadonlyArray<string | number>, entrada: string): Array<string | number> | null {
  if (campo.maxItems && actuales.length >= campo.maxItems) return null;
  const texto = entrada.trim();
  if (!texto) return null;
  if (campo.itemType === 'number') {
    const n = Number(texto.replace(',', '.').replace(/%$/, '').trim());
    if (!Number.isInteger(n)) return null;
    if (campo.min !== undefined && n < campo.min) return null;
    if (campo.max !== undefined && n > campo.max) return null;
    if (actuales.includes(n)) return null;
    return [...(actuales as number[]), n].sort((a, b) => a - b);
  }
  const corto = texto.slice(0, 60);
  if (actuales.some((v) => String(v).toLowerCase() === corto.toLowerCase())) return null;
  return [...actuales, corto];
}

export function etiquetaChip(campo: ContentFieldDef, v: string | number): string {
  if (campo.itemType === 'number') {
    // «0» de la propina se lee «Sin propina» (placeholder del catálogo).
    if (v === 0 && campo.placeholder) return campo.placeholder;
    return campo.suffix ? `${v} ${campo.suffix}` : String(v);
  }
  return String(v);
}

export function CampoChips({ campo, valor, onCambiar, deshabilitado }: CampoListaProps) {
  const id = useId();
  const [nuevo, setNuevo] = useState('');
  const chips = chipsDe(campo, valor);
  const lleno = !!campo.maxItems && chips.length >= campo.maxItems;
  const anadir = () => {
    const r = anadirChip(campo, chips, nuevo);
    if (r) {
      onCambiar(r);
      setNuevo('');
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={campo.label} className="flex flex-wrap gap-2">
        {chips.map((v) => (
          <li key={String(v)} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-tint pl-3 pr-1 text-[13px] font-medium text-brand">
            {etiquetaChip(campo, v)}
            <button
              type="button"
              aria-label={`Quitar ${etiquetaChip(campo, v)}`}
              disabled={deshabilitado || chips.length === 1}
              onClick={() => onCambiar(chips.filter((x) => x !== v))}
              className="flex size-6 items-center justify-center rounded-full hover:bg-brand-tint-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
      {!lleno && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-nuevo`} className="sr-only">
            {`Añadir a ${campo.label}`}
          </label>
          <Input
            id={`${id}-nuevo`}
            value={nuevo}
            inputMode={campo.itemType === 'number' ? 'numeric' : 'text'}
            placeholder={campo.itemType === 'number' ? `${campo.min ?? 0}–${campo.max ?? 100}${campo.suffix ? ` ${campo.suffix}` : ''}` : campo.placeholder}
            disabled={deshabilitado}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                anadir();
              }
            }}
            className="h-9 w-32 rounded-lg"
          />
          <button
            type="button"
            onClick={anadir}
            disabled={deshabilitado || !nuevo.trim()}
            aria-label={`Añadir a ${campo.label}`}
            className={cn(
              'flex size-9 items-center justify-center rounded-lg border border-line-strong text-fg hover:bg-hover disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            )}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
      {campo.helpText && <p className="text-xs leading-4 text-fg-secondary">{campo.helpText}</p>}
    </div>
  );
}
