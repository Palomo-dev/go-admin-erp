'use client';

import { Fragment, useMemo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { FilaDato, ListaDatos, type FilaDatoProps } from './FilaDato';
import { filasResumen, formatearTarifa, importeConSigno, type EntradaResumen, type FilaResumen } from './resumenTotalesLogica';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Resumen de totales (carrito y cobro del POS, factura de venta y de compra,
 * cierre de caja): Subtotal · descuentos · cargos · impuestos por nombre y
 * tarifa · **Total** · retenciones · neto a pagar, y debajo las filas que la
 * pantalla añada (Pagado, Falta, Cambio).
 *
 * No calcula: recibe los importes del servicio (`TaxSummary`, la RPC de la
 * factura). Formatea en la moneda que le pasen: la del documento o, si no
 * trae, la de la organización (`useMonedaOrganizacion()`); nunca supone pesos.
 */
export interface ResumenTotalesProps extends EntradaResumen {
  moneda: ContextoMoneda | string;
  etiquetaSubtotal?: string;
  etiquetaTotal?: string;
  etiquetaNeto?: string;
  /** Fila superior (interruptor «Impuestos incluidos» del POS). */
  cabecera?: ReactNode;
  /** Filas después del total (Pagado, Falta, Cambio, Saldo). */
  extras?: readonly FilaDatoProps[];
  cargando?: boolean;
  /** La organización no tiene impuestos configurados: aviso en lugar de las filas de impuesto. */
  sinImpuestosConfigurados?: boolean;
  /** Nombre accesible del bloque. */
  etiqueta?: string;
  className?: string;
}

export function ResumenTotales({
  moneda,
  etiquetaSubtotal,
  etiquetaTotal,
  etiquetaNeto,
  cabecera,
  extras,
  cargando,
  sinImpuestosConfigurados,
  etiqueta,
  className,
  ...entrada
}: ResumenTotalesProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const filas = filasResumen(entrada);

  const textoEtiqueta = (f: FilaResumen): string => {
    if ('texto' in f.etiqueta) {
      const tarifa = formatearTarifa(f.tarifa, locale);
      return tarifa ? `${f.etiqueta.texto} ${tarifa}` : f.etiqueta.texto;
    }
    if (f.etiqueta.clave === 'subtotal') return etiquetaSubtotal ?? t('resumen.subtotal');
    if (f.etiqueta.clave === 'neto') return etiquetaNeto ?? t('resumen.neto');
    return etiquetaTotal ?? t('resumen.total');
  };

  const descripcion = (f: FilaResumen): string | undefined => {
    const partes: string[] = [];
    if (f.descripcion) partes.push(f.descripcion);
    if (f.tipo === 'impuesto' && f.signo === 0) partes.push(t('resumen.incluido'));
    if (f.base !== undefined && f.base !== null) partes.push(t('resumen.base', { valor: formatear(f.base) }));
    return partes.length ? partes.join(' · ') : undefined;
  };

  if (cargando) {
    return (
      <div aria-busy="true" aria-label={etiqueta ?? t('resumen.etiqueta')} className={cn('flex flex-col gap-2', className)}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
    );
  }

  const indiceTotal = filas.findIndex((f) => f.tipo === 'total');
  return (
    <div className={cn('flex flex-col', className)}>
      {cabecera && <div className="mb-2">{cabecera}</div>}
      <ListaDatos etiqueta={etiqueta ?? t('resumen.etiqueta')}>
        {filas.map((f, i) => (
          <Fragment key={f.id}>
            {sinImpuestosConfigurados && i === indiceTotal && (
              <FilaDato
                etiqueta={t('resumen.sinImpuestos')}
                valor={<AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                tono="advertencia"
              />
            )}
            <FilaDato
              etiqueta={textoEtiqueta(f)}
              descripcion={descripcion(f)}
              valor={importeConSigno(formatear, f.importe, f.signo)}
              tono={f.tono}
              sangria={f.sangria}
              separadorAntes={f.separadorAntes}
              tamano={f.tipo === 'total' ? 'lg' : 'md'}
            />
          </Fragment>
        ))}
        {extras?.map((e, i) => <FilaDato key={`extra-${i}`} {...e} />)}
      </ListaDatos>
    </div>
  );
}
