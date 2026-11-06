'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Gauge } from 'lucide-react';
import { AvisoTonal, KpiStrip, StatCard } from '@/components/kit';
import { BotonesExportar } from '../NivelReporte';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { KPI_INDICADORES, TABLA_INDICADORES, calcularIndicadores, type ValorIndicador } from '@/lib/finanzas/estados/indicadores';
import type { BaseIndicadores } from '@/lib/finanzas/estados/tipos';
import { useConsultaInicial, useInforme, usePeriodo } from './clienteEstados';
import { CuerpoInforme, Fila, FiltrosPeriodo, PaginaInforme, Tabla } from './PiezasEstado';

export function IndicadoresPage() {
  const t = useTranslations('estadosFinancieros.indicadores');
  const locale = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const periodo = usePeriodo();
  const [comparar, setComparar] = useState(true);
  const { estado, datos, consultar } = useInforme<BaseIndicadores>('indicadores', periodo.desde, periodo.hasta, comparar);
  useConsultaInicial(!!periodo.desde, consultar);

  const actual = useMemo(() => (datos ? calcularIndicadores(datos.actual) : null), [datos]);
  const anterior = useMemo(() => (datos?.anterior ? calcularIndicadores(datos.anterior) : null), [datos]);
  const anioActual = datos?.actual.hasta.slice(0, 4) ?? '';
  const anioAnterior = datos?.anterior?.hasta.slice(0, 4) ?? '';

  const numero = (valor: number, decimales: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);

  const texto = (v: ValorIndicador | undefined): string => {
    if (!v || v.valor === null) return t('sinDato');
    switch (v.unidad) {
      case 'razon': return numero(v.valor, 2);
      case 'porcentaje': return `${numero(v.valor, 1)} %`;
      case 'dias': return t('dias', { valor: numero(v.valor, 0) });
      default: return t('veces', { valor: numero(v.valor, 1) });
    }
  };

  const encabezados = anterior ? [t('indicador'), t('formula'), anioActual, anioAnterior] : [t('indicador'), t('formula'), anioActual];

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={anioAnterior ? t('subtituloComparado', { anio: anioAnterior }) : t('subtitulo')}
      migas={t('miga')}
      icono={Gauge}
      acciones={actual && estado === 'listo' ? (
        <BotonesExportar
          nombre={`indicadores-${datos?.actual.hasta ?? ''}`}
          titulo={t('titulo')}
          columnas={encabezados}
          filas={[...KPI_INDICADORES, ...TABLA_INDICADORES].map((c) => {
            const fila = [t(`nombre.${c}`), t(`definicion.${c}`), texto(actual[c])];
            return anterior ? [...fila, texto(anterior[c])] : fila;
          })}
        />
      ) : undefined}
    >
      <FiltrosPeriodo
        desde={periodo.desde}
        hasta={periodo.hasta}
        hoy={periodo.hoy}
        onDesde={periodo.setDesde}
        onHasta={periodo.setHasta}
        comparar={comparar}
        onComparar={setComparar}
        onConsultar={() => void consultar()}
        cargando={estado === 'cargando'}
      />
      <CuerpoInforme estado={estado} onReintentar={() => void consultar()}>
        {actual && datos && (
          <>
            {datos.actual.sin_clasificar > 0 && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('sinClasificar.titulo')}
                descripcion={t('sinClasificar.detalle', { monto: formatear(datos.actual.sin_clasificar) })}
                accion={{ etiqueta: t('sinClasificar.ver'), href: '/app/finanzas/contabilidad/plan-cuentas' }}
              />
            )}
            <KpiStrip etiqueta={t('titulo')}>
              {KPI_INDICADORES.map((c) => (
                <StatCard
                  key={c}
                  etiqueta={t(`nombre.${c}`)}
                  valor={texto(actual[c])}
                  detalle={anterior ? t('enAnio', { valor: texto(anterior[c]), anio: anioAnterior }) : undefined}
                />
              ))}
            </KpiStrip>
            <Tabla etiqueta={t('titulo')} encabezados={encabezados}>
              {TABLA_INDICADORES.map((c) => {
                const celdas = [t(`nombre.${c}`), t(`definicion.${c}`), texto(actual[c])];
                return <Fila key={c} celdas={anterior ? [...celdas, texto(anterior[c])] : celdas} />;
              })}
            </Tabla>
          </>
        )}
      </CuerpoInforme>
    </PaginaInforme>
  );
}
