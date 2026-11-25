'use client';

/**
 * Tabla «por vendedor» del trimestre (Figma CRM 1431:19): avatar y nombre,
 * cuota, ganado, compromiso (con «Ajustado ±$» si hay ajuste), mejor caso,
 * ponderado, cobertura y el lápiz del ajuste con motivo (solo supervisor; el
 * servidor lo vuelve a exigir). Clic en la fila → oportunidades del vendedor.
 */

import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { FilaPronostico } from '@/lib/services/crm/forecastLogica';
import { tonoCobertura } from './trimestreLogica';

interface Props {
  filas: FilaPronostico[];
  nombre: (userId: string | null) => string;
  moneda: ContextoMoneda;
  puedeAjustar: boolean;
  onVer: (userId: string) => void;
  onAjustar: (fila: FilaPronostico) => void;
  estado?: EstadoTabla;
}

/** Filas con algo que mostrar: oportunidades, cuota o ajuste. */
export function vendedoresVisibles(filas: readonly FilaPronostico[]): FilaPronostico[] {
  return filas.filter((f) => f.oportunidades > 0 || f.quota.total > 0 || f.adjustment.total !== 0);
}

export function TablaVendedoresPronostico({ filas, nombre, moneda, puedeAjustar, onVer, onAjustar, estado }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.vendedores');
  const m = (n: number) => formatMoneda(n, moneda);
  const cobertura = (f: FilaPronostico, tamano?: 'sm') =>
    f.coverage === null ? (
      <span className="text-xs text-fg-muted">{t('sinCuota')}</span>
    ) : (
      <StatusBadge estado="cobertura" etiqueta={`${Math.round(f.coverage * 100)} %`} tono={tonoCobertura(f.coverage)} tamano={tamano} />
    );

  const columnas: ColumnaTabla<FilaPronostico>[] = [
    {
      id: 'vendedor',
      encabezado: t('columnas.vendedor'),
      celda: (f) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <AvatarIniciales nombre={nombre(f.userId)} tamano="sm" />
          <span className="truncate text-sm font-medium text-fg">{nombre(f.userId)}</span>
        </span>
      ),
    },
    { id: 'cuota', encabezado: t('columnas.cuota'), celda: (f) => <span className="text-[13px] text-fg-secondary tabular-nums">{f.quota.total > 0 ? m(f.quota.total) : '—'}</span>, ocultarDebajo: 'md' },
    { id: 'ganado', encabezado: t('columnas.ganado'), celda: (f) => <span className="text-[13px] text-fg-secondary tabular-nums">{m(f.won.total)}</span>, ocultarDebajo: 'lg' },
    {
      id: 'compromiso',
      encabezado: t('columnas.compromiso'),
      celda: (f) => (
        <span className="tabular-nums">
          <span className="text-sm font-semibold text-fg">{m(f.commit.total)}</span>
          {f.adjustment.total !== 0 && (
            <span className="block text-xs text-fg-secondary">{t('ajustado', { delta: `${f.adjustment.total > 0 ? '+' : '−'}${m(Math.abs(f.adjustment.total))}` })}</span>
          )}
        </span>
      ),
    },
    { id: 'mejor', encabezado: t('columnas.mejorCaso'), celda: (f) => <span className="text-[13px] text-fg-secondary tabular-nums">{m(f.bestCase.total)}</span>, ocultarDebajo: 'lg' },
    { id: 'ponderado', encabezado: t('columnas.ponderado'), celda: (f) => <span className="text-[13px] text-fg-secondary tabular-nums">{m(f.weighted.total)}</span>, ocultarDebajo: 'xl' },
    { id: 'cobertura', encabezado: t('columnas.cobertura'), celda: (f) => cobertura(f) },
  ];

  return (
    <DataTable
      columnas={columnas}
      filas={vendedoresVisibles(filas)}
      obtenerId={(f) => f.userId ?? 'sin-asignar'}
      etiqueta={t('titulo')}
      estado={estado}
      onFilaClick={(f) => f.userId && onVer(f.userId)}
      etiquetaFila={(f) => nombre(f.userId)}
      accionesRapidas={
        puedeAjustar
          ? (f) =>
              f.userId ? (
                <button
                  type="button"
                  aria-label={t('ajustarDe', { nombre: nombre(f.userId) })}
                  title={f.commit.sinTasa.length > 0 ? t('sinTasa') : t('ajustar')}
                  disabled={f.commit.sinTasa.length > 0}
                  onClick={() => onAjustar(f)}
                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'size-8 px-0' })}
                >
                  <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              ) : null
          : undefined
      }
      tarjetaMovil={(f) => (
        <div className="space-y-1 p-4">
          <div className="flex items-center gap-2">
            <AvatarIniciales nombre={nombre(f.userId)} tamano="sm" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{nombre(f.userId)}</p>
            {cobertura(f, 'sm')}
          </div>
          <p className="text-xs text-fg-secondary">{t('movil', { compromiso: m(f.commit.total), cuota: f.quota.total > 0 ? m(f.quota.total) : '—' })}</p>
        </div>
      )}
      vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
    />
  );
}
