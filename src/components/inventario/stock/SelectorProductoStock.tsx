'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Package } from 'lucide-react';
import { SelectorEntidad } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { listarStock, type StockFila } from '@/lib/services/stockService';
import { existenciaEn } from './logica';

/**
 * Producto que se mueve en «Registrar entrada/salida», «Nuevo lote» y el stock
 * mínimo. No es un buscador nuevo: es el `SelectorEntidad` del kit sobre el mismo
 * listado de stock del servidor (`fn_stock_listado`, agrupar = false), así cada
 * opción ya trae su existencia en la sucursal. Los padres con variantes no se
 * pueden elegir (P1: el stock vive en las variantes).
 */
export interface SelectorProductoStockProps {
  organizacionId: number;
  sucursalId: number | null;
  valor: StockFila | null;
  onCambiar: (fila: StockFila) => void;
  etiqueta: string;
  id?: string;
  deshabilitado?: boolean;
  /** Solo productos que manejan lotes (Nuevo lote). */
  soloConLotes?: boolean;
}

export function SelectorProductoStock({
  organizacionId,
  sucursalId,
  valor,
  onCambiar,
  etiqueta,
  id,
  deshabilitado,
  soloConLotes,
}: SelectorProductoStockProps) {
  const t = useTranslations('inventarioStock.selectorProducto');
  const entero = useFormatoEntero();

  const buscar = useCallback(
    async (texto: string) => {
      const r = await listarStock(
        organizacionId,
        {
          busqueda: texto.trim() || undefined,
          agrupar: false,
          sucursales: sucursalId ? [sucursalId] : undefined,
          seguimiento: soloConLotes ? 'lotes' : undefined,
        },
        0,
        20,
      );
      return r.filas;
    },
    [organizacionId, sucursalId, soloConLotes],
  );

  return (
    <SelectorEntidad<StockFila>
      id={id}
      layout="campo"
      valor={valor}
      icono={Package}
      etiqueta={etiqueta}
      deshabilitado={deshabilitado}
      buscar={buscar}
      aOpcion={(f) => {
        const enSucursal = existenciaEn(f, sucursalId);
        return {
          id: String(f.product_id),
          titulo: f.nombre,
          subtitulo: [f.sku ? t('sku', { sku: f.sku }) : null, f.atributos, f.con_lotes ? t('conLotes') : null].filter(Boolean).join(' · ') || null,
          insignia: sucursalId
            ? { texto: t('disponible', { n: entero(enSucursal?.disponible ?? 0) }), tono: (enSucursal?.disponible ?? 0) > 0 ? 'neutro' : 'advertencia' }
            : null,
          deshabilitada: f.sin_asignar_fila || f.variantes > 0,
          motivo: t('padreConVariantes'),
        };
      }}
      onCambiar={onCambiar}
      textos={{
        placeholder: t('placeholder'),
        buscar: t('buscar'),
        titulo: t('titulo'),
        vacio: t('vacio'),
        sinResultados: t('sinResultados'),
        error: t('error'),
        cambiar: t('cambiar'),
      }}
    />
  );
}
