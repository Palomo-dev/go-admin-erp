'use client';

/**
 * «Agregar productos» del formulario de documento conectado a sus datos:
 * `AgregarProductosDialog` del kit + `buscarProductosDocumento` (precio o
 * costo vigente, stock de la sucursal) + alta rápida con `fn_producto_guardar`.
 * Lo usan la factura de venta, la factura de compra y la orden de compra; el
 * viejo `ProductSearchDialog` queda para los módulos que no son documentos.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AgregarProductosDialog, type FiltrosProductos } from '@/components/kit/documento/AgregarProductosDialog';
import { FormularioRapidoProducto } from '@/components/kit/documento/FormularioRapidoProducto';
import type { OpcionImpuesto, ProductoDocumento } from '@/components/kit/documento/edicionDocumentoLogica';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  buscarProductosDocumento,
  crearProductoRapido,
  impuestosOrganizacion,
  type ImpuestoDocumento,
  type ProductoParaDocumento,
} from '@/lib/services/documentos/edicionDocumento';
import type { ContextoMoneda } from '@/lib/utils/moneda';

/** Impuestos y retenciones activos de la organización (una lectura por pantalla). */
export function useImpuestosOrganizacion(): { impuestos: ImpuestoDocumento[]; retenciones: ImpuestoDocumento[]; cargando: boolean; error: boolean } {
  const [estado, setEstado] = useState<{ impuestos: ImpuestoDocumento[]; retenciones: ImpuestoDocumento[]; cargando: boolean; error: boolean }>({
    impuestos: [],
    retenciones: [],
    cargando: true,
    error: false,
  });
  useEffect(() => {
    let cancelado = false;
    impuestosOrganizacion(getOrganizationId())
      .then((r) => !cancelado && setEstado({ ...r, cargando: false, error: false }))
      .catch(() => !cancelado && setEstado({ impuestos: [], retenciones: [], cargando: false, error: true }));
    return () => {
      cancelado = true;
    };
  }, []);
  return estado;
}

export interface AgregarProductosDocumentoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  variante: 'venta' | 'compra';
  destino?: 'factura' | 'orden';
  sucursal: number | null;
  nombreSucursal?: string | null;
  proveedor?: { id: number; nombre: string } | null;
  moneda: ContextoMoneda | string;
  impuestos: readonly OpcionImpuesto[];
  onAgregar: (producto: ProductoParaDocumento) => void;
  /** Sin «+ Crear producto» (p. ej. sin permiso sobre el catálogo). */
  sinCrear?: boolean;
}

export function AgregarProductosDocumento({
  abierto,
  onAbiertoChange,
  variante,
  destino = 'factura',
  sucursal,
  nombreSucursal,
  proveedor,
  moneda,
  impuestos,
  onAgregar,
  sinCrear,
}: AgregarProductosDocumentoProps) {
  const t = useTranslations('kit.documentoEdicion.productos');
  const buscar = useCallback(
    (texto: string, f: FiltrosProductos, senal: AbortSignal) =>
      buscarProductosDocumento(
        getOrganizationId(),
        { texto, variante, sucursal, proveedor: proveedor?.id ?? null, conStock: f.conStock, soloProveedor: f.soloProveedor, sinServicios: destino === 'orden' },
        senal,
      ) as Promise<ProductoDocumento[]>,
    [variante, sucursal, proveedor?.id, destino],
  );
  const descripcion =
    variante === 'venta'
      ? t('subtituloVenta', { sucursal: nombreSucursal ?? '—' })
      : proveedor
        ? t('subtituloCompra', { proveedor: proveedor.nombre, sucursal: nombreSucursal ?? '—' })
        : t('subtituloCompraSinProveedor', { sucursal: nombreSucursal ?? '—' });

  return (
    <AgregarProductosDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      variante={variante}
      destino={destino}
      descripcion={descripcion}
      moneda={moneda}
      buscar={buscar}
      hayProveedor={!!proveedor}
      onAgregar={(p) => onAgregar(p as ProductoParaDocumento)}
      formularioCrear={
        sinCrear
          ? undefined
          : ({ texto, onCreado, onCancelar }) => (
              <FormularioRapidoProducto
                variante={variante}
                texto={texto}
                moneda={moneda}
                impuestos={impuestos}
                onCrear={(d) => crearProductoRapido(getOrganizationId(), variante, d, proveedor?.id ?? null, impuestos)}
                onCreado={onCreado}
                onCancelar={onCancelar}
              />
            )
      }
    />
  );
}
