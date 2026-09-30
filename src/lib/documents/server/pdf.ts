/**
 * HTML → PDF en el servidor con Chromium (puppeteer).
 *
 * Estado verificado en producción (logs de Vercel, 2026-09): la ruta vieja
 * `/api/facturas-venta/[id]/pdf` fallaba SIEMPRE con «Could not find Chrome»:
 * `puppeteer` completo se instala con `puppeteer_skip_chromium_download=true`
 * (`.npmrc`) y en la función serverless no hay navegador. Por eso 5 PDF en
 * 3.187 facturas. Este lanzador resuelve el navegador en este orden:
 *
 *   1. `PDF_CHROMIUM_WS_ENDPOINT`: navegador remoto (browserless u otro
 *      servicio de render) por WebSocket — no pesa en la función.
 *   2. En serverless (Vercel/Lambda): `puppeteer-core` + `@sparticuz/chromium`
 *      138 (la misma versión de Chrome que puppeteer 24.15). La función lleva
 *      ~65 MB de Chromium comprimido; en frío lo descomprime en /tmp.
 *   3. Local / servidor propio: `PDF_CHROMIUM_EXECUTABLE_PATH`, si no un
 *      Chrome o Chromium ejecutable en `PATH`, y si no el de `puppeteer`.
 *      El paquete no descarga su Chrome (`.npmrc`).
 *
 * Si no hay navegador, `ErrorPdfNoDisponible` → la ruta responde 503 y las
 * funciones cliente caen al HTML imprimible (mismo documento, «Guardar como
 * PDF» del navegador): las pantallas nunca se quedan sin documento.
 *
 * Seguridad del render: toda petición de red de la página se aborta (el HTML
 * ya trae el logo en `data:` y el QR en `<svg>`), así un texto que se colara no
 * puede hacer que el servidor llame a una URL (SSRF). Máximo 2 renders
 * simultáneos por instancia y tiempo máximo por documento.
 */

import { accessSync, constants as fsConstants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { getPaperSpec } from '@printing';
import type { PapelDocumento } from '../tipos';

/** Nombres, en orden, de un Chrome o Chromium de la máquina (no el caché de puppeteer). */
const CHROME_EN_PATH = ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'] as const;

/**
 * Ejecutable para el proceso local. La variable manda aunque el archivo no
 * exista: así el error nombra la ruta que se configuró. Sin variable, el
 * primero ejecutable en `PATH`.
 */
export function ejecutableChromeLocal(): string | undefined {
  const explicito = process.env.PDF_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (explicito) return explicito;
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const nombre of CHROME_EN_PATH) {
    for (const dir of dirs) {
      const ruta = join(dir, nombre);
      try {
        accessSync(ruta, fsConstants.X_OK);
        return ruta;
      } catch {
        // sigue buscando
      }
    }
  }
  return undefined;
}

export class ErrorPdfNoDisponible extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ErrorPdfNoDisponible';
  }
}

