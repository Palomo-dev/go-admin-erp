'use client';

/**
 * GO Asistente — resultado de un reporte dentro de una respuesta (Figma
 * Reportes 22-03 escritorio y 22-05 móvil).
 *
 * Gráfico pequeño (solo si el reporte es por fecha), la tabla corta con las
 * filas más relevantes y tres accesos: «Exportar» (el mismo documento PDF del
 * visor; el servidor exige el permiso de exportar), «Programar envío» (abre el
 * diálogo del centro de reportes sobre este reporte) e «Ir al reporte» (el
 * visor con el mismo periodo, sucursal y vista).
 *
 * No hay una tabla ni un formato propios: la tabla es `TablaReporte` del visor
 * y las cifras salen de `useFormatoReporte` (moneda y zona de la organización).
 * El gráfico es un SVG de una línea en vez de recharts: en 400 px una serie
 * basta, y no arrastra la librería al panel que se carga en todas las páginas.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Download, Loader2, Mail } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { TablaReporte } from '@/components/reportes/TablaReporte';
import { rutaReporte } from '@/components/reportes/rutasReportes';
import { toastError } from '@/components/ui/use-toast';
import { descargarDocumento } from '@/lib/documents/cliente';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { aQuery, escribirFiltrosReportes, parametrosDocumento } from '@/lib/services/reportes/filtrosUrl';
import type { PeriodoCierre } from '@/lib/services/reportes/types';
import { puntosSparkline, type TarjetaReporte } from '@/lib/ai/assistant/tarjetaReporte';

const ANCHO = 280;
const ALTO = 40;

function periodoDe(tarjeta: TarjetaReporte): PeriodoCierre {
  return { ...tarjeta.periodo, tipo: tarjeta.periodo.tipo as PeriodoCierre['tipo'] };
}

/** Ruta del visor con los filtros de la respuesta (y `extra` para el centro). */
export function rutaDeTarjeta(tarjeta: TarjetaReporte, hoy: string, extra: Record<string, string> = {}): string {
  const filtros = escribirFiltrosReportes({ periodo: periodoDe(tarjeta), sucursal: tarjeta.sucursalId, vista: tarjeta.vista }, hoy);
  return rutaReporte(tarjeta.grupo, tarjeta.reporteId, aQuery({ ...filtros, ...extra }));
}

function Sparkline({ serie, etiqueta }: { serie: number[]; etiqueta: string }) {
  const puntos = puntosSparkline(serie, ANCHO, ALTO);
  if (!puntos) return null;
  const area = `2,${ALTO} ${puntos} ${ANCHO - 2},${ALTO}`;
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" className="h-10 w-full text-brand-action" role="img" aria-label={etiqueta}>
      <polygon points={area} className="fill-brand-tint" />
      <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function ReportAnswerCard({ tarjeta }: { tarjeta: TarjetaReporte }) {
  const t = useTranslations('asistente.reporte');
  const router = useRouter();
  const { getToday } = useFormatDate();
  const [exportando, setExportando] = useState(false);
  const hoy = getToday();

  const exportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const efectivos = { periodo: periodoDe(tarjeta), sucursal: tarjeta.sucursalId, comparar: null, vista: tarjeta.vista };
      await descargarDocumento('reporte', tarjeta.reporteId, parametrosDocumento(efectivos));
    } catch (error) {
      toastError(t('errorExportar'), error instanceof Error ? error.message : undefined);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {tarjeta.serie.length >= 3 && (
        <Sparkline serie={tarjeta.serie} etiqueta={t('tendencia', { serie: tarjeta.serieTitulo ?? tarjeta.titulo, periodo: tarjeta.periodo.etiqueta })} />
      )}
      {tarjeta.filas.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <TablaReporte columnas={tarjeta.columnas} filas={tarjeta.filas} etiqueta={`${tarjeta.titulo} · ${tarjeta.periodo.etiqueta}`} />
        </div>
      )}
      {tarjeta.totalFilas > tarjeta.filas.length && (
        <p className="text-xs text-fg-muted">{t('filasMostradas', { n: tarjeta.filas.length, total: tarjeta.totalFilas })}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void exportar()} disabled={exportando}>
          {exportando ? (
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
          ) : (
            <Download aria-hidden className="size-4" strokeWidth={1.5} />
          )}
          {t('exportar')}
        </button>
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          onClick={() => router.push(rutaDeTarjeta(tarjeta, hoy, { programar: '1' }))}
        >
          <Mail aria-hidden className="size-4" strokeWidth={1.5} />
          {t('programar')}
        </button>
        <Link href={rutaDeTarjeta(tarjeta, hoy)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />
          {t('irAlReporte')}
        </Link>
      </div>
    </div>
  );
}
