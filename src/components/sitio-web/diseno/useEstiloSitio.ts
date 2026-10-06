'use client';

/**
 * Estado del estilo global sobre el borrador V2 (Diseño › Estilo y el estilo
 * global del editor, A/05f). La vista previa cambia AL INSTANTE (estado local)
 * y el borrador se guarda con una espera corta tras el último cambio, siempre
 * con `useSitioV2().guardar` (compare-and-swap por versión: un 409 abre el
 * conflicto y no pisa a nadie). Nunca hay dos guardados a la vez: si cambias
 * algo mientras se guarda, se guarda otra vez al terminar. Al salir de la
 * página, lo pendiente se guarda.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SitioV2 } from '../useSitioV2';
import type { EstiloCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { escribirEstilo, leerEstilo, mismoEstilo, type EstiloEditable, type TokensEstilo } from '@/lib/website/v2/tokensEstilo';

export const ESPERA_GUARDADO_MS = 700;

export interface EstiloSitio {
  /** Estilo que se ve (con los cambios aún sin guardar). `null` sin borrador. */
  estilo: EstiloEditable | null;
  /** Hay cambios del panel que aún no llegan al borrador. */
  pendiente: boolean;
  cambiar: (parcial: Partial<EstiloEditable>) => void;
  aplicarPreset: (preset: EstiloCatalogo) => void;
  /** Guarda ya lo pendiente (antes de publicar o abrir la vista previa). `false` si falló. */
  guardarAhora: () => Promise<boolean>;
}

function tokensDe(p: EstiloCatalogo): TokensEstilo {
  return {
    modo: p.modo,
    fondo: p.fondo,
    texto: p.texto,
    acento: p.acento,
    fuenteTitulos: p.fuenteTitulos,
    fuenteCuerpo: p.fuenteCuerpo,
    radio: p.radio,
    estiloBoton: p.estiloBoton,
    movimiento: p.movimiento,
  };
}

/**
 * @param base estilo de partida para lo que el borrador no define (el preset en
 *   uso o el primero del giro); nunca un color cableado.
 * @param extendidos ¿se escriben `preset`, `radio`, `estiloBoton` y `movimiento`?
 * @param alFallarGuardado se llama cuando un guardado falla (también el
 *   automático, que nadie espera). Quien lo pasa lee el motivo con
 *   `useAvisoFalloSitio`, nunca de `sitio` justo después del `await`.
 */
export function useEstiloSitio(
  sitio: SitioV2,
  base: EstiloCatalogo | null,
  extendidos: boolean,
  alFallarGuardado?: () => void,
): EstiloSitio {
  const documento = sitio.documento;
  const leido = useMemo(() => (documento && base ? leerEstilo(documento, base) : null), [documento, base]);
  const [local, setLocal] = useState<EstiloEditable | null>(leido);
  const localRef = useRef<EstiloEditable | null>(leido);
  const pendienteRef = useRef(false);
  const [pendiente, setPendiente] = useState(false);
  const guardandoRef = useRef<Promise<boolean> | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardar = sitio.guardar;
  const alFallarRef = useRef(alFallarGuardado);
  alFallarRef.current = alFallarGuardado;

  // Sin cambios propios en curso, se muestra lo que dice el borrador (otra pestaña, recarga, conflicto).
  useEffect(() => {
    if (pendienteRef.current) return;
    // Sin tokens extendidos el preset no se guarda: se conserva el elegido en esta sesión.
    const previo = localRef.current?.preset ?? null;
    const siguiente = leido && !extendidos && !leido.preset && previo ? { ...leido, preset: previo } : leido;
    localRef.current = siguiente;
    setLocal(siguiente);
  }, [leido, extendidos]);

  const marcar = (v: boolean) => {
    pendienteRef.current = v;
    setPendiente(v);
  };

  const guardarAhora = useCallback(async (): Promise<boolean> => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    if (guardandoRef.current) await guardandoRef.current;
    const objetivo = localRef.current;
    if (!pendienteRef.current || !objetivo) return true;
    const promesa = guardar((d) => escribirEstilo(d, objetivo, extendidos));
    guardandoRef.current = promesa;
    const ok = await promesa;
    guardandoRef.current = null;
    if (!ok) {
      // Conflicto o error: se deja de insistir; el conflicto recarga y el error se muestra.
      marcar(false);
      alFallarRef.current?.();
      return false;
    }
    if (localRef.current === objetivo) marcar(false);
    else temporizador.current = setTimeout(() => void guardarAhora(), ESPERA_GUARDADO_MS);
    return true;
  }, [guardar, extendidos]);

  const cambiar = useCallback(
    (parcial: Partial<EstiloEditable>) => {
      const actual = localRef.current;
      if (!actual) return;
      const siguiente = { ...actual, ...parcial };
      if (mismoEstilo(actual, siguiente, true)) return;
      localRef.current = siguiente;
      setLocal(siguiente);
      marcar(true);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void guardarAhora(), ESPERA_GUARDADO_MS);
    },
    [guardarAhora],
  );

  const aplicarPreset = useCallback((preset: EstiloCatalogo) => cambiar({ ...tokensDe(preset), preset: preset.id }), [cambiar]);

  // Al salir con cambios sin guardar, se guardan.
  const guardarAlSalir = useRef(guardarAhora);
  guardarAlSalir.current = guardarAhora;
  useEffect(
    () => () => {
      if (pendienteRef.current) void guardarAlSalir.current();
    },
    [],
  );

  return { estilo: local, pendiente, cambiar, aplicarPreset, guardarAhora };
}
