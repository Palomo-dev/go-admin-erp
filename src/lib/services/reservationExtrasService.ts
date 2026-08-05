import { supabase } from '@/lib/supabase/config';

export interface ReservationExtra {
  id: string;
  reservation_id: string;
  organization_service_id: string | null;
  name: string;
  description?: string | null;
  unit_price: number;
  quantity: number;
  total: number;
  is_complimentary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateExtraData {
  organization_service_id?: string | null;
  name: string;
  description?: string;
  unit_price: number;
  quantity: number;
  is_complimentary?: boolean;
}

class ReservationExtrasService {
  /**
   * Obtener todos los extras de una reserva
   */
  async getByReservationId(reservationId: string): Promise<ReservationExtra[]> {
    const { data, error } = await supabase
      .from('reservation_extras')
      .select('*')
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching reservation extras:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      ...row,
      unit_price: parseFloat(row.unit_price) || 0,
      total: parseFloat(row.total) || 0,
    }));
  }

  /**
   * Crear extras para una reserva (batch)
   */
  async createForReservation(
    reservationId: string,
    extras: CreateExtraData[]
  ): Promise<ReservationExtra[]> {
    if (extras.length === 0) return [];

    const rows = extras.map((extra) => ({
      reservation_id: reservationId,
      organization_service_id: extra.organization_service_id || null,
      name: extra.name,
      description: extra.description || null,
      unit_price: extra.unit_price,
      quantity: extra.quantity,
      is_complimentary: extra.is_complimentary || false,
    }));

    const { data, error } = await supabase
      .from('reservation_extras')
      .insert(rows)
      .select('*');

    if (error) {
      console.error('Error creating reservation extras:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      ...row,
      unit_price: parseFloat(row.unit_price) || 0,
      total: parseFloat(row.total) || 0,
    }));
  }

  /**
   * Eliminar todos los extras de una reserva
   */
  async deleteByReservationId(reservationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('reservation_extras')
      .delete()
      .eq('reservation_id', reservationId);

    if (error) {
      console.error('Error deleting reservation extras:', error);
      return false;
    }
    return true;
  }

  /**
   * Actualizar un extra individual
   */
  async update(
    extraId: string,
    data: Partial<Pick<ReservationExtra, 'quantity' | 'unit_price' | 'is_complimentary'>>
  ): Promise<boolean> {
    const { error } = await supabase
      .from('reservation_extras')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', extraId);

    if (error) {
      console.error('Error updating reservation extra:', error);
      return false;
    }
    return true;
  }

  /**
   * Verificar si un producto del POS ya está incluido como extra en una reserva.
   * Busca por linked_product_id en organization_services.
   */
  async checkProductIncludedInReservation(
    reservationId: string,
    productId: number
  ): Promise<{ included: boolean; extraId: string | null; extraName: string | null }> {
    const { data, error } = await supabase
      .from('reservation_extras')
      .select(`
        id,
        name,
        organization_service_id,
        organization_services (
          linked_product_id
        )
      `)
      .eq('reservation_id', reservationId);

    if (error) {
      console.error('Error checking product in reservation:', error);
      return { included: false, extraId: null, extraName: null };
    }

    const match = (data || []).find(
      (row: any) => row.organization_services?.linked_product_id === productId
    );

    if (match) {
      return { included: true, extraId: match.id, extraName: match.name };
    }

    return { included: false, extraId: null, extraName: null };
  }

  /**
   * Obtener todos los IDs de productos del POS incluidos como extras en una reserva.
   * Busca por linked_product_id en organization_services.
   */
  async getIncludedProductIds(reservationId: string): Promise<Set<number>> {
    const { data, error } = await supabase
      .from('reservation_extras')
      .select(`
        organization_services (
          linked_product_id
        )
      `)
      .eq('reservation_id', reservationId);

    if (error || !data) return new Set();

    const ids = new Set<number>();
    for (const row of data as any[]) {
      const linkedId = row.organization_services?.linked_product_id;
      if (linkedId) ids.add(Number(linkedId));
    }
    return ids;
  }

  /**
   * Calcular el total de extras de una reserva
   */
  async calculateExtrasTotal(reservationId: string): Promise<number> {
    const { data, error } = await supabase
      .from('reservation_extras')
      .select('total, is_complimentary')
      .eq('reservation_id', reservationId);

    if (error || !data) return 0;

    return data
      .filter((row: any) => !row.is_complimentary)
      .reduce((sum: number, row: any) => sum + (parseFloat(row.total) || 0), 0);
  }
}

export default new ReservationExtrasService();
