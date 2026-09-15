'use client';

/**
 * Estado de la biblioteca de objeciones (FASE-02). Todo pasa por las rutas de
 * servidor (`/api/crm/objections/**`): el navegador nunca escribe `objections`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Objection, ObjectionInput } from '@/lib/services/crm/objectionService';
import { normalizeObjection } from '@/lib/services/crm/objectionModel';

async function readJson(res: Response): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { ok: res.ok, body };
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' && body.error ? body.error : fallback;
}

function upsert(list: Objection[], row: Objection): Objection[] {
  const i = list.findIndex((o) => o.id === row.id);
  if (i === -1) return [...list, row];
  return list.map((o) => (o.id === row.id ? row : o));
}

export function useObjections() {
  const [objections, setObjections] = useState<Objection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `true` desde la primera carga buena: con `error`, lo que se ve es la última lista conocida.
  const [loaded, setLoaded] = useState(false);

  // Solo la primera carga muestra el esqueleto. Si las recargas desmontaran la
  // lista, el botón que abrió la hoja desaparecería y el foco caería al body.
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const { ok, body } = await readJson(await fetch('/api/crm/objections?includeInactive=true', { cache: 'no-store' }));
      if (!ok) throw new Error(messageOf(body, 'No se pudieron cargar las objeciones'));
      setObjections(((body.data as Objection[]) ?? []).map(normalizeObjection));
      loadedOnce.current = true;
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (payload: ObjectionInput, id?: string) => {
    const { ok, body } = await readJson(
      await fetch(id ? `/api/crm/objections/${id}` : '/api/crm/objections', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo guardar la objeción'));
    const row = normalizeObjection(body.data as Objection);
    setObjections((prev) => upsert(prev, row));
    await load();
    return row;
  }, [load]);

  const toggle = useCallback(async (objection: Objection) => {
    const { ok, body } = await readJson(
      await fetch(`/api/crm/objections/${objection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !objection.is_active }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo cambiar el estado'));
    setObjections((prev) => upsert(prev, normalizeObjection(body.data as Objection)));
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const { ok, body } = await readJson(await fetch(`/api/crm/objections/${id}`, { method: 'DELETE' }));
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar la objeción'));
    setObjections((prev) => prev.filter((o) => o.id !== id));
    await load();
  }, [load]);

  return { objections, loading, loaded, error, reload: load, save, toggle, remove };
}
