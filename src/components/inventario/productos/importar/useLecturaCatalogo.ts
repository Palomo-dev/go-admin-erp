'use client';

/**
 * Lectura del catálogo completo de una tienda, por partes:
 *   detectar → (tanda → tanda → …) → productos deduplicados.
 *
 * Cada tanda es una llamada a la ruta del servidor con el cursor de la
 * anterior; así un catálogo de miles de productos no choca con el límite de
 * tiempo de la ruta, el usuario ve el progreso y puede detener la lectura
 * conservando lo leído. Una tanda que falla se reintenta dos veces con espera
 * antes de rendirse (y lo leído hasta ahí se conserva).
 */

import { useCallback, useRef, useState } from 'react';
import { fusionarCatalogo, resolverSkusRepetidos } from '@/lib/inventario/importacion/catalogo/deduplicacion';
import { MAX_PRODUCTOS_CATALOGO, MAX_URLS_POR_LLAMADA, type CursorCatalogo, type DeteccionCatalogo } from '@/lib/inventario/importacion/catalogo/tipos';
import type { ProductoWeb } from '@/lib/inventario/importacion/web';
import { detectarCatalogoWeb, ErrorApi, leerFichasWeb, leerTandaCatalogoWeb } from './apiImportacion';

/** Pausa entre tandas: además de la del servidor entre peticiones, no se le cae encima a la tienda. */
const PAUSA_ENTRE_TANDAS_MS = 300;
const ESPERAS_REINTENTO_MS = [1500, 4000];

export type FaseLectura = 'inactiva' | 'detectando' | 'detectada' | 'leyendo' | 'terminada' | 'detenida' | 'error';

export interface EstadoLectura {
  fase: FaseLectura;
  deteccion: DeteccionCatalogo | null;
  /** Productos únicos leídos. */
  leidos: number;
  /** Lo que informó la plataforma (o las URLs del sitemap). */
  total?: number;
  /** Fichas / registros recorridos (para el progreso de la lectura genérica). */
  recorridos: number;
  tandas: number;
  repetidos: number;
  sinDatos: number;
  avisos: string[];
  error?: string;
}

const INICIAL: EstadoLectura = { fase: 'inactiva', deteccion: null, leidos: 0, recorridos: 0, tandas: 0, repetidos: 0, sinDatos: 0, avisos: [] };

const dormir = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('abortado'), { name: 'AbortError' }));
    });
  });

const esAborto = (e: unknown) => (e as { name?: string })?.name === 'AbortError';
const reintentable = (e: unknown) => !(e instanceof ErrorApi) || e.status >= 500 || e.status === 429;

async function conReintentos<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (e) {
      if (esAborto(e) || !reintentable(e) || intento >= ESPERAS_REINTENTO_MS.length) throw e;
      await dormir(ESPERAS_REINTENTO_MS[intento], signal);
    }
  }
}

export function useLecturaCatalogo(orgId: number | undefined) {
  const [estado, setEstado] = useState<EstadoLectura>(INICIAL);
  const controlador = useRef<AbortController | null>(null);
  const detenerRef = useRef(false);

  const reiniciar = useCallback(() => {
    controlador.current?.abort();
    setEstado(INICIAL);
  }, []);

  const detectar = useCallback(
    async (url: string, clave?: string): Promise<DeteccionCatalogo | null> => {
      controlador.current?.abort();
      controlador.current = new AbortController();
      setEstado({ ...INICIAL, fase: 'detectando' });
      try {
        const deteccion = await detectarCatalogoWeb(orgId, url, clave, controlador.current.signal);
        setEstado({ ...INICIAL, fase: 'detectada', deteccion, total: deteccion.total, avisos: deteccion.avisos });
        return deteccion;
      } catch (e) {
        if (esAborto(e)) {
          setEstado(INICIAL);
          return null;
        }
        setEstado({ ...INICIAL, fase: 'error', error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    },
    [orgId],
  );

  /** Lee todo el catálogo detectado. Devuelve los productos (también si se detuvo o falló a mitad). */
  const leer = useCallback(
    async (deteccion: DeteccionCatalogo, clave?: string): Promise<{ productos: ProductoWeb[]; completo: boolean }> => {
      controlador.current?.abort();
      const ctrl = new AbortController();
      controlador.current = ctrl;
      detenerRef.current = false;
      let productos: ProductoWeb[] = [];
      let e: EstadoLectura = { ...INICIAL, fase: 'leyendo', deteccion, total: deteccion.total, avisos: [...deteccion.avisos] };
      setEstado(e);
      const sumar = (tanda: ProductoWeb[], extra: Partial<EstadoLectura>) => {
        const f = fusionarCatalogo(productos, tanda);
        productos = f.productos;
        e = { ...e, ...extra, leidos: productos.length, repetidos: e.repetidos + f.repetidos, tandas: e.tandas + 1 };
        setEstado(e);
      };
      const avisar = (codigos: string[]) => {
        const nuevos = codigos.filter((c) => !e.avisos.includes(c));
        if (nuevos.length) e = { ...e, avisos: [...e.avisos, ...nuevos] };
      };
      let completo = false;
      try {
        if (deteccion.plataforma === 'generica') {
          const urls = deteccion.urlsProducto ?? [];
          for (let i = 0; i < urls.length; i += MAX_URLS_POR_LLAMADA) {
            if (detenerRef.current) break;
            const grupo = urls.slice(i, i + MAX_URLS_POR_LLAMADA);
            const r = await conReintentos(() => leerFichasWeb(orgId, deteccion.origen, grupo, ctrl.signal), ctrl.signal);
            sumar(r.productos, { recorridos: i + grupo.length, sinDatos: e.sinDatos + r.sinDatos.length });
            if (productos.length >= MAX_PRODUCTOS_CATALOGO) {
              avisar(['catalogoTruncado']);
              break;
            }
            await dormir(PAUSA_ENTRE_TANDAS_MS, ctrl.signal);
          }
          completo = !detenerRef.current && e.recorridos >= urls.length;
        } else {
          let cursor: CursorCatalogo | null = deteccion.cursor;
          while (cursor) {
            if (detenerRef.current) break;
            const actual: CursorCatalogo = cursor;
            const r = await conReintentos(() => leerTandaCatalogoWeb(orgId, { origen: deteccion.origen, plataforma: deteccion.plataforma, cursor: actual, clave }, ctrl.signal), ctrl.signal);
            avisar(r.avisos);
            sumar(r.productos, { recorridos: r.leidos ?? e.recorridos + r.productos.length, total: r.total ?? e.total });
            cursor = r.siguiente;
            if (productos.length >= MAX_PRODUCTOS_CATALOGO) {
              avisar(['catalogoTruncado']);
              break;
            }
            if (cursor) await dormir(PAUSA_ENTRE_TANDAS_MS, ctrl.signal);
          }
          completo = !cursor;
        }
        setEstado({ ...e, fase: completo ? 'terminada' : 'detenida' });
      } catch (err) {
        if (esAborto(err)) {
          setEstado({ ...e, fase: 'detenida' });
        } else {
          setEstado({ ...e, fase: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { productos: resolverSkusRepetidos(productos.slice(0, MAX_PRODUCTOS_CATALOGO)), completo };
    },
    [orgId],
  );

  /** Detiene al terminar la tanda en curso (lo leído se conserva). */
  const detener = useCallback(() => {
    detenerRef.current = true;
  }, []);

  return { estado, detectar, leer, detener, reiniciar };
}
