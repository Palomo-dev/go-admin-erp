'use client';

/**
 * Textos compartidos de la parte «personas» de RR. HH. (alertas, categorías de
 * documento, valores del historial) en los 4 idiomas (namespace `hrmPersonas`).
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { CATEGORIAS_DOCUMENTO } from '@/lib/hrm/personas/catalogo';
import type { AlertaEmpleado } from '@/lib/hrm/personas/logica';

export const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function fechaCorta(v: string | null | undefined): string {
  return v ? formatPlainDate(v, FECHA_CORTA) : '';
}

/** Nombre de una categoría de documento (o la categoría cruda si es de otro origen). */
export function useNombreCategoria() {
  const t = useTranslations('hrmPersonas.categorias');
  return useCallback(
    (categoria: string) => (Object.prototype.hasOwnProperty.call(CATEGORIAS_DOCUMENTO, categoria) ? t(categoria) : categoria.replace(/_/g, ' ')),
    [t]
  );
}

/** Texto de una alerta. `corto`: la versión de la fila de la lista. */
export function useTextoAlerta() {
  const t = useTranslations('hrmPersonas.alertas');
  const categoria = useNombreCategoria();
  return useCallback(
    (a: AlertaEmpleado, corto = false): string => {
      const fecha = fechaCorta(a.fecha);
      const dias = a.dias ?? 0;
      switch (a.tipo) {
        case 'contrato_vence':
          return corto ? t('contratoVenceCorto', { dias }) : t('contratoVence', { fecha, dias });
        case 'contrato_vencido':
          return t('contratoVencido', { fecha });
        case 'prueba_termina':
          return t('pruebaTermina', { fecha, dias });
        case 'documentos_faltan':
          return corto
            ? t('documentosFaltanCorto', { n: a.n ?? 0 })
            : t('documentosFaltan', { lista: (a.categorias ?? []).map(categoria).join(', '), n: a.n ?? 0 });
        case 'sin_salario':
          return t('sinSalario');
        case 'certificacion_vencida':
          return corto ? t('vencidoCorto', { nombre: a.nombre ?? '' }) : t('certificacionVencida', { nombre: a.nombre ?? '', fecha });
        case 'certificacion_por_vencer':
          return corto ? t('porVencerCorto', { nombre: a.nombre ?? '' }) : t('certificacionPorVencer', { nombre: a.nombre ?? '', fecha, dias });
        case 'documento_vencido':
          return t('documentoVencido', { nombre: categoria(a.categoria ?? ''), fecha });
        case 'documento_por_vencer':
          return t('documentoPorVencer', { nombre: categoria(a.categoria ?? ''), fecha, dias });
        default:
          return '';
      }
    },
    [t, categoria]
  );
}

/** Valor legible de un campo del historial («Sede Centro», «$ 2.400.000», «42 h»). */
export function useValorCampo() {
  const t = useTranslations('hrmPersonas.comun');
  const moneda = useMonedaOrganizacion();
  return useCallback(
    (campo: string, valor: unknown, nombre: string | null): string => {
      if (valor === null || valor === undefined) return nombre ?? '—';
      if (campo === 'salario') return formatNumeroMoneda(Number(valor), moneda.code);
      if (campo === 'jornada_horas_semana') return t('horasSemana', { n: Number(valor) });
      if (campo === 'tipo_contrato') return t(`contratos.${String(valor)}`);
      if (campo === 'fin_contrato') return fechaCorta(String(valor));
      if (campo === 'periodo_salario') return t(`periodos.${String(valor)}`);
      return nombre ?? String(valor);
    },
    [t, moneda.code]
  );
}
