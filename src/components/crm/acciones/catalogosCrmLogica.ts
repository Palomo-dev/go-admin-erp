/**
 * Catálogos del CRM para las pantallas de la ola 3A, sin React: permisos de la
 * sesión (resueltos en el servidor), pipelines con etapas y usuarios.
 */
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { EtapaFormulario } from '@/components/crm/kit/opportunityFormLogica';
import type { PipelineOpcion } from '@/components/crm/kit/OpportunityFormCampos';

export interface PipelineCatalogo {
  id: string;
  name: string;
  pipeline_type?: string | null;
  is_default?: boolean | null;
  stages?: { id: string; name: string; position: number; probability: number | null; is_won?: boolean | null; is_lost?: boolean | null }[] | null;
}

export interface CatalogosCrm {
  usuarioId: string | null;
  permisos: Record<string, boolean>;
  /** Primero el de ventas por defecto: el formulario nace ahí (D2, plan §7.5). */
  pipelines: PipelineOpcion[];
  etapas: EtapaFormulario[];
  usuarios: OpcionUsuario[];
}

/** Ventas por defecto → ventas → por defecto → el resto, por nombre. */
export function ordenarPipelines(ps: readonly PipelineCatalogo[]): PipelineCatalogo[] {
  const peso = (p: PipelineCatalogo) => (p.pipeline_type === 'sales' ? 0 : 2) + (p.is_default ? 0 : 1);
  return [...ps].sort((a, b) => peso(a) - peso(b) || a.name.localeCompare(b.name));
}

export function catalogoDesdeRespuestas(
  sesion: { usuario_id: string; permisos: Record<string, boolean> } | null,
  pipelines: readonly PipelineCatalogo[],
  miembros: readonly { id: string; name: string | null; email: string | null }[],
): CatalogosCrm {
  const ordenados = ordenarPipelines(pipelines);
  return {
    usuarioId: sesion?.usuario_id ?? null,
    permisos: sesion?.permisos ?? {},
    pipelines: ordenados.map((p) => ({ id: p.id, name: p.name })),
    etapas: ordenados.flatMap((p) =>
      (p.stages ?? []).map((s) => ({ id: s.id, pipeline_id: p.id, name: s.name, position: s.position, probability: s.probability, is_won: s.is_won, is_lost: s.is_lost })),
    ),
    usuarios: miembros
      .map((m) => ({ id: m.id, nombre: (m.name ?? '').trim() || m.email || '—' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

/** `permisos['crm.leads.assign']` con `false` por defecto (sin respuesta, no se muestra). */
export function puede(permisos: Record<string, boolean>, codigo: string): boolean {
  return permisos[codigo] === true;
}

/** Nombre del usuario por id (para «Responsable»), o null. */
export function nombreUsuario(usuarios: readonly OpcionUsuario[], id: string | null | undefined): string | null {
  if (!id) return null;
  return usuarios.find((u) => u.id === id)?.nombre ?? null;
}
