'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Target } from 'lucide-react';
import { AvisoTonal, EmptyState } from '@/components/kit';
import { BotonesExportar } from '../NivelReporte';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { filasPresupuesto, filasSinPresupuesto, signoVariacion } from '@/lib/finanzas/estados/presentacion';
import type { EstadoPresupuesto } from '@/lib/finanzas/estados/tipos';
import { useConsultaInicial, useInforme, usePeriodo } from './clienteEstados';
import { CuerpoInforme, Fila, FilaTitulo, FiltrosPeriodo, PaginaInforme, Tabla, useCifra } from './PiezasEstado';

export function PresupuestoRealPage() {
  const t = useTranslations('estadosFinancieros.presupuesto');
  const { formatear } = useMonedaOrganizacion();
  const cifra = useCifra(formatear);
  const periodo = usePeriodo();
  const { estado, datos, consultar } = useInforme<EstadoPresupuesto>('presupuesto', periodo.desde, periodo.hasta, false);
  useConsultaInicial(!!periodo.desde, consultar);
  const actual = datos?.actual ?? null;
  const filas = useMemo(() => (actual ? filasPresupuesto(actual.detalle) : []), [actual]);
  const fuera = useMemo(() => (actual ? filasSinPresupuesto(actual.detalle) : []), [actual]);
  const encabezados = [t('cuenta'), t('presupuesto'), t('real'), t('variacion'), '%'];

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      migas={t('miga')}
      icono={Target}
      acciones={actual && filas.length > 0 && estado === 'listo' ? (
        <BotonesExportar
          nombre={`presupuesto-real-${periodo.desde}-${periodo.hasta}`}
          titulo={t('titulo')}
          columnas={[t('codigo'), ...encabezados]}
          filas={[...filas, ...fuera].map((f) => [f.cuenta, f.nombre, f.presupuesto, f.real, f.diferencia, signoVariacion(f.variacion)])}
        />
      ) : undefined}
    >
      <FiltrosPeriodo
        desde={periodo.desde}
        hasta={periodo.hasta}
        hoy={periodo.hoy}
        onDesde={periodo.setDesde}
        onHasta={periodo.setHasta}
        onConsultar={() => void consultar()}
        cargando={estado === 'cargando'}
      />
      <CuerpoInforme estado={estado} onReintentar={() => void consultar()}>
        {actual && (
          <>
            {actual.borradores > 0 && (
              <AvisoTonal
                tono="informacion"
                titulo={t('borradores', { n: actual.borradores })}
                accion={{ etiqueta: t('verPresupuestos'), href: '/app/finanzas/presupuestos' }}
              />
            )}
            {actual.varios_por_anio && <AvisoTonal tono="advertencia" titulo={t('repetidos')} />}
            {!actual.tiene_presupuesto ? (
              <EmptyState
                titulo={t('vacio.titulo')}
                descripcion={t('vacio.detalle')}
                accion={{ etiqueta: t('verPresupuestos'), href: '/app/finanzas/presupuestos' }}
              />
            ) : (
              <Tabla etiqueta={t('titulo')} encabezados={encabezados}>
                {filas.map((f) => (
                  <Fila key={f.cuenta} celdas={[`${f.cuenta} ${f.nombre}`, cifra(f.presupuesto), cifra(f.real), cifra(f.diferencia), signoVariacion(f.variacion)]} />
                ))}
                {fuera.length > 0 && <FilaTitulo columnas={5}>{t('sinPresupuesto')}</FilaTitulo>}
                {fuera.map((f) => (
                  <Fila key={f.cuenta} celdas={[`${f.cuenta} ${f.nombre}`, cifra(0), cifra(f.real), cifra(f.diferencia), '—']} />
                ))}
              </Tabla>
            )}
          </>
        )}
      </CuerpoInforme>
    </PaginaInforme>
  );
}
