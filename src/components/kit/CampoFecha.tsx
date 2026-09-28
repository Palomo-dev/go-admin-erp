'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CalendarioMes } from './CalendarioMes';
import { acotarDia, esFechaPlana, etiquetaDiaTrigger, fueraDeLimites } from './calendarioLogica';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Campo de fecha de marca (Figma `DateRange` 104:3343, disparador 104:3195 /
 * 104:3208 y panel «Calendario» 104:3219). Sustituye al `<input type="date">`
 * del navegador y al `DatePicker` viejo de `ui/date-picker`.
 *
 * Trabaja con un día calendario puro `YYYY-MM-DD` (`valor` / `onValorChange`,
 * `''` al limpiar), igual que el `value` de un `<input type="date">`: cambiar
 * uno por otro no cambia qué se guarda. «Hoy» es el de la organización
 * (`hoy`, o `useFormatDate().getToday()` si no llega).
 *
 * Disparador con el aspecto de los campos del kit (40 px, borde fuerte, radio
 * 8, icono de calendario, chevron); borde de marca abierto y de peligro con
 * `aria-invalid`. El panel va en portal por encima de diálogos y hojas, y al
 * cerrar el foco vuelve al disparador. Con `name` deja un campo oculto para
 * formularios nativos; con `required` el navegador lo valida.
 */
export interface CampoFechaProps {
  /** Día `YYYY-MM-DD`; vacío o `null` = sin fecha. */
  valor: string | null | undefined;
  /** Día elegido, o `''` al limpiar. */
  onValorChange: (dia: string) => void;
  min?: string | null;
  max?: string | null;
  /** «Hoy» en la zona de la organización (`YYYY-MM-DD`). */
  hoy?: string;
  /** Muestra «Limpiar» en el pie. Por defecto, si el campo no es obligatorio. */
  limpiable?: boolean;
  /** Texto sin fecha (por defecto «Elegir fecha»). */
  placeholder?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  /** Lo pasa `FormField` con `obligatorio` (no valida: para eso, `required`). */
  'aria-required'?: boolean;
  tamano?: 'sm' | 'md';
  /** Alineación del panel respecto al disparador. */
  alinear?: 'start' | 'center' | 'end';
  onBlur?: () => void;
  className?: string;
}

export const CampoFecha = React.forwardRef<HTMLButtonElement, CampoFechaProps>(function CampoFecha(
  {
    valor,
    onValorChange,
    min,
    max,
    hoy: hoyProp,
    limpiable,
    placeholder,
    id,
    name,
    required,
    disabled,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    tamano = 'md',
    alinear = 'start',
    onBlur,
    className,
  },
  ref,
) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const { getToday } = useFormatDate();
  const hoy = hoyProp ?? getToday();
  const [abierto, setAbierto] = React.useState(false);
  const refBoton = React.useRef<HTMLButtonElement | null>(null);
  const dia = esFechaPlana(valor) ? valor : '';
  const texto = dia ? etiquetaDiaTrigger(dia, locale) : (placeholder ?? t('calendario.elegirFecha'));
  const invalido = ariaInvalid === true || ariaInvalid === 'true';
  const puedeLimpiar = (limpiable ?? !required) && Boolean(dia);
  const hoyElegible = esFechaPlana(hoy) && !fueraDeLimites(hoy, min, max);

  const unirRef = (nodo: HTMLButtonElement | null) => {
    refBoton.current = nodo;
    if (typeof ref === 'function') ref(nodo);
    else if (ref) ref.current = nodo;
  };

  const elegir = (d: string) => {
    onValorChange(d);
    setAbierto(false);
  };

  return (
    <PopoverPrimitive.Root
      open={abierto}
      onOpenChange={(o) => {
        setAbierto(o);
        if (!o) onBlur?.();
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={unirRef}
          id={id}
          type="button"
          // Combobox de solo selección (patrón de WAI-ARIA): el texto es su valor y
          // admite aria-invalid / aria-required, que un botón no anuncia.
          // aria-expanded y aria-controls los pone el Trigger de Radix.
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
          role="combobox"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={
            ariaLabel
              ? `${ariaLabel}: ${dia ? texto : t('calendario.sinFecha')}`
              : ariaLabelledby || id
                ? undefined
                : texto
          }
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          aria-invalid={invalido || undefined}
          aria-required={required || ariaRequired || undefined}
          className={cn(
            'inline-flex w-full min-w-0 items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'data-[state=open]:border-brand',
            invalido ? 'border-line-danger' : 'border-line-strong',
            tamano === 'sm' ? 'h-8' : 'h-10',
            className,
          )}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span className={cn('min-w-0 flex-1 truncate tabular-nums', dia ? 'text-fg' : 'text-fg-muted')}>{texto}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverPrimitive.Trigger>
      {(name !== undefined || required) && (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          name={name}
          value={dia}
          required={required}
          disabled={disabled}
          onChange={() => undefined}
          onFocus={() => refBoton.current?.focus()}
        />
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={alinear}
          sideOffset={4}
          collisionPadding={8}
          aria-label={ariaLabel ?? t('calendario.etiqueta')}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            // Safari no enfoca el botón al hacer clic: el foco vuelve siempre al disparador.
            e.preventDefault();
            refBoton.current?.focus();
          }}
          className="z-[70] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-surface p-3 text-fg shadow-md outline-none"
        >
          <CalendarioMes
            valor={dia || null}
            diaInicial={dia || acotarDia(esFechaPlana(hoy) ? hoy : getToday(), min, max)}
            onElegir={elegir}
            min={min}
            max={max}
            hoy={hoy}
            enfocarAlMontar
          />
          {(hoyElegible || puedeLimpiar) && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs font-medium">
              {hoyElegible ? (
                <button
                  type="button"
                  onClick={() => elegir(hoy)}
                  className="rounded-md px-1 py-0.5 text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('calendario.hoy')}
                </button>
              ) : (
                <span />
              )}
              {puedeLimpiar && (
                <button
                  type="button"
                  onClick={() => elegir('')}
                  className="rounded-md px-1 py-0.5 text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('calendario.limpiar')}
                </button>
              )}
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
