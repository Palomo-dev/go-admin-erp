'use client';

/**
 * Líneas de la orden de compra con las piezas compartidas del documento
 * (docs/design/FACTURA-VENTA-FORMULARIO-V2.md, F3): la tabla `DocumentoLineas`
 * en edición y «Agregar productos a la orden» (`AgregarProductosDocumento`,
 * variante compra: costo del proveedor, «Solo del proveedor», stock y días de
 * entrega; sin servicios). Sustituye al buscador en línea
 * (`ProductSearchCombobox`) de la nueva y la edición de órdenes.
 *
 * La orden no lleva impuestos ni descuentos por línea (su contrato es
 * cantidad y costo); los seriales se siguen capturando con
 * `SerialCaptureSection` bajo la tabla.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { KbdButton, useAtajos } from '@/components/kit';
import { DocumentoLineas, type LineaDocumento } from '@/components/kit/documento';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { SerialCaptureSection } from '@/components/shared/SerialCaptureSection';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { cantidadInicialLinea } from '@/lib/services/documentos/cantidadLinea';
import type { ContextoMoneda } from '@/lib/utils/moneda';

export interface LineaOrden {
  id: string;
  product_id: number;
  productName: string;
  sku: string;
  image?: string | null;
  quantity: number;
  unit_cost: number;
  track_serial?: boolean;
  requires_serial?: boolean;
  serial_numbers?: string[];
  notes?: string;
  /** Producto por peso o medida: símbolo de la unidad («kg») y decimales de la cantidad (`cantidadLinea.ts`). */
  unidad?: string | null;
  decimalesCantidad?: number | null;
}

export interface LineasOrdenCompraProps {
  items: readonly LineaOrden[];
  onItemsChange: (items: LineaOrden[]) => void;
  proveedor: { id: number; nombre: string } | null;
  sucursal: number | null;
  nombreSucursal?: string | null;
  moneda: ContextoMoneda | string;
  /** Captura de seriales bajo la tabla (la nueva orden los pide; la edición no). */
  conSeriales?: boolean;
}

export function LineasOrdenCompra({ items, onItemsChange, proveedor, sucursal, nombreSucursal, moneda, conSeriales }: LineasOrdenCompraProps) {
  const t = useTranslations('kit.documentoEdicion');
  const [abierto, setAbierto] = useState(false);
  useAtajos([{ tecla: 'F3', descripcion: t('productos.tituloOrden'), accion: () => setAbierto(true), permitirEnCampo: true }], { activo: !abierto });

  const agregar = (p: ProductoParaDocumento) => {
    onItemsChange([
      ...items,
      {
        id: `temp-${Date.now()}-${p.id}`,
        product_id: p.id,
        productName: p.nombre,
        sku: p.sku ?? '',
        image: p.imagen,
        // El mínimo del proveedor, o 1; por peso o medida sin mínimo, vacía para escribir los kg.
        quantity: cantidadInicialLinea(p, p.minimoPedido),
        unit_cost: Number(p.precio) || 0,
        track_serial: p.serial,
        requires_serial: p.serial,
        serial_numbers: [],
        unidad: p.unidadVenta,
        decimalesCantidad: p.decimalesCantidad,
      },
    ]);
  };

  const lineas: LineaDocumento[] = items.map((i) => ({
    id: i.id,
    descripcion: i.productName,
    sku: i.sku || null,
    cantidad: i.quantity,
    unidad: i.unidad ?? null,
    decimalesCantidad: i.decimalesCantidad ?? null,
    precioUnitario: i.unit_cost,
    total: Math.round(i.quantity * i.unit_cost * 100) / 100,
    insignias: i.track_serial
      ? [
          {
            texto: t('lineas.seriales', { n: (i.serial_numbers ?? []).length, total: Math.floor(i.quantity) }),
            tono: (i.serial_numbers ?? []).length >= Math.floor(i.quantity) ? ('exito' as const) : ('advertencia' as const),
          },
        ]
      : undefined,
  }));

  return (
    <div className="flex flex-col gap-3">
      <DocumentoLineas
        lineas={lineas}
        modo="edicion"
        moneda={moneda}
        ocultar={['descuento', 'impuestos']}
        onCambiar={(id, c) =>
          onItemsChange(
            items.map((i) =>
              i.id === id
                ? {
                    ...i,
                    ...(c.cantidad !== undefined ? { quantity: c.cantidad } : {}),
                    ...(c.precioUnitario !== undefined ? { unit_cost: c.precioUnitario } : {}),
                  }
                : i,
            ),
          )
        }
        onQuitar={(id) => onItemsChange(items.filter((i) => i.id !== id))}
        vacio={{ titulo: t('productos.vacio'), descripcion: t('productos.vacioOrden') }}
        pie={
          <div className="flex flex-wrap items-center gap-2 p-3">
            <KbdButton variante="secundario" tamano="sm" atajo="F3" icono={Search} onClick={() => setAbierto(true)}>
              {t('productos.buscarOrden')}
            </KbdButton>
          </div>
        }
      />
      {conSeriales &&
        sucursal &&
        items
          .filter((i) => i.track_serial)
          .map((i) => (
            <div key={i.id} className="rounded-lg border border-line bg-subtle p-3">
              <SerialCaptureSection
                productId={i.product_id}
                productName={i.productName}
                productSku={i.sku}
                organizationId={getOrganizationId() || 0}
                branchId={sucursal}
                quantity={Math.floor(i.quantity)}
                serials={i.serial_numbers || []}
                onSerialsChange={(serials) => onItemsChange(items.map((x) => (x.id === i.id ? { ...x, serial_numbers: serials } : x)))}
                compact
              />
            </div>
          ))}
      <AgregarProductosDocumento
        abierto={abierto}
        onAbiertoChange={setAbierto}
        variante="compra"
        destino="orden"
        sucursal={sucursal}
        nombreSucursal={nombreSucursal}
        proveedor={proveedor}
        moneda={moneda}
        impuestos={[]}
        onAgregar={agregar}
      />
    </div>
  );
}
