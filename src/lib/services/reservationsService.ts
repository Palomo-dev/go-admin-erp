import { supabase } from '@/lib/supabase/config';

export type ReservationStatus = 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface Customer {
  id: string;
  organization_id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  document_type?: string;
  document_number?: string;
  address?: string;
  city?: string;
  country?: string;
  avatar_url?: string;
  user_id?: string;
  created_at?: string;
}

export interface Reservation {
  id: string;
  organization_id: number;
  branch_id?: number;
  customer_id: string;
  space_type_id?: string;
  space_id?: string;
  checkin: string;
  checkout: string;
  occupant_count: number;
  total_estimated: number;
  status: ReservationStatus;
  channel?: string;
  notes?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ReservationSpace {
  id: string;
  reservation_id: string;
  space_id: string;
  checkin: string;
  checkout: string;
  created_at?: string;
}

export interface CreateReservationData {
  customer_id: string;
  organization_id: number;
  branch_id?: number;
  checkin: string;
  checkout: string;
  occupant_count: number;
  space_type_id?: string;
  spaces: string[]; // Array de space IDs
  total_estimated: number;
  channel?: string;
  notes?: string;
  metadata?: Record<string, any>;
  payment_method?: string;
  payment_amount?: number;
}

class ReservationsService {
  /**
   * Buscar clientes por término
   */
  async searchCustomers(organizationId: number, searchTerm: string): Promise<Customer[]> {
    try {
      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId)
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
        .limit(10);

      if (error) {
        console.error('Error en búsqueda de clientes:', error);
        throw error;
      }

      if (!customers || customers.length === 0) {
        return [];
      }

      // Obtener avatares de los usuarios (si tienen user_id)
      const userIds = customers
        .filter(c => c.user_id)
        .map(c => c.user_id);

      let avatarMap: Record<string, string> = {};

      if (userIds.length > 0) {
        const { data: userDisplayInfo, error: avatarError } = await supabase
          .from('user_display_info')
          .select('id, avatar_url')
          .in('id', userIds);

        if (!avatarError && userDisplayInfo) {
          avatarMap = userDisplayInfo.reduce((acc, user) => {
            if (user.avatar_url) {
              acc[user.id] = user.avatar_url;
            }
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Combinar datos
      return customers.map((customer: any) => ({
        ...customer,
        avatar_url: customer.user_id ? (avatarMap[customer.user_id] || null) : null,
      }));
    } catch (error) {
      console.error('Error completo en searchCustomers:', error);
      throw error;
    }
  }

  /**
   * Crear nuevo cliente
   */
  async createCustomer(customerData: Omit<Customer, 'id' | 'created_at'>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert([customerData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Obtener espacios por categoría y fechas con indicador de disponibilidad
   * Retorna TODOS los espacios, marcando cuáles tienen conflictos
   */
  async getAvailableSpaces(
    organizationId: number,
    categoryCode: string,
    checkin: string,
    checkout: string
  ): Promise<any[]> {
    // Obtener todos los espacios de la categoría (sin filtrar por status)
    const { data: spaces, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        *,
        space_types!inner (
          id,
          name,
          base_rate,
          capacity,
          organization_id,
          category_code
        )
      `)
      .eq('space_types.organization_id', organizationId)
      .eq('space_types.category_code', categoryCode)
      .neq('status', 'maintenance'); // Solo excluir espacios en mantenimiento

    if (spacesError) throw spacesError;

    // Verificar disponibilidad de cada espacio y agregar flag
    const spacesWithAvailability = [];
    for (const space of spaces || []) {
      // Verificar conflictos en reservation_spaces (las fechas están en reservations)
      // Conflicto si: checkin_existente < checkout_nuevo Y checkout_existente > checkin_nuevo
      // Usamos .gt para checkout porque el checkout (11am) ocurre antes del checkin (3pm) del mismo día
      const { data: rsConflicts, error: rsError } = await supabase
        .from('reservation_spaces')
        .select(`
          id,
          reservations!inner (
            id,
            status,
            checkin,
            checkout
          )
        `)
        .eq('space_id', space.id)
        .neq('reservations.status', 'cancelled')
        .lt('reservations.checkin', checkout)
        .gt('reservations.checkout', checkin);

      if (rsError) throw rsError;

      // Verificar conflictos en reservations.space_id directamente
      // Misma lógica: conflicto si los rangos se solapan considerando horas de hotel
      const { data: directConflicts, error: directError } = await supabase
        .from('reservations')
        .select('id, checkin, checkout')
        .eq('space_id', space.id)
        .neq('status', 'cancelled')
        .lt('checkin', checkout)
        .gt('checkout', checkin);

      if (directError) throw directError;

      const hasConflicts = (rsConflicts && rsConflicts.length > 0) || 
                          (directConflicts && directConflicts.length > 0);

      // Agregar espacio con flag de disponibilidad
      spacesWithAvailability.push({
        ...space,
        isAvailable: !hasConflicts,
        hasConflict: hasConflicts
      });
    }

    return spacesWithAvailability;
  }

  /**
   * Crear reserva completa con espacios
   */
  async createReservation(reservationData: CreateReservationData): Promise<Reservation> {
    // 0. Verificar que los espacios no estén bloqueados
    if (reservationData.spaces && reservationData.spaces.length > 0) {
      for (const spaceId of reservationData.spaces) {
        const { data: blocks } = await supabase
          .from('reservation_blocks')
          .select('id, block_type, reason')
          .eq('space_id', spaceId)
          .lte('date_from', reservationData.checkout)
          .gte('date_to', reservationData.checkin);

        if (blocks && blocks.length > 0) {
          throw new Error(`El espacio está bloqueado (${blocks[0].block_type}): ${blocks[0].reason || 'Sin razón especificada'}`);
        }
      }
    }

    // 1. Crear la reserva principal
    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .insert([{
        organization_id: reservationData.organization_id,
        branch_id: reservationData.branch_id,
        customer_id: reservationData.customer_id,
        space_type_id: reservationData.space_type_id,
        start_date: reservationData.checkin,  // Campo obligatorio
        end_date: reservationData.checkout,    // Campo obligatorio
        checkin: reservationData.checkin,
        checkout: reservationData.checkout,
        occupant_count: reservationData.occupant_count,
        total_estimated: reservationData.total_estimated,
        channel: reservationData.channel || 'direct',
        notes: reservationData.notes,
        metadata: reservationData.metadata || {},
        status: 'confirmed',
      }])
      .select()
      .single();

    if (reservationError) {
      console.error('Supabase error creating reservation:', reservationError);
      throw reservationError;
    }

    // 2. Crear las relaciones con espacios
    const reservationSpaces = reservationData.spaces.map(spaceId => ({
      reservation_id: reservation.id,
      space_id: spaceId,
      checkin: reservationData.checkin,
      checkout: reservationData.checkout,
    }));

    const { error: spacesError } = await supabase
      .from('reservation_spaces')
      .insert(reservationSpaces);

    if (spacesError) {
      console.error('Supabase error creating reservation_spaces:', spacesError);
      // Rollback: eliminar reserva si falla la creación de espacios
      await supabase.from('reservations').delete().eq('id', reservation.id);
      throw spacesError;
    }

    // 3. Crear pago inicial si se proporcionó
    if (reservationData.payment_method && reservationData.payment_amount && reservationData.payment_amount > 0) {
      // Obtener la moneda base de la organización
      const currency = await this.getBaseCurrency(reservationData.organization_id);
      
      const { error: paymentError } = await supabase
        .from('payments')
        .insert([{
          organization_id: reservationData.organization_id,
          branch_id: reservationData.branch_id,
          source: 'pms',
          source_id: reservation.id,
          method: reservationData.payment_method,
          amount: reservationData.payment_amount,
          currency: currency,  // Moneda base de la organización
          reference: `RESERVA-${reservation.id.substring(0, 8)}`,
          status: 'completed',
        }]);

      if (paymentError) {
        console.error('Supabase error creating payment:', paymentError);
        // No hacemos rollback del pago, la reserva ya está creada
        console.warn('Payment failed but reservation was created successfully');
      }
    }

    return reservation;
  }

  /**
   * Obtener tipos de espacios por categoría
   */
  async getSpaceTypesByCategory(organizationId: number, categoryCode: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('space_types')
      .select(`
        *,
        space_categories!inner (
          code,
          display_name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('space_categories.code', categoryCode);

    if (error) throw error;
    return data || [];
  }

  /**
   * Calcular precio estimado de reserva (método legacy usando base_rate)
   */
  calculateEstimatedTotal(
    nights: number,
    basePrice: number,
    numberOfSpaces: number,
    extras: { price: number }[] = []
  ): number {
    const roomsTotal = nights * basePrice * numberOfSpaces;
    const extrasTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
    return roomsTotal + extrasTotal;
  }

  /**
   * Calcular precio estimado usando tarifas dinámicas
   * Busca la tarifa correcta según fecha y tipo de espacio
   */
  async calculateDynamicTotal(
    organizationId: number,
    spaceTypeId: string,
    checkin: string,
    checkout: string,
    numberOfSpaces: number = 1,
    extras: { price: number }[] = [],
    plan?: string
  ): Promise<{
    total: number;
    nights: number;
    dailyRate: number;
    rateSource: 'tarifa' | 'base_rate';
    extrasTotal: number;
  }> {
    const { data, error } = await supabase.rpc('calculate_reservation_total', {
      p_organization_id: organizationId,
      p_space_type_id: spaceTypeId,
      p_checkin: checkin,
      p_checkout: checkout,
      p_plan: plan || null,
    });

    if (error) throw error;

    const result = data?.[0];
    const baseTotal = parseFloat(result?.total_amount) || 0;
    const extrasTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
    
    return {
      total: (baseTotal * numberOfSpaces) + extrasTotal,
      nights: result?.nights || 0,
      dailyRate: parseFloat(result?.daily_rate) || 0,
      rateSource: result?.rate_source || 'base_rate',
      extrasTotal,
    };
  }

  /**
   * Calcular número de noches
   */
  calculateNights(checkin: string, checkout: string): number {
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    const diffTime = Math.abs(checkoutDate.getTime() - checkinDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Obtener métodos de pago activos de la organización
   */
  async getPaymentMethods(organizationId: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('organization_payment_methods')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('payment_method_code');

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener la moneda base de la organización
   */
  async getBaseCurrency(organizationId: number): Promise<string> {
    const { data, error } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', organizationId)
      .eq('is_base', true)
      .single();

    if (error || !data) {
      console.warn('No base currency found, defaulting to COP');
      return 'COP';
    }
    
    return data.currency_code;
  }
}

export default new ReservationsService();
