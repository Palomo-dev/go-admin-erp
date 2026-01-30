'use client';

import { supabase } from '@/lib/supabase/config';

export interface CustomerAddress {
  id: string;
  organization_id: number;
  customer_id: string;
  label: string;
  recipient_name?: string;
  recipient_phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  department?: string;
  country_code?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  delivery_instructions?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  };
}

export interface CustomerAddressInput {
  customer_id: string;
  label: string;
  recipient_name?: string;
  recipient_phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  department?: string;
  country_code?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  delivery_instructions?: string;
  is_default?: boolean;
}

export const customerAddressesService = {
  async getAddresses(organizationId: number) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select(`
        *,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching customer addresses:', error.message);
      return [];
    }
    return (data || []) as CustomerAddress[];
  },

  async getAddressesByCustomer(organizationId: number, customerId: string) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('is_default', { ascending: false });

    if (error) {
      console.warn('Error fetching addresses by customer:', error.message);
      return [];
    }
    return (data || []) as CustomerAddress[];
  },

  async getAddressById(id: string) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select(`
        *,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.warn('Error fetching address:', error.message);
      return null;
    }
    return data as CustomerAddress;
  },

  async createAddress(organizationId: number, input: CustomerAddressInput) {
    if (input.is_default) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('organization_id', organizationId)
        .eq('customer_id', input.customer_id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        organization_id: organizationId,
        ...input,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as CustomerAddress;
  },

  async updateAddress(id: string, organizationId: number, input: Partial<CustomerAddressInput>) {
    if (input.is_default && input.customer_id) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('organization_id', organizationId)
        .eq('customer_id', input.customer_id)
        .neq('id', id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as CustomerAddress;
  },

  async deleteAddress(id: string) {
    const { error } = await supabase
      .from('customer_addresses')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  async setAsDefault(id: string, organizationId: number, customerId: string) {
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId);

    const { data, error } = await supabase
      .from('customer_addresses')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as CustomerAddress;
  },

  async duplicateAddress(id: string, organizationId: number) {
    const original = await this.getAddressById(id);
    if (!original) throw new Error('Dirección no encontrada');

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        organization_id: organizationId,
        customer_id: original.customer_id,
        label: `${original.label} (copia)`,
        recipient_name: original.recipient_name,
        recipient_phone: original.recipient_phone,
        address_line1: original.address_line1,
        address_line2: original.address_line2,
        city: original.city,
        department: original.department,
        country_code: original.country_code,
        postal_code: original.postal_code,
        latitude: original.latitude,
        longitude: original.longitude,
        google_place_id: original.google_place_id,
        delivery_instructions: original.delivery_instructions,
        is_default: false,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as CustomerAddress;
  },

  async searchCustomers(organizationId: number, searchTerm: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone')
      .eq('organization_id', organizationId)
      .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .limit(20);

    if (error) {
      console.warn('Error searching customers:', error.message);
      return [];
    }
    return data || [];
  },
};
