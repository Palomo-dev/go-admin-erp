import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ErrorRutaVariantes, EscrituraVariantes } from './contrato';
import type { CatalogoOrden } from './logicaVariantes';
import type {
  DatosTipo,
  DatosValor,
  EstiloTipo,
  ResultadoFusion,
  ResultadoGuardado,
  ResumenVariantes,
  TipoVariante,
  Traducciones,
  ValorVariante,
} from './tipos';

/**
 * Catálogo de variantes (tipos y valores) de B6a. La lectura es la RPC
 * `fn_variantes_resumen`; las escrituras van por `POST /api/inventario/variantes`
 * (renombrar o fusionar puede reescribir miles de variantes y pasar del corte
 * de 8 s de PostgREST). Todo valida en el servidor la organización de la
 * sesión y el permiso de inventario (`ver`, `editar_catalogo` o `eliminar`);
 * esta capa no decide nada, solo traduce nombres y errores.
 */

type Cliente = Pick<SupabaseClient, 'rpc'>;

/** Error de una RPC del catálogo con su clave estable (para i18n). */
export class ErrorVariantes extends Error {
  constructor(
    public readonly clave: ClaveErrorVariantes,
    public readonly codigo: string | undefined,
    /** Id relacionado: el tipo o valor con el mismo nombre, el que está en uso. */
    public readonly relacionado: number | null,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorVariantes';
  }
}

export type ClaveErrorVariantes =
  | 'sinPermiso'
  | 'nombreRepetido'
  | 'valorRepetido'
  | 'skuRepetido'
  | 'enUso'
  | 'noEncontrado'
  | 'invalido'
  | 'desconocido';

const CLAVES: Record<string, ClaveErrorVariantes> = {
  sin_permiso: 'sinPermiso',
  nombre_repetido: 'nombreRepetido',
  valor_repetido: 'valorRepetido',
  sku_repetido: 'skuRepetido',
  en_uso: 'enUso',
  tipo_no_encontrado: 'noEncontrado',
  valor_no_encontrado: 'noEncontrado',
  nombre_requerido: 'invalido',
  nombre_largo: 'invalido',
  valor_requerido: 'invalido',
  valor_largo: 'invalido',
  hex_invalido: 'invalido',
  sku_invalido: 'invalido',
  traducciones_invalidas: 'invalido',
  tipo_distinto: 'invalido',
  sin_origen: 'invalido',
  sin_cambios: 'invalido',
};

/** Convierte el error de PostgREST en `ErrorVariantes` (clave estable + id relacionado). */
export function aErrorVariantes(error: unknown): ErrorVariantes {
  const e = (error ?? {}) as { code?: string; message?: string; hint?: string; details?: string };
  const mensaje = String(e.message ?? '');
  let clave: ClaveErrorVariantes = CLAVES[mensaje] ?? 'desconocido';
  if (clave === 'desconocido') {
    if (e.code === '42501') clave = 'sinPermiso';
    else if (e.code === 'P0002') clave = 'noEncontrado';
    else if (e.code === '23503') clave = 'enUso';
    else if (e.code === '23505') clave = 'nombreRepetido';
  }
  const relacionado = e.hint && /^\d+$/.test(e.hint) ? Number(e.hint) : null;
  return new ErrorVariantes(clave, e.code, relacionado, e.details || mensaje || 'Error');
}

async function llamar<T>(cliente: Cliente, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw aErrorVariantes(error);
  return data as T;
}

const traducciones = (t: unknown): Traducciones => {
  const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
  const out: Traducciones = {};
  for (const idioma of ['en', 'fr', 'pt'] as const) {
    const v = o[idioma];
    if (typeof v === 'string' && v.trim()) out[idioma] = v;
  }
  return out;
};

/** Normaliza la respuesta de `fn_variantes_resumen` (números como número, nulos a valores seguros). */
export function aResumenVariantes(data: unknown): ResumenVariantes {
  const r = (data ?? {}) as Record<string, unknown>;
  const lista = (x: unknown) => (Array.isArray(x) ? x : []) as Record<string, unknown>[];
  const escrituras = (x: unknown) => lista(x).map((e) => ({ texto: String(e.texto ?? ''), variantes: Number(e.variantes) || 0 }));
  const tipos: TipoVariante[] = lista(r.tipos).map((t) => ({
    id: Number(t.id),
    nombre: String(t.nombre ?? ''),
    orden: Number(t.orden) || 0,
    activo: t.activo !== false,
    estilo: (['texto', 'color', 'imagen'].includes(String(t.estilo)) ? t.estilo : 'texto') as EstiloTipo,
    meta: (t.meta as TipoVariante['meta']) ?? null,
    traducciones: traducciones(t.traducciones),
    creado: (t.creado as string | null) ?? null,
    variantes: Number(t.variantes) || 0,
    relaciones: Number(t.relaciones) || 0,
    valores_fuera: Number(t.valores_fuera) || 0,
    escrituras: escrituras(t.escrituras),
  }));
  const valores: ValorVariante[] = lista(r.valores).map((v) => ({
    id: Number(v.id),
    tipo_id: Number(v.tipo_id),
    valor: String(v.valor ?? ''),
    orden: Number(v.orden) || 0,
    activo: v.activo !== false,
    hex: (v.hex as string | null) ?? null,
    imagen: (v.imagen as string | null) ?? null,
    sku: (v.sku as string | null) ?? null,
    traducciones: traducciones(v.traducciones),
    variantes: Number(v.variantes) || 0,
    relaciones: Number(v.relaciones) || 0,
    escrituras: escrituras(v.escrituras),
  }));
  const fuera = (r.fuera_catalogo ?? {}) as Record<string, unknown>;
  return {
    tipos,
    valores,
    fuera_catalogo: { tipos: escrituras(fuera.tipos), pares: Number(fuera.pares) || 0 },
    variantes: Number(r.variantes) || 0,
    globales: lista(r.globales).map((g) => ({
      id: Number(g.id),
      nombre: String(g.nombre ?? ''),
      valores: (Array.isArray(g.valores) ? g.valores : []).map(String),
    })),
  };
}

