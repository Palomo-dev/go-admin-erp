'use client';

/**
 * Piezas del kit con la misma forma que los controles nativos que reemplazan (auditoría 27-oct, 7 y 8c):
 * `<select>` → chips (`ChipsOpcion`), `<input type="number">` → `CampoNumero`, casillas → interruptor
 * y `<input type="color">` → campo de color del kit. Mantienen `value`/`checked`/`onChange(e.target…)`
 * para no tocar la lógica de cada panel ni los valores guardados.
 */
import { Children, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { CampoNumero, ChipsOpcion } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import { cn } from '@/utils/Utils';

type EventoValor = { target: { value: string } };
type EventoCasilla = { target: { checked: boolean } };

function textoDe(n: ReactNode): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join('');
  if (isValidElement(n)) return textoDe((n.props as { children?: ReactNode }).children);
  return '';
}

/** Opciones de los `<option>` hijos. Una opción vacía con la misma etiqueta que otra es su valor por defecto. */
export function opcionesDeHijos(children: ReactNode): { opciones: { valor: string; etiqueta: string }[]; vacioEs: string | null } {
  const todas: { valor: string; etiqueta: string }[] = [];
  Children.toArray(children).forEach((h) => {
    if (!isValidElement(h)) return;
    const p = (h as ReactElement<{ value?: unknown; children?: ReactNode }>).props;
    const valor = p.value === undefined ? textoDe(p.children) : String(p.value);
    todas.push({ valor, etiqueta: textoDe(p.children) });
  });
  const vacia = todas.find((o) => o.valor === '');
  const gemela = vacia ? todas.find((o) => o.valor !== '' && o.etiqueta === vacia.etiqueta) : undefined;
  return { opciones: gemela ? todas.filter((o) => o.valor !== '') : todas, vacioEs: gemela ? gemela.valor : null };
}

export function SelectKit({
  value,
  onChange,
  disabled,
  children,
  'aria-label': ariaLabel,
}: {
  value?: string | number | null;
  onChange: (e: EventoValor) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const { opciones, vacioEs } = opcionesDeHijos(children);
  const actual = value == null ? '' : String(value);
  const elegido = actual === '' && vacioEs ? vacioEs : actual;
  return (
    <ChipsOpcion
      etiqueta={ariaLabel}
      opciones={opciones.map((o) => ({ ...o, deshabilitada: disabled }))}
      valor={elegido}
      onValorChange={(v) => {
        if (!disabled) onChange({ target: { value: v } });
      }}
    />
  );
}

export function NumeroKit({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  placeholder,
}: {
  value?: string | number | null;
  onChange: (e: EventoValor) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const n = value === '' || value == null ? null : Number(value);
  return (
    <CampoNumero
      valor={Number.isFinite(n as number) ? (n as number) : null}
      onValorChange={(v) => onChange({ target: { value: v == null ? '' : String(v) } })}
      decimales={step != null && step < 1 ? 2 : 0}
      minimo={min}
      maximo={max}
      disabled={disabled}
      placeholder={placeholder}
      alinear="izquierda"
      tamano="sm"
    />
  );
}

/** Fila «texto · interruptor» que reemplaza `<label><span>…</span><input type="checkbox"/></label>`. */
export function CasillaKit({ titulo, checked, onChange, disabled }: { titulo: ReactNode; checked: boolean; onChange: (e: EventoCasilla) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm text-fg', disabled && 'opacity-60')}>
      <label htmlFor={id}>{titulo}</label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange({ target: { checked: v } })} className="shrink-0" />
    </div>
  );
}

/** Campo de color del kit con la firma de `<input type="color">`. */
export function ColorKit({ etiqueta, value, onChange, disabled }: { etiqueta: string; value: string; onChange: (e: EventoValor) => void; disabled?: boolean }) {
  return <ColorField etiqueta={etiqueta} valor={value} deshabilitado={disabled} onCambiar={(hex) => onChange({ target: { value: hex } })} />;
}
