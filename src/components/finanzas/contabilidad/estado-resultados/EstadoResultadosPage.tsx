'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { AvisoTonal, ChipsOpcion, EmptyState, Tarjeta } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { primerDiaDelAnioDe } from '@/lib/services/fiscalCalendar';
import { COMPARATIVO_POR_DEFECTO } from '@/lib/finanzas/reportes/estadosNiif';
import {
  detalleResultado,
  resultadoIntegralDe,
  resultadoPorFuncion,
  resultadoPorNaturaleza,
  signoVariacion,
  type LargoDetalle,
} from '@/lib/finanzas/estados/presentacion';
import type { EstadoResultado } from '@/lib/finanzas/estados/tipos';
import { BotonesExportar } from '../NivelReporte';
import { pedirInforme } from '../estados/clienteEstados';
import { useVisorInforme } from '@/components/reportes/especiales/contextoVisor';
import { Fila, FiltrosPeriodo, PaginaInforme, Tabla, useCifra } from '../estados/PiezasEstado';

type Presentacion = 'naturaleza' | 'funcion';
type Datos = { actual: EstadoResultado; anterior: EstadoResultado | null };

const NIVELES: readonly LargoDetalle[] = ['2', '4', '6', '8'];

/**
 * Estado del resultado integral. La vista principal es por naturaleza
 * (decisión del Contador, NIIF para pymes 5.11); por función queda opcional.
 * Lee por el servidor y sale del mayor sin el asiento de cierre.
 */
export function EstadoResultadosPage() {
  const t = useTranslations('estadosFinancieros.resultado');
  const { formatear } = useMonedaOrganizacion();
  const cifra = useCifra(formatear);
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  // Dentro del visor de Reportes el periodo sale de su barra de filtros.
  const visor = useVisorInforme();

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [presentacion, setPresentacion] = useState<Presentacion>('naturaleza');
  const [nivel, setNivel] = useState<LargoDetalle>('4');
  const [comparar, setComparar] = useState(COMPARATIVO_POR_DEFECTO);
  const [data, setData] = useState<Datos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const arrancado = useRef(false);
  const turno = useRef(0);

  const loadData = async (d: string = desde, h: string = hasta, comparativo: boolean = comparar) => {
    if (!d || !h) return;
    const propio = ++turno.current;
    setIsLoading(true);
    try {
      const respuesta = await pedirInforme<EstadoResultado>('resultado', d, h, comparativo);
      if (propio === turno.current) setData(respuesta);
    } catch (error) {
      console.error('Error cargando el estado del resultado integral:', error);
      if (propio === turno.current) setData(null);
    } finally {
      if (propio === turno.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visor) return;
    if (tzLoading || arrancado.current) return;
    arrancado.current = true;
    const hoy = getToday();
    const inicio = primerDiaDelAnioDe(hoy);
    setDesde(inicio);
    setHasta(hoy);
    void loadData(inicio, hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visor, tzLoading, getToday]);

  useEffect(() => {
    if (!visor) return;
    setDesde(visor.desde);
    setHasta(visor.hasta);
    void loadData(visor.desde, visor.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visor?.desde, visor?.hasta]);

  const actual = data?.actual ?? null;
  const anterior = data?.anterior ?? null;
  const filas = useMemo(() => {
    if (!actual) return [];
    return presentacion === 'naturaleza' ? resultadoPorNaturaleza(actual, anterior) : resultadoPorFuncion(actual, anterior);
  }, [actual, anterior, presentacion]);
  const detalle = useMemo(() => (actual ? detalleResultado(actual, anterior, nivel) : []), [actual, anterior, nivel]);

  const anioActual = actual?.hasta.slice(0, 4) ?? '';
  const anioAnterior = anterior?.hasta.slice(0, 4) ?? '';
  const encabezados = anterior
    ? [t('concepto'), anioActual, anioAnterior, t('variacion')]
    : [t('concepto'), anioActual];
  const totalActual = actual ? resultadoIntegralDe(actual) : 0;
  const totalAnterior = anterior ? resultadoIntegralDe(anterior) : null;
  const variacionTotal = totalAnterior ? ((totalActual - totalAnterior) / Math.abs(totalAnterior)) * 100 : null;

  const celdas = (concepto: string, a: number, b: number | null, v: number | null) =>
    anterior ? [concepto, cifra(a), cifra(b), signoVariacion(v)] : [concepto, cifra(a)];

  return (
    <PaginaInforme
      titulo={t('titulo')}
      subtitulo={t(presentacion === 'naturaleza' ? 'subtituloNaturaleza' : 'subtituloFuncion')}
      migas={t('miga')}
      icono={TrendingUp}
      acciones={actual && !isLoading ? (
        <BotonesExportar
          nombre={`resultado-integral-${actual.desde}-${actual.hasta}`}
          titulo={t('titulo')}
          columnas={encabezados}
          filas={[
            ...filas.map((f) => (anterior ? [t(`fila.${f.clave}`), f.actual, f.anterior ?? 0, signoVariacion(f.variacion)] : [t(`fila.${f.clave}`), f.actual])),
            anterior ? [t('total'), totalActual, totalAnterior ?? 0, signoVariacion(variacionTotal)] : [t('total'), totalActual],
          ]}
        />
      ) : undefined}
    >
      <FiltrosPeriodo
        desde={desde}
        hasta={hasta}
        hoy={tzLoading ? '' : getToday()}
        onDesde={setDesde}
        onHasta={setHasta}
        comparar={comparar}
        onComparar={setComparar}
        onConsultar={() => void loadData()}
        cargando={isLoading}
      >
        <div className="space-y-1 text-xs text-fg-secondary">
          <span>{t('presentacion')}</span>
          <ChipsOpcion
            etiqueta={t('presentacion')}
            valor={presentacion}
            onValorChange={setPresentacion}
            opciones={[
              { valor: 'naturaleza', etiqueta: t('porNaturaleza') },
              { valor: 'funcion', etiqueta: t('porFuncion') },
            ]}
          />
        </div>
      </FiltrosPeriodo>

      {isLoading ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-4" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !data || !actual ? (
        <EmptyState variante="error" titulo={t('error')} onReintentar={() => void loadData()} />
      ) : (
        <>
          {actual.ori !== 0 && <AvisoTonal tono="informacion" titulo={t('ori', { valor: cifra(actual.ori) })} />}
          <Tabla etiqueta={t('titulo')} encabezados={encabezados}>
            {filas.map((f) => <Fila key={f.clave} celdas={celdas(t(`fila.${f.clave}`), f.actual, f.anterior, f.variacion)} />)}
            {actual.ori !== 0 && <Fila celdas={celdas(t('filaOri'), actual.ori, anterior?.ori ?? null, null)} />}
            <Fila fuerte celdas={celdas(t('total'), totalActual, totalAnterior, variacionTotal)} />
          </Tabla>

          <Tarjeta
            titulo={t('detalle')}
            accion={(
              <ChipsOpcion
                etiqueta={t('nivel')}
                valor={nivel}
                onValorChange={setNivel}
                opciones={NIVELES.map((n) => ({ valor: n, etiqueta: t(`niveles.n${n}`) }))}
              />
            )}
            sinRelleno
          >
            <table className="w-full text-sm" aria-label={t('detalle')}>
              <tbody>
                {detalle.map((f) => <Fila key={f.clave} celdas={celdas(`${f.clave} ${f.nombre ?? ''}`, f.actual, f.anterior, f.variacion)} />)}
              </tbody>
            </table>
          </Tarjeta>
        </>
      )}
    </PaginaInforme>
  );
}
