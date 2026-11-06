import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { EstadoReintento, FilaPendiente, ResumenPendientes } from '@/lib/finanzas/pendientesContables';

interface CrudoFila {
  id: number | string;
  fecha?: string | null;
  creado: string;
  dias?: number | null;
  origen?: string | null;
  origen_id?: string | null;
  documento?: string | null;
  clave?: string | null;
  debito?: string | null;
  credito?: string | null;
  importe?: number | string | null;
  motivo: string;
  detalle?: string | null;
  sede?: string | null;
  intentos?: number | null;
  ultimo_intento?: string | null;
  periodo_cerrado?: boolean | null;
  reintentable?: boolean | null;
}

interface CrudoResumen {
  pendientes?: number | null;
  mas_antiguo_dias?: number | null;
  bloquean_cierre?: number | null;
  periodo_inicio?: string | null;
  valor?: number | string | null;
  total_filtradas?: number | null;
  filas?: CrudoFila[] | null;
}

function organizacion(): number {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('Organization ID no disponible');
  return orgId;
}

function aFila(f: CrudoFila): FilaPendiente {
  return {
    id: Number(f.id),
    fecha: f.fecha ?? null,
    creado: f.creado,
    dias: Number(f.dias ?? 0),
    origen: f.origen ?? null,
    origenId: f.origen_id ?? null,
    documento: f.documento ?? null,
    clave: f.clave ?? null,
    debito: f.debito ?? null,
    credito: f.credito ?? null,
    importe: f.importe === null || f.importe === undefined ? null : Number(f.importe),
    motivo: f.motivo,
    detalle: f.detalle ?? null,
    sede: f.sede ?? null,
    intentos: Number(f.intentos ?? 1),
    ultimoIntento: f.ultimo_intento ?? null,
    periodoCerrado: f.periodo_cerrado === true,
    reintentable: f.reintentable === true,
  };
}

export class PendientesContablesService {
  /** Lanza si la consulta falla: quien llama muestra error, nunca cero. */
  static async listar(opciones: {
    busqueda?: string;
    limite: number;
    desplazamiento: number;
  }): Promise<ResumenPendientes> {
    const { data, error } = await supabase.rpc('fn_pendientes_contables', {
      p_organization_id: organizacion(),
      p_busqueda: opciones.busqueda?.trim() || null,
      p_limite: opciones.limite,
      p_desplazamiento: opciones.desplazamiento,
    });
    if (error) throw error;
    const crudo = data as CrudoResumen | null;
    if (!crudo) throw new Error('Respuesta vacía de fn_pendientes_contables');
    return {
      pendientes: Number(crudo.pendientes ?? 0),
      masAntiguoDias: crudo.mas_antiguo_dias ?? null,
      bloqueanCierre: Number(crudo.bloquean_cierre ?? 0),
      periodoInicio: crudo.periodo_inicio ?? null,
      valor: Number(crudo.valor ?? 0),
      totalFiltradas: Number(crudo.total_filtradas ?? 0),
      filas: (crudo.filas ?? []).map(aFila),
    };
  }

  static async reintentar(falloId: number): Promise<{ estado: EstadoReintento; aviso: string | null }> {
    const { data, error } = await supabase.rpc('fn_pendiente_reintentar', {
      p_organization_id: organizacion(),
      p_fallo_id: falloId,
    });
    if (error) throw error;
    const crudo = (data ?? {}) as { estado?: EstadoReintento; aviso?: string | null };
    return { estado: crudo.estado ?? 'sigue', aviso: crudo.aviso ?? null };
  }
}
