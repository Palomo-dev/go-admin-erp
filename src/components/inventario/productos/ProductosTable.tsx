"use client";

import React from 'react';
import Link from 'next/link';
import { Layers, Package, SlidersHorizontal, Wrench } from 'lucide-react';

import { DataTable, ListCard, StatusBadge, type AccionFila, type ColumnaTabla, type DataTableProps } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { useOrgCurrency, formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
import { margenDe, nivelStock, rutaImagenPrincipal } from './catalogoVista';
import { nivelesDe } from './stockVisible';
import type { Producto } from './types';

/**
 * Tabla del catálogo sobre el `DataTable` del kit (Figma «Catálogo de
 * productos», `09-catalogo-escritorio.png`): miniatura · Código · Nombre ·
 * Atributos · Categoría · Precio · Costo · Margen · Stock · Estado · «⋮».
 * En móvil (< lg) cada producto es una `ListCard` Inicio=imagen (foto de 48
 * o marcador), «código · categoría», existencias por sucursal, precio y estado.
 *
 * No carga nada: recibe la página ya filtrada y ordenada de `CatalogoProductos`.
 */
export interface ProductosTableProps
  extends Pick<
    DataTableProps<Producto>,
    'estado' | 'orden' | 'onOrdenar' | 'seleccion' | 'onSeleccionChange' | 'pie' | 'onReintentar' | 'onLimpiarFiltros' | 'termino' | 'vacio'
  > {
  productos: readonly Producto[];
  acciones: (producto: Producto) => readonly AccionFila[];
  onVer: (producto: Producto) => void;
  branchFilter: number | null;
  branches: ReadonlyArray<{ id?: number; name: string }>;
  /** La imagen principal no cargó (URL rota): cuenta como «sin imagen» en el filtro. */
  onImagenFallida: (productoId: string) => void;
}

/** URL pública de la imagen principal (misma regla de buckets que antes). */
function urlImagen(ruta: string | null): string | null {
  if (!ruta) return null;
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) return ruta;
  const bucket = ruta.startsWith('products/') || ruta.startsWith('productos/') ? 'product-images' : 'organization_images';
  return supabase.storage.from(bucket).getPublicUrl(ruta).data?.publicUrl ?? null;
}

const hrefDetalle = (p: Producto) => `/app/inventario/productos/${p.uuid || p.id}`;

