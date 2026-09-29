'use client';

/**
 * ¿Puede la persona en sesión pesar a mano en el POS? Lo resuelve el servidor
 * (`pos_pesaje_contexto`: regla `pos_pesaje` de la organización + permiso
 * `pos.peso_manual`), nunca el nombre del rol (CLAUDE.md, regla 6).
 *
 * Sin conexión se usa la última respuesta de esta organización y usuario
 * guardada en el navegador; sin ninguna, se asume que NO (el servidor revalida
 * igual al sincronizar la venta: `fn_pos_validar_pesaje`).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';

export interface ContextoPesaje {
  /** Regla de la organización: 'no' | 'permiso' (| 'supervisor', aún sin autorización de supervisor). */
  manual: string;
  puedePesarAMano: boolean;
  /**
   * Regla `pos_pesaje.peso_en_pantalla_cliente` (activa por defecto): la
   * pantalla del cliente muestra «Pesando…» mientras «Pesar» está abierto.
   */
  pesoEnPantallaCliente: boolean;
  /**
   * Regla `pos_pesaje.agregar_al_estabilizar` (activa por defecto,
   * 20260929220300): con báscula, la pesada se agrega sola en cuanto la
   * lectura está estable, sin Enter. Sin báscula no aplica.
   */
  agregarAlEstabilizar: boolean;
  /** true mientras no hay respuesta del servidor ni caché. */
  cargando: boolean;
}

const SIN_DATO: ContextoPesaje = { manual: 'permiso', puedePesarAMano: false, pesoEnPantallaCliente: true, agregarAlEstabilizar: true, cargando: true };

function claveCache(orgId: number): string {
  return `pos_pesaje_contexto_${orgId}`;
}

function leerCache(orgId: number | undefined): ContextoPesaje | null {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(claveCache(orgId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { manual?: string; puede?: boolean; pantalla?: boolean; estabilizar?: boolean };
    return {
      manual: v.manual ?? 'permiso',
      puedePesarAMano: v.puede === true,
      pesoEnPantallaCliente: v.pantalla !== false,
      agregarAlEstabilizar: v.estabilizar !== false,
      cargando: false,
    };
  } catch {
    return null;
  }
}

/** Interpreta la respuesta de `pos_pesaje_contexto`. */
export function contextoDesdeRespuesta(data: unknown): ContextoPesaje {
  const d = (data && typeof data === 'object' ? data : {}) as {
    manual?: unknown;
    puede_pesar_a_mano?: unknown;
    peso_en_pantalla_cliente?: unknown;
    agregar_al_estabilizar?: unknown;
  };
  return {
    manual: typeof d.manual === 'string' ? d.manual : 'permiso',
    puedePesarAMano: d.puede_pesar_a_mano === true,
    // Activa por defecto: solo `false` explícito la apaga (20260929225100).
    pesoEnPantallaCliente: d.peso_en_pantalla_cliente !== false,
    // Activa por defecto: solo `false` explícito la apaga (20260929220300).
    agregarAlEstabilizar: d.agregar_al_estabilizar !== false,
    cargando: false,
  };
}

export function usePesajeContexto(): ContextoPesaje {
  const { organization } = useOrganization();
  const orgId = organization?.id as number | undefined;
  const [ctx, setCtx] = useState<ContextoPesaje>(() => leerCache(orgId) ?? SIN_DATO);

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    const cache = leerCache(orgId);
    if (cache) setCtx(cache);
    supabase
      .rpc('pos_pesaje_contexto', { p_org: orgId })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          setCtx((prev) => (prev.cargando ? { ...prev, cargando: false } : prev));
          return;
        }
        const nuevo = contextoDesdeRespuesta(data);
        setCtx(nuevo);
        try {
          localStorage.setItem(claveCache(orgId), JSON.stringify({
              manual: nuevo.manual,
              puede: nuevo.puedePesarAMano,
              pantalla: nuevo.pesoEnPantallaCliente,
              estabilizar: nuevo.agregarAlEstabilizar,
            }));
        } catch {
          /* sin almacenamiento local: solo en memoria */
        }
      });
    return () => {
      cancelado = true;
    };
  }, [orgId]);

  return ctx;
}
