'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Switch } from '@/components/ui/switch';
import { formatearTarifa } from '../resumenTotalesLogica';
import { useKitT, useLocaleIntl } from '../useIdiomaKit';
import { alternarImpuesto, textoSeleccionImpuestos, type OpcionImpuesto, type SeleccionImpuestos } from './edicionDocumentoLogica';

/**
 * Impuestos de UNA línea (Figma `ImpuestosLinea` 1032:32779, Estado cerrado ·
 * abierto · sin-impuesto). Los impuestos son los de la organización
 * (Tesorería › Impuestos, sin retenciones: esas van en el resumen).
 *
 * - Cerrado: «IVA 19 %» o «IVA 19 % + Ultraprocesados 20 %»; sin impuesto,
 *   borde de advertencia y «Se facturará al 0 %» debajo.
 * - Abierto: casillas (`multiple`) o una sola opción, «Incluido en el precio»
 *   y «Sin impuesto (excluir esta línea)».
 *
 * Teclado: Enter o Espacio abren; ↑/↓ recorren; Espacio marca; Esc cierra.
 * No calcula nada: la pantalla recalcula la línea con su servicio.
 */
export interface ImpuestosLineaProps {
  opciones: readonly OpcionImpuesto[];
  valor: SeleccionImpuestos;
  onValorChange: (valor: SeleccionImpuestos) => void;
  /** Venta: varios impuestos por línea. Compra: uno (la RPC guarda una tarifa). */
  multiple?: boolean;
  /** Nombre accesible («Impuestos de Zapatilla urbana»). */
  etiqueta: string;
  /** Texto bajo el disparador cuando la línea queda sin impuesto («Se facturará al 0 %»). */
  avisoSinImpuesto?: string;
  /** Oculta «Incluido en el precio» (el documento lo decide en la cabecera). */
  sinIncluido?: boolean;
  deshabilitado?: boolean;
  className?: string;
}

export function ImpuestosLinea({
  opciones,
  valor,
  onValorChange,
  multiple = true,
  etiqueta,
  avisoSinImpuesto,
  sinIncluido,
  deshabilitado,
  className,
}: ImpuestosLineaProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const idLista = useId();
  const idAviso = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tarifa = (x: number) => formatearTarifa(x, locale);
  const texto = useMemo(() => textoSeleccionImpuestos(valor.ids, opciones, tarifa), [valor.ids, opciones, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinImpuesto = valor.ids.length === 0;

  const alternar = (id: string) => {
    onValorChange({ ...valor, ids: alternarImpuesto(valor.ids, id, multiple) });
  };

  const mover = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const n = opciones.length;
    const s = e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
    setActivo(s);
    refs.current[s]?.focus();
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <PopoverPrimitive.Root open={abierto} onOpenChange={(v) => !deshabilitado && setAbierto(v)}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={deshabilitado}
            aria-haspopup="dialog"
            aria-expanded={abierto}
            aria-label={`${etiqueta}: ${sinImpuesto ? t('documentoEdicion.impuestos.sinAsignar') : texto}`}
            aria-describedby={sinImpuesto && avisoSinImpuesto ? idAviso : undefined}
            className={cn(
              'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-surface px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
              sinImpuesto ? 'border-line-warning text-warning-text' : 'border-line-strong text-fg',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{sinImpuesto ? t('documentoEdicion.impuestos.sinAsignar') : texto}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              const i = Math.max(0, opciones.findIndex((o) => valor.ids.includes(o.id)));
              setActivo(i);
              refs.current[i]?.focus();
            }}
            className="z-50 flex w-[300px] max-w-[calc(100vw-16px)] flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-fg shadow-lg outline-none"
          >
            <p id={`${idLista}-t`} className="text-sm font-semibold text-fg">
              {t('documentoEdicion.impuestos.titulo')}
            </p>
            {opciones.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('documentoEdicion.impuestos.sinConfigurar')}</p>
            ) : (
              <div id={idLista} role="group" aria-labelledby={`${idLista}-t`} className="flex flex-col gap-0.5">
                {opciones.map((o, i) => {
                  const marcado = valor.ids.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      ref={(el) => {
                        refs.current[i] = el;
                      }}
                      type="button"
                      role={multiple ? 'checkbox' : 'radio'}
                      aria-checked={marcado}
                      tabIndex={i === activo ? 0 : -1}
                      onKeyDown={(e) => mover(e, i)}
                      onClick={() => alternar(o.id)}
                      className="flex min-h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-[18px] shrink-0 items-center justify-center border',
                          multiple ? 'rounded' : 'rounded-full',
                          marcado ? 'border-brand-action bg-brand-action text-fg-on-brand' : 'border-line-strong bg-surface',
                        )}
                      >
                        {marcado && <Check className="size-3" strokeWidth={2.5} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {o.nombre}
                        {!/\d/.test(o.nombre) && tarifa(o.tarifa) ? ` ${tarifa(o.tarifa)}` : ''}
                      </span>
                      {o.predeterminado && (
                        <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-brand-tint px-2 text-[11px] font-medium text-brand-deep">
                          {t('documentoEdicion.impuestos.predeterminado')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {!sinIncluido && (
              <label className="flex items-center gap-2.5 border-t border-line pt-2 text-sm text-fg">
                <Switch checked={valor.incluido} onCheckedChange={(v) => onValorChange({ ...valor, incluido: v === true })} />
                {t('documentoEdicion.impuestos.incluido')}
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                onValorChange({ ...valor, ids: [] });
                setAbierto(false);
              }}
              className="self-start rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('documentoEdicion.impuestos.excluir')}
            </button>
            <p className="text-xs text-fg-muted">{t('documentoEdicion.impuestos.ayuda')}</p>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {sinImpuesto && avisoSinImpuesto && (
        <span id={idAviso} className="text-xs text-warning-text">
          {avisoSinImpuesto}
        </span>
      )}
    </div>
  );
}
