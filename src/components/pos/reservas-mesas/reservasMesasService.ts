import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { resolverAjustesSede } from '@/lib/services/restaurantBookingSettingsService';
import { numeroVenta, type DocumentoVenta } from '@/lib/pos/ventas/documentosVenta';
import type { DepositoDeReserva } from '@/lib/services/restaurante/depositoReserva';
import {
  mensajeErrorReserva,
  interpretarErrorReserva,
  esFuncionInexistente,
  esColumnaInexistente,
  type ErrorReservaInterpretado,
} from './erroresReserva';
import {
  crearReservaSinMigracion,
  cancelarReservaSinMigracion,
  sentarReservaSinMigracion,
  noShowSinMigracion,
} from './respaldoSinMigracion';

// ── Tipos ──────────────────────────────────────────────────────────────

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
export type ReservationSource = 'admin' | 'website' | 'phone' | 'whatsapp';

/** Columnas del depósito (migración D7) vienen con `*`; antes de aplicarla, ausentes. */
export interface RestaurantReservation extends DepositoDeReserva {
  id: string;
  organization_id: number;
  branch_id: number;
  restaurant_table_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_id: string | null;
  party_size: number;
  reservation_date: string; // 'YYYY-MM-DD'
  reservation_time: string; // 'HH:mm:ss'
  duration_minutes: number;
  status: ReservationStatus;
  notes: string | null;
  special_requests: string | null;
  source: ReservationSource;
  created_by: string | null;
  confirmed_at: string | null;
  seated_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Migración D4: sesión de mesa abierta al sentar la reserva. */
  table_session_id?: string | null;
  /** Migración D5. */
  no_show_at?: string | null;
  late_alert_sent_at?: string | null;
  /** Migración D5: «Esperar 15 min» compartido entre puestos. */
  arrival_wait_until?: string | null;
  // Relaciones
  restaurant_table?: {
    id: string;
    name: string;
    zone: string | null;
    capacity: number;
    state: string;
  };
}

export interface CreateReservationInput {
  restaurant_table_id?: string | null;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_id?: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  duration_minutes?: number;
  notes?: string;
  special_requests?: string;
  source?: ReservationSource;
}

export interface UpdateReservationInput {
  restaurant_table_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  party_size?: number;
  reservation_date?: string;
  reservation_time?: string;
  duration_minutes?: number;
  notes?: string;
  special_requests?: string;
}

export interface ReservationFilters {
  status?: ReservationStatus[];
  date_from?: string;
  date_to?: string;
  search?: string;
  source?: ReservationSource;
  restaurant_table_id?: string;
  branch_id?: number | null;
}

export interface ReservationStats {
  total: number;
  pending: number;
  confirmed: number;
  seated: number;
  completed: number;
  cancelled: number;
  no_show: number;
  avg_party_size: number;
}

/** Venta de la mesa en la que se sentó la reserva («Completada · Venta …»). */
export interface VentaDeReserva {
  saleId: string;
  numero: string | null;
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  seated: 'Sentada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No se presentó',
};

export const RESERVATION_SOURCE_LABELS: Record<ReservationSource, string> = {
  admin: 'Admin',
  website: 'Website',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
};

/** Orígenes que el equipo puede elegir al crear: `website` solo lo usa el sitio. */
export const ORIGENES_DEL_EQUIPO: ReadonlyArray<Exclude<ReservationSource, 'website'>> = ['admin', 'phone', 'whatsapp'];

/** Tipo de notificación de una reserva web nueva (contrato con la campana, paquete E). */
export const TIPO_NOTIFICACION_RESERVA_WEB = 'restaurant_reservation_created';

const SELECT_RESERVA = `
  *,
  restaurant_table:restaurant_tables(id, name, zone, capacity, state)
`;

/**
 * Error de una acción de reservas. `message` va en español (registros);
 * `error` lleva la clave de `posReservasMesas.errores` que la interfaz traduce
 * con `useMensajeErrorReserva`.
 */
export class ReservaMesaError extends Error {
  public readonly error: ErrorReservaInterpretado | null;
  constructor(mensaje: string, public readonly causa?: unknown) {
    super(mensaje);
    this.name = 'ReservaMesaError';
    this.error = interpretarErrorReserva(causa as { message?: string; code?: string } | null);
  }
}

