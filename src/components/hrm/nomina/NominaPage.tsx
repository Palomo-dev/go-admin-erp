'use client';

/**
 * Recursos humanos › Nómina (Figma 20.16, 20.20, 20.21 y 20.25).
 *
 * Una pestaña del módulo con tres vistas en la URL (`?vista=`): Períodos (por
 * defecto), Prestaciones, y Préstamos y embargos (decisión 1 del dueño). Con la
 * bandera `hr_payroll_enabled` apagada la pantalla trabaja en modo solo
 * preliquidación y dice por qué (20.25 → 24.3).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CircleDollarSign, Plus } from 'lucide-react';
import { EmptyState, PageHeader, clasesBoton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import { RUTA_NUEVO_PRESTAMO, useResumenNomina } from './apiNomina';
import { proximoPago } from './nominaLogica';
import { AvisoSoloPreliquidacion, BarraVistasNomina, useFechas, useVistaNomina } from './piezasNomina';
import { DialogoNominaApagada } from './DialogoNominaApagada';
import { DialogoNuevoPeriodo } from './DialogoNuevoPeriodo';
import { VistaPeriodos } from './VistaPeriodos';
import { VistaPrestaciones } from './VistaPrestaciones';
import { VistaPrestamos } from './VistaPrestamos';

export const MIGA_RRHH = '/app/hrm/empleados';

export function NominaPage() {
  const t = useTranslations('hrmNomina');
  const tf = useTranslations('hrmNomina.frecuencias');
  const f = useFechas();
  const { getToday } = useFormatDate();
  const [vista, setVista] = useVistaNomina();
  const { carga, recargar } = useResumenNomina();
  const [nuevo, setNuevo] = useState(false);
  const [apagada, setApagada] = useState(false);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const sinPermiso = carga.estado === 'sinPermiso';
  const permisos = datos?.permisos;
  const ultima = datos?.periodos.find((p) => p.tipo === 'ordinaria') ?? null;
  const pago = useMemo(() => (datos ? proximoPago(datos.periodos, getToday()) : null), [datos, getToday]);

  const subtitulo = datos
    ? [
        ultima ? (tf.has(ultima.frecuencia) ? tf(ultima.frecuencia) : null) : null,
        ultima?.empleados ? t('subtitulo.empleados', { n: ultima.empleados }) : null,
        !datos.habilitada
          ? t('subtitulo.soloPreliquidacion')
          : vista === 'periodos' && pago
            ? t('subtitulo.proximoPago', { fecha: f.sinAnio(pago) })
            : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const accion =
    vista === 'prestamos'
      ? permisos?.procesar
        ? { etiqueta: t('prestamos.nuevo'), href: RUTA_NUEVO_PRESTAMO }
        : null
      : permisos?.procesar
        ? { etiqueta: t('periodos.nuevo'), onClick: () => setNuevo(true) }
        : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={CircleDollarSign}
        migas={[{ etiqueta: t('migas.rrhh'), href: MIGA_RRHH }, { etiqueta: t('titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={
          accion ? (
            accion.href ? (
              <Link href={accion.href} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
                <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                {accion.etiqueta}
              </Link>
            ) : (
              <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={accion.onClick}>
                <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                {accion.etiqueta}
              </button>
            )
          ) : undefined
        }
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{
          subtitulo,
          accion: accion ? (
            accion.href ? (
              <Link href={accion.href} aria-label={accion.etiqueta}>
                <Plus aria-hidden className="size-5" strokeWidth={1.5} />
              </Link>
            ) : (
              <button type="button" aria-label={accion.etiqueta} onClick={accion.onClick}>
                <Plus aria-hidden className="size-5" strokeWidth={1.5} />
              </button>
            )
          ) : undefined,
        }}
      />

      {sinPermiso ? (
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
      ) : (
        <>
          {datos && !datos.habilitada ? <AvisoSoloPreliquidacion onVerQueFalta={() => setApagada(true)} /> : null}
          <BarraVistasNomina valor={vista} onValor={setVista} />
          {vista === 'periodos' || !datos ? (
            <VistaPeriodos
              resumen={datos}
              estado={carga.estado === 'listo' ? 'listo' : carga.estado === 'cargando' ? 'cargando' : 'error'}
              onReintentar={() => void recargar()}
              onRecargar={() => void recargar()}
              onNuevo={() => setNuevo(true)}
            />
          ) : vista === 'prestaciones' ? (
            <VistaPrestaciones resumen={datos} onRecargar={() => void recargar()} />
          ) : (
            <VistaPrestamos resumen={datos} />
          )}
        </>
      )}

      <DialogoNuevoPeriodo
        abierto={nuevo}
        onAbiertoChange={(v) => {
          setNuevo(v);
          if (!v) void recargar();
        }}
        periodos={datos?.periodos ?? []}
      />
      <DialogoNominaApagada abierto={apagada} onAbiertoChange={setApagada} />
    </div>
  );
}