function Miniatura({ producto, onFallo }: { producto: Producto; onFallo: (id: string) => void }) {
  const url = React.useMemo(() => urlImagen(rutaImagenPrincipal(producto)), [producto]);
  const [fallo, setFallo] = React.useState(false);
  React.useEffect(() => setFallo(false), [url]);

  if (!url || fallo) {
    return (
      <div className="flex size-10 items-center justify-center rounded-lg border border-line bg-subtle text-fg-muted">
        <Package aria-hidden="true" className="size-4" strokeWidth={1.5} />
        <span className="sr-only">Sin imagen</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniaturas de Storage con dominios variables
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-10 rounded-lg border border-line bg-subtle object-cover"
      onError={() => {
        setFallo(true);
        onFallo(String(producto.id));
      }}
    />
  );
}

const TONO_STOCK = { sin: 'peligro', bajo: 'advertencia', con: 'exito' } as const;

/** Chips «Principal · 12» por sucursal (padre + variantes sumados). */
function StockSucursales({
  producto,
  branchFilter,
  branches,
  max = 2,
  suelto = false,
}: {
  producto: Producto;
  branchFilter: number | null;
  branches: ReadonlyArray<{ id?: number; name: string }>;
  max?: number;
  /** Tarjeta móvil: sin contenedor propio; los chips van sueltos en la fila de etiquetas, que envuelve. */
  suelto?: boolean;
}) {
  if (producto.track_stock === false) {
    return (
      <Badge tono="neutro" tamano="sm">
        Sin seguimiento
      </Badge>
    );
  }
  const nombre = (id: number) => branches.find((b) => b.id === id)?.name || `#${id}`;
  const conVariantes = (producto.children?.length ?? 0) > 0 ? ' (producto y variantes)' : '';
  const niveles = nivelesDe(producto).filter((sl) => branchFilter === null || sl.branch_id === branchFilter);

  const chips: { id: number | string; texto: string; qty: number }[] =
    niveles.length > 0
      ? niveles.map((sl) => ({ id: sl.branch_id, texto: nombre(sl.branch_id), qty: Number(sl.qty_on_hand) || 0 }))
      : branchFilter !== null
        ? [{ id: branchFilter, texto: nombre(branchFilter), qty: 0 }]
        : [{ id: 'total', texto: 'Total', qty: producto.stock ?? 0 }];

  const tono = (qty: number) => TONO_STOCK[qty <= 0 ? 'sin' : qty < 5 ? 'bajo' : 'con'];
  const visibles = chips.slice(0, max);
  const resto = chips.slice(max);

  const contenido = (
    <>
      {visibles.map((c) => (
        <Badge
          key={c.id}
          tono={tono(c.qty)}
          tamano="sm"
          title={`${c.texto}: ${c.qty} unidades${conVariantes}`}
          className="max-w-[min(140px,100%)]"
        >
          <span className="truncate">{c.texto}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{c.qty.toLocaleString('es-CO')}</span>
        </Badge>
      ))}
      {resto.length > 0 && (
        <Badge tono="neutro" tamano="sm" title={resto.map((c) => `${c.texto}: ${c.qty}`).join(' · ')}>
          +{resto.length}
        </Badge>
      )}
    </>
  );
  return suelto ? contenido : <div className="flex flex-wrap items-center gap-1">{contenido}</div>;
}

function Atributos({ producto }: { producto: Producto }) {
  const variantes = producto.children?.length ?? 0;
  const modificadores = producto.modifier_groups_count ?? 0;
  if (producto.product_type !== 'service' && variantes === 0 && modificadores === 0) return null;
  return (
    <>
      {producto.product_type === 'service' && (
        <Badge tono="neutro" tamano="sm" icono={Wrench}>
          Servicio
        </Badge>
      )}
      {variantes > 0 && (
        <Badge tono="neutro" tamano="sm" icono={Layers} title={`${variantes} ${variantes === 1 ? 'variante' : 'variantes'}`}>
          {variantes} var.
        </Badge>
      )}
      {modificadores > 0 && (
        <Badge
          tono="neutro"
          tamano="sm"
          icono={SlidersHorizontal}
          title={`${modificadores} ${modificadores === 1 ? 'grupo de modificadores' : 'grupos de modificadores'}`}
        >
          {modificadores} modif.
        </Badge>
      )}
    </>
  );
}

function Margen({ producto }: { producto: Producto }) {
  const m = margenDe(producto);
  if (m === null) return <span className="text-fg-muted">—</span>;
  const tono = m >= 30 ? 'exito' : m >= 10 ? 'advertencia' : 'peligro';
  return (
    <Badge tono={tono} tamano="sm" className="tabular-nums">
      {Math.round(m)} %
    </Badge>
  );
}

const ProductosTable: React.FC<ProductosTableProps> = ({
  productos,
  acciones,
  onVer,
  branchFilter,
  branches,
  onImagenFallida,
  ...tabla
}) => {
  const moneda = useOrgCurrency();
  const precio = React.useCallback((v: number) => formatMonedaSinDecimales(v, moneda), [moneda]);

  const celdaPrecio = React.useCallback(
    (producto: Producto) => {
      if (typeof producto.price !== 'number' || producto.price <= 0) return <span className="text-fg-muted">—</span>;
      const comparacion =
        typeof producto.compare_price === 'number' && producto.compare_price > producto.price ? producto.compare_price : null;
      return (
        <div className="flex flex-col items-end leading-tight">
          <span className="font-medium text-fg">{precio(producto.price)}</span>
          {comparacion !== null && (
            <span
              className="text-xs text-fg-muted line-through"
              title={`Antes ${precio(comparacion)} · ${Math.round((1 - producto.price / comparacion) * 100)} % de descuento`}
            >
              {precio(comparacion)}
            </span>
          )}
        </div>
      );
    },
    [precio],
  );

  const columnas = React.useMemo<ColumnaTabla<Producto>[]>(
    () => [
      {
        id: 'imagen',
        encabezado: 'Imagen',
        ancho: 56,
        className: 'pr-0',
        celda: (p) => <Miniatura producto={p} onFallo={onImagenFallida} />,
      },
      { id: 'sku', encabezado: 'Código', variante: 'mono', ordenable: true, celda: (p) => p.sku || '—' },
      {
        id: 'nombre',
        encabezado: 'Nombre',
        ordenable: true,
        className: 'max-w-[280px]',
        celda: (p) => (
          <Link
            href={hrefDetalle(p)}
            onClick={(e) => e.stopPropagation()}
            title={p.name}
            className="block truncate font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {p.name}
          </Link>
        ),
      },
      {
        id: 'atributos',
        encabezado: 'Atributos',
        ocultarDebajo: 'xl',
        celda: (p) => (
          <div className="flex flex-wrap items-center gap-1">
            <Atributos producto={p} />
          </div>
        ),
      },
      {
        id: 'categoria',
        encabezado: 'Categoría',
        ordenable: true,
        className: 'max-w-[180px]',
        celda: (p) => <span className="block truncate text-fg-secondary">{p.category?.name || '—'}</span>,
      },
      { id: 'precio', encabezado: 'Precio', variante: 'importe', ordenable: true, celda: celdaPrecio },
      {
        id: 'costo',
        encabezado: 'Costo',
        variante: 'importe',
        ocultarDebajo: 'xl',
        celda: (p) => (typeof p.cost === 'number' && p.cost > 0 ? precio(p.cost) : <span className="text-fg-muted">—</span>),
      },
      { id: 'margen', encabezado: 'Margen', alinear: 'derecha', ordenable: true, celda: (p) => <Margen producto={p} /> },
      {
        id: 'stock',
        encabezado: 'Stock',
        ordenable: true,
        celda: (p) => <StockSucursales producto={p} branchFilter={branchFilter} branches={branches} />,
      },
      { id: 'estado', encabezado: 'Estado', ordenable: true, celda: (p) => <StatusBadge estado={p.status} /> },
    ],
    [celdaPrecio, branchFilter, branches, onImagenFallida, precio],
  );

  return (
    <DataTable<Producto>
      etiqueta="Catálogo de productos"
      columnas={columnas}
      filas={productos}
      obtenerId={(p) => String(p.id)}
      etiquetaFila={(p) => p.name}
      onFilaClick={onVer}
      acciones={acciones}
      tonoFila={(p) => {
        const n = nivelStock(p, branchFilter);
        return n === 'sin' ? 'peligro' : n === 'bajo' ? 'advertencia' : undefined;
      }}
      tarjetaMovil={(p, ctx) => (
        <ListCard
          imagen={{ src: urlImagen(rutaImagenPrincipal(p)), onError: () => onImagenFallida(String(p.id)) }}
          titulo={p.name}
          subtitulo={[p.sku, p.category?.name].filter(Boolean).join(' · ') || undefined}
          // Existencias por sucursal y atributos: badges sm que envuelven, nunca desbordan.
          etiquetas={
            <>
              <StockSucursales producto={p} branchFilter={branchFilter} branches={branches} suelto />
              <Atributos producto={p} />
            </>
          }
          valor={typeof p.price === 'number' && p.price > 0 ? precio(p.price) : undefined}
          estado={<StatusBadge estado={p.status} />}
          onClick={() => onVer(p)}
          acciones={acciones(p)}
          seleccionable={ctx.modoSeleccion}
          seleccionado={ctx.seleccionado}
          onSeleccionChange={ctx.alternar}
        />
      )}
      sinResultados={{ descripcion: 'Prueba con otra búsqueda o quita algún filtro.' }}
      error={{ titulo: 'No se pudo cargar el catálogo', descripcion: 'Revisa la conexión e inténtalo de nuevo.' }}
      {...tabla}
    />
  );
};

export default ProductosTable;
