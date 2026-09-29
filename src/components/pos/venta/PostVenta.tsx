'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FileCheck2, Printer, ShoppingCart } from 'lucide-react';
import { ResultadoOperacion, useAtajos, type AccionResultado, type FilaDatoProps } from '@/components/kit';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { hayRafagaDelLector } from '@/hooks/useHardwareBarcodeScanner';
import { enterCompletaVenta } from '@/components/pos/venta/cobro/teclasCobro';
import { MembresiasVendidas } from '@/components/pos/venta/MembresiasVendidas';
import type { MembresiaVendida } from '@/lib/pos/venta/membresias';

/**
 * Post-venta del POS (POS-PLAN paso 13, Figma `247:74846` / `247:75030`): el
 * `ResultadoOperacion` del kit con «Nueva venta · Enter», «Reimprimir · P»,
 * «Factura electrónica · F» (solo con CUFE) y «Cerrar · Esc».
 *
 * Aviso del recibo automático (sin badge «Nuevo»): enviado a la impresora de
 * caja, sin impresora de caja, sin sucursal o con error. Sin conexión
 * (Desktop), la variante «Pendiente de sincronizar · OFF-…».
 *
 * Membresías (frame D2 `986:615576`): si el cobro creó, activó o renovó
 * membresías, una tarjeta por cada una (`MembresiasVendidas`).
 *
 * Solo dibuja y registra los atajos: imprimir, la factura y entregar la venta
 * a la pantalla (`onCheckoutComplete`) siguen en `CheckoutDialog`.
 */
export type EstadoRecibo = 'enviando' | 'enviado' | 'sinImpresora' | 'sinSucursal' | 'error';

export interface PostVentaProps {
  moneda: ContextoMoneda | string;
  total: number;
  pagado: number;
  cambio: number;
  /** Número corto de la venta con red («#1a2b3c4d»). */
  numeroVenta: string;
  /** Sin red: número local `OFF-…`; null con red. */
  numeroLocal: string | null;
  pendienteSincronizar: boolean;
  estadoRecibo: EstadoRecibo | null;
  detalleRecibo?: string | null;
  /** Hay CUFE: se puede imprimir la factura electrónica. */
  conFactura: boolean;
  onNuevaVenta: () => void;
  onReimprimir: () => void;
  onFactura: () => void;
  onCerrar: () => void;
  /** Atajos activos (el panel abierto y sin otro diálogo encima). */
  activo: boolean;
  /** Membresías que creó, activó o renovó la venta (frame D2). */
  membresias?: readonly MembresiaVendida[];
  /** Nombre del cliente titular de esas membresías. */
  titular?: string | null;
}

export function PostVenta({
  moneda,
  total,
  pagado,
  cambio,
  numeroVenta,
  numeroLocal,
  pendienteSincronizar,
  estadoRecibo,
  detalleRecibo,
  conFactura,
  onNuevaVenta,
  onReimprimir,
  onFactura,
  onCerrar,
  activo,
  membresias,
  titular,
}: PostVentaProps) {
  const t = useTranslations('posCobro.postVenta');
  const tAtajos = useTranslations('posVenta.atajos');
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);

  // Enter: la primaria ya tiene el foco (y Enter la pulsa); el atajo solo
  // cuenta con el foco fuera de un control, para no cerrar la venta dos veces.
  useAtajos(
    [
      { tecla: teclaAtajo('nuevaVenta'), descripcion: tAtajos('nuevaVenta'), accion: onNuevaVenta, cuando: () => enterCompletaVenta(typeof document === 'undefined' ? null : document.activeElement) },
      { tecla: teclaAtajo('reimprimir'), descripcion: tAtajos('reimprimir'), accion: onReimprimir },
      { tecla: teclaAtajo('factura'), descripcion: tAtajos('factura'), accion: onFactura, cuando: () => conFactura },
    ],
    { activo, hayRafaga: hayRafagaDelLector },
  );

  const cifras: FilaDatoProps[] = [
    { etiqueta: t('total'), valor: formatear(total), tono: 'fuerte' },
    { etiqueta: t('pagado'), valor: formatear(pagado), tono: 'exito' },
  ];
  if (cambio > 0) cifras.push({ etiqueta: t('cambio'), valor: formatear(cambio), tono: 'fuerte', tamano: 'lg' });

  const secundarias: AccionResultado[] = [{ etiqueta: t('reimprimir'), onClick: onReimprimir, atajo: teclaAtajo('reimprimir'), icono: Printer }];
  if (conFactura) secundarias.push({ etiqueta: t('factura'), onClick: onFactura, atajo: teclaAtajo('factura'), icono: FileCheck2 });

  const avisoRecibo = estadoRecibo ? (
    <p role={estadoRecibo === 'error' || estadoRecibo === 'sinImpresora' ? 'alert' : undefined}>
      {estadoRecibo === 'error' ? t('recibo.error', { detalle: detalleRecibo ?? '' }) : t(`recibo.${estadoRecibo}`)}
    </p>
  ) : null;
  // D2: las membresías de la venta van en el hueco del aviso (el kit no tiene
  // otro entre las cifras y las acciones), antes del aviso del recibo.
  const vendidas = membresias ?? [];
  const aviso = vendidas.length > 0 ? (
    <div className="flex flex-col gap-2">
      <MembresiasVendidas membresias={vendidas}ventaPagada={pagado >= total} titular={titular} />
      {avisoRecibo}
    </div>
  ) : (avisoRecibo ?? undefined);

  return (
    <ResultadoOperacion
      tono={pendienteSincronizar ? 'advertencia' : 'exito'}
      titulo={pendienteSincronizar ? t('tituloPendiente') : t('titulo')}
      descripcion={pendienteSincronizar ? t('descripcionPendiente') : t('descripcion', { numero: numeroVenta })}
      referencia={pendienteSincronizar && numeroLocal ? t('referenciaPendiente', { numero: numeroLocal }) : null}
      cifras={cifras}
      aviso={aviso}
      primaria={{ etiqueta: t('nuevaVenta'), onClick: onNuevaVenta, atajo: teclaAtajo('nuevaVenta'), icono: ShoppingCart }}
      secundarias={secundarias}
      onCerrar={onCerrar}
      textoCerrar={t('cerrar')}
      atajoCerrar={teclaAtajo('cerrarPostVenta')}
      className="py-2"
    />
  );
}
