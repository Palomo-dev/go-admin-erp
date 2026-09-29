'use client';

/**
 * Lectura en vivo de una báscula en React: crea el transporte (Desktop o Web
 * Serial) y el `LectorBascula` mientras `activo`, y lo cierra al desactivarse
 * (el diálogo «Pesar» se cierra) o al desmontar.
 *
 * Web Serial necesita un gesto la primera vez: si no hay puerto autorizado el
 * lector queda en error `sin_puerto` y `conectarWebSerial()` (desde un clic)
 * abre el selector del navegador y reintenta con el puerto elegido.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LectorBascula, type EstadoLector } from './lector';
import type { ConfigBascula } from './tipos';
import { crearTransporte, elegirPuertoWebSerial, ErrorTransporte, type EntornoBascula, type PuertoSerieWeb } from './transportes';
import { entornoBascula } from './entorno';

export interface LectorEnVivo {
  estado: EstadoLector | null;
  cero: () => void;
  reintentar: () => void;
  /** Solo Web Serial: elegir el puerto (llamar desde un clic). Devuelve la pista elegida. */
  conectarWebSerial: () => Promise<string | null>;
  puedeElegirPuerto: boolean;
}

export function useLectorBascula(
  config: ConfigBascula | null,
  activo: boolean,
  opciones: { entorno?: EntornoBascula } = {},
): LectorEnVivo {
  const [estado, setEstado] = useState<EstadoLector | null>(null);
  const [intento, setIntento] = useState(0);
  const lectorRef = useRef<LectorBascula | null>(null);
  const puertoRef = useRef<PuertoSerieWeb | null>(null);
  const entornoFijo = opciones.entorno;

  useEffect(() => {
    if (!activo || !config) {
      setEstado(null);
      return;
    }
    const entorno = entornoFijo ?? entornoBascula();
    let lector: LectorBascula;
    try {
      lector = new LectorBascula(config, crearTransporte(config, entorno, { puertoWebSerial: puertoRef.current }));
    } catch (err) {
      const codigo = err instanceof ErrorTransporte ? err.codigo : 'io';
      setEstado({
        fase: 'error',
        error: codigo,
        lectura: null,
        peso: null,
        unidad: config.unidad,
        estable: false,
        ultimaLecturaMs: null,
        crudo: new Uint8Array(0),
        tramasReconocidas: 0,
        tramasNoReconocidas: 0,
        ceroEnPos: true,
      });
      return;
    }
    lectorRef.current = lector;
    const baja = lector.suscribir(setEstado);
    void lector.iniciar();
    return () => {
      baja();
      lectorRef.current = null;
      void lector.detener();
    };
  }, [activo, config, intento, entornoFijo]);

  const cero = useCallback(() => {
    void lectorRef.current?.cero().catch(() => undefined);
  }, []);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const puedeElegirPuerto = !!config && config.transporte === 'web_serial' && !!(entornoFijo ?? entornoBascula()).serial;

  const conectarWebSerial = useCallback(async () => {
    const serial = (entornoFijo ?? entornoBascula()).serial;
    if (!serial) return null;
    // Soltar el puerto actual antes de pedir otro.
    await lectorRef.current?.detener();
    const elegido = await elegirPuertoWebSerial(serial);
    if (!elegido) {
      setIntento((n) => n + 1);
      return null;
    }
    puertoRef.current = elegido.puerto;
    setIntento((n) => n + 1);
    return elegido.pista;
  }, [entornoFijo]);

  return { estado, cero, reintentar, conectarWebSerial, puedeElegirPuerto };
}
