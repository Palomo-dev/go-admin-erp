import JsBarcode from 'jsbarcode';
import type { ProductLabelsPrintPayload } from '@printing/labels';
import { formatoJsBarcode } from '@/lib/utils/codigoBarras';
import {
  CLAVE_TRABAJO_ETIQUETAS,
  normalizarCantidad,
  type CamposEtiqueta,
  type DatosEtiqueta,
  type TrabajoImpresionEtiquetas,
} from '@/lib/utils/etiquetasImpresion';

/**
 * Salidas del diálogo «Imprimir etiquetas»: el trabajo que lee la página de
 * impresión del navegador y el payload de la estación (`print_jobs`).
 */

/** Guarda el trabajo para la página `/imprimir/etiquetas` y devuelve su clave. */
export function guardarTrabajo(trabajo: Omit<TrabajoImpresionEtiquetas, 'version' | 'creadoEn'>): string | null {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    // Limpia trabajos viejos que una pestaña cerrada dejó sin leer.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(CLAVE_TRABAJO_ETIQUETAS)) continue;
      const creado = Number(JSON.parse(localStorage.getItem(k) ?? '{}').creadoEn) || 0;
      if (Date.now() - creado > 60 * 60 * 1000) localStorage.removeItem(k);
    }
    const completo: TrabajoImpresionEtiquetas = { ...trabajo, version: 1, creadoEn: Date.now() };
    localStorage.setItem(`${CLAVE_TRABAJO_ETIQUETAS}${id}`, JSON.stringify(completo));
    return id;
  } catch {
    return null;
  }
}

/** SVG de las barras para la impresora del sistema de la estación (sin DOM visible). */
function svgDe(codigo: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, codigo, {
      format: formatoJsBarcode(codigo),
      displayValue: false,
      margin: 0,
      height: 60,
      width: 2,
      background: '#ffffff',
      lineColor: '#000000',
    });
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if (w && h) {
      svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
      svg.setAttribute('preserveAspectRatio', 'none');
    }
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return svg.outerHTML;
  } catch {
    return null;
  }
}

/** Payload `product_label`: una entrada por producto con sus copias. */
export function payloadEstacion(
  filas: readonly { datos: DatosEtiqueta; cantidad: number }[],
  campos: CamposEtiqueta,
  rotuloComparacion: string,
): ProductLabelsPrintPayload {
  const svgs = new Map<string, string | null>();
  return {
    fields: {
      name: campos.nombre,
      variant: campos.variante,
      price: campos.precio,
      comparePrice: campos.precioComparacion,
      sku: campos.sku,
      barcode: campos.codigo,
    },
    compareLabel: rotuloComparacion,
    labels: filas
      .filter((f) => normalizarCantidad(f.cantidad) > 0)
      .map(({ datos, cantidad }) => {
        let svg: string | null = null;
        if (campos.codigo && datos.codigo) {
          if (!svgs.has(datos.codigo)) svgs.set(datos.codigo, svgDe(datos.codigo));
          svg = svgs.get(datos.codigo) ?? null;
        }
        return {
          name: datos.nombre,
          variant: datos.variante,
          price: datos.precio,
          comparePrice: datos.precioComparacion,
          sku: datos.sku,
          barcode: datos.codigo,
          barcodeFormat: datos.codigo ? formatoJsBarcode(datos.codigo) : null,
          barcodeSvg: svg,
          copies: normalizarCantidad(cantidad),
        };
      }),
  };
}
