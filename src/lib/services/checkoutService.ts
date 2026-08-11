import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export interface CheckoutReservation {
  id: string;
  code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_id: string;
  checkin: string;
  checkout: string;
  nights: number;
  occupant_count: number;
  total_estimated: number;
  status: string;
  spaces: Array<{
    id: string;
    label: string;
    space_type_name: string;
    floor_zone: string;
    housekeeping_status?: string;
    is_ready: boolean;
  }>;
  folio: {
    id: string;
    balance: number;
    total_charges: number;
    total_payments: number;
    items: Array<{
      description: string;
      amount: number;
      source: string;
      created_at: string;
    }>;
  } | null;
  deposit_payments: Array<{
    id: string;
    amount: number;
    method: string;
    reference: string;
    created_at: string;
  }>;
  metadata: any;
}

export interface CheckoutStats {
  total_departures: number;
  checked_out: number;
  pending: number;
  with_balance: number;
  rooms_cleaned: number;
}

export interface CheckoutData {
  reservationId: string;
  userId?: string;
  notes?: string;
  generateInvoice: boolean;
  generateReceipt: boolean;
  updateCheckoutDate?: boolean;
  payments?: { method: string; amount: number }[];
  taxIncluded?: boolean;
  appliedTaxIds?: string[];
  totalPaid?: number;
  change?: number;
}

class CheckoutService {
  /**
   * Obtener reservas con salida para un rango de fechas
   */
  async getDepartures(
    organizationId: number,
    startDate: string,
    endDate?: string
  ): Promise<CheckoutReservation[]> {
    let query = supabase
      .from('reservations')
      .select(`
        id,
        customer_id,
        checkin,
        checkout,
        occupant_count,
        total_estimated,
        status,
        metadata,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        reservation_spaces (
          space_id,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        )
      `)
      .eq('organization_id', organizationId);

    // Aplicar filtro de fecha
    if (endDate && endDate !== startDate) {
      query = query.gte('checkout', startDate).lte('checkout', endDate);
    } else {
      query = query.eq('checkout', startDate);
    }

    // Solo reservas que están checked_in (listas para hacer checkout)
    query = query.eq('status', 'checked_in');

    const { data, error } = await query.order('checkout', { ascending: true });

    if (error) throw error;

    // Establecer parámetro de sesión para RLS de folios
    await supabase.rpc('set_session_org_id', {
      org_id: organizationId
    });

    // Transformar datos
    const departures: CheckoutReservation[] = await Promise.all(
      (data || []).map(async (reservation: any) => {
        // Obtener folio para esta reserva
        let folioData = null;
        const { data: folios } = await supabase
          .from('folios')
          .select('id, balance, status')
          .eq('reservation_id', reservation.id)
          .maybeSingle();

        if (folios) {
          const folio = folios;
          
          // Obtener items del folio
          const { data: folioItems } = await supabase
            .from('folio_items')
            .select('description, amount, source, created_at, payment_status, charge_type')
            .eq('folio_id', folio.id)
            .order('created_at', { ascending: true });

          // Obtener pagos del folio
          const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .eq('source', 'folio')
            .eq('source_id', folio.id);

          const totalCharges = (folioItems || []).reduce((sum, item) => sum + Number(item.amount), 0);
          const totalPayments = (payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);

          folioData = {
            id: folio.id,
            balance: Number(folio.balance),
            total_charges: totalCharges,
            total_payments: totalPayments,
            items: folioItems || [],
          };
        }

        const customer = (Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers) || {};
        const spaces = (reservation.reservation_spaces || []).map((rs: any) => ({
          id: rs.spaces?.id || '',
          label: rs.spaces?.label || '',
          space_type_name: rs.spaces?.space_types?.name || '',
          floor_zone: rs.spaces?.floor_zone || '',
          housekeeping_status: 'pending',
          is_ready: false,
        }));

        // Obtener depósitos/abonos registrados durante el check-in
        const { data: depositPayments } = await supabase
          .from('payments')
          .select('id, amount, method, reference, created_at')
          .eq('source', 'pms')
          .eq('source_id', reservation.id)
          .eq('status', 'completed');

        const checkin = new Date(reservation.checkin);
        const checkout = new Date(reservation.checkout);
        const nights = Math.ceil(
          (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)
        );

          return {
            id: reservation.id,
            code: reservation.metadata?.code || `RES-${reservation.id.slice(0, 8)}`,
            customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
            customer_email: customer.email || '',
            customer_phone: customer.phone || '',
            customer_id: reservation.customer_id,
            checkin: reservation.checkin,
            checkout: reservation.checkout,
            nights,
            occupant_count: reservation.occupant_count || 1,
            total_estimated: Number(reservation.total_estimated || 0),
            status: reservation.status,
            spaces,
            folio: folioData,
            deposit_payments: (depositPayments || []).map((p: any) => ({
              id: p.id,
              amount: Number(p.amount),
              method: p.method,
              reference: p.reference || '',
              created_at: p.created_at,
            })),
            metadata: reservation.metadata || {},
        };
      })
    );

    return departures;
  }

