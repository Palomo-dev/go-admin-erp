'use client';

/**
 * La térmica imprime la IMAGEN del rótulo (decisión 2 aprobada, Figma «21 Logística» 3228:16613):
 * se pinta el mismo `RotuloEnvio` de 80 mm fuera de pantalla, se fotografía con html2canvas al
 * ancho del cabezal (576 puntos a 203 ppp en 80 mm; 384 en 58 mm) y se pasa a un bitmap
 * monocromo (`MonochromeRaster`) que el agente imprime con `GS v 0`. Así el papel no puede
 * diferir de la vista previa.
 *
 * Los códigos de barras se vuelven a dibujar encima, nítidos y con un ancho entero de puntos por
 * módulo: escalar barras finas y umbralizarlas deja módulos desparejos que algunos lectores no
 * leen. Nunca lanza: un rótulo sin imagen sale por la versión en texto del agente.
 */
import { createRoot } from 'react-dom/client';
import JsBarcode from 'jsbarcode';
import { getPaperSpec, type MonochromeRaster, type PaperWidth, type ShipmentLabelPayload } from '@printing';
import { packToBase64 } from '@/lib/services/logoRasterService';
import { formatoJsBarcode } from '@/lib/utils/codigoBarras';
import { RotuloEnvio } from './RotuloEnvio';

/** Umbral de tinta: un poco por encima de la mitad para no perder los trazos finos del texto. */
const UMBRAL = 0.62;
const ESPERA_MAXIMA_MS = 4000;

/** Puntos del cabezal por ancho de papel (Font A de 12 puntos × caracteres por línea). */
export function puntosDelCabezal(ancho: PaperWidth): number {
  return getPaperSpec(ancho).charsPerLine * 12;
}

/** Módulos del código (1 = barra) según JsBarcode, para redibujarlo nítido. */
function modulosDe(valor: string): string | null {
  try {
    const datos: { encodings?: { data: string }[] } = {};
    JsBarcode(datos, valor, { format: formatoJsBarcode(valor) });
    const binario = (datos.encodings ?? []).map((e) => e.data).join('');
    return /^[01]+$/.test(binario) ? binario : null;
  } catch {
    return null;
  }
}

function redibujarBarras(ctx: CanvasRenderingContext2D, raiz: HTMLElement, escala: number): void {
  const base = raiz.getBoundingClientRect();
  raiz.querySelectorAll<HTMLElement>('[data-rotulo-barras]').forEach((nodo) => {
    const valor = nodo.dataset.rotuloBarras ?? '';
    const modulos = modulosDe(valor);
    const svg = nodo.querySelector('svg');
    if (!modulos || !svg) return;
    const r = svg.getBoundingClientRect();
    const x = Math.round((r.left - base.left) * escala);
    const y = Math.round((r.top - base.top) * escala);
    const ancho = Math.round(r.width * escala);
    const alto = Math.round(r.height * escala);
    const modulo = Math.floor(ancho / modulos.length);
    if (modulo < 1 || alto < 1) return;
    const inicio = x + Math.floor((ancho - modulo * modulos.length) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, ancho, alto);
    ctx.fillStyle = '#000000';
    for (let i = 0; i < modulos.length; i += 1) if (modulos[i] === '1') ctx.fillRect(inicio + i * modulo, y, modulo, alto);
  });
}

/** Pinta un rótulo de 80 mm fuera de pantalla y espera a que barras y logo estén listos. */
async function montar(textos: ShipmentLabelPayload): Promise<{ nodo: HTMLElement; desmontar: () => void }> {
  const contenedor = document.createElement('div');
  contenedor.setAttribute('aria-hidden', 'true');
  contenedor.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;background:#fff;';
  document.body.appendChild(contenedor);
  const root = createRoot(contenedor);
  await new Promise<void>((resolver) => {
    const tope = setTimeout(resolver, ESPERA_MAXIMA_MS);
    root.render(
      <RotuloEnvio
        textos={textos}
        formato="80mm"
        onListo={() => {
          clearTimeout(tope);
          resolver();
        }}
      />,
    );
  });
  try {
    await document.fonts?.ready;
  } catch {
    /* sin API de fuentes: se sigue con las que haya */
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const nodo = contenedor.firstElementChild as HTMLElement;
  return {
    nodo,
    desmontar: () => {
      root.unmount();
      contenedor.remove();
    },
  };
}

async function fotografiar(nodo: HTMLElement, puntos: number): Promise<MonochromeRaster | null> {
  const { default: html2canvas } = await import('html2canvas');
  const caja = nodo.getBoundingClientRect();
  if (caja.width <= 0 || caja.height <= 0) return null;
  const escala = puntos / caja.width;
  const lienzo = await html2canvas(nodo, { scale: escala, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;
  redibujarBarras(ctx, nodo, lienzo.width / caja.width);
  const width = Math.min(lienzo.width, puntos);
  const height = lienzo.height;
  const { data } = ctx.getImageData(0, 0, width, height);
  const negro = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const alfa = data[i + 3] / 255;
    const luz = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    return alfa * luz + (1 - alfa) < UMBRAL;
  };
  return { width, height, data: packToBase64(negro, width, height) };
}

/**
 * Imagen de cada rótulo para cada ancho de papel pedido. `resultado[i][ancho]` es null si esa
 * imagen no se pudo generar (CORS del logo, navegador sin canvas…): esa impresora usa el texto.
 */
export async function rasterizarRotulos(
  rotulos: readonly ShipmentLabelPayload[],
  anchos: readonly PaperWidth[],
): Promise<Partial<Record<PaperWidth, MonochromeRaster | null>>[]> {
  const salida: Partial<Record<PaperWidth, MonochromeRaster | null>>[] = [];
  const unicos = [...new Set(anchos)];
  // Copias idénticas seguidas (misma guía) comparten la imagen: se fotografía una vez.
  const memo = new Map<string, Partial<Record<PaperWidth, MonochromeRaster | null>>>();
  for (const textos of rotulos) {
    const clave = JSON.stringify(textos);
    const previo = memo.get(clave);
    if (previo) {
      salida.push(previo);
      continue;
    }
    const porAncho: Partial<Record<PaperWidth, MonochromeRaster | null>> = {};
    let montado: Awaited<ReturnType<typeof montar>> | null = null;
    try {
      montado = await montar(textos);
      for (const ancho of unicos) {
        try {
          porAncho[ancho] = await fotografiar(montado.nodo, puntosDelCabezal(ancho));
        } catch (e) {
          console.warn('[rótulo] no se pudo generar la imagen; la térmica usará el texto', e);
          porAncho[ancho] = null;
        }
      }
    } catch (e) {
      console.warn('[rótulo] no se pudo pintar el rótulo fuera de pantalla', e);
      for (const ancho of unicos) porAncho[ancho] = null;
    } finally {
      montado?.desmontar();
    }
    memo.set(clave, porAncho);
    salida.push(porAncho);
  }
  return salida;
}
