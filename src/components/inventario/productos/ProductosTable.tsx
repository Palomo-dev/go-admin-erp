"use client";

import React from 'react';
import Link from 'next/link';
import { Layers, Package, SlidersHorizontal, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DataTable,
  ListCard,
  MarcadorSinFoto,
  RowActionsMenu,
  StatusBadge,
  type AccionFila,
  type ColumnaTabla,
  type DataTableProps,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { useOrgCurrency, formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { margenDe, nivelDeCantidad, nivelStock, rutaImagenPrincipal } from './catalogoVista';
import { nivelesDe } from './stockVisible';
import type { Producto } from './types';

/**
 * Tabla del catálogo sobre el `DataTable` del kit (Figma «Catálogo de
 * productos», `09-catalogo-escritorio.png`): miniatura · Código · Nombre ·
 * Atributos · Categoría · Precio · Costo · Margen · Stock · Estado · «⋮».
 * En móvil (< lg) cada producto es una `ListCard` Inicio=imagen (foto de 48
 * o marcador), «código · categoría», existencias por sucursal, precio y estado.
 *
 * Vista «Tarjetas» (Figma «Escritorio / Catálogo · cuadrícula» `120:13625`,
 * `ViewToggle` + `ProductCard` del catálogo): desde `lg`, una cuadrícula de
 * tarjetas con selección, menú ⋮, estado sobre la imagen, «código ·
 * categoría», precio con la comparación tachada y existencias por sucursal. En
 * móvil sigue la lista de `ListCard` (Figma no dibuja cuadrícula móvil). Los
 * estados cargando / vacío / error los pinta siempre el `DataTable`.
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
  /** `tarjetas` = cuadrícula en escritorio. Por defecto la tabla. */
  vista?: 'tarjetas' | 'lista';
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
  const t = useTranslations('productos.tabla');
  const url = React.useMemo(() => urlImagen(rutaImagenPrincipal(producto)), [producto]);
  const [fallo, setFallo] = React.useState(false);
  React.useEffect(() => setFallo(false), [url]);

  if (!url || fallo) {
    return (
      <div className="flex size-10 items-center justify-center rounded-lg border border-line bg-subtle text-fg-muted">
        <Package aria-hidden="true" className="size-4" strokeWidth={1.5} />
        <span className="sr-only">{t('sinImagen')}</span>
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
  const t = useTranslations('productos.tabla');
  const entero = useFormatoEntero();
  if (producto.track_stock === false) {
    return (
      <Badge tono="neutro" tamano="sm">
        {t('sinSeguimiento')}
      </Badge>
    );
  }
  const nombre = (id: number) => branches.find((b) => b.id === id)?.name || `#${id}`;
  const conVariantes = (producto.children?.length ?? 0) > 0 ? 'si' : 'no';
  const niveles = nivelesDe(producto).filter((sl) => branchFilter === null || sl.branch_id === branchFilter);

  const chips: { id: number | string; texto: string; qty: number; minimo: number }[] =
    niveles.length > 0
      ? niveles.map((sl) => ({
          id: sl.branch_id,
          texto: nombre(sl.branch_id),
          qty: Number(sl.qty_on_hand) || 0,
          minimo: Number(sl.min_level) || 0,
        }))
      : branchFilter !== null
        ? [{ id: branchFilter, texto: nombre(branchFilter), qty: 0, minimo: 0 }]
        : [{ id: 'total', texto: t('total'), qty: producto.stock ?? 0, minimo: 0 }];

  const tono = (qty: number, minimo: number) => TONO_STOCK[nivelDeCantidad(qty, minimo)];
  const visibles = chips.slice(0, max);
  const resto = chips.slice(max);

  const contenido = (
    <>
      {visibles.map((c) => (
        <Badge
          key={c.id}
          tono={tono(c.qty, c.minimo)}
          tamano="sm"
          title={t('stockTitulo', {
            sucursal: c.texto,
            count: c.qty,
            n: entero(c.qty),
            conMinimo: c.minimo > 0 ? 'si' : 'no',
            minimo: entero(c.minimo),
            conVariantes,
          })}
          className="max-w-[min(140px,100%)]"
        >
          <span className="truncate">{c.texto}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{entero(c.qty)}</span>
        </Badge>
      ))}
      {resto.length > 0 && (
        <Badge tono="neutro" tamano="sm" title={resto.map((c) => t('stockCorto', { sucursal: c.texto, n: entero(c.qty) })).join(' · ')}>
          +{resto.length}
        </Badge>
      )}
    </>
  );
  return suelto ? contenido : <div className="flex flex-wrap items-center gap-1">{contenido}</div>;
}

function Atributos({ producto }: { producto: Producto }) {
  const t = useTranslations('productos.tabla');
  const entero = useFormatoEntero();
  const variantes = producto.children?.length ?? 0;
  const modificadores = producto.modifier_groups_count ?? 0;
  if (producto.product_type !== 'service' && variantes === 0 && modificadores === 0) return null;
  return (
    <>
      {producto.product_type === 'service' && (
        <Badge tono="neutro" tamano="sm" icono={Wrench}>
          {t('servicio')}
        </Badge>
      )}
      {variantes > 0 && (
        <Badge tono="neutro" tamano="sm" icono={Layers} title={t('variantes', { count: variantes, n: entero(variantes) })}>
          {t('variantesCorto', { n: entero(variantes) })}
        </Badge>
      )}
      {modificadores > 0 && (
        <Badge
          tono="neutro"
          tamano="sm"
          icono={SlidersHorizontal}
          title={t('modificadores', { count: modificadores, n: entero(modificadores) })}
        >
          {t('modificadoresCorto', { n: entero(modificadores) })}
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

/** Imagen de la tarjeta de la cuadrícula: foto o marcador (nunca un recuadro vacío). */
function ImagenTarjeta({ producto, onFallo }: { producto: Producto; onFallo: (id: string) => void }) {
  const url = React.useMemo(() => urlImagen(rutaImagenPrincipal(producto)), [producto]);
  const [fallo, setFallo] = React.useState(false);
  React.useEffect(() => setFallo(false), [url]);
  if (!url || fallo) return <MarcadorSinFoto nombre={producto.name} conInicial={false} className="size-full" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imágenes de Storage con dominios variables
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-full object-cover"
      onError={() => {
        setFallo(true);
        onFallo(String(producto.id));
      }}
    />
  );
}

interface TarjetaCatalogoProps {
  producto: Producto;
  acciones: readonly AccionFila[];
  seleccionado: boolean;
  onSeleccionar?: (marcado: boolean) => void;
  onVer: () => void;
  precio: (v: number) => string;
  branchFilter: number | null;
  branches: ReadonlyArray<{ id?: number; name: string }>;
  onImagenFallida: (id: string) => void;
}

/** Tarjeta de la cuadrícula del catálogo (Figma `ProductCard` del catálogo, 264 × 328). */
function TarjetaCatalogo({
  producto: p,
  acciones,
  seleccionado,
  onSeleccionar,
  onVer,
  precio,
  branchFilter,
  branches,
  onImagenFallida,
}: TarjetaCatalogoProps) {
  const t = useTranslations('productos.tabla');
  const comparacion =
    typeof p.compare_price === 'number' && typeof p.price === 'number' && p.compare_price > p.price ? p.compare_price : null;
  const n = nivelStock(p, branchFilter);
  const borde = seleccionado ? 'border-line-brand ring-2 ring-brand/30' : n === 'sin' ? 'border-line-danger' : 'border-line';
  return (
    <li className={`group relative flex flex-col overflow-hidden rounded-xl border bg-surface transition-shadow hover:shadow-md ${borde}`}>
      <div className="relative h-36 bg-subtle">
        <ImagenTarjeta producto={p} onFallo={onImagenFallida} />
        {onSeleccionar && (
          <span className="absolute left-2 top-2 z-10 flex rounded bg-surface/90">
            <Checkbox
              checked={seleccionado}
              onCheckedChange={(v) => onSeleccionar(v === true)}
              aria-label={t('seleccionar', { nombre: p.name })}
              className="size-[18px] rounded"
            />
          </span>
        )}
        {acciones.length > 0 && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-surface/90">
            <RowActionsMenu acciones={acciones} titulo={p.name} />
          </span>
        )}
        <span className="absolute bottom-2 left-2">
          <StatusBadge estado={p.status} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* El enlace cubre toda la tarjeta (after:inset-0); casilla, menú y chips van por encima. */}
        <Link
          href={hrefDetalle(p)}
          onClick={(e) => {
            e.preventDefault();
            onVer();
          }}
          title={p.name}
          className="truncate font-medium text-fg after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {p.name}
        </Link>
        <p className="truncate text-xs text-fg-secondary">{[p.sku, p.category?.name].filter(Boolean).join(' · ') || '—'}</p>
        <p className="flex items-baseline gap-2">
          {typeof p.price === 'number' && p.price > 0 ? (
            <span className="text-base font-semibold tabular-nums text-fg">{precio(p.price)}</span>
          ) : (
            <span className="text-sm text-fg-muted">{t('sinPrecio')}</span>
          )}
          {comparacion !== null && <span className="text-xs tabular-nums text-fg-muted line-through">{precio(comparacion)}</span>}
        </p>
        <div className="relative z-10 mt-auto flex flex-wrap items-center gap-1 pt-1">
          <StockSucursales producto={p} branchFilter={branchFilter} branches={branches} suelto />
          <Atributos producto={p} />
        </div>
      </div>
    </li>
  );
}

const ProductosTable: React.FC<ProductosTableProps> = ({
  productos,
  acciones,
  onVer,
  branchFilter,
  branches,
  onImagenFallida,
  vista = 'lista',
  ...tabla
}) => {
  const t = useTranslations('productos.tabla');
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
              title={t('precioAntes', { precio: precio(comparacion), descuento: String(Math.round((1 - producto.price / comparacion) * 100)) })}
            >
              {precio(comparacion)}
            </span>
          )}
        </div>
      );
    },
    [precio, t],
  );

  const columnas = React.useMemo<ColumnaTabla<Producto>[]>(
    () => [
      {
        id: 'imagen',
        encabezado: t('columnas.imagen'),
        ancho: 56,
        className: 'pr-0',
        celda: (p) => <Miniatura producto={p} onFallo={onImagenFallida} />,
      },
      { id: 'sku', encabezado: t('columnas.codigo'), variante: 'mono', ordenable: true, celda: (p) => p.sku || '—' },
      {
        id: 'nombre',
        encabezado: t('columnas.nombre'),
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
        encabezado: t('columnas.atributos'),
        ocultarDebajo: 'xl',
        celda: (p) => (
          <div className="flex flex-wrap items-center gap-1">
            <Atributos producto={p} />
          </div>
        ),
      },
      {
        id: 'categoria',
        encabezado: t('columnas.categoria'),
        ordenable: true,
        className: 'max-w-[180px]',
        celda: (p) => <span className="block truncate text-fg-secondary">{p.category?.name || '—'}</span>,
      },
      { id: 'precio', encabezado: t('columnas.precio'), variante: 'importe', ordenable: true, celda: celdaPrecio },
      {
        id: 'costo',
        encabezado: t('columnas.costo'),
        variante: 'importe',
        ocultarDebajo: 'xl',
        celda: (p) => (typeof p.cost === 'number' && p.cost > 0 ? precio(p.cost) : <span className="text-fg-muted">—</span>),
      },
      { id: 'margen', encabezado: t('columnas.margen'), alinear: 'derecha', ordenable: true, celda: (p) => <Margen producto={p} /> },
      {
        id: 'stock',
        encabezado: t('columnas.stock'),
        ordenable: true,
        celda: (p) => <StockSucursales producto={p} branchFilter={branchFilter} branches={branches} />,
      },
      { id: 'estado', encabezado: t('columnas.estado'), ordenable: true, celda: (p) => <StatusBadge estado={p.status} /> },
    ],
    [celdaPrecio, branchFilter, branches, onImagenFallida, precio, t],
  );

  const tablaCompleta = (
    <DataTable<Producto>
      etiqueta={t('etiqueta')}
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
      sinResultados={{ descripcion: t('sinResultados') }}
      error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
      {...tabla}
    />
  );

  // Cuadrícula solo con datos: cargando, vacío, sin resultados y error los pinta el DataTable.
  if (vista !== 'tarjetas' || (tabla.estado ?? 'listo') !== 'listo' || productos.length === 0) return tablaCompleta;

  const seleccion = tabla.seleccion;
  const onSeleccionChange = tabla.onSeleccionChange;
  const alternar = (id: string, marcado: boolean) => {
    if (!onSeleccionChange) return;
    const siguiente = new Set(seleccion ?? []);
    if (marcado) siguiente.add(id);
    else siguiente.delete(id);
    onSeleccionChange(siguiente);
  };

  return (
    <>
      <div className="lg:hidden">{tablaCompleta}</div>
      <div className="hidden flex-col gap-4 lg:flex">
        <ul aria-label={t('etiqueta')} className="grid grid-cols-3 gap-4 xl:grid-cols-4">
          {productos.map((p) => {
            const id = String(p.id);
            return (
              <TarjetaCatalogo
                key={id}
                producto={p}
                acciones={acciones(p)}
                seleccionado={!!seleccion?.has(id)}
                onSeleccionar={onSeleccionChange ? (marcado) => alternar(id, marcado) : undefined}
                onVer={() => onVer(p)}
                precio={precio}
                branchFilter={branchFilter}
                branches={branches}
                onImagenFallida={onImagenFallida}
              />
            );
          })}
        </ul>
        {tabla.pie}
      </div>
    </>
  );
};

export default ProductosTable;
