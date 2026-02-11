/**
 * Servicio para realizar búsquedas en Supabase
 * Este módulo contiene la lógica de consulta a múltiples tablas
 */

import { supabase } from '@/lib/supabase/config';
import { SearchDataResult } from './types';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Busca datos en múltiples tablas de Supabase según un término de búsqueda
 * @param searchTerm Término de búsqueda
 * @returns Resultados agrupados por tipo de entidad
 */
export const searchData = async (searchTerm: string, resultLimit: number = 5): Promise<SearchDataResult> => {
  // No realizar búsqueda para términos vacíos
  if (!searchTerm || searchTerm.trim() === '') {
    console.log('Término de búsqueda vacío, no se realizará búsqueda');
    return {
      organizaciones: [], sucursales: [], productos: [],
      proveedores: [], categorias: [], clientes: [],
      facturas: [], pedidosOnline: [], reservas: [], espacios: [],
      membresias: [], vehiculosParking: []
    };
  }

  const organizationId = getOrganizationId();
  console.log('🔍 Buscando término:', searchTerm, 'organizationId:', organizationId);
  
  // Si no hay resultados con la organización actual, probaremos sin filtrar por organización
  let usarFallback = false;

  try {
    // Búsquedas existentes
    const { data: organizaciones, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .ilike('name', `%${searchTerm}%`)
      .limit(resultLimit);

    const { data: sucursales, error: branchError } = await supabase
      .from('branches')
      .select('id, name, organization_id')
      .ilike('name', `%${searchTerm}%`)
      .limit(resultLimit);

    // Nuevas búsquedas
    // Productos
    const { data: productos, error: productError } = await supabase
      .from('products')
      .select('id, name, sku, description, organization_id')
      .or(`name.ilike.%${searchTerm}%, sku.ilike.%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .limit(resultLimit);

    // Proveedores
    const { data: proveedores, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, name, nit, email')
      .or(`name.ilike.%${searchTerm}%, nit.ilike.%${searchTerm}%, email.ilike.%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .limit(resultLimit);
      
    // Clientes - Mejoramos la búsqueda para incluir búsqueda por full_name también e incluimos avatar_url
    const { data: clientes, error: clientError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, full_name, organization_id, avatar_url')
      .or(`first_name.ilike.%${searchTerm}%, last_name.ilike.%${searchTerm}%, email.ilike.%${searchTerm}%, full_name.ilike.%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .limit(resultLimit);
      
    if (clientError) {
      console.error('Error al buscar clientes:', clientError);
    } else {
      console.log(`Clientes encontrados: ${clientes?.length || 0}`, clientes);
    }

    // Categorías
    const { data: categorias, error: categoryError } = await supabase
      .from('categories')
      .select('id, name, slug')
      .ilike('name', `%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .limit(resultLimit);

    // Facturas de venta
    const { data: facturas } = await supabase
      .from('invoice_sales')
      .select('id, number, total, status, customer_id, customers(full_name)')
      .or(`number.ilike.%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(resultLimit);

    // Pedidos online
    const { data: pedidosOnline } = await supabase
      .from('web_orders')
      .select('id, order_number, customer_name, status, total')
      .or(`order_number.ilike.%${searchTerm}%, customer_name.ilike.%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(resultLimit);

    // Reservas (buscar por ID del espacio o nombre del cliente)
    const { data: reservas } = await supabase
      .from('reservations')
      .select('id, status, checkin, checkout, customers(full_name), spaces(label)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(resultLimit);

    // Espacios
    const { data: espacios } = await supabase
      .from('spaces')
      .select('id, label, floor_zone, status, space_types(name), branches!inner(organization_id)')
      .ilike('label', `%${searchTerm}%`)
      .eq('branches.organization_id', organizationId)
      .limit(resultLimit);

    // Membresías
    const { data: membresias } = await supabase
      .from('memberships')
      .select('id, status, start_date, end_date, customers(full_name), membership_plans(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(resultLimit);

    // Vehículos de parqueadero
    const { data: vehiculosParking } = await supabase
      .from('parking_vehicles')
      .select('id, plate, brand, model, vehicle_type, color')
      .or(`plate.ilike.%${searchTerm}%, brand.ilike.%${searchTerm}%, model.ilike.%${searchTerm}%`)
      .eq('organization_id', organizationId)
      .limit(resultLimit);

    // Verificar si hay resultados de entidades relacionadas con organización
    const hayResultadosLocales = (
      (productos && productos.length > 0) ||
      (clientes && clientes.length > 0) ||
      (proveedores && proveedores.length > 0) ||
      (categorias && categorias.length > 0) ||
      (facturas && facturas.length > 0) ||
      (pedidosOnline && pedidosOnline.length > 0) ||
      (reservas && reservas.length > 0) ||
      (espacios && espacios.length > 0) ||
      (membresias && membresias.length > 0) ||
      (vehiculosParking && vehiculosParking.length > 0)
    );
    
    // Si no hay resultados locales, activar búsqueda sin filtro de organización
    usarFallback = !hayResultadosLocales;
    console.log(usarFallback ? '🔎 No hay resultados locales, usando búsqueda fallback' : '✅ Se encontraron resultados locales');
    
    // Si no hay resultados con la organización actual, buscar sin filtrar por organización
    if (usarFallback) {
      console.log('🔎 Iniciando búsqueda fallback sin filtro de organización');
      // Búsqueda de productos sin filtro de organización
      const { data: productosFallback, error: productFallbackError } = await supabase
        .from('products')
        .select('id, name, sku, description, organization_id')
        .or(`name.ilike.%${searchTerm}%, sku.ilike.%${searchTerm}%`)
        .limit(resultLimit);
        
      // Búsqueda de clientes sin filtro de organización - mejorada para incluir full_name y avatar_url
      const { data: clientesFallback, error: clientFallbackError } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, full_name, identification_number, organization_id, avatar_url')
        .or(`first_name.ilike.%${searchTerm}%, last_name.ilike.%${searchTerm}%, email.ilike.%${searchTerm}%, full_name.ilike.%${searchTerm}%`)
        .limit(resultLimit);
        
      if (clientFallbackError) {
        console.error('Error al buscar clientes (fallback):', clientFallbackError);
      } else {
        console.log(`Clientes encontrados (fallback): ${clientesFallback?.length || 0}`, clientesFallback);
      }
        
      // Búsqueda de proveedores sin filtro de organización
      const { data: proveedoresFallback, error: supplierFallbackError } = await supabase
        .from('suppliers')
        .select('id, name, nit, email')
        .or(`name.ilike.%${searchTerm}%, nit.ilike.%${searchTerm}%, email.ilike.%${searchTerm}%`)
        .limit(resultLimit);
        
      // Búsqueda de categorías sin filtro de organización
      const { data: categoriasFallback, error: categoryFallbackError } = await supabase
        .from('categories')
        .select('id, name, slug')
        .ilike('name', `%${searchTerm}%`)
        .limit(resultLimit);
        
      console.log('📊 Resultados fallback encontrados:', {
        productos: productosFallback?.length || 0,
        clientes: clientesFallback?.length || 0,
        proveedores: proveedoresFallback?.length || 0,
        categorias: categoriasFallback?.length || 0
      });
        
      // Retornar resultados con fallback
      return { 
        organizaciones: organizaciones || [], 
        sucursales: sucursales || [], 
        clientes: clientesFallback || clientes || [],
        productos: productosFallback || productos || [],
        proveedores: proveedoresFallback || proveedores || [],
        categorias: categoriasFallback || categorias || [],
        facturas: facturas || [],
        pedidosOnline: pedidosOnline || [],
        reservas: reservas || [],
        espacios: espacios || [],
        membresias: membresias || [],
        vehiculosParking: vehiculosParking || []
      };
    }
    
    // Retornar resultados normales si no se necesita fallback
    const resultados = { 
      organizaciones: organizaciones || [], 
      sucursales: sucursales || [], 
      productos: productos || [],
      proveedores: proveedores || [],
      categorias: categorias || [],
      clientes: clientes || [],
      facturas: facturas || [],
      pedidosOnline: pedidosOnline || [],
      reservas: reservas || [],
      espacios: espacios || [],
      membresias: membresias || [],
      vehiculosParking: vehiculosParking || []
    };
    
    // Mapear claves de URL para cada tipo de entidad
    const urlMappings = {
      organizations: '/configuracion/organizaciones',
      branches: '/configuracion/sucursales',
      products: '/inventario/productos',
      suppliers: '/inventario/proveedores',
      categories: '/inventario/categorias',
      customers: '/clientes'
    };
    
    // Aplicar límite global al número total de resultados por categoría
    const limitarResultados = <T extends {id: string}>(items: T[] | null): T[] => {
      return items ? items.slice(0, resultLimit) : [];
    };

    console.log('🔄 Resultados finales:', {
      organizaciones: resultados.organizaciones.length,
      sucursales: resultados.sucursales.length,
      productos: resultados.productos.length,
      proveedores: resultados.proveedores.length,
      categorias: resultados.categorias.length,
      clientes: resultados.clientes.length,
      facturas: resultados.facturas.length,
      pedidosOnline: resultados.pedidosOnline.length,
      reservas: resultados.reservas.length,
      espacios: resultados.espacios.length,
      membresias: resultados.membresias.length,
      vehiculosParking: resultados.vehiculosParking.length
    });
    
    // Aplicar límites globales a todos los resultados
    return {
      organizaciones: limitarResultados(resultados.organizaciones), 
      sucursales: limitarResultados(resultados.sucursales),
      productos: limitarResultados(resultados.productos),
      proveedores: limitarResultados(resultados.proveedores),
      categorias: limitarResultados(resultados.categorias),
      clientes: limitarResultados(resultados.clientes),
      facturas: limitarResultados(resultados.facturas),
      pedidosOnline: limitarResultados(resultados.pedidosOnline),
      reservas: limitarResultados(resultados.reservas),
      espacios: limitarResultados(resultados.espacios),
      membresias: limitarResultados(resultados.membresias),
      vehiculosParking: limitarResultados(resultados.vehiculosParking)
    };
  } catch (error) {
    console.error('Error al buscar datos:', error);
    // Retornar objeto vacío en caso de error
    return {
      organizaciones: [], sucursales: [], clientes: [],
      productos: [], proveedores: [], categorias: [],
      facturas: [], pedidosOnline: [], reservas: [], espacios: [],
      membresias: [], vehiculosParking: []
    };
  }
};
