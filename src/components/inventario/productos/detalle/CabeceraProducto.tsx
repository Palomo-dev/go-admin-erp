'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ImageOff, Package } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { StatusBadge } from '@/components/kit';
import { getPublicUrl, type ProductImageType } from '@/lib/supabase/imageUtils';
import { useProductoDetalle } from './ContextoProducto';

/**
 * Galería de la cabecera (Figma `Producto — Cabecera`, A.2 #1-#5): principal,
 * hasta 5 miniaturas con anillo en la elegida, «+N» / «−». La usa el Resumen
 * en escritorio y la cabecera móvil (tira desplazable).
 */
export function GaleriaProducto({
  imagenes,
  tira = false,
  className,
}: {
  imagenes: readonly ProductImageType[];
  /** Móvil: tira horizontal de miniaturas grandes. */
  tira?: boolean;
  className?: string;
}) {
  const tg = useTranslations('productoDetalle.galeria');
  const [elegida, setElegida] = useState(0);
  const [todas, setTodas] = useState(false);
  const [fallidas, setFallidas] = useState<Set<string>>(new Set());

  const ordenadas = [...imagenes].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0));
  const url = (i: ProductImageType) => getPublicUrl(i.storage_path);
  const marcarFallida = (ruta: string) => setFallidas((s) => new Set(s).add(ruta));

  const Imagen = ({ img, clase }: { img: ProductImageType; clase: string }) =>
    fallidas.has(img.storage_path) ? (
      <div className={cn('flex items-center justify-center bg-subtle text-fg-muted', clase)}>
        <ImageOff className="size-5" aria-hidden />
      </div>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- imágenes públicas del bucket; next/image exige dominios fijos
      <img src={url(img)} alt={img.alt_text || ''} onError={() => marcarFallida(img.storage_path)} className={cn('object-cover', clase)} />
    );

  if (ordenadas.length === 0) {
    return (
      <div className={cn('flex aspect-square w-full max-w-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-subtle text-fg-muted', tira && 'h-20 w-20', className)}>
        <Package className="size-8" aria-hidden />
        {!tira && <span className="text-xs">{tg('sinImagenes')}</span>}
      </div>
    );
  }

  if (tira) {
    return (
      <div className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]', className)} aria-label={tg('etiqueta')}>
        {ordenadas.map((img, i) => (
          <div key={img.id ?? img.storage_path} className={cn('size-20 shrink-0 overflow-hidden rounded-lg border', i === 0 ? 'border-line-brand' : 'border-line')}>
            <Imagen img={img} clase="size-full" />
          </div>
        ))}
      </div>
    );
  }

  const actual = ordenadas[Math.min(elegida, ordenadas.length - 1)];
  const visibles = todas ? ordenadas : ordenadas.slice(0, 5);
  const resto = ordenadas.length - 5;

  return (
    <div className={cn('flex w-full max-w-[200px] flex-col gap-2', className)}>
      <div className="aspect-square w-full overflow-hidden rounded-xl border border-line bg-subtle">
        <Imagen img={actual} clase="size-full" />
      </div>
      {ordenadas.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tg('etiqueta')}>
          {visibles.map((img, i) => (
            <button
              key={img.id ?? img.storage_path}
              type="button"
              onClick={() => setElegida(i)}
              aria-label={tg('verImagen', { n: i + 1 })}
              aria-pressed={i === elegida}
              className={cn(
                'size-8 overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                i === elegida ? 'border-line-brand ring-2 ring-brand' : 'border-line',
              )}
            >
              <Imagen img={img} clase="size-full" />
            </button>
          ))}
          {resto > 0 && (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              aria-label={todas ? tg('verMenos') : tg('verMas', { n: resto })}
              className="flex h-8 min-w-8 items-center justify-center rounded-md border border-line px-1.5 text-xs font-medium text-fg-secondary hover:bg-hover"
            >
              {todas ? '−' : `+${resto}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Cabecera móvil (Figma `Producto — Cabecera`, móvil): tira de imágenes,
 * nombre con estado, metadatos, impuestos como chips y acciones. En escritorio
 * no se pinta: manda el `PageHeader`.
 */
export function CabeceraMovilProducto({ imagenes, acciones }: { imagenes: readonly ProductImageType[]; acciones: ReactNode }) {
  const t = useTranslations('productoDetalle');
  const { producto } = useProductoDetalle();
  const preferido = producto.product_suppliers?.find((s) => s.is_preferred);
  const impuestos = (producto.product_tax_relations ?? []).map((r) => r.organization_taxes).filter(Boolean);

  const Dato = ({ etiqueta, valor, mono }: { etiqueta: string; valor: ReactNode; mono?: boolean }) => (
    <span className="whitespace-nowrap">
      <span className="text-fg-secondary">{etiqueta}: </span>
      <span className={cn('font-medium text-fg', mono && 'font-mono')}>{valor}</span>
    </span>
  );

  return (
    <section className="flex flex-col gap-3 lg:hidden" aria-label={t('cabecera.etiqueta')}>
      <GaleriaProducto imagenes={imagenes} tira />
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold leading-6 text-fg">{producto.name}</h2>
        <StatusBadge estado={producto.status} etiqueta={t(`estado.${['active', 'inactive', 'discontinued', 'deleted'].includes(producto.status) ? producto.status : 'inactive'}`)} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
        <Dato etiqueta={t('meta.sku')} valor={producto.sku} mono />
        <Dato etiqueta={t('meta.categoria')} valor={producto.categories?.name ?? t('meta.sinCategoria')} />
        {producto.unit_code && <Dato etiqueta={t('meta.unidad')} valor={producto.unit_code} />}
        <Dato etiqueta={t('meta.tipo')} valor={producto.product_type === 'service' ? t('meta.servicio') : t('meta.producto')} />
        {producto.brand && <Dato etiqueta={t('meta.marca')} valor={producto.brand} />}
        {producto.reference && <Dato etiqueta={t('meta.referencia')} valor={producto.reference} />}
        <Dato etiqueta={t('meta.proveedor')} valor={preferido?.supplier?.name ?? t('meta.sinProveedor')} />
      </div>
      {impuestos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-fg-secondary">{t('meta.impuestos')}:</span>
          {impuestos.map((imp) => (
            <span key={imp!.id} className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-fg">
              {imp!.name} {Number(imp!.rate)} %
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 [&>*:first-child]:flex-1 [&>a]:flex-1">{acciones}</div>
    </section>
  );
}
