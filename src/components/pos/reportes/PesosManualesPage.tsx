'use client';

/**
 * Reportes › POS › «Pesos manuales» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.9): líneas vendidas con el peso escrito a mano, por día y cajero, para
 * auditar el peso a mano (sin báscula, o con la báscula desconectada).
 *
 * Los días son calendario de la organización (`date`): se envían tal cual y
 * se muestran con `formatPlain`, sin convertir zona. La sucursal es la del
 * selector del encabezado («Todas» = sin filtro). El permiso lo resuelve el
 * servidor; sin él la pantalla lo dice y no muestra nada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, RefreshCw, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatCard } from '@/components/kit/StatCard';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatoCantidad } from '@/lib/pos/peso/modoVenta';
import {
  claseError,
  obtenerPesosManuales,
  totalesPesosManuales,
  type ErrorReportePesos,
  type ReportePesosManuales,
} from './pesosManualesService';

/** «1,235 kg» con los 3 decimales del peso y el símbolo de la unidad. */
export function cantidadPeso(cantidad: number, unidad: string, locale: string): string {
  return formatoCantidad(cantidad, { sale_mode: 'weight', unit_code: unidad }, locale);
}

export type EstadoReportePesos = 'cargando' | 'listo' | ErrorReportePesos;

export interface VistaPesosManualesProps {
  estado: EstadoReportePesos;
  reporte: ReportePesosManuales | null;
  formatearMoneda: (n: number) => string;
  /** Día `date` en el formato del idioma (sin conversión de zona). */
  formatearDia: (dia: string) => string;
  onReintentar?: () => void;
}

/** Cuerpo del reporte (sin cabecera ni filtros): lo prueban los tests en 4 idiomas. */
export function VistaPesosManuales({ estado, reporte, formatearMoneda, formatearDia, onReintentar }: VistaPesosManualesProps) {
  const t = useTranslations('posPesosManuales');
  const locale = useLocale();
  const filas = useMemo(() => reporte?.filas ?? [], [reporte]);
  const totales = useMemo(() => totalesPesosManuales(filas), [filas]);

  if (estado === 'sinPermiso') {
    return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />;
  }
  if (estado === 'error' || estado === 'rango') {
    return (
      <EmptyState
        variante="error"
        titulo={t('error.titulo')}
        descripcion={t(estado === 'rango' ? 'error.rango' : 'error.descripcion')}
        accion={onReintentar ? { etiqueta: t('reintentar'), onClick: onReintentar } : undefined}
      />
    );
  }

  const cargando = estado === 'cargando';
  const cantidadTotal = totales.porUnidad.map((u) => cantidadPeso(u.cantidad, u.unidad, locale)).join(' · ') || '—';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard etiqueta={t('kpis.lineas')} valor={cargando ? '—' : String(totales.lineas)} cargando={cargando} detalle={t('kpis.cajeros', { count: totales.cajeros })} />
        <StatCard etiqueta={t('kpis.cantidad')} valor={cargando ? '—' : cantidadTotal} cargando={cargando} />
        <StatCard etiqueta={t('kpis.importe')} valor={cargando ? '—' : formatearMoneda(totales.importe)} cargando={cargando} />
      </div>

      {!cargando && filas.length === 0 ? (
        <EmptyState variante="empty" icono={Scale} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t('tabla.titulo')}</caption>
            <thead className="bg-subtle text-left text-xs text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{t('tabla.dia')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('tabla.cajero')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('tabla.lineas')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('tabla.cantidad')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('tabla.importe')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('tabla.autorizadas')}</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-fg-secondary">{t('cargando')}</td>
                </tr>
              ) : (
                filas.map((f) => (
                  <tr key={`${f.dia}:${f.usuario_id ?? '—'}:${f.unidad}`} className="border-t border-line">
                    <td className="px-4 py-2 text-fg">{formatearDia(f.dia)}</td>
                    <td className="px-4 py-2 text-fg">{f.cajero ?? t('tabla.sinCajero')}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg">{f.lineas}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg">{cantidadPeso(f.cantidad, f.unidad, locale)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg">{formatearMoneda(f.importe)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg-secondary">{f.autorizadas}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PesosManualesPage() {
  const t = useTranslations('posPesosManuales');
  const { getToday, formatPlain } = useFormatDate();
  const { formatear } = useMonedaOrganizacion();
  const { branchFilter } = useBranch();
  const hoy = getToday();
  // Últimos 7 días calendario de la organización (hoy incluido), por texto: nunca toISOString.
  const [desde, setDesde] = useState(() => restarDias(hoy, 6));
  const [hasta, setHasta] = useState(hoy);
  const [estado, setEstado] = useState<EstadoReportePesos>('cargando');
  const [reporte, setReporte] = useState<ReportePesosManuales | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const r = await obtenerPesosManuales({ organizationId: getOrganizationId(), desde, hasta, branchId: branchFilter ?? null });
      setReporte(r);
      setEstado('listo');
    } catch (error) {
      console.error('Error cargando el reporte de pesos manuales:', error);
      setReporte(null);
      setEstado(claseError(error));
    }
  }, [desde, hasta, branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/app/pos/reportes" aria-label={t('volver')} className="mt-1 rounded-md p-1 text-fg-secondary hover:bg-hover hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
              <Scale aria-hidden="true" className="size-5 text-fg-secondary" strokeWidth={1.5} />
              {t('titulo')}
            </h1>
            <p className="text-sm text-fg-secondary">{t('subtitulo')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void cargar()} disabled={estado === 'cargando'}>
          <RefreshCw aria-hidden="true" className="mr-2 size-4" strokeWidth={1.5} />
          {t('actualizar')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          {t('filtros.desde')}
          <CampoFecha valor={desde} onValorChange={(d) => d && setDesde(d)} max={hasta} hoy={hoy} limpiable={false} aria-label={t('filtros.desde')} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          {t('filtros.hasta')}
          <CampoFecha valor={hasta} onValorChange={(d) => d && setHasta(d)} min={desde} max={hoy} hoy={hoy} limpiable={false} aria-label={t('filtros.hasta')} />
        </label>
      </div>

      <VistaPesosManuales
        estado={estado}
        reporte={reporte}
        formatearMoneda={formatear}
        formatearDia={(d) => formatPlain(d)}
        onReintentar={() => void cargar()}
      />
    </div>
  );
}

/** Resta días a un día calendario `YYYY-MM-DD` sin pasar por la zona horaria del navegador. */
export function restarDias(dia: string, dias: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return dia;
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - dias));
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${f.getUTCFullYear()}-${dd(f.getUTCMonth() + 1)}-${dd(f.getUTCDate())}`;
}
