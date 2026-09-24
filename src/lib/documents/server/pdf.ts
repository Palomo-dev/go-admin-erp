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
 *   2. En serverless (Vercel/Lambda): `@sparticuz/chromium` si está instalado
 *      (se carga en tiempo de ejecución, sin empaquetarlo). Activarlo requiere
 *      `npm i @sparticuz/chromium@^138` (misma versión mayor de Chrome que
 *      puppeteer 24) y trazar su carpeta `bin` en `next.config.js`
 *      (`outputFileTracingIncludes`). Pendiente de aprobación del dueño.
 *   3. Local / servidor propio: `puppeteer` (o `PDF_CHROMIUM_EXECUTABLE_PATH`).
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

import { getPaperSpec } from '@printing';
import type { PapelDocumento } from '../tipos';

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

async function lanzar(): Promise<NavegadorMinimo> {
  const puppeteer = (await import('puppeteer')).default;
  const remoto = process.env.PDF_CHROMIUM_WS_ENDPOINT;
  if (remoto) {
    return (await puppeteer.connect({ browserWSEndpoint: remoto })) as unknown as NavegadorMinimo;
  }
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (serverless) {
    let chromium: { args: string[]; executablePath(): Promise<string> } | null = null;
    try {
      const paquete = '@sparticuz/chromium';
      const modulo = await import(/* webpackIgnore: true */ paquete);
      chromium = (modulo.default ?? modulo) as { args: string[]; executablePath(): Promise<string> };
    } catch {
      chromium = null;
    }
    if (!chromium) {
      throw new ErrorPdfNoDisponible('No hay Chromium en la función serverless (falta @sparticuz/chromium o PDF_CHROMIUM_WS_ENDPOINT)');
    }
    return (await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })) as unknown as NavegadorMinimo;
  }
  return (await puppeteer.launch({
    headless: true,
    executablePath: process.env.PDF_CHROMIUM_EXECUTABLE_PATH || undefined,
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
        if (err instanceof ErrorPdfNoDisponible) throw err;
        throw new ErrorPdfNoDisponible(err instanceof Error ? err.message : String(err));
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