// ── Servicio ───────────────────────────────────────────────────────────

let contadorCanales = 0;

class ReservasMesasService {

  private get organizationId() {
    return getOrganizationId();
  }

  /**
   * Obtener reservas con filtros
   */
  async getReservations(filters?: ReservationFilters): Promise<RestaurantReservation[]> {
    try {
      let query = supabase
        .from('restaurant_reservations')
        .select(SELECT_RESERVA)
        .eq('organization_id', this.organizationId)
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });

      // Filtro de sucursal: branch_id viene explícito en los filtros (del BranchContext)
      if (filters?.branch_id != null) {
        query = query.eq('branch_id', filters.branch_id);
      }

      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters?.date_from) {
        query = query.gte('reservation_date', filters.date_from);
      }

      if (filters?.date_to) {
        query = query.lte('reservation_date', filters.date_to);
      }

      if (filters?.source) {
        query = query.eq('source', filters.source);
      }

      if (filters?.restaurant_table_id) {
        query = query.eq('restaurant_table_id', filters.restaurant_table_id);
      }

      if (filters?.search) {
        query = query.or(
          `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as RestaurantReservation[];
    } catch (error) {
      console.error('Error obteniendo reservas:', error);
      throw error;
    }
  }

  /**
   * Obtener una reserva por ID
   */
  async getReservationById(id: string): Promise<RestaurantReservation | null> {
    try {
      const { data, error } = await supabase
        .from('restaurant_reservations')
        .select(SELECT_RESERVA)
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .single();

      if (error) throw error;
      return data as RestaurantReservation;
    } catch (error) {
      console.error('Error obteniendo reserva:', error);
      throw error;
    }
  }

  /**
   * Crear reserva desde el ERP: UNA sola vía, la RPC `create_restaurant_reservation`
   * (sobrecarga de la migración D1) con origen del equipo. La base valida la mesa
   * contra la organización y la sede con `FOR UPDATE`, el solape con buffer y el
   * cliente; ya no se marca `restaurant_tables.state = 'reserved'` a mano (la
   * pantalla de Mesas deriva «reservada» con `estadoVisualMesa`).
   *
   * @param branchId Sucursal concreta (obligatoria): el branchFilter del BranchContext.
   */
  async createReservation(input: CreateReservationInput, branchId: number): Promise<RestaurantReservation> {
    const origen = input.source && input.source !== 'website' ? input.source : 'admin';
    const { data, error } = await supabase.rpc('create_restaurant_reservation', {
      p_organization_id: this.organizationId,
      p_reservation_date: input.reservation_date,
      p_reservation_time: input.reservation_time,
      p_party_size: input.party_size,
      p_customer_name: input.customer_name,
      p_table_id: input.restaurant_table_id || null,
      p_customer_id: input.customer_id || null,
      p_duration_minutes: input.duration_minutes || null,
      p_validar_reglas: true,
      p_branch_id: branchId,
      p_customer_phone: input.customer_phone || null,
      p_customer_email: input.customer_email || null,
      p_notes: input.notes || null,
      p_special_requests: input.special_requests || null,
      p_source: origen,
    });
    let reservationId: string | null = data?.reservation_id ? String(data.reservation_id) : null;
    if (esFuncionInexistente(error)) {
      // D1 sin aplicar: la vía anterior (respaldoSinMigracion).
      try {
        reservationId = await crearReservaSinMigracion(this.organizationId, input, branchId, origen);
      } catch (e) {
        console.error('Error creando reserva (sin D1):', e);
        throw new ReservaMesaError(mensajeErrorReserva(e as { message?: string }, 'No se pudo crear la reserva'), e);
      }
    } else if (error || !reservationId) {
      console.error('Error creando reserva:', error);
      throw new ReservaMesaError(mensajeErrorReserva(error, 'No se pudo crear la reserva'), error);
    }
    const creada = await this.getReservationById(reservationId as string);
    if (!creada) throw new ReservaMesaError('No se pudo leer la reserva creada');
    return creada;
  }

  /**
   * Actualizar reserva
   */
  async updateReservation(id: string, input: UpdateReservationInput): Promise<RestaurantReservation> {
    try {
      const { data, error } = await supabase
        .from('restaurant_reservations')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .select(SELECT_RESERVA)
        .single();

      if (error) throw error;
      return data as RestaurantReservation;
    } catch (error) {
      console.error('Error actualizando reserva:', error);
      throw error;
    }
  }

  /**
   * Sentar una reserva en su mesa: `pos_reserva_sentar` (migración D4) abre la
   * cuenta de la mesa y deja la reserva `seated` con `table_session_id` en una
   * transacción. Al cerrar esa mesa (liberar, cobrar o anular) la base pasa la
   * reserva a «Completada».
   */
  async sentarReserva(reservationId: string, tableId: string, comensales?: number): Promise<{ tableSessionId: string }> {
    const { data, error } = await supabase.rpc('pos_reserva_sentar', {
      p_organization_id: this.organizationId,
      p_reservation_id: reservationId,
      p_table_id: tableId,
      p_customers: comensales ?? null,
    });
    if (esFuncionInexistente(error)) {
      // D4 sin aplicar: abrir la cuenta y marcar `seated`, como antes.
      try {
        return await sentarReservaSinMigracion(this.organizationId, reservationId, tableId, comensales);
      } catch (e) {
        console.error('Error sentando reserva (sin D4):', e);
        throw new ReservaMesaError(mensajeErrorReserva(e as { message?: string }, 'No se pudo sentar la reserva'), e);
      }
    }
    if (error || !data?.table_session_id) {
      console.error('Error sentando reserva:', error);
      throw new ReservaMesaError(mensajeErrorReserva(error, 'No se pudo sentar la reserva'), error);
    }
    return { tableSessionId: String(data.table_session_id) };
  }

  /**
   * Cambiar estado de reserva.
   * - `cancelled`: RPC `cancel_restaurant_reservation` con `p_forzar` (el equipo
   *   puede cancelar fuera del plazo del cliente; la base exige sesión de miembro).
   * - `no_show`: `no_show_at` (migración D5), ya no `cancelled_at`.
   * - `seated` sin mesa: solo el estado. Con mesa, usar `sentarReserva`.
   * La mesa solo se suelta si estaba marcada `reserved` (dato heredado): nunca se
   * toca una mesa `occupied`, que pertenece a una cuenta abierta.
   */
  async changeStatus(id: string, status: ReservationStatus, reason?: string): Promise<RestaurantReservation> {
    const now = new Date().toISOString();

    if (status === 'cancelled') {
      const { error } = await supabase.rpc('cancel_restaurant_reservation', {
        p_reservation_id: id,
        p_forzar: true,
        p_reason: reason || null,
      });
      if (esFuncionInexistente(error)) {
        // D1 sin aplicar: UPDATE de estado, como antes.
        await cancelarReservaSinMigracion(this.organizationId, id, reason).catch((e) => {
          throw new ReservaMesaError(mensajeErrorReserva(e, 'No se pudo cancelar la reserva'), e);
        });
      } else if (error) {
        console.error('Error cancelando reserva:', error);
        throw new ReservaMesaError(mensajeErrorReserva(error, 'No se pudo cancelar la reserva'), error);
      }
    } else {
      const updateData: Record<string, unknown> = { status, updated_at: now };
      switch (status) {
        case 'confirmed':
          updateData.confirmed_at = now;
          break;
        case 'seated':
          updateData.seated_at = now;
          break;
        case 'completed':
          updateData.completed_at = now;
          break;
        case 'no_show':
          updateData.no_show_at = now;
          break;
      }
      const { error } = await supabase
        .from('restaurant_reservations')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', this.organizationId);
      if (status === 'no_show' && esColumnaInexistente(error)) {
        // D5 sin aplicar (no hay `no_show_at`): como antes, en `cancelled_at`.
        await noShowSinMigracion(this.organizationId, id).catch((e) => {
          throw new ReservaMesaError(mensajeErrorReserva(e, 'No se pudo cambiar el estado'), e);
        });
      } else if (error) {
        console.error('Error cambiando estado de reserva:', error);
        throw new ReservaMesaError(mensajeErrorReserva(error, 'No se pudo cambiar el estado'), error);
      }
    }

    const data = await this.getReservationById(id);
    if (!data) throw new ReservaMesaError('La reserva ya no existe');

    if (data.restaurant_table_id && ['completed', 'cancelled', 'no_show'].includes(status)) {
      await this.soltarMesaReservada(data.restaurant_table_id);
    }
    return data;
  }

  /**
   * «Esperar N min» del aviso «no ha llegado»: guarda `arrival_wait_until`
   * (D5) para que lo vean todos los puestos. Devuelve el instante, o `null` si
   * la columna aún no existe (antes de D5): la pantalla lo recuerda entonces
   * solo en este navegador.
   */
  async esperarLlegada(id: string, minutos: number): Promise<string | null> {
    // Instante absoluto (timestamptz): no es un día calendario, no pasa por la zona.
    const hasta = new Date(Date.now() + minutos * 60_000).toISOString();
    const { error } = await supabase
      .from('restaurant_reservations')
      .update({ arrival_wait_until: hasta })
      .eq('id', id)
      .eq('organization_id', this.organizationId);
    if (esColumnaInexistente(error)) return null;
    if (error) {
      console.error('Error posponiendo el aviso de llegada:', error);
      throw new ReservaMesaError(mensajeErrorReserva(error, 'No se pudo posponer el aviso'), error);
    }
    return hasta;
  }

  /**
   * Registra en finanzas el reembolso del depósito de una reserva web (D7):
   * `fn_reserva_mesa_deposito_reembolsar` deja el pago `void` con su rastro en
   * `finance_audit_log` y el depósito `refunded`. El permiso (`finance.void` o
   * `pos.void`) y la sucursal los comprueba la base con la sesión. El dinero se
   * devuelve en la pasarela: esto solo lo registra, una vez.
   */
  async reembolsarDeposito(id: string, motivo: string): Promise<void> {
    const { error } = await supabase.rpc('fn_reserva_mesa_deposito_reembolsar', {
      p_reservation_id: id,
      p_motivo: motivo,
    });
    if (error) {
      console.error('Error registrando el reembolso del depósito:', { code: error.code });
      throw new ReservaMesaError(
        error.message?.includes('sin_permiso')
          ? 'No tienes permiso para registrar reembolsos'
          : error.message?.includes('deposito_no_reembolsable')
            ? 'Este depósito no está pagado o ya se reembolsó'
            : 'No se pudo registrar el reembolso',
        error,
      );
    }
  }

  /**
   * «Confirmar y asignar mesa» (Figma 1801:169066, paso 4) de una reserva
   * pendiente: comprueba con `getAvailableTables` —la misma regla de solape y
   * buffer que usa la edición— que la mesa sigue libre a esa hora y deja la
   * reserva `confirmed` con su mesa. Sin mesa (sede sin mesas), solo confirma.
   */
  async confirmarConMesa(reserva: RestaurantReservation, tableId: string | null): Promise<RestaurantReservation> {
    if (tableId) {
      const libres = await this.getAvailableTables(
        reserva.reservation_date,
        reserva.reservation_time,
        reserva.party_size,
        reserva.branch_id,
        reserva.id,
        reserva.duration_minutes || 90,
      );
      if (!libres.some((m) => m.id === tableId)) {
        throw new ReservaMesaError(
          mensajeErrorReserva({ message: 'AFORO: La mesa ya tiene una reserva en ese horario' }),
          { message: 'AFORO: La mesa ya tiene una reserva en ese horario' },
        );
      }
    }
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from('restaurant_reservations')
      .update({
        status: 'confirmed',
        confirmed_at: ahora,
        updated_at: ahora,
        ...(tableId ? { restaurant_table_id: tableId } : {}),
      })
      .eq('id', reserva.id)
      .eq('organization_id', this.organizationId)
      .eq('status', 'pending');
    if (error) {
      console.error('Error confirmando reserva:', error);
      throw new ReservaMesaError(mensajeErrorReserva(error, 'No se pudo confirmar la reserva'), error);
    }
    const data = await this.getReservationById(reserva.id);
    if (!data) throw new ReservaMesaError('La reserva ya no existe');
    return data;
  }

  /**
   * Eliminar reserva
   */
  async deleteReservation(id: string): Promise<void> {
    try {
      const reservation = await this.getReservationById(id);

      const { error } = await supabase
        .from('restaurant_reservations')
        .delete()
        .eq('id', id)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      if (reservation?.restaurant_table_id && ['pending', 'confirmed'].includes(reservation.status)) {
        await this.soltarMesaReservada(reservation.restaurant_table_id);
      }
    } catch (error) {
      console.error('Error eliminando reserva:', error);
      throw error;
    }
  }

  /** Suelta la mesa solo si quedó marcada `reserved` (nunca una `occupied`). */
  private async soltarMesaReservada(tableId: string): Promise<void> {
    await supabase
      .from('restaurant_tables')
      .update({ state: 'free', updated_at: new Date().toISOString() })
      .eq('id', tableId)
      .eq('organization_id', this.organizationId)
      .eq('state', 'reserved');
  }

  /**
   * Mesas libres para una fecha/hora. Ayuda de la interfaz: la garantía la da
   * la RPC con `FOR UPDATE`. Usa el mismo solape que la base: duración + buffer
   * de la configuración de la sede (con respaldo de la organización).
   */
  async getAvailableTables(
    date: string,
    time: string,
    partySize: number,
    branchId: number,
    excludeReservationId?: string,
    durationMinutes: number = 90
  ): Promise<Array<{ id: string; name: string; zone: string | null; capacity: number; state: string }>> {
    try {
      const [{ data: tables, error: tablesError }, buffer] = await Promise.all([
        supabase
          .from('restaurant_tables')
          .select('id, name, zone, capacity, state')
          .eq('organization_id', this.organizationId)
          .eq('branch_id', branchId)
          .gte('capacity', partySize)
          .order('name'),
        this.bufferDeSede(branchId),
      ]);

      if (tablesError) throw tablesError;
      if (!tables) return [];

      let reservationsQuery = supabase
        .from('restaurant_reservations')
        .select('restaurant_table_id, reservation_time, duration_minutes')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', branchId)
        .eq('reservation_date', date)
        .in('status', ['pending', 'confirmed', 'seated'])
        .not('restaurant_table_id', 'is', null);

      if (excludeReservationId) {
        reservationsQuery = reservationsQuery.neq('id', excludeReservationId);
      }

      const { data: reservations } = await reservationsQuery;

      const busyTableIds = new Set<string>();
      const requestedMinutes = this.timeToMinutes(time);
      const requestedEnd = requestedMinutes + durationMinutes + buffer;

      reservations?.forEach((r) => {
        const resMinutes = this.timeToMinutes(r.reservation_time);
        const resEnd = resMinutes + (r.duration_minutes || 90) + buffer;
        if (requestedMinutes < resEnd && requestedEnd > resMinutes && r.restaurant_table_id) {
          busyTableIds.add(r.restaurant_table_id);
        }
      });

      return tables.filter((t) => !busyTableIds.has(t.id));
    } catch (error) {
      console.error('Error obteniendo mesas disponibles:', error);
      throw error;
    }
  }

  /** `buffer_minutes` efectivo de la sede: `resolverAjustesSede` (la sede gana, la organización respalda, si no el default). */
  private async bufferDeSede(branchId: number): Promise<number> {
    const { data } = await supabase
      .from('restaurant_booking_settings')
      .select('branch_id, buffer_minutes')
      .eq('organization_id', this.organizationId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`);
    return resolverAjustesSede((data ?? []) as Record<string, unknown>[], branchId).efectiva.buffer_minutes;
  }

  /**
   * Venta de la mesa de cada reserva sentada o completada:
   * `table_session_id` → `table_sessions.sale_id` → número de su factura
   * (`numeroVenta`). Antes de aplicar la migración D4 no hay `table_session_id`
   * y devuelve un mapa vacío.
   */
  async getVentasDeReservas(reservas: readonly RestaurantReservation[]): Promise<Map<string, VentaDeReserva>> {
    const resultado = new Map<string, VentaDeReserva>();
    const conSesion = reservas.filter((r) => r.table_session_id);
    if (conSesion.length === 0) return resultado;

    const { data: sesiones } = await supabase
      .from('table_sessions')
      .select('id, sale_id')
      .eq('organization_id', this.organizationId)
      .in('id', conSesion.map((r) => r.table_session_id as string));
    const ventaDeSesion = new Map<string, string>();
    (sesiones ?? []).forEach((s: { id: string; sale_id: string | null }) => {
      if (s.sale_id) ventaDeSesion.set(s.id, s.sale_id);
    });
    const ventas = Array.from(new Set(ventaDeSesion.values()));
    if (ventas.length === 0) return resultado;

    const { data: documentos } = await supabase
      .from('invoice_sales')
      .select('id, sale_id, number, document_type, status, created_at')
      .eq('organization_id', this.organizationId)
      .in('sale_id', ventas);
    const docsDeVenta = new Map<string, DocumentoVenta[]>();
    (documentos ?? []).forEach((d: DocumentoVenta & { sale_id: string }) => {
      const lista = docsDeVenta.get(d.sale_id) ?? [];
      lista.push(d);
      docsDeVenta.set(d.sale_id, lista);
    });

    conSesion.forEach((r) => {
      const saleId = ventaDeSesion.get(r.table_session_id as string);
      if (!saleId) return;
      const n = numeroVenta(docsDeVenta.get(saleId));
      resultado.set(r.id, { saleId, numero: n.tipo === 'sin_numero' ? null : n.numero });
    });
    return resultado;
  }

  /** Inasistencias (`no_show`) de cada cliente de la lista. */
  async getInasistenciasPorCliente(customerIds: readonly string[]): Promise<Map<string, number>> {
    const ids = Array.from(new Set(customerIds.filter(Boolean)));
    const conteo = new Map<string, number>();
    if (ids.length === 0) return conteo;
    const { data } = await supabase
      .from('restaurant_reservations')
      .select('customer_id')
      .eq('organization_id', this.organizationId)
      .eq('status', 'no_show')
      .in('customer_id', ids);
    (data ?? []).forEach((f: { customer_id: string | null }) => {
      if (f.customer_id) conteo.set(f.customer_id, (conteo.get(f.customer_id) ?? 0) + 1);
    });
    return conteo;
  }

  /**
   * Tiempo real: avisa de cada INSERT/UPDATE de reservas de la organización
   * (migración D3 añade la tabla a `supabase_realtime`; la RLS de SELECT ya
   * limita a los miembros). Con sede, filtra en el cliente: Realtime solo admite
   * un filtro por canal. Devuelve la función para cancelar.
   */
  subscribeToReservations(
    callback: (evento: { tipo: 'INSERT' | 'UPDATE' | 'DELETE'; reserva: Partial<RestaurantReservation> }) => void,
    branchId?: number | null,
  ): () => void {
    const orgId = this.organizationId;
    contadorCanales += 1;
    // Un canal por suscripción: Mesas y Reservas pueden escuchar a la vez.
    const canal: RealtimeChannel = supabase
      .channel(`restaurant_reservations_${orgId}_${branchId ?? 'todas'}_${contadorCanales}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_reservations', filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const fila = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as Partial<RestaurantReservation>;
          if (branchId != null && fila.branch_id != null && fila.branch_id !== branchId) return;
          callback({ tipo: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', reserva: fila });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }

  /**
   * Obtener estadísticas de reservas para un rango de fechas
   */
  async getStats(dateFrom?: string, dateTo?: string, branchId?: number | null): Promise<ReservationStats> {
    try {
      let query = supabase
        .from('restaurant_reservations')
        .select('id, status, party_size')
        .eq('organization_id', this.organizationId);

      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

      if (dateFrom) query = query.gte('reservation_date', dateFrom);
      if (dateTo) query = query.lte('reservation_date', dateTo);

      const { data, error } = await query;
      if (error) throw error;

      const reservations = data || [];
      const total = reservations.length;

      const stats: ReservationStats = {
        total,
        pending: 0,
        confirmed: 0,
        seated: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0,
        avg_party_size: 0,
      };

      let totalPartySize = 0;

      reservations.forEach((r) => {
        const s = r.status as ReservationStatus;
        if (s in stats) {
          (stats as unknown as Record<string, number>)[s]++;
        }
        totalPartySize += r.party_size || 0;
      });

      stats.avg_party_size = total > 0 ? Math.round((totalPartySize / total) * 10) / 10 : 0;

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
  }
}

export const reservasMesasService = new ReservasMesasService();
