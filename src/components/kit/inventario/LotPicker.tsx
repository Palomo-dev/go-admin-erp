'use client';

import { useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit/botonClases';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import {
  estadoVencimiento,
  ordenarFefo,
  repartirFefo,
  totalAsignado,
  UMBRAL_POR_VENCER_DIAS,
  type AsignacionLote,
} from '@/lib/inventario/nucleo/lotes';
import type { EstadoVencimiento, LoteDisponible } from '@/lib/inventario/nucleo/tipos';
import { BadgeVencimiento, useTextoVencimiento } from './BadgeVencimiento';
import { formatearCantidad } from './SaldoCorridoCell';

/**
 * Selector de lote (Figma `LotPicker` 530:65092): lotes con existencias en la
 * sucursal, ordenados por vencimiento (FEFO), con su estado. Se usa al vender
 * (POS, B9), al recibir (B8), en el ajuste (B2) y en el traslado (B3).
 *
 * - En línea: `<LotPicker …/>` dentro de un formulario.
 * - Diálogo en escritorio / hoja en móvil: `<DialogoLotes …/>` (Figma 530:65099 y 530:65161).
 *
 * Con `cantidad` la selección es un REPARTO: cada lote marcado lleva su cantidad
 * y el pie dice «Reparto: 12 de 12 uds asignadas». Sin `cantidad`, se elige un
 * solo lote (recepción, alta de serial).
 *
 * La venta real la reparte el servidor (`fn_inv_int_mover`, FEFO): esto solo
 * propone y deja cambiar. `hoy` = `todayInTz(zonaDeLaOrganizacion)`.
 */
export interface LotPickerProps {
  lotes: readonly LoteDisponible[];
  hoy: string;
  /** Cantidad a repartir (venta, traslado, ajuste de salida). null/undefined = un solo lote. */
  cantidad?: number | null;
  valor: readonly AsignacionLote[];
  onChange: (valor: AsignacionLote[]) => void;
  /** Deshabilita los lotes vencidos. */
  noVenderVencidos?: boolean;
  /** Si llega, se muestra el interruptor «No vender lotes vencidos» en el pie. */
  onNoVenderVencidosChange?: (valor: boolean) => void;
  umbralDias?: number;
  /** Sin la cabecera «Elegir lote» (cuando la pone el diálogo). */
  sinCabecera?: boolean;
  className?: string;
}

const FONDO_FILA: Record<EstadoVencimiento, string> = {
  vigente: 'bg-surface',
  por_vencer: 'bg-surface',
  vencido: 'bg-danger-subtle',
  sin_vencimiento: 'bg-surface',
};

const TEXTO_VENCE: Record<EstadoVencimiento, string> = {
  vigente: 'text-fg-muted',
  por_vencer: 'text-warning-text',
  vencido: 'text-danger-text',
  sin_vencimiento: 'text-fg-muted',
};

