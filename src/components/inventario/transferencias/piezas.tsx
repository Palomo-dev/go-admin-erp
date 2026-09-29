'use client';

/**
 * Piezas de traslados y distribución (inventario B3): badge de estado,
 * formato de cantidades, mensaje de error de la API y seguimiento.
 */
import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeftRight, Ban, CheckCircle2, Clock, PackageCheck, Pencil, Undo2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/kit';
import { formatearCantidad } from '@/components/kit/inventario';
import { ErrorPeticionTraslado } from '@/lib/inventario/transferencias/cliente';
import type { CabeceraTraslado, EstadoTraslado, EstadoVisibleTraslado, EventoTraslado } from '@/lib/inventario/transferencias/contrato';
import { estadoVisible, tonoEstado } from '@/lib/inventario/transferencias/logica';
import { cn } from '@/utils/Utils';

/** Cantidades con la configuración regional (hasta 3 decimales, como la base). */
export function useCantidad(): (n: number | null | undefined) => string {
  const locale = useLocale();
  return useCallback((n) => formatearCantidad(Number(n) || 0, locale), [locale]);
}

export function useEtiquetaEstadoTraslado(): (estado: EstadoVisibleTraslado) => string {
  const t = useTranslations('inventarioTraslados.estados');
  return useCallback((estado) => t(estado), [t]);
}

export function BadgeEstadoTraslado({
  estado,
  conDiferencia,
  tamano = 'sm',
  className,
}: {
  estado: EstadoTraslado;
  conDiferencia?: boolean;
  tamano?: 'sm' | 'md';
  className?: string;
}) {
  const etiqueta = useEtiquetaEstadoTraslado();
  const visible = estadoVisible({ estado, con_diferencia: conDiferencia });
  const { tono, contorno } = tonoEstado(visible);
  return (
    <StatusBadge
      estado={visible}
      etiqueta={etiqueta(visible)}
      tono={tono}
      apariencia={contorno ? 'contorno' : 'suave'}
      tamano={tamano}
      className={className}
    />
  );
}

/** Mensaje legible de un error de la API de traslados (con el detalle de existencias o seriales). */
export function useMensajeErrorTraslado(): (error: unknown) => string {
  const t = useTranslations('inventarioTraslados.errores');
  const cantidad = useCantidad();
  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ErrorPeticionTraslado)) return t('error_desconocido');
      const d = error.detalle;
      switch (error.codigo) {
        case 'stock_insuficiente':
          if (d && typeof d.disponible === 'number' && typeof d.solicitado === 'number') {
            return t('stock_insuficiente_detalle', { disponible: cantidad(d.disponible), solicitado: cantidad(d.solicitado) });
          }
          return t('stock_insuficiente');
        case 'seriales_requeridos':
          return d?.producto ? t('seriales_requeridos_producto', { producto: d.producto }) : t('seriales_requeridos');
        case 'excede_orden_produccion':
          if (d && typeof d.producido === 'number' && typeof d.ya_distribuido === 'number') {
            return t('excede_orden_produccion_detalle', { producido: cantidad(d.producido), ya: cantidad(d.ya_distribuido) });
          }
          return t('excede_orden_produccion');
        default:
          return t.has(error.codigo) ? t(error.codigo) : t('error_desconocido');
      }
    },
    [t, cantidad],
  );
}

// ─── Seguimiento ────────────────────────────────────────────────────────────

interface PasoSeguimiento {
  id: string;
  icono: LucideIcon;
  titulo: string;
  lineas: string[];
  fecha?: string | null;
  enlace?: { etiqueta: string; href: string } | null;
  pendiente?: boolean;
  tono?: 'marca' | 'exito' | 'advertencia' | 'peligro' | 'neutro';
}

const TONO_ICONO: Record<NonNullable<PasoSeguimiento['tono']>, string> = {
  marca: 'bg-brand-tint text-brand',
  exito: 'bg-success-subtle text-success-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  peligro: 'bg-danger-subtle text-danger-text',
  neutro: 'bg-subtle text-fg-secondary',
};

/**
 * Seguimiento del traslado (Figma «Seguimiento»): cada evento con su autor y
 * fecha, y el paso siguiente que falta. `formatoFecha` recibe instantes
 * (timestamptz) y los pinta en la zona de la organización.
 */
