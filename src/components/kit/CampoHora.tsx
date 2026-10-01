'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { buscarPorTexto, etiquetaHora, horasDelDia, indiceInicial, moverIndice, normalizarHora, opcionesConValor } from './horaLogica';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Campo de hora del kit. Hermano de `CampoFecha`: mismo disparador (40 px,
 * borde fuerte, radio 8, icono y chevron), panel en portal por encima de
 * diálogos y foco de vuelta al disparador al cerrar. Sustituye al
 * `<input type="time">` del navegador, cuyo selector (columnas de hora,
 * minuto y a. m./p. m.) no sigue la marca ni el idioma.
 *
 * Trabaja con `HH:mm` (`''` sin hora), igual que el `value` del input nativo:
 * cambiar uno por otro no cambia qué se guarda. Lista cada `paso` minutos
 * (15 por defecto) con el rótulo del idioma («3:00 p. m.»); una hora guardada
 * fuera del paso se conserva en la lista. Teclado: ↑/↓, Re Pág/Av Pág,
 * Inicio/Fin, Enter para elegir, Escape para cerrar y escribir «14» o «2 p»
 * para saltar.
 */
export interface CampoHoraProps {
  valor: string | null | undefined;
  onValorChange: (hora: string) => void;
  /** Minutos entre opciones. */
  paso?: 5 | 10 | 15 | 30 | 60;
  min?: string | null;
  max?: string | null;
  limpiable?: boolean;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean;
  tamano?: 'sm' | 'md';
  alinear?: 'start' | 'center' | 'end';
  className?: string;
}

export const CampoHora = React.forwardRef<HTMLButtonElement, CampoHoraProps>(function CampoHora(
  {
    valor,
    onValorChange,
    paso = 15,
    min,
    max,
    limpiable,
    placeholder,
    id,
    disabled,
    required,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    tamano = 'md',
    alinear = 'start',
    className,
  },
  ref,
) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const idLista = React.useId();
  const hora = normalizarHora(valor);
  const opciones = React.useMemo(() => opcionesConValor(horasDelDia(paso), hora, min, max), [paso, hora, min, max]);
  const [abierto, setAbierto] = React.useState(false);
  const [activo, setActivo] = React.useState(-1);
  const busqueda = React.useRef({ texto: '', hasta: 0 });
  const refBoton = React.useRef<HTMLButtonElement | null>(null);
  const refLista = React.useRef<HTMLUListElement | null>(null);
  const invalido = ariaInvalid === true || ariaInvalid === 'true';
  const texto = hora ? etiquetaHora(hora, locale) : (placeholder ?? t('hora.elegir'));
  const puedeLimpiar = (limpiable ?? !(required || ariaRequired)) && Boolean(hora);

  const unirRef = (nodo: HTMLButtonElement | null) => {
    refBoton.current = nodo;
    if (typeof ref === 'function') ref(nodo);
    else if (ref) ref.current = nodo;
  };

  // Al abrir, la opción elegida (o la más cercana a las 9) queda activa y visible.
  React.useEffect(() => {
    if (!abierto) return;
    const i = indiceInicial(opciones, hora);
    setActivo(i);
    requestAnimationFrame(() => {
      refLista.current?.focus();
      refLista.current?.querySelector<HTMLElement>(`[data-indice="${i}"]`)?.scrollIntoView({ block: 'center' });
    });
  }, [abierto, opciones, hora]);

  const mostrar = (i: number) => {
    setActivo(i);
    refLista.current?.querySelector<HTMLElement>(`[data-indice="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const elegir = (h: string) => {
    onValorChange(h);
    setAbierto(false);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const siguiente = moverIndice(activo, e.key, opciones.length);
    if (siguiente !== null) {
      e.preventDefault();
      mostrar(siguiente);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && activo >= 0) {
      e.preventDefault();
      elegir(opciones[activo]);
      return;
    }
    if (e.key.length === 1 && /[\d:apm ]/i.test(e.key)) {
      const ahora = Date.now();
      const b = busqueda.current;
      b.texto = (ahora < b.hasta ? b.texto : '') + e.key;
      b.hasta = ahora + 900;
      const i = buscarPorTexto(opciones, b.texto);
      if (i >= 0) mostrar(i);
    }
  };

  return (
    <PopoverPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={unirRef}
          id={id}
          type="button"
          // Combobox de solo selección, como `CampoFecha`.
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
          role="combobox"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-label={ariaLabel ? `${ariaLabel}: ${hora ? texto : t('hora.sinHora')}` : ariaLabelledby || id ? undefined : texto}
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
          <Clock aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span className={cn('min-w-0 flex-1 truncate tabular-nums', hora ? 'text-fg' : 'text-fg-muted')}>{texto}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={alinear}
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            refBoton.current?.focus();
          }}
          className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-[160px] rounded-xl border border-line bg-surface p-1 text-fg shadow-md outline-none"
        >
          <ul
            ref={refLista}
            id={idLista}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel ?? t('hora.etiqueta')}
            aria-activedescendant={activo >= 0 ? `${idLista}-${activo}` : undefined}
            onKeyDown={alTeclear}
            className="max-h-64 overflow-y-auto outline-none"
          >
            {opciones.map((h, i) => {
              const elegida = h === hora;
              return (
                <li
                  key={h}
                  id={`${idLista}-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={elegida}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(h)}
                  className={cn(
                    'cursor-pointer rounded-md px-3 py-1.5 text-sm tabular-nums',
                    elegida ? 'bg-brand text-fg-on-brand' : i === activo ? 'bg-subtle text-fg' : 'text-fg',
                  )}
                >
                  {etiquetaHora(h, locale)}
                </li>
              );
            })}
          </ul>
          {puedeLimpiar && (
            <div className="mt-1 border-t border-line px-2 pt-1.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => elegir('')}
                className="rounded-md px-1 py-0.5 text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('hora.limpiar')}
              </button>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
