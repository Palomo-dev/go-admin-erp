'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/utils/Utils';
import { CodigoBarras } from './CodigoBarras';
import type { CamposEtiqueta, DatosEtiqueta } from '@/lib/utils/etiquetasImpresion';

/**
 * `Doc/Etiqueta de producto` (Figma `511:257339`, Formato × Precio): nombre
 * (hasta dos líneas), variante, código de barras con su número y, al pie, SKU
 * a la izquierda y precio a la derecha (con el de comparación tachado).
 *
 * Mide en milímetros reales: la misma pieza sirve a la vista previa (escalada
 * por quien la contiene) y a la página de impresión (`@page`). Las letras
 * crecen con la etiqueta, tomando la de carta (63,5 × 33,9 mm) como base.
 * Es papel: blanco y negro fijos.
 */
export interface EtiquetaProductoProps {
  datos: Omit<DatosEtiqueta, 'productId'> | null;
  campos: CamposEtiqueta;
  anchoMm: number;
  altoMm: number;
  textoSinCodigo: string;
  textoInvalido?: string;
  /** Borde punteado de corte (vista previa); en la hoja troquelada no se imprime. */
  guia?: boolean;
  className?: string;
  style?: CSSProperties;
  onListo?: () => void;
}

export function EtiquetaProducto({
  datos,
  campos,
  anchoMm,
  altoMm,
  textoSinCodigo,
  textoInvalido,
  guia = false,
  className,
  style,
  onListo,
}: EtiquetaProductoProps) {
  const k = Math.max(0.6, Math.min(anchoMm / 63.5, altoMm / 33.9));
  const mm = (n: number) => `${(n * k).toFixed(2)}mm`;
  const caja: CSSProperties = {
    width: `${anchoMm}mm`,
    height: `${altoMm}mm`,
    padding: `${mm(1.8)} ${mm(2.4)}`,
    ...style,
  };

  if (!datos) {
    return <div aria-hidden="true" className={cn('box-border overflow-hidden bg-white', guia && 'outline-dashed outline-[0.2mm] outline-black/15', className)} style={caja} />;
  }

  const hayPie = (campos.sku && datos.sku) || (campos.precio && datos.precio);

  return (
    <div
      className={cn(
        'box-border flex flex-col overflow-hidden bg-white text-black',
        guia && 'outline-dashed outline-[0.2mm] outline-black/15',
        className,
      )}
      style={caja}
    >
      {campos.nombre && (
        <p className="line-clamp-2 font-semibold leading-[1.15]" style={{ fontSize: mm(2.9) }}>
          {datos.nombre}
        </p>
      )}
      {campos.variante && datos.variante && (
        <p className="truncate leading-tight text-black/70" style={{ fontSize: mm(2.2), marginTop: mm(0.3) }}>
          {datos.variante}
        </p>
      )}
      {campos.codigo && (
        <div className="flex min-h-0 flex-1 items-stretch" style={{ marginTop: mm(0.8), marginBottom: hayPie ? mm(0.6) : 0 }}>
          <CodigoBarras
            valor={datos.codigo}
            textoSinCodigo={textoSinCodigo}
            textoInvalido={textoInvalido}
            tamanoTexto={mm(2.1)}
            onListo={onListo}
          />
        </div>
      )}
      {!campos.codigo && <div className="flex-1" />}
      {hayPie && (
        <div className="flex items-end justify-between gap-[1mm] leading-none">
          <span className="truncate font-mono text-black/70" style={{ fontSize: mm(2) }}>
            {campos.sku ? datos.sku : ''}
          </span>
          {campos.precio && datos.precio && (
            <span className="flex shrink-0 items-baseline gap-[0.8mm]">
              {campos.precioComparacion && datos.precioComparacion && (
                <s className="text-black/60" style={{ fontSize: mm(2.1) }}>
                  {datos.precioComparacion}
                </s>
              )}
              <strong className="font-bold tabular-nums" style={{ fontSize: mm(3.6) }}>
                {datos.precio}
              </strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
