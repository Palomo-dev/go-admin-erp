'use client';

import { Ban, CreditCard, FileText, LockOpen, Pause, Percent, Play, Printer, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BotonImporte, KbdButton } from '@/components/kit';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import type { EstadoBotonCobrar } from '@/lib/pos/venta/requisitosCarrito';

/**
 * Botonera del carrito (POS-UX-V2 D3 y D3b; Figma `Carrito (listo)`,
 * `244:64655` sin caja, `244:65395` en espera, `244:66158` con deuda):
 *
 * - Activo: «Cobrar · $ · F4» a todo el ancho (o «Abrir caja para cobrar · F9»
 *   sin caja, D4) y debajo Descuento · D, Espera · F6, Deuda · F7 y Cocina · F8.
 * - En espera: «Reactivar · F6» y el cobro bloqueado con su motivo.
 * - Con deuda: Ver factura, Imprimir, «Cobrar deuda» (no exige caja) y Anular.
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
}

export function AccionesCarrito(p: AccionesCarritoProps) {
  const t = useTranslations('posVenta.acciones');

  if (p.modo === 'deuda') {
    return (
      <div className="flex flex-col gap-2">
        <BotonImporte etiqueta={t('cobrarDeuda')} importe={p.total} icono={CreditCard} atajo={teclaAtajo('cobrar')} onClick={p.onCobrarDeuda} />
        <div className="grid grid-cols-3 gap-2">
          <KbdButton variante="secundario" tamano="sm" icono={FileText} cargando={p.cargandoFactura} onClick={p.onVerFactura}>
            {t('verFactura')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="sm" icono={Printer} onClick={p.onImprimir}>
            {t('imprimir')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="sm" icono={Ban} onClick={p.onAnular} className="text-danger-text">
            {t('anular')}
          </KbdButton>
        </div>
      </div>
    );
  }

  const enEspera = p.modo === 'espera';
  const sinCaja = p.estadoCobrar === 'sin-caja';
  return (
    <div className="flex flex-col gap-2">
      {sinCaja ? (
        <BotonImporte etiqueta={t('abrirCajaParaCobrar')} icono={LockOpen} estado="sinCaja" atajo={teclaAtajo('caja')} onClick={p.onAbrirCaja} />
      ) : (
        <BotonImporte
          etiqueta={t('cobrar')}
          importe={p.total}
          icono={CreditCard}
          atajo={teclaAtajo('cobrar')}
          estado={p.estadoCobrar === 'listo' ? 'listo' : 'deshabilitado'}
          motivo={enEspera ? t('motivoEnEspera') : undefined}
          onClick={p.onCobrar}
        />
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {p.onDescuento && (
          <KbdButton variante="secundario" tamano="sm" icono={Percent} atajo={teclaAtajo('lineaDescuento')} disabled={enEspera} onClick={p.onDescuento}>
            {t('descuento')}
          </KbdButton>
        )}
        {enEspera ? (
          <KbdButton variante="tinte" tamano="sm" icono={Play} atajo={teclaAtajo('espera')} onClick={p.onReactivar}>
            {t('reactivar')}
          </KbdButton>
        ) : (
          <KbdButton variante="secundario" tamano="sm" icono={Pause} atajo={teclaAtajo('espera')} onClick={p.onEspera}>
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
          >
            {t('cocina')}
          </KbdButton>
        )}
      </div>
    </div>
  );
}
