'use client';

/**
 * Oportunidades del trimestre con su categoría (Figma CRM 1434:648 y la lista
 * del móvil 1434:843089). Quien puede editar la oportunidad cambia la
 * categoría; el servidor bloquea por `updated_at` (si alguien la cambió antes,
 * 409 y se recarga). Las omitidas se explican debajo de la tabla.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { Pagination } from '@/components/kit/Pagination';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { probabilityToFraction } from '@/lib/services/crm/revenueOs/forecastScenarios';
import { FORECAST_CATEGORIES, TAMANO_PAGINA_PRONOSTICO, type ForecastCategory } from '@/lib/services/crm/forecastLogica';
import type { RespuestaPronostico } from '@/lib/services/crm/forecastService';

export type OportunidadPronostico = RespuestaPronostico['opportunities'][number];

/** Cambio de categoría compartido por la tabla y las tarjetas del móvil. */
export function useCategoriaPronostico(onCambio: () => void) {
  const t = useTranslations('crm.pronosticoTrimestre.oportunidades');
  const tc = useTranslations('crm.pronosticoTrimestre.categorias');
  const [guardando, setGuardando] = useState<string | null>(null);
  const opciones = FORECAST_CATEGORIES.map((c) => ({ valor: c, etiqueta: tc(c) }));

  const cambiar = async (o: OportunidadPronostico, categoria: ForecastCategory) => {
    setGuardando(o.id);
    try {
      await pedirCrm(`/api/crm/opportunities/${encodeURIComponent(o.id)}/forecast-category`, { method: 'PATCH', cuerpo: { category: categoria, expected_updated_at: o.updated_at } });
      toast({ title: t('ok', { nombre: o.name, categoria: tc(categoria) }) });
      onCambio();
    } catch (e) {
      const conflicto = e instanceof ErrorApiCrm && e.status === 409;
      toast({ title: t(conflicto ? 'conflicto' : 'error'), variant: 'destructive' });
      if (conflicto) onCambio();
    } finally {
      setGuardando(null);
    }
  };

  const selector = (o: OportunidadPronostico, className?: string) =>
    o.canEdit ? (
      <SelectCrm className={className} valor={o.category} onValorChange={(v) => void cambiar(o, v as ForecastCategory)} opciones={opciones} disabled={guardando === o.id} aria-label={t('categoriaDe', { nombre: o.name })} />
    ) : (
      <StatusBadge estado={o.category} etiqueta={tc(o.category)} tono={o.category === 'commit' ? 'marca' : o.category === 'omitted' ? 'neutro' : 'informacion'} />
    );

  return { selector };
}

interface Props {
  filas: OportunidadPronostico[];
  total: number;
  pagina: number;
  onPagina: (p: number) => void;
  moneda: ContextoMoneda;
  estado: EstadoTabla;
  onCambio: () => void;
}

export function OportunidadesPronostico({ filas, total, pagina, onPagina, moneda, estado, onCambio }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.oportunidades');
  const { selector } = useCategoriaPronostico(onCambio);
  const omitidas = filas.filter((o) => o.category === 'omitted');
  const monto = (o: OportunidadPronostico) => formatMoneda(o.amount, o.currency ?? moneda);

  const columnas: ColumnaTabla<OportunidadPronostico>[] = [
    { id: 'nombre', encabezado: t('columnas.oportunidad'), celda: (o) => <span className="text-sm font-medium text-fg">{o.name}</span> },
    { id: 'etapa', encabezado: t('columnas.etapa'), celda: (o) => <span className="text-[13px] text-fg-secondary">{o.stage_name}</span>, ocultarDebajo: 'md' },
    { id: 'cierre', encabezado: t('columnas.cierre'), celda: (o) => <span className="text-[13px] text-fg-secondary">{formatPlainDate(o.expected_close_date) || '—'}</span>, ocultarDebajo: 'lg' },
    { id: 'monto', encabezado: t('columnas.monto'), celda: (o) => <span className="text-sm font-semibold text-fg tabular-nums">{monto(o)}</span> },
    { id: 'prob', encabezado: t('columnas.probabilidad'), celda: (o) => <span className="text-[13px] text-fg-secondary tabular-nums">{Math.round(probabilityToFraction(o.probability) * 100)} %</span>, ocultarDebajo: 'lg' },
    { id: 'categoria', encabezado: t('columnas.categoria'), ancho: 200, celda: (o) => selector(o) },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columnas={columnas}
        filas={filas}
        obtenerId={(o) => o.id}
        etiqueta={t('titulo')}
        estado={estado}
        etiquetaFila={(o) => o.name}
        tarjetaMovil={(o) => (
          <div className="space-y-2 p-4">
            <p className="text-sm font-medium text-fg">{o.name}</p>
            <p className="text-xs text-fg-secondary">{[monto(o), formatPlainDate(o.expected_close_date, { day: '2-digit', month: '2-digit' })].filter(Boolean).join(' · ')}</p>
            {selector(o, 'w-full')}
          </div>
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('vacio.irPipeline'), href: '/app/crm/pipeline' } }}
        pie={total > TAMANO_PAGINA_PRONOSTICO ? <Pagination pagina={pagina} tamano={TAMANO_PAGINA_PRONOSTICO} total={total} onPaginaChange={onPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} /> : undefined}
      />
      {estado === 'listo' && omitidas.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          compacto
          titulo={omitidas.length === 1 ? t('omitida.una', { nombre: omitidas[0].name }) : t('omitida.varias', { n: omitidas.length })}
          descripcion={t('omitida.efecto')}
        />
      )}
    </div>
  );
}
