import { supabase } from '@/lib/supabase/config';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { todayInTz, toPlainDate, plainDateToInstant } from '@/lib/utils/timezone';
import { obtenerOrganizacionActiva, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export interface JournalEntry {
  id: number;
  organization_id: number;
  branch_id: number;
  entry_date: string;
  memo: string | null;
  posted: boolean;
  source: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  fact_key?: string | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
  base_currency_code?: string | null;
  comprobante_tipo?: string | null;
  comprobante_prefijo?: string | null;
  comprobante_numero?: number | null;
  lines?: JournalLine[];
}

export interface EstadoReversion {
  /** Contra-asiento que revirtió este asiento. */
  revertidoPor: number | null;
  /** Asiento original, si este es un contra-asiento. */
  reversionDe: number | null;
}

/** Original → contra-asiento, a partir de los asientos ya cargados. */
export function mapaDeReversiones(asientos: Pick<JournalEntry, 'id' | 'source' | 'source_id'>[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const a of asientos) {
    if (a.source === 'reversal' && a.source_id) {
      const original = Number(a.source_id);
      if (Number.isFinite(original)) mapa.set(original, a.id);
    }
  }
  return mapa;
}

const MENSAJES_ASIENTO: Record<string, string> = {
  SIN_PERMISO: 'No tienes permiso para esta acción contable.',
  MOTIVO_REQUERIDO: 'Escribe el motivo de la reversión (al menos 5 caracteres).',
  ES_CONTRA_ASIENTO: 'Un contra-asiento no se revierte. Registra un asiento manual nuevo.',
  AUTOMATICO_SE_REVIERTE_ANULANDO_DOCUMENTO: 'Este asiento es automático: se revierte anulando su documento de origen.',
  ES_BORRADOR: 'Un borrador no se revierte: se descarta.',
  ASIENTO_YA_REVERTIDO: 'Este asiento ya tiene su contra-asiento.',
  PERIODO_CERRADO: 'El periodo contable está cerrado.',
  ASIENTO_DESCUADRADO: 'Los débitos y los créditos no cuadran.',
  CUENTA_INEXISTENTE: 'Una de las cuentas no existe en el plan de cuentas.',
  CUENTA_DE_TITULO: 'Una de las cuentas agrupa otras y no recibe movimientos. Elige una cuenta de detalle.',
  CUENTA_NO_ES_DE_DETALLE: 'Una de las cuentas tiene subcuentas: usa una de ellas.',
  TERCERO_REQUERIDO: 'Esa cuenta exige el NIT o la cédula del tercero.',
  CENTRO_REQUERIDO: 'Esa cuenta exige un centro de costo.',
  CENTRO_INVALIDO: 'El centro de costo no pertenece a la organización.',
  NOMBRE_REQUERIDO: 'Escribe el nombre de la plantilla.',
  NO_ENCONTRADO: 'No se encontró el registro.',
  SESION_REQUERIDA: 'La sesión expiró. Vuelve a entrar.',
  FECHA_REQUERIDA: 'La fecha es requerida.',
  LINEA_INVALIDA: 'Cada línea va al débito o al crédito, con un importe mayor que cero.',
  LINEAS_INSUFICIENTES: 'Un asiento necesita al menos dos líneas.',
  SUCURSAL_INVALIDA: 'Selecciona una sucursal de la organización.',
  ASIENTO_PUBLICADO_INMUTABLE: 'Un asiento publicado no se edita ni se borra: se revierte.',
};

/** Traduce el código que devuelve la base a un mensaje para el usuario. */
export function mensajeErrorAsiento(error: { message?: string } | null | undefined): string {
  const texto = error?.message ?? '';
  const codigo = texto.split(':')[0].trim();
  return MENSAJES_ASIENTO[codigo] ?? (texto || 'No se pudo completar la operación contable.');
}

export interface JournalLine {
  id: number;
  journal_entry_id: number;
  account_code: string;
  description: string | null;
  debit: number;
  credit: number;
  created_at: string;
  updated_at: string;
  /** Sin llave foránea a `cost_centers`: el nombre se lee aparte (`centrosDeCosto`). */
  cost_center_id?: string | null;
  tercero_nit?: string | null;
  tercero_nombre?: string | null;
  account?: ChartAccount;
}

export type TipoCuentaContable = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'order';
export type NaturalezaCuenta = 'debito' | 'credito' | 'orden';
export type NivelCuenta = 'clase' | 'grupo' | 'cuenta' | 'subcuenta' | 'auxiliar' | 'subauxiliar' | 'legacy';

export interface ChartAccount {
  account_code: string;
  organization_id: number;
  name: string;
  type: TipoCuentaContable;
  parent_code: string | null;
  is_active: boolean;
  es_movimiento?: boolean | null;
  requiere_tercero?: boolean | null;
  requiere_centro_costo?: boolean | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** Generada. clase, grupo, cuenta, subcuenta, auxiliar, subauxiliar o legacy. */
  nivel?: NivelCuenta | null;
  clase?: number | null;
  naturaleza?: NaturalezaCuenta | null;
  /** Generada a partir de is_active. No se escribe. */
  activa?: boolean | null;
}

const CAMPOS_CUENTA = [
  'name',
  'type',
  'parent_code',
  'description',
  'is_active',
  'naturaleza',
  'es_movimiento',
  'requiere_tercero',
  'requiere_centro_costo',
] as const;

function camposDeCuenta(cuenta: Partial<ChartAccount>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const campo of CAMPOS_CUENTA) {
    if (cuenta[campo] !== undefined) salida[campo] = cuenta[campo];
  }
  return salida;
}

