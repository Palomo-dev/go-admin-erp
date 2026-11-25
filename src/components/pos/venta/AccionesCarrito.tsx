'use client';

import { Ban, CreditCard, FileText, LockOpen, Pause, Percent, Play, Printer, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BotonImporte, KbdButton } from '@/components/kit';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import type { EstadoBotonCobrar } from '@/lib/pos/venta/requisitosCarrito';
import { cn } from '@/utils/Utils';

/**
 * Botonera del carrito (POS-UX-V2 D3 y D3b; Figma `Carrito (listo)`,
 * `244:64655` sin caja, `244:65395` en espera, `244:66158` con deuda):
 *
 * - Activo: «Cobrar · $ · F4» a todo el ancho (o «Abrir caja para cobrar · F9»
 *   sin caja, D4) y debajo Descuento · D, Espera · F6, Deuda · F7 y Cocina · F8.
 *   Con una membresía sin cliente, «Cobrar» deshabilitado con su motivo (P1).
 * - En espera: «Reactivar · F6» y el cobro bloqueado con su motivo.
 * - Con deuda: Ver factura, Imprimir, «Cobrar deuda» (no exige caja) y Anular.
 *
 * `compacto` (la hoja del carrito en celular y tableta vertical): las acciones
 * secundarias van en UNA sola fila, con el icono sobre la etiqueta y 48 px de
 * alto para el dedo. Antes eran dos filas de botones de 32 px y, en un celular,
 * «Deuda» y «Cocina» quedaban por debajo del borde de la pantalla. Sin caja el
 * botón principal no lleva importe, así que el total se pinta encima.
 *
 * No decide nada: los estados llegan de `CartView` (`estadoBotonCobrar`,
 * `puedeRegistrarDeuda`). Los atajos los registra `CartView` con `useAtajos`.
 */
export interface AccionesCarritoProps {
  modo: 'activo' | 'espera' | 'deuda';
  /** Total del carrito ya formateado. */
  total: string;
  estadoCobrar: EstadoBotonCobrar;
  onCobrar: () => void;
  onAbrirCaja?: () => void;
  onDescuento?: () => void;
  onEspera: () => void;
  onReactivar: () => void;
  puedeDeuda: boolean;
  /** Por qué no se puede registrar deuda (sin cliente). */
  motivoDeuda?: string;
  onDeuda: () => void;
  conCocina: boolean;
  enviandoCocina: boolean;
  onCocina: () => void;
  // Carrito con deuda
  cargandoFactura: boolean;
  onVerFactura: () => void;
  onImprimir: () => void;
  onCobrarDeuda: () => void;
  onAnular: () => void;
  /** Hoja del carrito (< 1024 px): una sola fila de acciones, altas para el dedo. */
  compacto?: boolean;
}

/** Botón secundario de la fila compacta: icono arriba y etiqueta abajo; desde `sm` vuelve a ir en línea. */
const BOTON_COMPACTO =
  'h-12 min-w-0 flex-col gap-0.5 px-0.5 text-xs max-[359px]:text-[11px] [&>span]:max-w-full sm:h-10 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-[13px]';

/** Columnas de la fila compacta según cuántas acciones hay (2 a 4): siempre una sola fila. */
const COLUMNAS_COMPACTO: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

export function AccionesCarrito(p: AccionesCarritoProps) {
  const t = useTranslations('posVenta.acciones');
  const tMembresias = useTranslations('membresias.pos');
  const tKit = useTranslations('kit.resumen');
  const claseBoton = p.compacto ? BOTON_COMPACTO : undefined;

  if (p.modo === 'deuda') {
    return (
      <div className="flex flex-col gap-2">
        <BotonImporte etiqueta={t('cobrarDeuda')} importe={p.total} icono={CreditCard} atajo={teclaAtajo('cobrar')} onClick={p.onCobrarDeuda} />
        <div className="grid grid-cols-3 gap-2">
          <KbdButton variante="secundario" tamano="sm" icono={FileText} cargando={p.cargandoFactura} onClick={p.onVerFactura} className={claseBoton}>
            {t('verFactura')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="sm" icono={Printer} onClick={p.onImprimir} className={claseBoton}>
            {t('imprimir')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="sm" icono={Ban} onClick={p.onAnular} className={cn('text-danger-text', claseBoton)}>
            {t('anular')}
          </KbdButton>
        </div>
      </div>
    );
  }

  const enEspera = p.modo === 'espera';
  const sinCaja = p.estadoCobrar === 'sin-caja';
  const acciones = (p.onDescuento ? 1 : 0) + 2 + (p.conCocina ? 1 : 0);
  return (
    <div className="flex flex-col gap-2">
      {p.compacto && sinCaja && (
        <p className="flex items-baseline justify-between gap-3 text-sm text-fg-secondary" data-carrito-total-compacto="">
          <span>{tKit('total')}</span>
          <span className="text-base font-semibold tabular-nums text-fg">{p.total}</span>
        </p>
      )}
      {sinCaja ? (
        <BotonImporte etiqueta={t('abrirCajaParaCobrar')} icono={LockOpen} estado="sinCaja" atajo={teclaAtajo('caja')} onClick={p.onAbrirCaja} />
      ) : (
        <BotonImporte
          etiqueta={t('cobrar')}
          importe={p.total}
          icono={CreditCard}
          atajo={teclaAtajo('cobrar')}
          estado={p.estadoCobrar === 'listo' ? 'listo' : 'deshabilitado'}
          motivo={enEspera ? t('motivoEnEspera') : p.estadoCobrar === 'sin-cliente' ? tMembresias('motivoSinCliente') : undefined}
          onClick={p.onCobrar}
        />
      )}
      <div className={cn('grid', p.compacto ? cn('gap-1.5 sm:gap-2', COLUMNAS_COMPACTO[acciones]) : 'grid-cols-2 gap-2 sm:grid-cols-4')} data-carrito-acciones="">
        {p.onDescuento && (
          <KbdButton variante="secundario" tamano="sm" icono={Percent} atajo={teclaAtajo('lineaDescuento')} disabled={enEspera} onClick={p.onDescuento} className={claseBoton}>
            {t('descuento')}
          </KbdButton>
        )}
        {enEspera ? (
          <KbdButton variante="tinte" tamano="sm" icono={Play} atajo={teclaAtajo('espera')} onClick={p.onReactivar} className={claseBoton}>
            {t('reactivar')}
          </KbdButton>
        ) : (
          <KbdButton variante="secundario" tamano="sm" icono={Pause} atajo={teclaAtajo('espera')} onClick={p.onEspera} className={claseBoton}>
            {t('espera')}
          </KbdButton>
        )}
        <KbdButton
          variante="secundario"
          tamano="sm"
          icono={FileText}
          atajo={teclaAtajo('deuda')}
          disabled={!p.puedeDeuda}
          title={!p.puedeDeuda ? p.motivoDeuda : undefined}
          onClick={p.onDeuda}
          className={claseBoton}
        >
          {t('deuda')}
        </KbdButton>
        {p.conCocina && (
          <KbdButton
            variante="secundario"
            tamano="sm"
            icono={Send}
            atajo={teclaAtajo('cocina')}
            disabled={enEspera}
            cargando={p.enviandoCocina}
            onClick={p.onCocina}
            className={claseBoton}
          >
            {t('cocina')}
          </KbdButton>
        )}
      </div>
    </div>
  );
}
