'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AvisoTonal } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { errorDePendiente } from '@/lib/finanzas/pendientesContables';
import {
  ContabilidadService,
  type AlertasContablesDatos,
} from './ContabilidadService';

const RUTA_PENDIENTES = '/app/finanzas/contabilidad/pendientes';
/** fn_alertas_contables devuelve como mucho 50 de cada lista. */
const TOPE_ALERTAS = 50;
const VISIBLES = 5;

type EstadoAlertas =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; datos: AlertasContablesDatos };

/**
 * Fallos de asiento abiertos y asientos sin líneas. Cargando, error y vacío son
 * estados distintos: un error de consulta no puede verse como «sin incidencias».
 */
export function AlertasContables() {
  const t = useTranslations('pendientesContables');
  const { formatDate } = useFormatDate();
  const [estado, setEstado] = useState<EstadoAlertas>({ tipo: 'cargando' });

  const cargar = useCallback(() => {
    let cancelado = false;
    setEstado({ tipo: 'cargando' });
    ContabilidadService.obtenerAlertas()
      .then((datos) => {
        if (!cancelado) setEstado({ tipo: 'listo', datos });
      })
      .catch((error) => {
        console.error('No se pudieron leer las alertas contables:', error);
        if (!cancelado) setEstado({ tipo: 'error' });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => cargar(), [cargar]);

  if (estado.tipo === 'cargando') {
    return <Skeleton aria-label={t('alertas.cargando')} className="h-16 w-full rounded-xl" />;
  }

  if (estado.tipo === 'error') {
    return (
      <AvisoTonal
        tono="peligro"
        rol="alert"
        titulo={t('error.titulo')}
        descripcion={t('error.descripcion')}
        accion={{ etiqueta: t('error.reintentar'), onClick: () => cargar() }}
      />
    );
  }

  const { fallos, sinLineas } = estado.datos;

  if (fallos.length === 0 && sinLineas.length === 0) {
    return <AvisoTonal tono="exito" compacto titulo={t('alertas.vacio')} />;
  }

  const cuantos = (n: number) => (n >= TOPE_ALERTAS ? `${TOPE_ALERTAS}+` : String(n));

  return (
    <section aria-label={t('titulo')} className="space-y-4 rounded-xl border border-line-warning bg-warning-subtle p-4">
      {fallos.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('alertas.fallos', { n: fallos.length, cantidad: cuantos(fallos.length) })}
          accion={{ etiqueta: t('alertas.verBandeja'), href: RUTA_PENDIENTES }}
          descripcion={
            <ul className="mt-1 space-y-1">
              {fallos.slice(0, VISIBLES).map((fallo) => (
                <li key={fallo.id} className="text-sm text-fg">
                  {t(`errores.${errorDePendiente(fallo.motivo ?? '')}`)}
                  <span className="text-xs text-fg-secondary">
                    {' · '}
                    {formatDate(fallo.fecha)}
                    {fallo.origen ? ` · ${fallo.origen}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          }
        />
      )}

      {sinLineas.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-warning-text">
            {t('alertas.sinLineas', { n: sinLineas.length, cantidad: cuantos(sinLineas.length) })}
          </p>
          <ul className="space-y-2">
            {sinLineas.slice(0, VISIBLES).map((asiento) => (
              <li key={asiento.id}>
                <Link
                  href={`/app/finanzas/contabilidad/asientos/${asiento.id}`}
                  className="block rounded-lg bg-surface px-3 py-2 text-sm text-fg hover:bg-hover"
                >
                  <span className="font-medium">{t('alertas.asiento', { id: asiento.id })}</span>
                  <span className="text-xs text-fg-secondary">
                    {' · '}
                    {formatDate(asiento.fecha)}
                    {asiento.origen ? ` · ${asiento.origen}` : ''}
                    {' · '}
                    {asiento.publicado ? t('alertas.publicado') : t('alertas.borrador')}
                  </span>
                  {asiento.memo && <span className="mt-1 block text-xs text-fg-secondary">{asiento.memo}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
