'use client';

import { useEffect, useState } from 'react';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { EtapaFormulario } from '@/components/crm/kit/opportunityFormLogica';
import { pedirCrm } from './apiCrm';
import { catalogoDesdeRespuestas, type CatalogosCrm, type PipelineCatalogo } from './catalogosCrmLogica';

/**
 * Permisos CRM de la sesión, pipelines con etapas y usuarios de la
 * organización (CRM ola 3A). Todo por rutas del servidor:
 * `/api/crm/permisos`, `/api/crm/pipelines` y `/api/crm/teams/org-members`.
 * Se piden una vez por carga de página (promesa compartida) y se invalidan
 * con `invalidarCatalogosCrm()` (p. ej. tras crear un embudo).
 */
let compartido: Promise<CatalogosCrm> | null = null;

async function cargar(): Promise<CatalogosCrm> {
  const [permisos, pipelines, miembros] = await Promise.all([
    pedirCrm<{ usuario_id: string; permisos: Record<string, boolean> }>('/api/crm/permisos'),
    // Sin `crm.opportunities.view` la ruta responde 403: la pantalla sigue, sin formulario.
    pedirCrm<PipelineCatalogo[]>('/api/crm/pipelines').catch(() => ({ data: [] as PipelineCatalogo[] })),
    pedirCrm<{ id: string; name: string | null; email: string | null }[]>('/api/crm/teams/org-members').catch(() => ({ data: [] })),
  ]);
  return catalogoDesdeRespuestas(permisos.data, pipelines.data, miembros.data);
}

export function invalidarCatalogosCrm(): void {
  compartido = null;
}

export interface EstadoCatalogosCrm extends CatalogosCrm {
  cargando: boolean;
  error: unknown;
}

const VACIO: CatalogosCrm = { usuarioId: null, permisos: {}, pipelines: [], etapas: [] as EtapaFormulario[], usuarios: [] as OpcionUsuario[] };

export function useCatalogosCrm(): EstadoCatalogosCrm {
  const [estado, setEstado] = useState<EstadoCatalogosCrm>({ ...VACIO, cargando: true, error: null });
  useEffect(() => {
    let vivo = true;
    compartido ??= cargar().catch((e) => {
      compartido = null;
      throw e;
    });
    compartido.then(
      (c) => vivo && setEstado({ ...c, cargando: false, error: null }),
      (e: unknown) => vivo && setEstado({ ...VACIO, cargando: false, error: e }),
    );
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}
