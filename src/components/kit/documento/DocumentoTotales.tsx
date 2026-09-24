'use client';

import { useMemo, type ReactNode } from 'react';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { FilaDatoProps } from '../FilaDato';
import { ResumenTotales } from '../ResumenTotales';
import type { EntradaResumen } from '../resumenTotalesLogica';
import { Tarjeta } from '../Tarjeta';
import { useKitT } from '../useIdiomaKit';

/**
 * Totales de un documento (Figma `DocumentTotals`, Variant venta · compra ·
 * cotización): la tarjeta «Resumen» de facturas, CxC, CxP, NC y cotizaciones.
 * Se apoya en `ResumenTotales` (el mismo bloque del POS: no hay dos bloques de
 * totales) y añade lo del documento: bases por impuesto, retenciones, neto a
 * cobrar o a pagar, pagado y saldo.
 *
 * Todo llega calculado por el servicio o la RPC del documento.
 */
export interface DocumentoTotalesProps extends EntradaResumen {
  variante?: 'venta' | 'compra' | 'cotizacion';
  /** Moneda del documento; si no trae, la de la organización. */
  moneda: ContextoMoneda | string;
  /** Pagado hasta hoy (facturas y cuentas). */
  pagado?: number | null;
  /** Saldo pendiente (el de la base, que mantienen los disparadores). */
  saldo?: number | null;
  titulo?: string;
  /** Acción en la cabecera de la tarjeta («Ver pagos»). */
  accion?: ReactNode;
  /** Filas extra al final (tasa de cambio, total en moneda base). */
  extras?: readonly FilaDatoProps[];
  cargando?: boolean;
  /** Sin tarjeta alrededor (formularios que ya van dentro de una sección). */
  sinTarjeta?: boolean;
  className?: string;
}

export function DocumentoTotales({
  variante = 'venta',
  moneda,
  pagado,
  saldo,
  titulo,
  accion,
  extras,
  cargando,
  sinTarjeta,
  className,
  mostrarBases = true,
  ...entrada
}: DocumentoTotalesProps) {
  const t = useKitT();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const filasExtra: FilaDatoProps[] = [];
  if (typeof pagado === 'number' && Number.isFinite(pagado)) {
    filasExtra.push({ etiqueta: t('documento.totales.pagado'), valor: formatear(pagado), tono: 'exito', separadorAntes: true });
  }
  if (typeof saldo === 'number' && Number.isFinite(saldo)) {
    filasExtra.push({
      etiqueta: t('documento.totales.saldo'),
      valor: formatear(saldo),
      tono: saldo > 0 ? 'peligro' : 'fuerte',
      separadorAntes: filasExtra.length === 0,
    });
  }
  if (extras) filasExtra.push(...extras);

  const resumen = (
    <ResumenTotales
      {...entrada}
      mostrarBases={mostrarBases}
      moneda={moneda}
      cargando={cargando}
      etiquetaNeto={variante === 'compra' ? t('documento.totales.netoPagar') : t('documento.totales.netoCobrar')}
      extras={filasExtra}
      etiqueta={titulo ?? t('documento.totales.titulo')}
    />
  );
  if (sinTarjeta) return <div className={className}>{resumen}</div>;
  return (
    <Tarjeta titulo={titulo ?? t('documento.totales.titulo')} accion={accion} className={className}>
      {resumen}
    </Tarjeta>
  );
}
