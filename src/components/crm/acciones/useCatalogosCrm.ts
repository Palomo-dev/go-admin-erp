'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { EtapaFormulario } from '@/components/crm/kit/opportunityFormLogica';
import { pedirCrm, ErrorApiCrm } from './apiCrm';
import { catalogoDesdeRespuestas, type CatalogosCrm, type PipelineCatalogo } from './catalogosCrmLogica';

/**
 * Permisos CRM de la sesión, pipelines con etapas y usuarios de la
 * organización (CRM ola 3A). Todo por rutas del servidor:
 * `/api/crm/permisos`, `/api/crm/pipelines` y `/api/crm/teams/org-members`.
 * Se piden una vez por carga de página (promesa compartida) y se invalidan
 * con `invalidarCatalogosCrm()` (p. ej. tras crear un embudo).
 */
const compartidos = new Map<string, Promise<CatalogosCrm>>();
const INVALIDADOS = 'crm:catalogos-invalidados';
let revision = 0;
function suscribir(actualizar: () => void) {
  window.addEventListener(ORGANIZATION_CHANGED_EVENT, actualizar);
  window.addEventListener(INVALIDADOS, actualizar);
  return () => {
    window.removeEventListener(ORGANIZATION_CHANGED_EVENT, actualizar);
    window.removeEventListener(INVALIDADOS, actualizar);
  };
}
const snapshot = () => `${getOrganizationId()}:${revision}`;

async function cargar(): Promise<CatalogosCrm> {
  const [permisos, pipelines, miembros] = await Promise.all([
    pedirCrm<{ usuario_id: string; permisos: Record<string, boolean> }>('/api/crm/permisos'),
    // Sin `crm.opportunities.view` la ruta responde 403: la pantalla sigue, sin formulario.
    pedirCrm<PipelineCatalogo[]>('/api/crm/pipelines').catch(error => {
      if (error instanceof ErrorApiCrm && error.status === 403) return { data: [] as PipelineCatalogo[] };
      throw error;
    }),
    pedirCrm<{ id: string; name: string | null; email: string | null }[]>('/api/crm/teams/org-members'),
  ]);
  return catalogoDesdeRespuestas(permisos.data, pipelines.data, miembros.data);
}

export function invalidarCatalogosCrm(): void {
  compartidos.clear();
  revision += 1;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INVALIDADOS));
}

export interface EstadoCatalogosCrm extends CatalogosCrm {
  cargando: boolean;
  error: unknown;
}

const VACIO: CatalogosCrm = { usuarioId: null, permisos: {}, pipelines: [], etapas: [] as EtapaFormulario[], usuarios: [] as OpcionUsuario[] };

export function useCatalogosCrm(): EstadoCatalogosCrm {
  const scope = useSyncExternalStore(suscribir, snapshot, () => 'ssr');
  const [estado, setEstado] = useState<EstadoCatalogosCrm & { scope: string }>({ ...VACIO, scope: '', cargando: true, error: null });
  useEffect(() => {
    let vivo = true;
    let promesa = compartidos.get(scope);
    promesa ??= cargar().catch((e) => {
      if (compartidos.get(scope) === promesa) compartidos.delete(scope);
      throw e;
    });
    compartidos.set(scope, promesa);
    promesa.then(
      (c) => vivo && setEstado({ ...c, scope, cargando: false, error: null }),
      (e: unknown) => vivo && setEstado({ ...VACIO, scope, cargando: false, error: e }),
    );
    return () => {
      vivo = false;
    };
  }, [scope]);
  return estado.scope === scope ? estado : { ...VACIO, cargando: true, error: null };
}
