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
      organizaciones: [], 
      sucursales: [], 
      usuarios: [],
      productos: [],
      proveedores: [],
      categorias: [],
      clientes: []
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

    const { data: usuarios, error: userError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .or(`first_name.ilike.%${searchTerm}%, last_name.ilike.%${searchTerm}%, email.ilike.%${searchTerm}%`)
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
    
    // Verificar si hay resultados de entidades relacionadas con organización
    const hayResultadosLocales = (
      (productos && productos.length > 0) ||
      (clientes && clientes.length > 0) ||
      (proveedores && proveedores.length > 0) ||
      (categorias && categorias.length > 0)
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
        usuarios: usuarios || [],
        clientes: clientesFallback || clientes || [],
        productos: productosFallback || productos || [],
        proveedores: proveedoresFallback || proveedores || [],
        categorias: categoriasFallback || categorias || []
      };
    }
    
    // Retornar resultados normales si no se necesita fallback
    const resultados = { 
      organizaciones: organizaciones || [], 
      sucursales: sucursales || [], 
      usuarios: usuarios || [],
      productos: productos || [],
      proveedores: proveedores || [],
      categorias: categorias || [],
      clientes: clientes || []
    };
    
    // Mapear claves de URL para cada tipo de entidad
    const urlMappings = {
      users: '/usuarios',
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
      usuarios: resultados.usuarios.length,
      productos: resultados.productos.length,
      proveedores: resultados.proveedores.length,
      categorias: resultados.categorias.length,
      clientes: resultados.clientes.length
    });
    
    // Aplicar límites globales a todos los resultados
    return {
      organizaciones: limitarResultados(resultados.organizaciones), 
      sucursales: limitarResultados(resultados.sucursales), 
      usuarios: limitarResultados(resultados.usuarios),
      productos: limitarResultados(resultados.productos),
      proveedores: limitarResultados(resultados.proveedores),
      categorias: limitarResultados(resultados.categorias),
      clientes: limitarResultados(resultados.clientes)
    };
  } catch (error) {
    console.error('Error al buscar datos:', error);
    // Retornar objeto vacío en caso de error
    return {
      organizaciones: [],
      sucursales: [],
      usuarios: [],
      clientes: [],
      productos: [],
      proveedores: [],
      categorias: []
    };
  }
};
