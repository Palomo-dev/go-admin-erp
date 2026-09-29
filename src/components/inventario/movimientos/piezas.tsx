'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, ClipboardCheck, Copy, ExternalLink, Layers, Package, User } from 'lucide-react';
import type { AccionFila } from '@/components/kit';
import { EnlaceDocumento } from '@/components/kit/inventario';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { DocumentoMovimiento, PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import type { MovimientoFila } from '@/lib/services/stockService';
import { cn } from '@/utils/Utils';
import { rutaAjuste, rutaKardexCompleto, rutaKardexLote } from '../productos/detalle/inventario/stock/logicaInventario';
import { useCantidadStock } from '../stock/useInventarioB1';

/**
 * Piezas compartidas por Movimientos y Kardex (Figma 586:286575 y 516:270498):
 * fecha en la zona de la organización, documento enlazado con quién lo registró,
 * entrada/salida con signo y el menú ⋯ de la fila.
 */

export function CeldaFecha({ fecha, className }: { fecha: string; className?: string }) {
  const { formatDate, formatTime } = useFormatDate();
  return (
    <div className={cn('flex flex-col tabular-nums', className)}>
      <span className="text-fg">{formatDate(fecha)}</span>
      <span className="text-xs text-fg-secondary">{formatTime(fecha)}</span>
    </div>
  );
}

export function CeldaDocumento({ fila, documento, cargando }: { fila: MovimientoFila; documento: DocumentoMovimiento; cargando?: boolean }) {
  const t = useTranslations('inventarioMovimientos');
  const sinDocumento = !fila.source_id && (documento.tipo === 'producto' || documento.tipo === 'otro');
  return (
    <div className="flex min-w-0 flex-col">
      {sinDocumento ? <span className="text-sm text-fg-muted">{t('sinDocumento')}</span> : <EnlaceDocumento documento={documento} cargando={cargando} />}
      {fila.usuario ? (
        <span className="truncate text-xs text-fg-secondary">{t('por', { nombre: fila.usuario })}</span>
      ) : sinDocumento ? (
        <span className="truncate text-xs text-fg-secondary">{fila.source === 'initial' ? t('cargaInicial') : t('edicionDirecta')}</span>
      ) : null}
    </div>
  );
}

/** «+500» en verde o «−2» en rojo; guion en la otra columna. */
export function CeldaCantidad({ fila, direccion }: { fila: MovimientoFila; direccion: 'in' | 'out' }) {
  const cantidad = useCantidadStock();
  if (fila.direccion !== direccion) return <span className="text-fg-muted">—</span>;
  return (
    <span className={cn('font-semibold tabular-nums', direccion === 'in' ? 'text-success-text' : 'text-danger-text')}>
      {direccion === 'in' ? '+' : '−'}
      {cantidad(fila.cantidad)}
    </span>
  );
}

/** Menú ⋯ de un movimiento (Figma 586:295053 y 522:70811). */
export function useAccionesMovimiento(permisos: PermisosInventario, opciones: { onSoloUsuario?: (fila: MovimientoFila) => void } = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioMovimientos.acciones');
  const td = useTranslations('inventario.documentos');
  const { onSoloUsuario } = opciones;
  return useCallback(
    (fila: MovimientoFila, documento: DocumentoMovimiento): AccionFila[] => {
      const tipo = td.has(documento.tipo) ? td(documento.tipo) : td('otro');
      const numero = documento.numero ?? fila.source_id;
      return [
        {
          id: 'documento',
          etiqueta: t('abrir', { documento: documento.numero ? `${tipo} ${documento.numero}` : tipo }),
          icono: ExternalLink,
          oculta: !documento.ruta,
          onSelect: () => documento.ruta && router.push(documento.ruta),
        },
        { id: 'kardex', etiqueta: t('kardex'), icono: BookOpen, onSelect: () => router.push(rutaKardexCompleto(fila.product_id)) },
        {
          id: 'lote',
          etiqueta: t('lote', { codigo: fila.lote ?? '' }),
          icono: Layers,
          oculta: !fila.lot_id,
          onSelect: () => fila.lot_id && router.push(rutaKardexLote(fila.product_id, fila.lot_id)),
        },
        { id: 'producto', etiqueta: t('producto'), icono: Package, onSelect: () => router.push(`/app/inventario/productos/${fila.parent_id ?? fila.product_id}`) },
        {
          id: 'copiar',
          etiqueta: t('copiar'),
          icono: Copy,
          oculta: !numero,
          onSelect: () => {
            void navigator.clipboard?.writeText(String(numero)).then(
              () => toast({ title: t('copiado', { numero: String(numero) }) }),
              () => undefined,
            );
          },
        },
        {
          id: 'usuario',
          etiqueta: t('soloUsuario', { nombre: fila.usuario ?? '' }),
          icono: User,
          oculta: !onSoloUsuario || !fila.usuario_id || !fila.usuario,
          onSelect: () => onSoloUsuario?.(fila),
        },
        {
          id: 'corregir',
          etiqueta: t('corregir'),
          icono: ClipboardCheck,
          separadorAntes: true,
          oculta: !permisos.ajustar,
          onSelect: () => router.push(rutaAjuste(fila.product_id, null, fila.branch_id)),
        },
      ];
    },
    [router, toast, t, td, permisos.ajustar, onSoloUsuario],
  );
}