/** Cabeceras de la ruta: la organización activa solo para desambiguar pestañas (el servidor usa la de la sesión). */
function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) };
}

/** Escritura por `POST /api/inventario/variantes` (sin el corte de 8 s de PostgREST). */
async function escribir<T>(cuerpo: EscrituraVariantes): Promise<T> {
  const r = await fetch('/api/inventario/variantes', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(),
    body: JSON.stringify(cuerpo),
  });
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  if (!r.ok) {
    const e = (json ?? {}) as Partial<ErrorRutaVariantes> & { code?: string };
    const sqlstate = e.sqlstate ?? (r.status === 403 ? '42501' : r.status === 404 ? 'P0002' : undefined);
    throw aErrorVariantes({
      code: sqlstate,
      message: e.codigo ?? (e.code === 'FOREIGN_ORGANIZATION' ? 'sin_permiso' : 'error_interno'),
      hint: e.relacionado != null ? String(e.relacionado) : undefined,
    });
  }
  return (json as { resultado: T }).resultado;
}

export const variantesService = {
  async resumen(org: number, cliente: Cliente = supabase): Promise<ResumenVariantes> {
    return aResumenVariantes(await llamar<unknown>(cliente, 'fn_variantes_resumen', { p_org: org }));
  },

  /**
   * Orden y muestras del catálogo (tipos y valores ACTIVOS) en una consulta
   * liviana, para quien muestra variantes: el selector del POS y la tienda
   * (`ordenarAtributosSegunCatalogo`) y el formulario del producto. Lee con la
   * RLS de pertenencia; no trae variantes.
   */
  async catalogoOrden(org: number, cliente: Pick<SupabaseClient, 'from'> = supabase): Promise<CatalogoOrden> {
    const { data, error } = await cliente
      .from('variant_types')
      .select('name, display_order, display_style, is_active, variant_values(value, display_order, hex_color, is_active)')
      .eq('organization_id', org)
      .eq('is_active', true);
    if (error) throw error;
    const filas = (data ?? []) as {
      name: string;
      display_order: number | null;
      display_style: string | null;
      variant_values: { value: string; display_order: number | null; hex_color: string | null; is_active: boolean | null }[] | null;
    }[];
    return {
      tipos: filas.map((t) => ({
        nombre: t.name,
        orden: Number(t.display_order) || 0,
        estilo: (['texto', 'color', 'imagen'].includes(String(t.display_style)) ? t.display_style : 'texto') as EstiloTipo,
      })),
      valores: filas.flatMap((t) =>
        (t.variant_values ?? [])
          .filter((v) => v.is_active !== false)
          .map((v) => ({ tipo: t.name, valor: v.value, orden: Number(v.display_order) || 0, hex: v.hex_color })),
      ),
    };
  },

  guardarTipo(id: number | null, datos: DatosTipo): Promise<ResultadoGuardado> {
    return escribir({ accion: 'tipo_guardar', id, datos });
  },

  guardarValor(id: number | null, datos: DatosValor): Promise<ResultadoGuardado> {
    return escribir({ accion: 'valor_guardar', id, datos });
  },

  fusionarTipos(origen: number[], destino: number): Promise<ResultadoFusion> {
    return escribir({ accion: 'fusionar_tipos', ids: origen, destino });
  },

  fusionarValores(origen: number[], destino: number): Promise<ResultadoFusion> {
    return escribir({ accion: 'fusionar_valores', ids: origen, destino });
  },

  /** `tipo` null: ordena los tipos; si no, los valores de ese tipo. */
  reordenar(tipo: number | null, ids: number[]): Promise<number> {
    return escribir({ accion: 'reordenar', tipo, ids });
  },

  cambiar(cambios: { tipos?: number[]; valores?: number[]; activo?: boolean; estilo?: EstiloTipo }): Promise<number> {
    const c: { activo?: boolean; estilo?: EstiloTipo } = {};
    if (cambios.activo !== undefined) c.activo = cambios.activo;
    if (cambios.estilo !== undefined) c.estilo = cambios.estilo;
    return escribir({ accion: 'cambiar', ids: cambios.tipos ?? [], valores: cambios.valores ?? [], cambios: c });
  },

  eliminar(ids: { tipos?: number[]; valores?: number[] }): Promise<number> {
    return escribir({ accion: 'eliminar', ids: ids.tipos ?? [], valores: ids.valores ?? [] });
  },

  completarCatalogo(): Promise<{ tipos: number; valores: number }> {
    return escribir({ accion: 'completar' });
  },

  /** `tipos` null: todos los sugeridos del catálogo global. */
  usarSugeridos(tipos: number[] | null): Promise<number> {
    return escribir(tipos ? { accion: 'sugeridos', ids: tipos } : { accion: 'sugeridos' });
  },
};