interface CrudoAlerta {
  id?: number | string;
  fecha?: string | null;
  origen?: string | null;
  origen_id?: string | number | null;
  debito?: string | null;
  credito?: string | null;
  importe?: number | string | null;
  motivo?: string | null;
  detalle?: string | null;
  memo?: string | null;
  publicado?: boolean | null;
}

export interface FalloContable {
  id: number;
  fecha: string | null;
  origen: string | null;
  origenId: string | null;
  debito: string | null;
  credito: string | null;
  importe: number | null;
  motivo: string | null;
  detalle: string | null;
}

export interface AsientoSinLineas {
  id: number;
  fecha: string | null;
  memo: string | null;
  origen: string | null;
  publicado: boolean;
}

export interface AlertasContablesDatos {
  fallos: FalloContable[];
  sinLineas: AsientoSinLineas[];
}

export interface ContabilidadResumen {
  totalAsientos: number;
  asientosPosted: number;
  asientosPendientes: number;
  totalCuentas: number;
  periodosAbiertos: number;
}

export class ContabilidadService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  private static getBranchId(): number | null {
    return getCurrentBranchId();
  }

  static async obtenerResumen(branchId?: number | null): Promise<ContabilidadResumen> {
    const organizationId = this.getOrganizationId();

    let asientosQuery = supabase
      .from('journal_entries')
      .select('id, posted', { count: 'exact' })
      .eq('organization_id', organizationId);

    if (branchId != null) {
      asientosQuery = asientosQuery.eq('branch_id', branchId);
    }

    const [asientosRes, cuentasRes, periodosRes] = await Promise.all([
      asientosQuery,
      supabase
        .from('chart_of_accounts')
        .select('account_code', { count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabase
        .from('fiscal_periods')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('status', 'open')
    ]);

    const asientos = asientosRes.data || [];
    return {
      totalAsientos: asientosRes.count || 0,
      asientosPosted: asientos.filter(a => a.posted).length,
      asientosPendientes: asientos.filter(a => !a.posted).length,
      totalCuentas: cuentasRes.count || 0,
      periodosAbiertos: periodosRes.count || 0
    };
  }

  // Plan de Cuentas
  static async obtenerPlanCuentas(): Promise<ChartAccount[]> {
    const organizationId = this.getOrganizationId();

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('account_code');

    if (error) {
      console.error('Error obteniendo plan de cuentas:', error);
      throw error;
    }

    return data || [];
  }

  /** Solo código, nombre y tipo: el mayor no necesita el plan completo. */
  static async obtenerCuentasLigero(): Promise<Pick<ChartAccount, 'account_code' | 'name' | 'type'>[]> {
    const organizationId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, type')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('account_code');
    if (error) throw error;
    return data || [];
  }

  static async crearCuenta(cuenta: Partial<ChartAccount>): Promise<ChartAccount> {
    const organizationId = this.getOrganizationId();

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        account_code: cuenta.account_code,
        name: cuenta.name,
        type: cuenta.type,
        parent_code: cuenta.parent_code || null,
        description: cuenta.description || null,
        organization_id: organizationId,
        is_active: cuenta.is_active ?? true,
        naturaleza: cuenta.naturaleza ?? null,
        es_movimiento: cuenta.es_movimiento ?? null,
        requiere_tercero: cuenta.requiere_tercero ?? false,
        requiere_centro_costo: cuenta.requiere_centro_costo ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando cuenta:', error);
      throw error;
    }

    return data;
  }

  static async actualizarCuenta(accountCode: string, cuenta: Partial<ChartAccount>): Promise<ChartAccount> {
    const organizationId = this.getOrganizationId();

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .update({
        ...camposDeCuenta(cuenta),
        updated_at: new Date().toISOString()
      })
      .eq('account_code', accountCode)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando cuenta:', error);
      throw error;
    }

    return data;
  }

  static async eliminarCuenta(accountCode: string): Promise<void> {
    const organizationId = this.getOrganizationId();

    const { error } = await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('account_code', accountCode)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error eliminando cuenta:', error);
      throw error;
    }
  }

  // Asientos Contables
  static async obtenerAsientos(filtros?: {
    fechaInicio?: string;
    fechaFin?: string;
    posted?: boolean;
    source?: string;
    branchId?: number | null;
  }): Promise<JournalEntry[]> {
    const organizationId = this.getOrganizationId();

    let query = supabase
      .from('journal_entries')
      .select('*')
      .eq('organization_id', organizationId)
      .order('entry_date', { ascending: false });

    if (filtros?.branchId != null) {
      query = query.eq('branch_id', filtros.branchId);
    }
    if (filtros?.fechaInicio) {
      query = query.gte('entry_date', filtros.fechaInicio);
    }
    if (filtros?.fechaFin) {
      query = query.lte('entry_date', filtros.fechaFin);
    }
    if (filtros?.posted !== undefined) {
      query = query.eq('posted', filtros.posted);
    }
    if (filtros?.source) {
      query = query.eq('source', filtros.source);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo asientos:', error);
      throw error;
    }

    return data || [];
  }

  /** Código y nombre de los centros de costo de la organización con esos ids. */
  static async centrosDeCosto(ids: string[]): Promise<Map<string, { code: string; name: string }>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase
      .from('cost_centers')
      .select('id, code, name')
      .eq('organization_id', this.getOrganizationId())
      .in('id', ids);
    if (error) throw error;
    return new Map(((data ?? []) as Array<{ id: string; code: string; name: string }>).map((c) => [c.id, { code: c.code, name: c.name }]));
  }

  static async nombreSucursal(branchId: number): Promise<string | null> {
    const { data, error } = await supabase
      .from('branches')
      .select('name')
      .eq('id', branchId)
      .eq('organization_id', this.getOrganizationId())
      .maybeSingle();
    if (error) throw error;
    return (data as { name: string | null } | null)?.name ?? null;
  }

  /** Nombre (o correo) de quien creó el asiento; la RLS de `profiles` solo deja ver miembros de la organización. */
  static async nombreUsuario(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    const p = data as { first_name: string | null; last_name: string | null; email: string | null } | null;
    if (!p) return null;
    const nombre = [p.first_name, p.last_name].filter((v) => v && v.trim()).join(' ').trim();
    return nombre || p.email || null;
  }

  static async obtenerAsiento(id: number): Promise<JournalEntry | null> {
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (entryError) {
      console.error('Error obteniendo asiento:', entryError);
      return null;
    }

    const { data: lines, error: linesError } = await supabase
      .from('journal_lines')
      .select(`
        *,
        account:chart_of_accounts (
          account_code,
          name,
          type
        )
      `)
      .eq('journal_entry_id', id)
      .order('id');

    if (linesError) {
      console.error('Error obteniendo líneas:', linesError);
    }

    return {
      ...entry,
      lines: lines || []
    };
  }

  /**
   * Crea un asiento manual en una sola transacción de la base
   * (`fn_asiento_manual_crear`): valida cuentas de detalle, partida doble,
   * permiso y periodo abierto, y le pone su clave de hecho `manual:{uuid}`.
   * Ver ADR-CC-012.
   */
  static async crearAsiento(asiento: {
    entry_date: string;
    memo?: string;
    currency_code?: string;
    exchange_rate?: number;
    base_currency_code?: string;
    lines: {
      account_code: string;
      description?: string;
      debit: number;
      credit: number;
      cost_center_id?: string | null;
      tercero_nit?: string | null;
      tercero_nombre?: string | null;
    }[];
  }, branchId?: number | null, publicar = false): Promise<JournalEntry> {
    const organizationId = this.getOrganizationId();
    const effectiveBranchId = branchId !== undefined ? branchId : this.getBranchId();
    // `journal_entries.entry_date` es timestamptz y aqui llega ya como
    // instante. Para elegir la tasa del dia hace falta el DIA de ese instante
    // en la zona de la sucursal dueña del asiento (ADR-003: identidad dentro,
    // zona resuelta aqui), no su dia UTC.
    const timezone = await resolveTimezone(organizationId, effectiveBranchId);
    const diaDelAsiento = toPlainDate(new Date(asiento.entry_date), timezone);

    const currencyCode = asiento.currency_code || 'COP';
    const baseCurrency = asiento.base_currency_code || 'COP';
    let exchangeRate = asiento.exchange_rate || 1.0;

    // Si la moneda no es la base, obtener la tasa de currency_rates
    if (currencyCode !== baseCurrency && !asiento.exchange_rate) {
      const { data: rateData, error: rateError } = await supabase
        .from('currency_rates')
        .select('rate')
        .eq('code', currencyCode)
        .lte('rate_date', diaDelAsiento)
        .order('rate_date', { ascending: false })
        .limit(1)
        .single();

      if (!rateError && rateData) {
        exchangeRate = parseFloat(rateData.rate);
      }
    }

    const { data: entryId, error } = await supabase.rpc('fn_asiento_manual_crear', {
      p_organization_id: organizationId,
      p_branch_id: effectiveBranchId,
      p_fecha: asiento.entry_date,
      p_memo: asiento.memo ?? null,
      p_lineas: asiento.lines.map(line => ({
        account_code: line.account_code,
        description: line.description ?? null,
        debit: line.debit || 0,
        credit: line.credit || 0,
        cost_center_id: line.cost_center_id || null,
        tercero_nit: line.tercero_nit?.trim() || null,
        tercero_nombre: line.tercero_nombre?.trim() || null,
      })),
      p_publicar: publicar,
      p_currency_code: currencyCode,
      p_exchange_rate: exchangeRate,
      p_base_currency_code: baseCurrency,
    });

    if (error) {
      console.error('Error creando asiento:', error);
      throw new Error(mensajeErrorAsiento(error));
    }

    const entry = await this.obtenerAsiento(entryId as number);
    if (!entry) throw new Error('El asiento se creó pero no se pudo leer');
    return entry;
  }

  static async publicarAsiento(id: number): Promise<void> {
    const { error } = await supabase.rpc('fn_asiento_manual_publicar', { p_entry_id: id });

    if (error) {
      console.error('Error publicando asiento:', error);
      throw new Error(mensajeErrorAsiento(error));
    }
  }

  /** Descarta un borrador manual. Un asiento publicado no se borra: se revierte. */
  static async eliminarAsiento(id: number): Promise<void> {
    const { error } = await supabase.rpc('fn_asiento_manual_descartar', { p_entry_id: id });

    if (error) {
      console.error('Error descartando asiento:', error);
      throw new Error(mensajeErrorAsiento(error));
    }
  }

  /**
   * Revierte un asiento manual publicado con un contra-asiento y un motivo.
   * El permiso «Revertir asientos» y el periodo se resuelven en la base.
   * Devuelve el id del contra-asiento.
   */
  static async revertirAsiento(id: number, motivo: string): Promise<number> {
    const { data, error } = await supabase.rpc('fn_revertir_asiento_manual', {
      p_entry_id: id,
      p_motivo: motivo,
    });

    if (error) {
      console.error('Error revirtiendo asiento:', error);
      throw new Error(mensajeErrorAsiento(error));
    }
    return data as number;
  }

  /** Solo decide si se muestra el botón: la base vuelve a comprobarlo al revertir. */
  static async puedeRevertir(): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_tiene_permiso', {
      p_organization_id: this.getOrganizationId(),
      p_code: 'accounting.reverse',
    });
    return !error && data === true;
  }

  /** Enlace entre un asiento y su contra-asiento, en los dos sentidos. */
  static async obtenerReversion(entry: JournalEntry): Promise<EstadoReversion> {
    if (entry.source === 'reversal') {
      return { revertidoPor: null, reversionDe: Number(entry.source_id) || null };
    }
    const { data } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('organization_id', entry.organization_id)
      .eq('fact_key', `reversal:${entry.id}`)
      .maybeSingle();
    return { revertidoPor: data?.id ?? null, reversionDe: null };
  }

  static async duplicarAsiento(id: number): Promise<JournalEntry> {
    const original = await this.obtenerAsiento(id);
    if (!original || !original.lines) throw new Error('Asiento no encontrado');

    // «Hoy» es el dia del negocio, no el de UTC: a las 20:00 en Bogota el
    // instante UTC ya es del dia siguiente.
    const timezone = await resolveTimezone(this.getOrganizationId(), original.branch_id);

    return this.crearAsiento({
      entry_date: plainDateToInstant(todayInTz(timezone), timezone),
      memo: `${original.memo || ''} (copia)`,
      lines: original.lines.map(l => ({
        account_code: l.account_code,
        description: l.description || undefined,
        debit: l.debit,
        credit: l.credit,
        cost_center_id: l.cost_center_id ?? null,
        tercero_nit: l.tercero_nit ?? null,
        tercero_nombre: l.tercero_nombre ?? null,
      }))
    });
  }

  /**
   * Fallos de asiento aún abiertos y asientos publicados o en borrador
   * que no tienen líneas. La pertenencia la vuelve a exigir la base.
   */
  static async obtenerAlertas(): Promise<AlertasContablesDatos> {
    const { data, error } = await supabase.rpc('fn_alertas_contables', {
      p_organization_id: this.getOrganizationId(),
    });
    if (error) throw error;
    const crudo = (data ?? {}) as { fallos?: CrudoAlerta[]; asientos_sin_lineas?: CrudoAlerta[] };
    const filas = (lista: CrudoAlerta[] | undefined) => (Array.isArray(lista) ? lista : []);
    return {
      fallos: filas(crudo.fallos).map((fila) => ({
        id: Number(fila.id),
        fecha: fila.fecha ?? null,
        origen: fila.origen ?? null,
        origenId: fila.origen_id != null ? String(fila.origen_id) : null,
        debito: fila.debito ?? null,
        credito: fila.credito ?? null,
        importe: fila.importe == null ? null : Number(fila.importe),
        motivo: fila.motivo ?? null,
        detalle: fila.detalle ?? null,
      })),
      sinLineas: filas(crudo.asientos_sin_lineas).map((fila) => ({
        id: Number(fila.id),
        fecha: fila.fecha ?? null,
        memo: fila.memo ?? null,
        origen: fila.origen ?? null,
        publicado: fila.publicado === true,
      })),
    };
  }

  static async listarCentrosCosto(): Promise<{ id: string; code: string; name: string }[]> {
    const { data, error } = await supabase
      .from('cost_centers')
      .select('id, code, name')
      .eq('organization_id', this.getOrganizationId())
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    return (data ?? []) as { id: string; code: string; name: string }[];
  }

  static async guardarCuentasCatalogo(
    tipo: 'producto' | 'categoria',
    id: number,
    cuentas: { ingreso?: string | null; costo?: string | null; inventario?: string | null; devolucion?: string | null },
  ): Promise<void> {
    const { error } = await supabase.rpc('fn_cuentas_catalogo_guardar', {
      p_organization_id: this.getOrganizationId(),
      p_tipo: tipo,
      p_id: id,
      p_ingreso: cuentas.ingreso ?? null,
      p_costo: cuentas.costo ?? null,
      p_inventario: cuentas.inventario ?? null,
      p_devolucion: cuentas.devolucion ?? null,
    });
    if (error) throw new Error(mensajeErrorAsiento(error));
  }

  static async listarPlantillas(): Promise<PlantillaAsiento[]> {
    const { data, error } = await supabase
      .from('plantillas_asiento')
      .select('id, nombre, memo, lineas:plantillas_asiento_lineas(orden, account_code, descripcion, debito, credito, tercero_nit, tercero_nombre, cost_center_id)')
      .eq('organization_id', this.getOrganizationId())
      .eq('activa', true)
      .order('nombre');
    if (error) throw error;
    return ((data ?? []) as PlantillaAsiento[]).map((p) => ({
      ...p,
      lineas: [...(p.lineas ?? [])].sort((a, b) => a.orden - b.orden),
    }));
  }

  static async guardarPlantilla(plantilla: {
    id?: string | null;
    nombre: string;
    memo?: string | null;
    lineas: LineaPlantilla[];
  }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_plantilla_asiento_guardar', {
      p_organization_id: this.getOrganizationId(),
      p_id: plantilla.id ?? null,
      p_nombre: plantilla.nombre,
      p_memo: plantilla.memo ?? null,
      p_lineas: plantilla.lineas.map((l) => ({
        account_code: l.account_code,
        description: l.descripcion,
        debit: l.debito,
        credit: l.credito,
        tercero_nit: l.tercero_nit,
        tercero_nombre: l.tercero_nombre,
        cost_center_id: l.cost_center_id,
      })),
    });
    if (error) throw new Error(mensajeErrorAsiento(error));
    return data as string;
  }

  /** Crea un borrador para revisarlo antes de publicarlo. */
  static async aplicarPlantilla(id: string, branchId: number, fecha: string, memo?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('fn_plantilla_asiento_aplicar', {
      p_plantilla_id: id,
      p_branch_id: branchId,
      p_fecha: fecha,
      p_memo: memo ?? null,
    });
    if (error) throw new Error(mensajeErrorAsiento(error));
    return data as number;
  }

  static async archivarPlantilla(id: string): Promise<void> {
    const { error } = await supabase.rpc('fn_plantilla_asiento_archivar', { p_plantilla_id: id });
    if (error) throw new Error(mensajeErrorAsiento(error));
  }
}

export interface LineaPlantilla {
  orden: number;
  account_code: string;
  descripcion: string | null;
  debito: number;
  credito: number;
  tercero_nit: string | null;
  tercero_nombre: string | null;
  cost_center_id: string | null;
}

export interface PlantillaAsiento {
  id: string;
  nombre: string;
  memo: string | null;
  lineas: LineaPlantilla[];
}
