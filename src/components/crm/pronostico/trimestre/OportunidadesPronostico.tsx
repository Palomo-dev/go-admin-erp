'use client';

/**
 * Oportunidades abiertas del trimestre con su categoría (Figma CRM 1434:648).
 * Quien puede editar la oportunidad cambia la categoría; el servidor bloquea
 * por `updated_at` (si alguien la cambió antes, 409 y se recarga).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { Pagination } from '@/components/kit/Pagination';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { probabilityToFraction } from '@/lib/services/crm/revenueOs/forecastScenarios';
import { FORECAST_CATEGORIES, TAMANO_PAGINA_PRONOSTICO, type ForecastCategory } from '@/lib/services/crm/forecastLogica';
import type { RespuestaPronostico } from '@/lib/services/crm/forecastService';

type Fila = RespuestaPronostico['opportunities'][number];

interface Props {
  filas: Fila[];
  total: number;
  pagina: number;
  onPagina: (p: number) => void;
  moneda: ContextoMoneda;
  estado: EstadoTabla;
  onCambio: () => void;
}

export function OportunidadesPronostico({ filas, total, pagina, onPagina, moneda, estado, onCambio }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.oportunidades');
  const tc = useTranslations('crm.pronosticoTrimestre.categorias');
  const [guardando, setGuardando] = useState<string | null>(null);
  const opciones = FORECAST_CATEGORIES.map((c) => ({ valor: c, etiqueta: tc(c) }));

  const cambiar = async (o: Fila, categoria: ForecastCategory) => {
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

  const columnas: ColumnaTabla<Fila>[] = [
    { id: 'nombre', encabezado: t('columnas.oportunidad'), celda: (o) => <span className="text-sm font-medium text-fg">{o.name}</span> },
    { id: 'etapa', encabezado: t('columnas.etapa'), celda: (o) => <span className="text-[13px] text-fg-secondary">{o.stage_name}</span>, ocultarDebajo: 'md' },
    { id: 'cierre', encabezado: t('columnas.cierre'), celda: (o) => <span className="text-[13px] text-fg-secondary">{formatPlainDate(o.expected_close_date) || '—'}</span>, ocultarDebajo: 'lg' },
    { id: 'monto', encabezado: t('columnas.monto'), variante: 'importe', celda: (o) => formatMoneda(o.amount, o.currency ?? moneda) },
    { id: 'prob', encabezado: t('columnas.probabilidad'), variante: 'importe', celda: (o) => `${Math.round(probabilityToFraction(o.probability) * 100)} %`, ocultarDebajo: 'lg' },
    {
      id: 'categoria',
      encabezado: t('columnas.categoria'),
      ancho: 180,
      celda: (o) =>
        o.canEdit ? (
          <SelectCrm valor={o.category} onValorChange={(v) => void cambiar(o, v as ForecastCategory)} opciones={opciones} disabled={guardando === o.id} aria-label={t('categoriaDe', { nombre: o.name })} />
        ) : (
          <StatusBadge estado={o.category} etiqueta={tc(o.category)} tono={o.category === 'commit' ? 'marca' : o.category === 'omitted' ? 'neutro' : 'informacion'} />
        ),
    },
  ];

  return (
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
          <p className="text-xs text-fg-secondary">{[o.stage_name, formatPlainDate(o.expected_close_date), formatMoneda(o.amount, o.currency ?? moneda)].filter(Boolean).join(' · ')}</p>
          {columnas[5].celda(o, 0)}
        </div>
      )}
      vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
      pie={total > TAMANO_PAGINA_PRONOSTICO ? <Pagination pagina={pagina} tamano={TAMANO_PAGINA_PRONOSTICO} total={total} onPaginaChange={onPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} /> : undefined}
    />
  );
}
