/**
 * GO Assistant — guías de uso y revisión de permisos (preguntas «¿cómo hago…?»).
 *
 * - `buscar_guia`: pasos y rutas reales del ERP desde la base versionada
 *   `../guias/guias.ts` (las rutas las verifica una prueba contra `src/app`).
 * - `revisar_permisos_usuario`: si el usuario de la SESIÓN tiene un permiso.
 *   Usa `capabilities.permissions` (RPC `get_user_permission_codes`, rol +
 *   cargo) y `hasAnyPermission`, los mismos que filtran las herramientas. No
 *   hay otra lógica de permisos aquí.
 *
 * Las dos son de lectura (`low`).
 */

import { hasAnyPermission } from '@/lib/ai/assistant/capabilities';
import { buscarGuias, RUTA_CARGOS, type Guia } from '../guias/guias';
import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

const READ_PREVIEW: ToolPreview = {
  title: 'Consulta',
  summary: 'Consulta de solo lectura.',
  lines: [],
  warnings: [],
  estimatedCredits: 0,
  reversible: true,
};

function serializarGuia(g: Guia) {
  return {
    id: g.id,
    titulo: g.titulo,
    disponible: g.disponible !== false,
    pasos: g.pasos,
    rutas: g.rutas,
    permisos: g.permisos ?? [],
    notas: g.notas ?? [],
  };
}

interface BuscarGuiaArgs {
  consulta: string;
}

export const buscarGuia: ToolDefinition<BuscarGuiaArgs> = {
  name: 'buscar_guia',
  description:
    'Busca en las guías de uso del ERP cómo hacer una tarea («¿cómo creo un método de pago?», «¿cómo dejo que el cajero quite una promoción?»). Devuelve los pasos y las rutas EXACTAS de las pantallas. Úsala antes de explicar cualquier «¿cómo hago…?». Si una guía viene con disponible=false, la función aún no existe: dilo así.',
  parameters: {
    type: 'object',
    properties: {
      consulta: { type: 'string', description: 'La pregunta o el tema, en palabras del usuario, o el id de una guía.' },
    },
    required: ['consulta'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(raw: unknown): BuscarGuiaArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = (raw as Record<string, unknown>).consulta;
    if (typeof c !== 'string' || !c.trim()) return null;
    return { consulta: c.trim().slice(0, 200) };
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(_ctx: ToolContext, args: BuscarGuiaArgs): Promise<ToolResult> {
    const guias = buscarGuias(args.consulta);
    if (guias.length === 0) {
      return {
        ok: true,
        message: `No tengo una guía para «${args.consulta}». Explica el camino por los menús sin inventar rutas.`,
        data: { encontradas: 0, guias: [] },
      };
    }
    return {
      ok: true,
      message: `Guía: ${guias[0].titulo}.`,
      data: { encontradas: guias.length, guias: guias.map(serializarGuia) },
    };
  },
};

interface RevisarPermisoArgs {
  codigo: string;
}

interface FilaMiembro {
  job_position_id: string | null;
  job_positions: { name: string | null } | Array<{ name: string | null }> | null;
}

/** Nombre del cargo del usuario de la sesión, si lo tiene. Nunca lanza. */
async function cargoDelUsuario(ctx: ToolContext): Promise<string | null> {
  try {
    const { data, error } = await ctx.supabase
      .from('organization_members')
      .select('job_position_id, job_positions(name)')
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (error || !data) return null;
    const fila = data as FilaMiembro;
    const jp = Array.isArray(fila.job_positions) ? fila.job_positions[0] : fila.job_positions;
    return jp?.name ?? null;
  } catch {
    return null;
  }
}

/** Nombre legible del permiso en el catálogo (`permissions`). `undefined` = no existe. */
async function nombrePermiso(ctx: ToolContext, codigo: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await ctx.supabase.from('permissions').select('code, name').eq('code', codigo).maybeSingle();
    if (error) return null;
    if (!data) return undefined;
    return (data as { name: string | null }).name ?? null;
  } catch {
    return null;
  }
}

export const revisarPermisosUsuario: ToolDefinition<RevisarPermisoArgs> = {
  name: 'revisar_permisos_usuario',
  description:
    'Dice si el usuario actual (su rol y su cargo) tiene un permiso concreto, por código (ej. "pos.promotions.remove"). Úsala cuando el usuario pregunte por qué no ve una opción o si puede hacer algo. Si no lo tiene, indica dónde lo activa un administrador.',
  parameters: {
    type: 'object',
    properties: {
      codigo: { type: 'string', description: 'Código del permiso, ej. "pos.promotions.remove".' },
    },
    required: ['codigo'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(raw: unknown): RevisarPermisoArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = (raw as Record<string, unknown>).codigo;
    if (typeof c !== 'string') return null;
    const codigo = c.trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,80}$/.test(codigo)) return null;
    return { codigo };
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: RevisarPermisoArgs): Promise<ToolResult> {
    const [nombre, cargo] = await Promise.all([nombrePermiso(ctx, args.codigo), cargoDelUsuario(ctx)]);
    if (nombre === undefined) {
      return {
        ok: true,
        message: `No existe ningún permiso con el código «${args.codigo}».`,
        data: { codigo: args.codigo, existe: false, tiene: false, cargo },
      };
    }
    const etiqueta = nombre ? `«${nombre}» (${args.codigo})` : `«${args.codigo}»`;
    const tiene = hasAnyPermission(ctx.capabilities, [args.codigo]);
    const porAdmin = tiene && ctx.capabilities.isAdmin;
    return {
      ok: true,
      message: tiene
        ? `Sí tienes el permiso ${etiqueta}${porAdmin ? ' porque eres administrador' : ''}.`
        : `Tu ${cargo ? `cargo «${cargo}»` : 'cargo'} no tiene el permiso ${etiqueta}; un administrador lo activa en Roles y permisos > Cargos (${RUTA_CARGOS}).`,
      data: {
        codigo: args.codigo,
        nombre,
        existe: true,
        tiene,
        por_administrador: porAdmin,
        cargo,
        ruta_para_activarlo: tiene ? null : RUTA_CARGOS,
      },
    };
  },
};

export const GUIAS_TOOLS = [buscarGuia, revisarPermisosUsuario];
