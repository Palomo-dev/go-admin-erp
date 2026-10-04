'use client';

/**
 * Objeciones registradas en UNA oportunidad + catálogo activo para registrar
 * otra (FASE-02, bloque «Objeciones» del drawer). Rutas:
 * `GET/POST /api/crm/objections/opportunity/[id]` y `GET /api/crm/objections`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Objection, OpportunityObjection } from '@/lib/services/crm/objectionService';
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

function normalizeLinked(row: OpportunityObjection): OpportunityObjection {
  return { ...row, objection: row.objection ? normalizeObjection(row.objection) : null };
}

export function useOpportunityObjections(opportunityId: string) {
  const [linked, setLinked] = useState<OpportunityObjection[]>([]);
  const [catalog, setCatalog] = useState<Objection[]>([]);
  const [canRegister,setCanRegister]=useState(false);
  const version=useRef(0);
  const epoch=useRef(0);
  const invalidate=useCallback(()=>{version.current++;epoch.current++;},[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    const current=++version.current;
    try {
      const [linkedRes, catalogRes] = await Promise.all([
        fetch(`/api/crm/objections/opportunity/${opportunityId}`, { cache: 'no-store' }).then(readJson),
        fetch('/api/crm/objections', { cache: 'no-store' }).then(readJson),
      ]);
      if (!linkedRes.ok) throw new Error(messageOf(linkedRes.body, 'No se pudieron cargar las objeciones'));
      if (!catalogRes.ok) throw new Error(messageOf(catalogRes.body, 'No se pudo cargar el catálogo'));
      if(current!==version.current)return;
      setCanRegister(linkedRes.body.canRegister===true);
      setLinked(((linkedRes.body.data as OpportunityObjection[]) ?? []).map(normalizeLinked));
      setCatalog(((catalogRes.body.data as Objection[]) ?? []).map(normalizeObjection));
      loadedOnce.current = true;
    } catch (err) {
      if(current===version.current)setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if(current===version.current)setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    loadedOnce.current = false;
    void load();
    const switched=()=>{invalidate();loadedOnce.current=false;setLinked([]);setCatalog([]);setCanRegister(false);void load();};window.addEventListener('organization-changed',switched);return()=>{invalidate();window.removeEventListener('organization-changed',switched);};
  }, [load,invalidate]);

  const register = useCallback(async (objectionId: string, notes?: string) => {
    const context=epoch.current;
    const { ok, body } = await readJson(
      await fetch(`/api/crm/objections/opportunity/${opportunityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objection_id: objectionId, notes: notes?.trim() || null }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo registrar la objeción'));
    if(context===epoch.current)await load();
    return (body.data as OpportunityObjection).id;
  }, [opportunityId, load]);

  const resolve = useCallback(async (id: string) => {
    const context=epoch.current;
    const { ok, body } = await readJson(
      await fetch(`/api/crm/objections/opportunity/${opportunityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolveId: id }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo marcar como resuelta'));
    if(context!==epoch.current)return;
    const confirmed=body.data as OpportunityObjection;
    setLinked((prev) => prev.map((l) => (l.id === id ? { ...l, resolved:confirmed.resolved,resolved_at:confirmed.resolved_at } : l)));
    await load();
  }, [opportunityId, load]);

  return { linked, catalog, canRegister,loading, error, reload: load, register, resolve };
}