export function SeguimientoTraslado({
  traslado,
  eventos,
  formatoFecha,
  enlaceKardex,
  className,
}: {
  traslado: CabeceraTraslado;
  eventos: readonly EventoTraslado[];
  formatoFecha: (v: string | null | undefined) => string;
  enlaceKardex?: string | null;
  className?: string;
}) {
  const t = useTranslations('inventarioTraslados.detalle.seguimiento');
  const cantidad = useCantidad();
  const origen = traslado.origen.nombre ?? '';
  const destino = traslado.destino.nombre ?? '';

  const pasos: PasoSeguimiento[] = eventos.map((e) => {
    const d = e.detalle ?? {};
    const por = e.autor ? t('por', { autor: e.autor }) : null;
    switch (e.tipo) {
      case 'creado':
        return {
          id: String(e.id),
          icono: ArrowLeftRight,
          titulo: t('creado'),
          lineas: [
            [
              typeof d.renglones === 'number' ? t('renglones', { count: d.renglones, n: cantidad(d.renglones) }) : null,
              typeof d.unidades === 'number' ? t('unidades', { count: d.unidades, n: cantidad(d.unidades) }) : null,
              por,
            ]
              .filter(Boolean)
              .join(' · '),
          ].filter(Boolean),
          fecha: e.fecha,
          tono: 'marca',
        };
      case 'editado':
        return { id: String(e.id), icono: Pencil, titulo: t('editado'), lineas: [por].filter(Boolean) as string[], fecha: e.fecha, tono: 'neutro' };
      case 'despachado':
        return {
          id: String(e.id),
          icono: ArrowLeftRight,
          titulo: t('despachado', { origen }),
          lineas: [
            [typeof d.unidades === 'number' ? t('salieron', { n: cantidad(d.unidades) }) : null, por].filter(Boolean).join(' · '),
          ],
          fecha: e.fecha,
          enlace: enlaceKardex ? { etiqueta: t('verKardex'), href: enlaceKardex } : null,
          tono: 'marca',
        };
      case 'recibido': {
        const lineas = [[typeof d.unidades === 'number' ? t('entraron', { n: cantidad(d.unidades) }) : null, por].filter(Boolean).join(' · ')];
        if (d.faltantes && d.faltantes > 0) {
          const motivos = (d.lineas ?? []).map((l) => l.motivo).filter(Boolean);
          lineas.push(t('faltante', { n: cantidad(d.faltantes), motivo: motivos.join('; ') || '—' }));
        }
        if (d.en_camino && d.en_camino > 0) lineas.push(t('enCamino', { n: cantidad(d.en_camino) }));
        return {
          id: String(e.id),
          icono: PackageCheck,
          titulo: t('recibido', { destino }),
          lineas,
          fecha: e.fecha,
          tono: d.faltantes && d.faltantes > 0 ? 'advertencia' : 'exito',
        };
      }
      case 'cancelado':
        return {
          id: String(e.id),
          icono: Ban,
          titulo: t('cancelado'),
          lineas: [d.motivo ? t('motivo', { motivo: d.motivo }) : null, d.limpieza ? t('limpieza') : null, por].filter(Boolean) as string[],
          fecha: e.fecha,
          tono: 'peligro',
        };
      case 'devuelto':
        return {
          id: String(e.id),
          icono: Undo2,
          titulo: t('devuelto'),
          lineas: [
            typeof d.unidades === 'number' ? t('volvieron', { n: cantidad(d.unidades), origen }) : null,
            d.motivo ? t('motivo', { motivo: d.motivo }) : null,
            por,
          ].filter(Boolean) as string[],
          fecha: e.fecha,
          tono: 'neutro',
        };
      default:
        return { id: String(e.id), icono: Clock, titulo: e.tipo, lineas: [], fecha: e.fecha, tono: 'neutro' };
    }
  });

  if (traslado.estado === 'pending') {
    pasos.push({ id: 'siguiente', icono: Clock, titulo: t('pendienteDespachar'), lineas: [t('pendienteDespacharDetalle', { origen })], pendiente: true });
  } else if (traslado.estado === 'in_transit') {
    pasos.push({ id: 'siguiente', icono: PackageCheck, titulo: t('pendienteRecibir', { destino }), lineas: [t('pendienteRecibirDetalle')], pendiente: true });
  } else if (traslado.estado === 'received' && !eventos.some((e) => e.tipo === 'recibido')) {
    pasos.push({ id: 'legado', icono: CheckCircle2, titulo: t('recibidoLegado'), lineas: [], tono: 'exito' });
  }

  return (
    <ol className={cn('flex flex-col', className)} aria-label={t('titulo')}>
      {pasos.map((p, i) => {
        const Icono = p.icono;
        const ultimo = i === pasos.length - 1;
        return (
          <li key={p.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!ultimo && <span aria-hidden="true" className="absolute left-4 top-9 h-[calc(100%-2.5rem)] w-px bg-line" />}
            <span
              aria-hidden="true"
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                p.pendiente ? 'border border-dashed border-line-strong bg-surface text-fg-muted' : TONO_ICONO[p.tono ?? 'neutro'],
              )}
            >
              <Icono className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', p.pendiente ? 'text-fg-secondary' : 'text-fg')}>{p.titulo}</p>
              {p.lineas.map((l, j) => (
                <p key={j} className="text-[13px] text-fg-secondary">
                  {l}
                </p>
              ))}
              {(p.fecha || p.enlace) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                  {p.fecha && <time dateTime={p.fecha}>{formatoFecha(p.fecha)}</time>}
                  {p.enlace && (
                    <Link href={p.enlace.href} className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {p.enlace.etiqueta}
                    </Link>
                  )}
                </p>
              )}
              {p.pendiente && <p className="text-xs text-fg-muted">—</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
