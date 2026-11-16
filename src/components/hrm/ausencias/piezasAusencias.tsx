'use client';

/**
 * Piezas compartidas de Ausencias (Figma 20.13 y 20.14), armadas con el kit:
 * barra de secciones, celda de persona, insignia de estado, carga de la lista y
 * formato de días calendario en el idioma activo (sin zona horaria: son `date`).
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AvatarIniciales, SegmentedControl, StatusBadge, useOpcionUrl } from '@/components/kit';
import { mediodiaUtc } from '@/components/kit/calendarioLogica';
import { useCarga } from '../personas/apiPersonas';
import { urlLista } from './apiAusencias';
import {
  SECCIONES,
  TONO_ESTADO,
  diasPorPagador,
  esPagador,
  estadoVisible,
  numeroDias,
  type FilaAusencia,
  type ListaAusencias,
  type Seccion,
  type TramoPago,
} from './ausenciasLogica';

export const RUTA_AUSENCIAS = '/app/hrm/ausencias';
export const RUTA_MIS_VACACIONES = '/app/hrm/ausencias/mis-vacaciones';

export function useSeccion(): [Seccion, (s: Seccion) => void] {
  return useOpcionUrl<Seccion>('seccion', SECCIONES, 'vacaciones', 'replace');
}

export function useListaAusencias(seccion: Seccion | 'todas', desde: string, hasta: string, propias = false) {
  return useCarga<ListaAusencias>(desde && hasta ? urlLista(seccion, desde, hasta, propias) : null);
}

/** Formato de días calendario en el idioma activo, a mediodía UTC: nunca se corre el día. */
export function useFechas() {
  const locale = useLocale();
  return useMemo(() => {
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
    const corta = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
    const sinAnio = fmt({ day: 'numeric', month: 'short' });
    const conDia = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const diaSemana = fmt({ weekday: 'short', day: 'numeric' });
    const diaLargo = fmt({ weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    const mesAnio = fmt({ month: 'long', year: 'numeric' });
    const mes = fmt({ month: 'long' });
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return {
      locale,
      /** «21 dic 2026». */
      corta: (d: string) => corta.format(mediodiaUtc(d)),
      /** «21 dic». */
      sinAnio: (d: string) => sinAnio.format(mediodiaUtc(d)),
      /** «lun, 21 dic 2026». */
      conDia: (d: string) => conDia.format(mediodiaUtc(d)),
      /** «lun 28». */
      diaSemana: (d: string) => diaSemana.format(mediodiaUtc(d)),
      /** «martes, 5 ene 2027». */
      diaLargo: (d: string) => diaLargo.format(mediodiaUtc(d)),
      /** «Diciembre de 2026». */
      mesAnio: (mesPlano: string) => cap(mesAnio.format(mediodiaUtc(`${mesPlano}-01`))),
      /** «diciembre». */
      mes: (mesPlano: string) => mes.format(mediodiaUtc(`${mesPlano}-01`)),
      /** «21 – 26 dic 2026» / «28 dic 2026 – 4 ene 2027». */
      rango: (desde: string, hasta: string) => (desde === hasta ? corta.format(mediodiaUtc(desde)) : corta.formatRange(mediodiaUtc(desde), mediodiaUtc(hasta))),
      /** «21 – 26 dic». */
      rangoCorto: (desde: string, hasta: string) =>
        desde === hasta ? sinAnio.format(mediodiaUtc(desde)) : sinAnio.formatRange(mediodiaUtc(desde), mediodiaUtc(hasta)),
      dias: (n: number | null | undefined) => numeroDias(n, locale),
    };
  }, [locale]);
}

/** Vacaciones · Incapacidades y licencias · Permisos (sub-pestañas de Ausencias), con lo de la derecha. */
export function BarraSecciones({ valor, onValor, derecha }: { valor: Seccion; onValor: (s: Seccion) => void; derecha?: ReactNode }) {
  const t = useTranslations('hrmAusencias.secciones');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl
        etiqueta={t('etiqueta')}
        valor={valor}
        onValorChange={onValor}
        opciones={[
          { valor: 'vacaciones', etiqueta: t('vacaciones') },
          { valor: 'incapacidades', etiqueta: t('incapacidades') },
          { valor: 'permisos', etiqueta: t('permisos') },
        ]}
      />
      {derecha ? <div className="flex flex-wrap items-center gap-2">{derecha}</div> : null}
    </div>
  );
}

/** Avatar, nombre y «Cargo · Área». */
export function CeldaPersona({ fila }: { fila: Pick<FilaAusencia, 'nombre' | 'cargo' | 'area'> }) {
  const detalle = [fila.cargo, fila.area].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AvatarIniciales nombre={fila.nombre ?? '?'} tamano="sm" />
      <div className="min-w-0">
        <p className="truncate font-medium text-fg">{fila.nombre ?? '—'}</p>
        {detalle ? <p className="truncate text-xs text-fg-secondary">{detalle}</p> : null}
      </div>
    </div>
  );
}

export function EstadoAusencia({ fila, hoy }: { fila: Pick<FilaAusencia, 'estado' | 'desde' | 'hasta' | 'seccion' | 'aprobacion'>; hoy: string }) {
  const t = useTranslations('hrmAusencias');
  const e = estadoVisible(fila, hoy);
  return <StatusBadge estado={e} tono={TONO_ESTADO[e]} etiqueta={t(`estados.${e}`)} />;
}

/** «Empresa 2 d · EPS 8 d». */
export function useQuienPaga() {
  const t = useTranslations('hrmAusencias.pagadores');
  const { dias } = useFechas();
  return useCallback(
    (tramos: readonly TramoPago[] | null | undefined) =>
      diasPorPagador(tramos)
        .map((x) => t('diasDe', { pagador: esPagador(x.paga) ? t(`nombres.${x.paga}`) : x.paga ?? t('nombres.ninguno'), dias: dias(x.dias) }))
        .join(' · '),
    [t, dias]
  );
}