  /**
   * Obtener una reserva individual con todos los datos para check-out
   */
  async getReservationForCheckout(reservationId: string): Promise<CheckoutReservation | null> {
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(`
        id,
        customer_id,
        checkin,
        checkout,
        occupant_count,
        total_estimated,
        status,
        metadata,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        reservation_spaces (
          space_id,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        )
      `)
      .eq('id', reservationId)
      .single();

    if (error || !reservation) return null;

    // Establecer parámetro de sesión para RLS de folios
    const orgId = reservation.metadata?.organization_id || await this.getOrganizationIdFromReservation(reservationId);
    if (orgId) {
      await supabase.rpc('set_session_org_id', { org_id: orgId });
    }

    // Obtener folio
    let folioData = null;
    const { data: folio } = await supabase
      .from('folios')
      .select('id, balance, status')
      .eq('reservation_id', reservation.id)
      .maybeSingle();

    if (folio) {
      const { data: folioItems } = await supabase
        .from('folio_items')
        .select('description, amount, source, created_at, payment_status, charge_type')
        .eq('folio_id', folio.id)
        .order('created_at', { ascending: true });

      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('source', 'folio')
        .eq('source_id', folio.id);

      const totalCharges = (folioItems || []).reduce((sum, item) => sum + Number(item.amount), 0);
      const totalPayments = (payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);

      folioData = {
        id: folio.id,
        balance: Number(folio.balance),
        total_charges: totalCharges,
        total_payments: totalPayments,
        items: folioItems || [],
      };
    }

    const customer = (Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers) || {};
    const spaces = (reservation.reservation_spaces || []).map((rs: any) => ({
      id: rs.spaces?.id || '',
      label: rs.spaces?.label || '',
      space_type_name: rs.spaces?.space_types?.name || '',
      floor_zone: rs.spaces?.floor_zone || '',
      housekeeping_status: 'pending',
      is_ready: false,
    }));

    // Obtener depósitos/abonos registrados durante el check-in
    const { data: depositPayments } = await supabase
      .from('payments')
      .select('id, amount, method, reference, created_at')
      .eq('source', 'pms')
      .eq('source_id', reservation.id)
      .eq('status', 'completed');

    const checkin = new Date(reservation.checkin);
    const checkout = new Date(reservation.checkout);
    const nights = Math.ceil(
      (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      id: reservation.id,
      code: reservation.metadata?.code || `RES-${reservation.id.slice(0, 8)}`,
      customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      customer_email: customer.email || '',
      customer_phone: customer.phone || '',
      customer_id: reservation.customer_id,
      checkin: reservation.checkin,
      checkout: reservation.checkout,
      nights,
      occupant_count: reservation.occupant_count || 1,
      total_estimated: Number(reservation.total_estimated || 0),
      status: reservation.status,
      spaces,
      folio: folioData,
      deposit_payments: (depositPayments || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference || '',
        created_at: p.created_at,
      })),
      metadata: reservation.metadata || {},
    };
  }

  /**
   * Obtener estadísticas de salidas
   */
  async getStats(
    organizationId: number,
    startDate: string,
    endDate?: string
  ): Promise<CheckoutStats> {
    // Establecer parámetro de sesión para RLS de folios
    await supabase.rpc('set_session_org_id', {
      org_id: organizationId
    });

    let query = supabase
      .from('reservations')
      .select('id, status')
      .eq('organization_id', organizationId);

    // Aplicar filtro de fecha
    if (endDate && endDate !== startDate) {
      query = query.gte('checkout', startDate).lte('checkout', endDate);
    } else {
      query = query.eq('checkout', startDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      total_departures: data?.length || 0,
      checked_out: data?.filter((r) => r.status === 'closed').length || 0,
      pending: data?.filter((r) => r.status === 'checked_in').length || 0,
      with_balance: 0,
      rooms_cleaned: 0,
    };

    // Contar reservas con saldo pendiente obteniendo folios individualmente
    let withBalanceCount = 0;
    if (data && data.length > 0) {
      for (const reservation of data) {
        const { data: folio } = await supabase
          .from('folios')
          .select('balance')
          .eq('reservation_id', reservation.id)
          .maybeSingle();
        
        if (folio && Number(folio.balance) > 0) {
          withBalanceCount++;
        }
      }
    }
    stats.with_balance = withBalanceCount;

    return stats;
  }

  /**
   * Calcular y aplicar cargo por noches extra al folio.
   * Se llama antes del pago para que el FolioPaymentDialog incluya el cargo.
   * Retorna el monto del cargo aplicado (0 si no hay noches extra).
   */
  async applyExtraNightsCharge(reservationId: string, userId?: string): Promise<number> {
    const { data: currentReservation } = await supabase
      .from('reservations')
      .select('metadata, checkout, checkin, organization_id, space_type_id, total_estimated')
      .eq('id', reservationId)
      .single();

    if (!currentReservation?.checkout) return 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const originalCheckout = new Date(currentReservation.checkout + 'T00:00:00');
    const today = new Date(todayStr + 'T00:00:00');
    const diffMs = today.getTime() - originalCheckout.getTime();
    const extraNightsCount = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (extraNightsCount <= 0) return 0;

    // Calcular tarifa de las noches extra
    let extraNightsCharge = 0;
    try {
      const { data: rateResult, error: rateError } = await supabase.rpc('calculate_reservation_total', {
        p_organization_id: currentReservation.organization_id,
        p_space_type_id: currentReservation.space_type_id,
        p_checkin: currentReservation.checkout,
        p_checkout: todayStr,
        p_plan: currentReservation.metadata?.plan || null,
      });

      if (!rateError && rateResult?.[0]) {
        extraNightsCharge = parseFloat(rateResult[0].total_amount) || 0;
      } else {
        const originalNights = Math.ceil(
          (new Date(currentReservation.checkout + 'T00:00:00').getTime() -
           new Date(currentReservation.checkin + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
        );
        const nightlyRate = originalNights > 0
          ? Number(currentReservation.total_estimated || 0) / originalNights
          : 0;
        extraNightsCharge = nightlyRate * extraNightsCount;
      }
    } catch (rateErr) {
      console.warn('⚠️ Error calculando tarifa de noches extra, usando promedio:', rateErr);
      const originalNights = Math.ceil(
        (new Date(currentReservation.checkout + 'T00:00:00').getTime() -
         new Date(currentReservation.checkin + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
      );
      const nightlyRate = originalNights > 0
        ? Number(currentReservation.total_estimated || 0) / originalNights
        : 0;
      extraNightsCharge = nightlyRate * extraNightsCount;
    }

    if (extraNightsCharge <= 0) return 0;

    // Agregar folio_item por las noches extra
    const { data: folio } = await supabase
      .from('folios')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (folio) {
      await supabase
        .from('folio_items')
        .insert({
          folio_id: folio.id,
          source: 'room_charge',
          description: `Cargo por ${extraNightsCount} noche(s) extra (check-out tardío)`,
          amount: extraNightsCharge,
          charge_type: 'room_charge',
          payment_status: 'pending',
          created_by: userId || null,
        });

      // Actualizar balance del folio
      const { data: items } = await supabase
        .from('folio_items')
        .select('amount')
        .eq('folio_id', folio.id);
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('source', 'folio')
        .eq('source_id', folio.id)
        .eq('status', 'completed');
      const itemsTotal = (items || []).reduce((s, i) => s + Number(i.amount), 0);
      const paymentsTotal = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      await supabase
        .from('folios')
        .update({ balance: itemsTotal - paymentsTotal, updated_at: new Date().toISOString() })
        .eq('id', folio.id);
    }

    // Actualizar total_estimated de la reserva
    const newTotal = Number(currentReservation.total_estimated || 0) + extraNightsCharge;
    await supabase
      .from('reservations')
      .update({ total_estimated: newTotal })
      .eq('id', reservationId);

    return extraNightsCharge;
  }

  /**
   * Realizar checkout de una reserva
   * Si updateCheckoutDate es true y la fecha actual es posterior a la checkout original,
   * se cobran las noches extra al folio.
   */
  async performCheckout(data: CheckoutData): Promise<void> {
    const { reservationId, userId, notes, generateInvoice, generateReceipt, updateCheckoutDate } = data;

    // Las noches extra ya se aplicaron antes del pago via applyExtraNightsCharge
    // Solo aplicar si no se aplicaron antes (caso de deuda sin pago previo)
    let extraNightsCharge = 0;
    let extraNightsCount = 0;
    if (updateCheckoutDate) {
      // Verificar si ya existe un folio_item de noches extra para no duplicar
      const { data: folio } = await supabase
        .from('folios')
        .select('id')
        .eq('reservation_id', reservationId)
        .maybeSingle();

      const { data: existingExtra } = await supabase
        .from('folio_items')
        .select('id, amount, description')
        .eq('folio_id', folio?.id || '')
        .ilike('description', '%noche(s) extra%');

      if (!existingExtra || existingExtra.length === 0) {
        extraNightsCharge = await this.applyExtraNightsCharge(reservationId, userId);
      } else {
        // Ya se aplicó antes del pago, leer el monto
        extraNightsCharge = Number(existingExtra[0].amount) || 0;
        const match = existingExtra[0].description?.match(/(\d+)\s+noche/);
        extraNightsCount = match ? parseInt(match[1]) : 0;
      }
    }

    // Obtener datos actuales de la reserva para metadata
    const { data: currentReservation } = await supabase
      .from('reservations')
      .select('metadata, checkout, checkin')
      .eq('id', reservationId)
      .single();

    const todayStr = new Date().toISOString().split('T')[0];

    // Actualizar estado de la reserva con campos de auditoría
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({
        status: 'checked_out',
        updated_at: new Date().toISOString(),
        // Si se actualiza la fecha (anticipado o tardío)
        ...(updateCheckoutDate ? {
          checkout: todayStr,
          end_date: todayStr,
        } : {}),
        // Campos de auditoría
        actual_checkout_at: new Date().toISOString(),
        checkout_by: userId || null,
        checkout_notes: notes || null,
        // Preservar metadata existente y registrar noches extra
        metadata: {
          ...(currentReservation?.metadata || {}),
          ...(extraNightsCount > 0 ? {
            late_checkout: {
              original_checkout: currentReservation?.checkout,
              actual_checkout: todayStr,
              extra_nights: extraNightsCount,
              extra_charge: extraNightsCharge,
            },
          } : {}),
        },
      })
      .eq('id', reservationId);

    if (reservationError) throw reservationError;

    // Si se actualizó la fecha, actualizar también reservation_spaces
    if (updateCheckoutDate) {
      await supabase
        .from('reservation_spaces')
        .update({ checkout: todayStr })
        .eq('reservation_id', reservationId);
    }

    // Establecer contexto de organización para RLS antes de operar con folios
    try {
      const orgId = await this.getOrganizationIdFromReservation(reservationId);
      if (orgId) {
        await supabase.rpc('set_session_org_id', { org_id: orgId });
      }
    } catch (e) {
      console.warn('No se pudo establecer set_session_org_id antes de cerrar folio:', e);
    }

    // Obtener el folio
    const { data: folio, error: folioQueryError } = await supabase
      .from('folios')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (folioQueryError) throw folioQueryError;

    console.log('Checkout - Folio encontrado:', folio?.id || 'null');

    // 1. Crear venta y factura desde el folio ANTES de cerrarlo
    //    (el trigger fn_auto_journal_folio_close verifica si ya existe factura)
    if (folio) {
      try {
        await this.createSaleFromFolio(folio.id, reservationId, userId, generateInvoice, {
          payments: data.payments,
          taxIncluded: data.taxIncluded,
          appliedTaxIds: data.appliedTaxIds,
          totalPaid: data.totalPaid,
          change: data.change,
        });
      } catch (saleError) {
        console.error('Error creando venta desde folio:', saleError);
        throw saleError;
      }
    }

    // 2. Cerrar el folio DESPUÉS de crear la venta
    if (folio) {
      const { error: folioError } = await supabase
        .from('folios')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', folio.id);

      if (folioError) {
        console.error('Error cerrando folio:', { folioId: folio.id, error: folioError });
        throw folioError;
      }
    }

    // Crear tarea de limpieza para las habitaciones
    await this.createHousekeepingTasks(reservationId);

    // Actualizar estado de espacios a 'cleaning' después de crear tareas de limpieza
    await this.updateSpaceStatus(reservationId, 'cleaning');

    // La factura se genera en createSaleFromFolio si generateInvoice es true
  }

  /**
   * Crear venta + sale_items desde los folio_items
   * El stock ya fue descontado al agregar consumos, aqui no se descuenta de nuevo.
   */
  private async createSaleFromFolio(
    folioId: string,
    reservationId: string,
    userId?: string,
    generateInvoice: boolean = false,
    paymentData?: {
      payments?: { method: string; amount: number }[];
      taxIncluded?: boolean;
      appliedTaxIds?: string[];
      totalPaid?: number;
      change?: number;
    }
  ): Promise<void> {
    const { payments = [], taxIncluded = false, appliedTaxIds, totalPaid = 0, change = 0 } = paymentData || {};

    // Obtener datos de la reserva y folio
    const { data: reservation } = await supabase
      .from('reservations')
      .select('organization_id, branch_id, customer_id, total_estimated')
      .eq('id', reservationId)
      .single();

    if (!reservation) {
      console.error('createSaleFromFolio: No se encontró la reserva', reservationId);
      return;
    }

    const { data: folioItems, error: folioItemsError } = await supabase
      .from('folio_items')
      .select('id, description, amount, product_id, quantity, unit_price, source, payment_status, charge_type')
      .eq('folio_id', folioId)
      .order('created_at', { ascending: true });

    if (folioItemsError) {
      console.error('createSaleFromFolio: Error obteniendo folio_items:', folioItemsError);
      throw folioItemsError;
    }

    if (!folioItems || folioItems.length === 0) {
      console.log('createSaleFromFolio: No hay items en el folio, saltando venta');
      return;
    }

    // Filtrar: solo items room_charge y paid (los direct_payment ya tienen su propia venta en POS)
    const saleableItems = folioItems.filter(
      (item: any) => item.charge_type === 'room_charge' || (!item.charge_type && item.payment_status !== 'paid')
    );

    if (saleableItems.length === 0) {
      console.log('createSaleFromFolio: No hay items vendibles (room_charge), saltando venta');
      return;
    }

    const branchId = reservation.branch_id || getCurrentBranchId();
    console.log('createSaleFromFolio: Iniciando venta', { folioId, reservationId, branchId, itemsCount: saleableItems.length });

    // Obtener el balance real del folio
    const { data: folioData } = await supabase
      .from('folios')
      .select('balance')
      .eq('id', folioId)
      .single();

    const folioBalance = Number(folioData?.balance || 0);

    // Calcular impuestos usando la utilidad compartida con POS
    const { calculateCartTaxes } = await import('@/lib/utils/taxCalculations');
    const { generateInvoiceNumber } = await import('@/lib/utils/invoiceUtils');

    // Obtener impuestos de la organización
    const { data: orgTaxes } = await supabase
      .from('organization_taxes')
      .select('id, name, rate, is_default, is_active')
      .eq('organization_id', reservation.organization_id)
      .eq('is_active', true);

    const organizationTaxes = (orgTaxes || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      rate: Number(t.rate),
      is_default: t.is_default,
      is_active: t.is_active,
    }));

    // Construir items para cálculo de impuestos
    const taxCalcItems = saleableItems.map((item: any) => ({
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || Number(item.amount),
      product_id: Number(item.product_id) || 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_included: taxIncluded,
    }));

    // Aplicar impuestos seleccionados en el dialog, o los por defecto si no se especifican
    const appliedTaxes: { [key: string]: boolean } = {};
    if (appliedTaxIds && appliedTaxIds.length > 0) {
      organizationTaxes.forEach(t => { appliedTaxes[t.id] = appliedTaxIds.includes(t.id); });
    } else {
      organizationTaxes.forEach(t => { appliedTaxes[t.id] = t.is_default; });
    }

    const taxCalculation = calculateCartTaxes(taxCalcItems, appliedTaxes, organizationTaxes, taxIncluded);

    const subtotal = taxCalculation.subtotal;
    const taxTotal = taxCalculation.totalTaxAmount;
    const finalTotal = taxCalculation.finalTotal;

    // Determinar si está pagado completamente
    const isPaid = totalPaid >= finalTotal && finalTotal > 0;
    const remainingBalance = Math.max(0, finalTotal - totalPaid);

    // Crear la venta
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        organization_id: reservation.organization_id,
        branch_id: branchId,
        customer_id: reservation.customer_id || null,
        user_id: userId || null,
        subtotal,
        tax_total: taxTotal,
        discount_total: 0,
        total: finalTotal,
        balance: remainingBalance,
        status: isPaid ? 'paid' : 'pending',
        payment_status: isPaid ? 'paid' : 'partial',
        tax_included: taxIncluded,
        notes: `Checkout reserva ${reservationId.slice(0, 8)}`,
        sale_date: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (saleError) {
      console.error('createSaleFromFolio: Error creando sale:', saleError);
      throw saleError;
    }

    console.log('createSaleFromFolio: Sale creada', sale.id);

    // Crear sale_items solo desde los items vendibles
    const saleItems = saleableItems.map((item: any) => ({
      sale_id: sale.id,
      product_id: item.product_id || null,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || Number(item.amount),
      total: Number(item.amount),
      tax_amount: 0,
      discount_amount: 0,
      notes: item.description,
    }));

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems);

    if (itemsError) {
      console.error('createSaleFromFolio: Error creando sale_items:', itemsError);
      throw itemsError;
    }

    console.log('createSaleFromFolio: Sale_items creados', saleItems.length);

    // Registrar pagos en tabla payments
    const { data: baseCurrency } = await supabase
      .from('currencies')
      .select('code')
      .eq('organization_id', reservation.organization_id)
      .eq('is_base', true)
      .maybeSingle();

    const currencyCode = baseCurrency?.code || 'COP';
    let changeAssigned = false;

    for (const payment of payments) {
      if (payment.amount > 0) {
        const paymentData: any = {
          organization_id: reservation.organization_id,
          branch_id: branchId,
          amount: payment.amount,
          method: payment.method,
          currency: currencyCode,
          status: 'completed',
          source: 'sale',
          source_id: sale.id,
          change_amount: (!changeAssigned && change > 0 && payment.method === 'cash') ? change : 0,
        };
        if (!changeAssigned && change > 0 && payment.method === 'cash') {
          changeAssigned = true;
        }
        if (userId) paymentData.created_by = userId;

        await supabase.from('payments').insert(paymentData);
      }
    }

    // Generar factura (siempre para checkout, como en POS)
    try {
      const invoiceNumber = await generateInvoiceNumber(reservation.organization_id, 'FACT');
      const hasDebt = remainingBalance > 0;

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: reservation.organization_id,
          branch_id: branchId,
          customer_id: reservation.customer_id || null,
          sale_id: sale.id,
          number: invoiceNumber,
          issue_date: new Date().toISOString(),
          due_date: new Date().toISOString(),
          currency: currencyCode,
          subtotal,
          tax_total: taxTotal,
          total: finalTotal,
          balance: remainingBalance,
          status: hasDebt ? 'issued' : 'paid',
          payment_method: hasDebt ? 'credit' : (payments[0]?.method || 'cash'),
          tax_included: taxIncluded,
          payment_terms: hasDebt ? 30 : 0,
          document_type: 'invoice',
          created_by: userId || null,
          notes: `Factura desde checkout - Reserva ${reservationId.slice(0, 8)}`,
        })
        .select('id')
        .single();

      if (invoiceError) {
        console.error('createSaleFromFolio: Error generando factura:', invoiceError);
        throw invoiceError;
      } else {
        // Crear invoice_items
        const invoiceItems = saleableItems.map((item: any) => ({
          invoice_id: invoice.id,
          invoice_type: 'sale',
          invoice_sales_id: invoice.id,
          product_id: item.product_id || null,
          description: item.description?.substring(0, 255) || 'Cargo',
          qty: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || Number(item.amount),
          tax_rate: 0,
          total_line: Number(item.amount),
          discount_amount: 0,
          tax_included: taxIncluded,
        }));

        await supabase.from('invoice_items').insert(invoiceItems);

        console.log(`📄 Factura ${invoiceNumber} generada para reserva ${reservationId.slice(0, 8)}`);

        // Si hay deuda, la cuenta por cobrar se crea automáticamente por trigger
        if (hasDebt) {
          console.log(`💰 Cuenta por cobrar creada por trigger para factura ${invoice.id}`);
        }
      }
    } catch (invoiceError) {
      console.warn('⚠️ Error generando factura (no bloquea checkout):', invoiceError);
    }

    console.log(`🧾 Venta creada desde folio: ${sale.id} para reserva ${reservationId.slice(0, 8)}`);
  }

  /**
   * Crear tareas de housekeeping después del checkout
   */
  private async createHousekeepingTasks(reservationId: string): Promise<void> {
    // Obtener espacios de la reserva
    const { data: reservationSpaces } = await supabase
      .from('reservation_spaces')
      .select('space_id')
      .eq('reservation_id', reservationId);

    if (!reservationSpaces || reservationSpaces.length === 0) return;

    // Crear tarea de limpieza para cada espacio
    const tasks = reservationSpaces.map((rs) => ({
      space_id: rs.space_id,
      task_date: new Date().toISOString().split('T')[0],
      status: 'pending' as const,
      notes: `Limpieza post check-out - Reserva ${reservationId.slice(0, 8)}`,
    }));

    const { error } = await supabase.from('housekeeping_tasks').insert(tasks);

    if (error) throw error;
  }

  /**
   * Obtener organization_id de una reserva
   */
  private async getOrganizationIdFromReservation(reservationId: string): Promise<number> {
    const { data, error } = await supabase
      .from('reservations')
      .select('organization_id')
      .eq('id', reservationId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Reserva no encontrada');

    return data.organization_id;
  }

  /**
   * Actualizar estado de los espacios de una reserva
   */
  private async updateSpaceStatus(
    reservationId: string,
    status: 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning' | 'out_of_order'
  ): Promise<void> {
    // Obtener los espacios asociados a la reserva
    const { data: reservationSpaces, error: rsError } = await supabase
      .from('reservation_spaces')
      .select('space_id')
      .eq('reservation_id', reservationId);

    if (rsError) throw rsError;

    if (reservationSpaces && reservationSpaces.length > 0) {
      // Actualizar el estado de cada espacio
      const spaceIds = reservationSpaces.map((rs) => rs.space_id);
      
      const { error: updateError } = await supabase
        .from('spaces')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', spaceIds);

      if (updateError) throw updateError;
    }
  }

  /**
   * Obtener detalle del folio para una reserva
   */
  async getFolioDetails(reservationId: string) {
    const { data: folio, error: folioError } = await supabase
      .from('folios')
      .select(`
        id,
        balance,
        status,
        created_at
      `)
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (folioError) throw folioError;
    if (!folio) return null;

    // Establecer parámetro de sesión para RLS
    const orgId = await this.getOrganizationIdFromReservation(reservationId);
    await supabase.rpc('set_session_org_id', { org_id: orgId });

    // Obtener items
    const { data: items } = await supabase
      .from('folio_items')
      .select('*')
      .eq('folio_id', folio.id)
      .order('created_at', { ascending: true });

    // Obtener pagos
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('source', 'folio')
      .eq('source_id', folio.id)
      .order('created_at', { ascending: true });

    return {
      ...folio,
      items: items || [],
      payments: payments || [],
    };
  }
}

export default new CheckoutService();
