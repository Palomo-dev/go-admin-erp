'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { normalizarBusqueda } from '@/components/kit/arbol';

/**
 * Catálogo de atributos de variantes de la organización (`variant_types` +
 * `variant_values`) combinado con los valores que ya usan las variantes
 * (`products.variant_data`), igual que la pestaña anterior: así las
 * sugerencias incluyen lo que se creó antes de que existiera el catálogo.
 *
 * Solo el detalle escribe aquí («Guardar este valor en el catálogo» y
 * «Crear tipo»): son operaciones de una sola tabla con RLS por pertenencia.
 * El formulario no escribe: la RPC de guardado crea tipos y valores nuevos.
 */
export interface TipoCatalogo {
  /** null = tipo que solo aparece en variantes (aún no está en `variant_types`). */
  id: number | null;
  nombre: string;
  valores: string[];
  /** Valores que ya están en `variant_values` (los demás solo aparecen en variantes). */
  guardados?: string[];
}

export function mismoTexto(a: string, b: string): boolean {
  return normalizarBusqueda(a.trim()) === normalizarBusqueda(b.trim());
}

function agregarUnico(lista: string[], valor: string): void {
  const v = valor.trim();
  if (v && !lista.some((x) => mismoTexto(x, v))) lista.push(v);
}

/** Une tipos de varias fuentes por nombre (sin mayúsculas ni tildes). */
export function unirTipos(...fuentes: readonly (readonly TipoCatalogo[])[]): TipoCatalogo[] {
  const out: TipoCatalogo[] = [];
  for (const fuente of fuentes) {
    for (const t of fuente) {
      const nombre = t.nombre.trim();
      if (!nombre) continue;
      let destino = out.find((x) => mismoTexto(x.nombre, nombre));
      if (!destino) {
        destino = { id: t.id, nombre, valores: [], guardados: [] };
        out.push(destino);
      } else if (destino.id === null && t.id !== null) {
        destino.id = t.id;
      }
      for (const v of t.valores) agregarUnico(destino.valores, v);
      for (const v of t.guardados ?? []) agregarUnico((destino.guardados ??= []), v);
    }
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** ¿El valor ya está guardado en el catálogo de ese tipo? */
export function valorEnCatalogo(tipos: readonly TipoCatalogo[], tipo: string, valor: string): boolean {
  const t = tipos.find((x) => mismoTexto(x.nombre, tipo));
  return !!t && t.id !== null && (t.guardados ?? []).some((v) => mismoTexto(v, valor));
}

/** Valores sugeridos para un tipo del catálogo. */
export function valoresDeTipo(tipos: readonly TipoCatalogo[], nombre: string): string[] {
  return tipos.find((t) => mismoTexto(t.nombre, nombre))?.valores ?? [];
}

interface FilaTipo {
  id: number;
  name: string;
}
interface FilaValor {
  variant_type_id: number;
  value: string;
}
interface FilaVariantData {
  variant_data: Record<string, unknown> | null;
}

export function useCatalogoAtributos(organizacionId: number) {
  const [tipos, setTipos] = useState<TipoCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    const mio = ++turno.current;
    try {
      const [rTipos, rUsados] = await Promise.all([
        supabase.from('variant_types').select('id, name').or(`organization_id.eq.${organizacionId},organization_id.eq.0`).order('name'),
        supabase
          .from('products')
          .select('variant_data')
          .eq('organization_id', organizacionId)
          .not('parent_product_id', 'is', null)
          .not('variant_data', 'is', null)
          .neq('status', 'deleted')
          .limit(2000),
      ]);
      if (rTipos.error) throw rTipos.error;
      const filasTipo = (rTipos.data ?? []) as FilaTipo[];
      let filasValor: FilaValor[] = [];
      if (filasTipo.length > 0) {
        const rValores = await supabase
          .from('variant_values')
          .select('variant_type_id, value')
          .in(
            'variant_type_id',
            filasTipo.map((t) => t.id),
          )
          .order('display_order');
        if (rValores.error) throw rValores.error;
        filasValor = (rValores.data ?? []) as FilaValor[];
      }
      const delCatalogo: TipoCatalogo[] = filasTipo.map((t) => ({
        id: t.id,
        nombre: t.name,
        valores: filasValor.filter((v) => v.variant_type_id === t.id).map((v) => v.value),
        guardados: filasValor.filter((v) => v.variant_type_id === t.id).map((v) => v.value),
      }));
      const usados: TipoCatalogo[] = [];
      for (const fila of ((rUsados.data ?? []) as FilaVariantData[])) {
        const datos = fila.variant_data;
        if (!datos || typeof datos !== 'object') continue;
        for (const [k, v] of Object.entries(datos)) {
          const valor = v === null || v === undefined ? '' : String(v);
          usados.push({ id: null, nombre: k, valores: valor.trim() ? [valor] : [] });
        }
      }
      if (mio === turno.current) setTipos(unirTipos(delCatalogo, usados));
    } catch {
      // Sin catálogo el diálogo sigue funcionando: solo faltan las sugerencias.
      if (mio === turno.current) setTipos([]);
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Crea (o reutiliza) el tipo en `variant_types` y devuelve su id. */
  const guardarTipo = useCallback(
    async (nombre: string): Promise<number> => {
      const limpio = nombre.trim();
      const { data: existentes, error: e1 } = await supabase
        .from('variant_types')
        .select('id, name')
        .eq('organization_id', organizacionId);
      if (e1) throw e1;
      const ya = ((existentes ?? []) as FilaTipo[]).find((t) => mismoTexto(t.name, limpio));
      if (ya) return ya.id;
      const { data, error } = await supabase
        .from('variant_types')
        .insert({ organization_id: organizacionId, name: limpio })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: number }).id;
    },
    [organizacionId],
  );

  /** Guarda el valor en `variant_values` del tipo (lo crea si hace falta). */
  const guardarValor = useCallback(
    async (tipo: string, valor: string): Promise<void> => {
      const limpio = valor.trim();
      const idTipo = await guardarTipo(tipo);
      const { data: existentes, error: e1 } = await supabase
        .from('variant_values')
        .select('value, display_order')
        .eq('variant_type_id', idTipo);
      if (e1) throw e1;
      const filas = (existentes ?? []) as { value: string; display_order: number | null }[];
      if (filas.some((f) => mismoTexto(f.value, limpio))) return;
      const siguiente = filas.reduce((m, f) => Math.max(m, (f.display_order ?? -1) + 1), 0);
      const { error } = await supabase
        .from('variant_values')
        .insert({ variant_type_id: idTipo, value: limpio, display_order: siguiente });
      if (error) throw error;
    },
    [guardarTipo],
  );

  return { tipos, cargando, recargar, guardarTipo, guardarValor };
}