export function LotPicker({
  lotes,
  hoy,
  cantidad,
  valor,
  onChange,
  noVenderVencidos = false,
  onNoVenderVencidosChange,
  umbralDias = UMBRAL_POR_VENCER_DIAS,
  sinCabecera,
  className,
}: LotPickerProps) {
  const t = useTranslations('inventario.lotes');
  const locale = useLocale();
  const textoVence = useTextoVencimiento();
  const idSwitch = useId();
  const reparto = typeof cantidad === 'number';
  const ordenados = useMemo(() => ordenarFefo(lotes), [lotes]);
  const asignado = totalAsignado(valor);
  const porLote = new Map(valor.map((a) => [a.lot_id, a.qty]));

  const alternar = (lote: LoteDisponible, marcar: boolean) => {
    if (!reparto) {
      onChange(marcar ? [{ lot_id: lote.lot_id, qty: lote.qty_on_hand }] : []);
      return;
    }
    if (!marcar) {
      onChange(valor.filter((a) => a.lot_id !== lote.lot_id));
      return;
    }
    const restante = Math.max(0, (cantidad ?? 0) - asignado);
    onChange([...valor, { lot_id: lote.lot_id, qty: Math.min(restante, lote.qty_on_hand) }]);
  };

  const cambiarCantidad = (lote: LoteDisponible, texto: string) => {
    const n = Math.max(0, Math.min(lote.qty_on_hand, Number(texto.replace(',', '.')) || 0));
    onChange(valor.map((a) => (a.lot_id === lote.lot_id ? { ...a, qty: n } : a)));
  };

  return (
    <div className={cn('flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface', className)}>
      {!sinCabecera && (
        <div className="flex flex-col gap-0.5 bg-subtle px-3.5 py-3">
          <p className="text-sm font-semibold text-fg">{t('titulo')}</p>
          <p className="text-xs text-fg-muted">{t('ayuda')}</p>
        </div>
      )}

      {ordenados.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-fg-secondary">{t('sinLotes')}</p>
      ) : (
        <ul role="list" className="divide-y divide-line">
          {ordenados.map((lote) => {
            const { estado } = estadoVencimiento(lote.expiry_date, hoy, umbralDias);
            const marcado = porLote.has(lote.lot_id);
            const bloqueado = noVenderVencidos && estado === 'vencido';
            const idCasilla = `lote-${lote.lot_id}`;
            return (
              <li
                key={lote.lot_id}
                className={cn('flex items-center gap-2.5 px-3.5 py-2.5', marcado ? 'bg-brand-tint' : FONDO_FILA[estado])}
                data-estado={estado}
              >
                <Checkbox
                  id={idCasilla}
                  checked={marcado}
                  disabled={bloqueado && !marcado}
                  onCheckedChange={(v) => alternar(lote, v === true)}
                />
                <label htmlFor={idCasilla} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium leading-[18px] text-fg">
                    {t('opcion', { codigo: lote.lot_code, cantidad: formatearCantidad(lote.qty_on_hand, locale) })}
                  </span>
                  <span className={cn('text-xs', TEXTO_VENCE[estado])}>{textoVence(lote.expiry_date, hoy)}</span>
                </label>
                {reparto && marcado && (
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={lote.qty_on_hand}
                    step="0.001"
                    value={porLote.get(lote.lot_id) ?? 0}
                    onChange={(e) => cambiarCantidad(lote, e.target.value)}
                    aria-label={t('cantidadDelLote', { codigo: lote.lot_code })}
                    className="h-8 w-20 rounded-md border border-line-strong bg-surface px-2 text-right text-sm tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                )}
                <BadgeVencimiento expiry={lote.expiry_date} hoy={hoy} umbralDias={umbralDias} />
              </li>
            );
          })}
        </ul>
      )}

      {(reparto || onNoVenderVencidosChange) && (
        <div className="flex flex-col gap-2 bg-subtle px-3.5 py-2.5">
          {reparto && (
            <p className="text-xs text-fg-secondary" aria-live="polite">
              {t('reparto', { asignado: formatearCantidad(asignado, locale), total: formatearCantidad(cantidad ?? 0, locale) })}
              {asignado < (cantidad ?? 0) && (
                <span className="ml-1 text-warning-text">
                  · {t('faltante', { faltante: formatearCantidad(Math.round(((cantidad ?? 0) - asignado) * 1000) / 1000, locale) })}
                </span>
              )}
            </p>
          )}
          {onNoVenderVencidosChange && (
            <div className="flex items-center gap-2">
              <label htmlFor={idSwitch} className="flex-1 text-xs text-fg-secondary">
                {t('noVenderVencidos')}
              </label>
              <Switch id={idSwitch} checked={noVenderVencidos} onCheckedChange={onNoVenderVencidosChange} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Diálogo en escritorio y hoja inferior en móvil con el `LotPicker` (Figma 530:65099 / 530:65161). */
export interface DialogoLotesProps extends Omit<LotPickerProps, 'valor' | 'onChange' | 'sinCabecera' | 'className'> {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** «Zapatilla urbana Nova 42 · 12 uds». */
  descripcion?: string;
  /** Selección inicial; si no llega, el reparto FEFO sugerido. */
  valorInicial?: readonly AsignacionLote[];
  onConfirmar: (valor: AsignacionLote[]) => void;
}

export function DialogoLotes({ abierto, onAbiertoChange, descripcion, valorInicial, onConfirmar, ...picker }: DialogoLotesProps) {
  const t = useTranslations('inventario.lotes');
  const sugerido = useMemo(
    () =>
      valorInicial
        ? [...valorInicial]
        : typeof picker.cantidad === 'number'
          ? repartirFefo(picker.lotes, picker.cantidad, picker.hoy, { incluirVencidos: !picker.noVenderVencidos }).asignaciones
          : [],
    // Solo al abrir: la selección de trabajo vive en el estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [abierto],
  );
  const [trabajo, setTrabajo] = useState<AsignacionLote[]>(sugerido);
  const [base, setBase] = useState(sugerido);
  if (base !== sugerido) {
    setBase(sugerido);
    setTrabajo(sugerido);
  }

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={descripcion ?? t('ayuda')}
      ancho={672}
      pie={
        <>
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)}>
            {t('cancelar')}
          </button>
          <button
            type="button"
            className={clasesBoton({ variante: 'primario' })}
            onClick={() => {
              onConfirmar(trabajo.filter((a) => a.qty > 0 || typeof picker.cantidad !== 'number'));
              onAbiertoChange(false);
            }}
          >
            {t('usar')}
          </button>
        </>
      }
    >
      <LotPicker {...picker} valor={trabajo} onChange={setTrabajo} sinCabecera />
    </PanelAdaptable>
  );
}