interface PaginaMinima {
  setRequestInterception(v: boolean): Promise<void>;
  on(evento: 'request', manejador: (r: { url(): string; continue(): Promise<void>; abort(): Promise<void>; isInterceptResolutionHandled?(): boolean }) => void): unknown;
  setContent(html: string, opciones: { waitUntil: 'load'; timeout: number }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  pdf(opciones: Record<string, unknown>): Promise<Uint8Array>;
  close(): Promise<void>;
}
interface NavegadorMinimo {
  newPage(): Promise<PaginaMinima>;
  on(evento: 'disconnected', manejador: () => void): unknown;
  connected?: boolean;
}

const MAX_SIMULTANEOS = 2;
const TIEMPO_MAXIMO_MS = 25_000;
let activos = 0;
const cola: Array<() => void> = [];
let navegador: Promise<NavegadorMinimo> | null = null;

async function turno(): Promise<() => void> {
  if (activos >= MAX_SIMULTANEOS) await new Promise<void>((resolver) => cola.push(resolver));
  activos++;
  return () => {
    activos--;
    cola.shift()?.();
  };
}

/** Chromium empaquetado para serverless (`@sparticuz/chromium`, Chrome 138 como puppeteer 24). */
interface ChromiumServerless {
  args: string[];
  executablePath(): Promise<string>;
  setGraphicsMode?: boolean;
}

async function lanzar(): Promise<NavegadorMinimo> {
  const remoto = process.env.PDF_CHROMIUM_WS_ENDPOINT;
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (remoto || serverless) {
    // `puppeteer-core` y `@sparticuz/chromium` van con import literal: el
    // rastreo de archivos de Next los incluye en la función (los dos están en
    // su lista de `serverExternalPackages`). La carpeta `bin` de Chromium, que
    // no se requiere desde JS, la agrega `outputFileTracingIncludes`.
    const core = (await import('puppeteer-core')).default;
    if (remoto) {
      return (await core.connect({ browserWSEndpoint: remoto })) as unknown as NavegadorMinimo;
    }
    let chromium: ChromiumServerless;
    try {
      const modulo = await import('@sparticuz/chromium');
      chromium = (modulo.default ?? modulo) as unknown as ChromiumServerless;
    } catch (err) {
      throw new ErrorPdfNoDisponible(`No hay Chromium en la función serverless: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Sin WebGL: un documento no lo necesita y así no se descomprime swiftshader.
    try {
      chromium.setGraphicsMode = false;
    } catch {
      // versión sin el setter
    }
    return (await core.launch({
      args: core.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    })) as unknown as NavegadorMinimo;
  }

  // Local / servidor propio. El nombre del paquete va en una variable para
  // que el rastreo de Vercel no meta `puppeteer` en la función (allí no se usa).
  const paquete = 'puppeteer';
  const puppeteer = ((await import(/* webpackIgnore: true */ paquete)) as { default: typeof import('puppeteer-core').default }).default;
  return (await puppeteer.launch({
    headless: true,
    executablePath: ejecutableChromeLocal(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })) as unknown as NavegadorMinimo;
}

async function obtenerNavegador(): Promise<NavegadorMinimo> {
  if (!navegador) {
    navegador = lanzar()
      .then((n) => {
        n.on('disconnected', () => {
          navegador = null;
        });
        return n;
      })
      .catch((err) => {
        navegador = null;
        const motivo = err instanceof ErrorPdfNoDisponible ? err.message : err instanceof Error ? err.message : String(err);
        console.error('[pdf] no se pudo abrir Chromium:', motivo);
        if (err instanceof ErrorPdfNoDisponible) throw err;
        throw new ErrorPdfNoDisponible(motivo);
      });
  }
  return navegador;
}

function conTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new Error('Tiempo agotado generando el PDF')), ms);
    promesa.then(
      (v) => {
        clearTimeout(temporizador);
        resolver(v);
      },
      (e) => {
        clearTimeout(temporizador);
        rechazar(e);
      },
    );
  });
}

/** Genera el PDF de un HTML del motor. Carta/A4 toman tamaño y márgenes del `@page`; 80 mm mide el alto del ticket. */
export async function generarPdf(html: string, papel: PapelDocumento): Promise<Uint8Array> {
  const liberar = await turno();
  try {
    const nav = await obtenerNavegador();
    const pagina = await nav.newPage();
    try {
      await pagina.setRequestInterception(true);
      pagina.on('request', (peticion) => {
        if (peticion.isInterceptResolutionHandled?.()) return;
        const url = peticion.url();
        if (url.startsWith('data:') || url === 'about:blank') void peticion.continue();
        else void peticion.abort();
      });
      await pagina.setContent(html, { waitUntil: 'load', timeout: TIEMPO_MAXIMO_MS });
      if (papel === '80mm') {
        const spec = getPaperSpec('80mm');
        const alto = await pagina.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
        return await conTiempo(
          pagina.pdf({ width: `${spec.printableMm}mm`, height: `${Math.max(alto + 8, 200)}px`, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } }),
          TIEMPO_MAXIMO_MS,
        );
      }
      return await conTiempo(pagina.pdf({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false }), TIEMPO_MAXIMO_MS);
    } finally {
      await pagina.close().catch(() => undefined);
    }
  } finally {
    liberar();
  }
}
