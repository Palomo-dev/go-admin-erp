'use client';

/**
 * Filtro recordado por persona y pantalla SOLO durante el día de la organización (decisión 2,
 * Figma 3300-420477 › 07). La regla vive en `filtroDelDia.ts`; aquí solo se toma la persona de la
 * sesión, la organización y el «hoy» de su zona horaria.
 *
 * `listo` pasa a `true` cuando ya se intentó leer lo guardado: la pantalla espera a `listo` para
 * su primera consulta y no pide dos veces (con el defecto y luego con lo recordado).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { almacenDelNavegador, claveFiltroDelDia, guardarFiltroDelDia, leerFiltroDelDia } from '@/lib/finanzas/recaudo/filtroDelDia';

export function useFiltroDelDia<T extends object>(pantalla: string, defecto: T): { valor: T; setValor: (v: T | ((previo: T) => T)) => void; listo: boolean; restablecer: () => void } {
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const [valor, setValorInterno] = useState<T>(defecto);
  const [listo, setListo] = useState(false);
  const claveRef = useRef<string | null>(null);
  const defectoRef = useRef(defecto);

  useEffect(() => {
    let vigente = true;
    let organizacion: number | null = null;
    try {
      organizacion = getOrganizationId();
    } catch {
      organizacion = null;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!vigente) return;
        const clave = claveFiltroDelDia(pantalla, organizacion, data.session?.user?.id ?? null);
        claveRef.current = clave;
        const guardado = leerFiltroDelDia<T>(almacenDelNavegador(), clave, hoy);
        if (guardado !== null) setValorInterno({ ...defectoRef.current, ...guardado });
      })
      .catch(() => undefined)
      .finally(() => vigente && setListo(true));
    return () => {
      vigente = false;
    };
  }, [pantalla, hoy]);

  const setValor = useCallback(
    (v: T | ((previo: T) => T)) => {
      setValorInterno((previo) => {
        const nuevo = typeof v === 'function' ? (v as (p: T) => T)(previo) : v;
        if (claveRef.current) guardarFiltroDelDia(almacenDelNavegador(), claveRef.current, hoy, nuevo);
        return nuevo;
      });
    },
    [hoy],
  );

  const restablecer = useCallback(() => setValor(defectoRef.current), [setValor]);

  return { valor, setValor, listo, restablecer };
}
