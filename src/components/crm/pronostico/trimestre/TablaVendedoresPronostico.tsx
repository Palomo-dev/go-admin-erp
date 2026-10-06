'use client';

/** Tabla «por vendedor» del trimestre (Figma CRM 1431:19). */

import { useTranslations } from 'next-intl';
import { Eye, SlidersHorizontal } from 'lucide-react';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { AccionFila } from '@/components/kit/acciones';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { FilaPronostico } from '@/lib/services/crm/forecastLogica';
import { nombreVendedor, tonoCobertura } from './trimestreLogica';

interface Props {
  filas: FilaPronostico[];
  vendedores: { id: string; first_name: string | null; last_name: string | null }[];
  moneda: ContextoMoneda;
  puedeAjustar: boolean;
  onVer: (userId: string) => void;
  onAjustar: (fila: FilaPronostico) => void;
}

export function TablaVendedoresPronostico({ filas, vendedores, moneda, puedeAjustar, onVer, onAjustar }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.vendedores');
  const m = (n: number) => formatMoneda(n, moneda);
  const nombre = (f: FilaPronostico) => (f.userId ? nombreVendedor(vendedores.find((u) => u.id === f.userId)) : null) ?? t(f.userId ? 'sinNombre' : 'sinAsignar');
  const visibles = filas.filter((f) => f.oportunidades > 0 || f.quota.total > 0 || f.adjustment.total !== 0);

  const columnas: ColumnaTabla<FilaPronostico>[] = [
    { id: 'vendedor', encabezado: t('columnas.vendedor'), celda: (f) => <span className="text-sm font-medium text-fg">{nombre(f)}</span> },
    { id: 'cuota', encabezado: t('columnas.cuota'), variante: 'importe', celda: (f) => (f.quota.total > 0 ? m(f.quota.total) : '—'), ocultarDebajo: 'md' },
    { id: 'ganado', encabezado: t('columnas.ganado'), variante: 'importe', celda: (f) => m(f.won.total), ocultarDebajo: 'lg' },
    {
      id: 'compromiso',
      encabezado: t('columnas.compromiso'),
      variante: 'importe',
      celda: (f) => (
        <span>
          {m(f.commit.total)}
          {f.adjustment.total !== 0 && (
            <span className="block text-xs text-fg-secondary">{t('ajustado', { delta: `${f.adjustment.total > 0 ? '+' : '−'}${m(Math.abs(f.adjustment.total))}` })}</span>
          )}
        </span>
      ),
    },
    { id: 'mejor', encabezado: t('columnas.mejorCaso'), variante: 'importe', celda: (f) => m(f.bestCase.total), ocultarDebajo: 'lg' },
    { id: 'ponderado', encabezado: t('columnas.ponderado'), variante: 'importe', celda: (f) => m(f.weighted.total), ocultarDebajo: 'xl' },
    {
      id: 'cobertura',
      encabezado: t('columnas.cobertura'),
      celda: (f) =>
        f.coverage === null ? (
          <span className="text-xs text-fg-muted">{t('sinCuota')}</span>
        ) : (
          <StatusBadge estado="cobertura" etiqueta={`${Math.round(f.coverage * 100)} %`} tono={tonoCobertura(f.coverage)} />
        ),
    },
  ];

  const acciones = (f: FilaPronostico): AccionFila[] => [
    { id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => f.userId && onVer(f.userId), oculta: !f.userId },
    {
      id: 'ajustar',
      etiqueta: t('ajustar'),
      icono: SlidersHorizontal,
      onSelect: () => onAjustar(f),
      oculta: !puedeAjustar || !f.userId,
      deshabilitada: f.commit.sinTasa.length > 0,
      motivo: f.commit.sinTasa.length > 0 ? t('sinTasa') : undefined,
    },
  ];

  return (
    <DataTable
      columnas={columnas}
      filas={visibles}
      obtenerId={(f) => f.userId ?? 'sin-asignar'}
      etiqueta={t('titulo')}
      onFilaClick={(f) => f.userId && onVer(f.userId)}
      etiquetaFila={nombre}
      acciones={acciones}
      tarjetaMovil={(f) => (
        <div className="space-y-1 p-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{nombre(f)}</p>
            {f.coverage !== null && <StatusBadge estado="cobertura" etiqueta={`${Math.round(f.coverage * 100)} %`} tono={tonoCobertura(f.coverage)} tamano="sm" />}
          </div>
          <p className="text-xs text-fg-secondary">{t('movil', { compromiso: m(f.commit.total), cuota: f.quota.total > 0 ? m(f.quota.total) : '—' })}</p>
        </div>
      )}
      vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
    />
  );
}
