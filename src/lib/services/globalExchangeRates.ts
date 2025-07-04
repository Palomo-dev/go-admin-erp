/**
 * Servicio para actualización global de tasas de cambio
 * Implementa la funcionalidad para actualizar automáticamente
 * las tasas de todas las organizaciones en una sola operación
 */

// Importación con ruta absoluta para evitar problemas de resolución
import { supabase } from '@/lib/supabase/config';
import { obtenerTasasDeCambio } from './openexchangerates';

/**
 * Obtiene la moneda base para una organización utilizando el sistema de fallback de 4 niveles
 * @param orgId - ID de la organización
 * @returns Código de la moneda base encontrada
 */
export async function obtenerMonedaBase(orgId: number): Promise<string> {
  try {
    console.log(`Buscando moneda base para organización ${orgId}...`);
    
    // Nivel 1: Buscar moneda marcada con is_base=true
    const { data: baseCurrency, error: baseError } = await supabase
      .from('currencies')
      .select('code')
      .eq('organization_id', orgId)
      .eq('is_base', true)
      .limit(1)
      .single();
    
    if (baseCurrency?.code) {
      console.log(`Nivel 1: Encontrada moneda base explícita: ${baseCurrency.code}`);
      return baseCurrency.code;
    }
    
    // Nivel 2: Usar moneda predeterminada de preferencias
    const { data: preferences, error: prefError } = await supabase
      .from('organization_preferences')
      .select('settings')
      .eq('organization_id', orgId)
      .limit(1)
      .single();
    
    const defaultCurrency = preferences?.settings?.finance?.default_currency;
    if (defaultCurrency) {
      console.log(`Nivel 2: Usando moneda de preferencias: ${defaultCurrency}`);
      return defaultCurrency;
    }
    
    // Nivel 3: Usar USD como fallback estándar
    const { data: usdCurrency, error: usdError } = await supabase
      .from('currencies')
      .select('code')
      .eq('organization_id', orgId)
      .eq('code', 'USD')
      .limit(1)
      .single();
    
    if (usdCurrency?.code) {
      console.log(`Nivel 3: Usando USD como fallback: ${usdCurrency.code}`);
      return 'USD';
    }
    
    // Nivel 4: Usar primera moneda disponible
    const { data: anyCurrency, error: anyError } = await supabase
      .from('currencies')
      .select('code')
      .eq('organization_id', orgId)
      .limit(1)
      .single();
    
    if (anyCurrency?.code) {
      console.log(`Nivel 4: Usando primera moneda disponible: ${anyCurrency.code}`);
      return anyCurrency.code;
    }
    
    throw new Error('No se encontró ninguna moneda disponible');
    
  } catch (error) {
    console.error('Error al obtener moneda base:', error);
    return 'USD'; // Último recurso si todo falla
  }
}

/**
 * Guarda las tasas de cambio para una organización específica
 * @param orgId - ID de la organización
 * @param baseCurrencyCode - Código de la moneda base
 * @param rates - Objeto con las tasas de cambio
 * @param timestamp - Timestamp de las tasas (opcional)
 */
export async function guardarTasasDeCambio(
  orgId: number,
  baseCurrencyCode: string,
  rates: Record<string, number>,
  timestamp?: number
): Promise<void> {
  try {
    console.log(`Guardando tasas para organización ${orgId} con base ${baseCurrencyCode}`);
    
    // Llamar a la función RPC para guardar las tasas
    const { data, error } = await supabase.rpc('save_exchange_rates', {
      p_organization_id: orgId,
      p_base_currency_code: baseCurrencyCode,
      p_rates: rates,
      p_timestamp: timestamp || Math.floor(Date.now() / 1000)
    });
    
    if (error) {
      throw error;
    }
    
    console.log(`Tasas guardadas exitosamente para organización ${orgId}`);
  } catch (error) {
    console.error('Error al guardar tasas:', error);
    throw error;
  }
}

/**
 * Actualiza las tasas de cambio para una organización específica
 * @param orgId - ID de la organización
 */
export async function actualizarTasasDeCambio(orgId: number): Promise<void> {
  try {
    console.log(`Iniciando actualización de tasas para organización ${orgId}`);
    
    // Obtener la moneda base usando el sistema de fallback
    const baseCurrency = await obtenerMonedaBase(orgId);
    console.log(`Moneda base determinada: ${baseCurrency}`);
    
    // Obtener tasas actuales desde la API
    const response = await obtenerTasasDeCambio(baseCurrency);
    console.log(`Tasas obtenidas desde API para base ${baseCurrency}`);
    
    // Guardar tasas en la base de datos
    await guardarTasasDeCambio(
      orgId,
      baseCurrency,
      response.rates,
      response.timestamp
    );
    
    console.log(`Actualización completada para organización ${orgId}`);
  } catch (error) {
    console.error(`Error actualizando tasas para organización ${orgId}:`, error);
    throw error;
  }
}

/**
 * Actualiza las tasas de cambio para todas las organizaciones activas
 * @returns Resultado con métricas de la operación global
 */
export async function actualizarTasasDeCambioGlobal(): Promise<{
  total: number;
  success: number;
  failed: number;
  details: Record<string, any>[];
}> {
  const result = {
    total: 0,
    success: 0,
    failed: 0,
    details: [] as Record<string, any>[]
  };
  
  try {
    console.log('Iniciando actualización global de tasas de cambio');
    
    // Obtener todas las organizaciones activas
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('is_active', true);
    
    if (error) throw error;
    
    result.total = organizations?.length || 0;
    console.log(`Total de organizaciones a procesar: ${result.total}`);
    
    // Procesar cada organización de forma aislada
    if (organizations && organizations.length > 0) {
      for (const org of organizations) {
        try {
          await actualizarTasasDeCambio(org.id);
          
          result.success++;
          result.details.push({
            organization_id: org.id,
            name: org.name,
            success: true
          });
        } catch (orgError: any) {
          result.failed++;
          result.details.push({
            organization_id: org.id,
            name: org.name,
            success: false,
            error: orgError.message
          });
        }
      }
    }
    
    // Registrar la ejecución en la tabla de logs
    const { error: logError } = await supabase
      .from('exchange_rates_logs')
      .insert({
        execution_date: new Date().toISOString(),
        success: result.failed === 0,
        error_message: result.failed > 0 ? `Fallaron ${result.failed} de ${result.total} organizaciones` : null,
        organizations_total: result.total,
        organizations_success: result.success,
        organizations_error: result.failed,
        details: result.details
      });
      
    if (logError) {
      console.error('Error al registrar log de ejecución:', logError);
    }
    
    console.log(`Actualización global completada. Éxito: ${result.success}, Fallos: ${result.failed}`);
    return result;
    
  } catch (error) {
    console.error('Error crítico en actualización global:', error);
    throw error;
  }
}
