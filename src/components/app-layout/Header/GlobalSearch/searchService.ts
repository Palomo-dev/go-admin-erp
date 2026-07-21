/**
 * Servicio para realizar búsquedas en Supabase
 * Este módulo contiene la lógica de consulta a múltiples tablas
 */

import { supabase } from '@/lib/supabase/config';
import { SearchDataResult } from './types';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

const QUERY_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<any>, ms: number = QUERY_TIMEOUT_MS): Promise<any> {
  return Promise.race([
    promise,
    new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), ms)
    ),
  ]);
}

function extractData(result: PromiseSettledResult<any>): any[] {
  if (result.status === 'fulfilled' && result.value && !result.value.error) {
    return result.value.data || [];
  }
  return [];
}

/**
 * Busca datos en múltiples tablas de Supabase según un término de búsqueda
 * Usa Promise.allSettled para que una query lenta no bloquee las demás.
 * Cada query tiene un timeout de 3s.
 */
export const searchData = async (searchTerm: string, resultLimit: number = 5, signal: AbortSignal = new AbortController().signal): Promise<SearchDataResult> => {
  const emptyResult: SearchDataResult = {
    organizaciones: [], sucursales: [], productos: [],
    proveedores: [], categorias: [], clientes: [],
    facturas: [], pedidosOnline: [], reservas: [], espacios: [],
    membresias: [], vehiculosParking: []
  };

  if (!searchTerm || searchTerm.trim() === '') {
    return emptyResult;
  }

  const organizationId = getOrganizationId();
  const term = searchTerm.trim();

  try {
    const results = await Promise.allSettled([
      withTimeout(supabase.from('organizations').select('id, name').ilike('name', `%${term}%`).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('branches').select('id, name, organization_id').ilike('name', `%${term}%`).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('products').select('id, name, sku, description, organization_id').or(`name.ilike.%${term}%, sku.ilike.%${term}%`).eq('organization_id', organizationId).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('suppliers').select('id, name, nit, email').or(`name.ilike.%${term}%, nit.ilike.%${term}%, email.ilike.%${term}%`).eq('organization_id', organizationId).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('customers').select('id, first_name, last_name, email, full_name, company_name, trade_name, organization_id, avatar_url').or(`first_name.ilike.%${term}%, last_name.ilike.%${term}%, email.ilike.%${term}%, full_name.ilike.%${term}%, company_name.ilike.%${term}%, trade_name.ilike.%${term}%, phone.ilike.%${term}%, identification_number.ilike.%${term}%`).eq('organization_id', organizationId).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('categories').select('id, name, slug').ilike('name', `%${term}%`).eq('organization_id', organizationId).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('invoice_sales').select('id, number, total, status, customer_id, customers(full_name)').or(`number.ilike.%${term}%`).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('web_orders').select('id, order_number, customer_name, status, total').or(`order_number.ilike.%${term}%, customer_name.ilike.%${term}%`).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('reservations').select('id, status, checkin, checkout, customers(full_name), spaces(label)').eq('organization_id', organizationId).or(`customers.full_name.ilike.%${term}%`).order('created_at', { ascending: false }).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('spaces').select('id, label, floor_zone, status, space_types(name), branches!inner(organization_id)').ilike('label', `%${term}%`).eq('branches.organization_id', organizationId).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('memberships').select('id, status, start_date, end_date, customers(full_name), membership_plans(name)').eq('organization_id', organizationId).or(`customers.full_name.ilike.%${term}%`).order('created_at', { ascending: false }).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
      withTimeout(supabase.from('parking_vehicles').select('id, plate, brand, model, vehicle_type, color').or(`plate.ilike.%${term}%, brand.ilike.%${term}%, model.ilike.%${term}%`).eq('organization_id', organizationId).limit(resultLimit).abortSignal(signal) as unknown as Promise<any>),
    ]);

    return {
      organizaciones: extractData(results[0]),
      sucursales: extractData(results[1]),
      productos: extractData(results[2]),
      proveedores: extractData(results[3]),
      clientes: extractData(results[4]),
      categorias: extractData(results[5]),
      facturas: extractData(results[6]),
      pedidosOnline: extractData(results[7]),
      reservas: extractData(results[8]),
      espacios: extractData(results[9]),
      membresias: extractData(results[10]),
      vehiculosParking: extractData(results[11]),
    };
  } catch (error) {
    console.error('Error al buscar datos:', error);
    return emptyResult;
  }
};
