/**
 * Servicio para interactuar con la API de OpenExchangeRates
 * Proporciona funcionalidades para obtener, guardar y actualizar tasas de cambio
 * tanto para organizaciones individuales como de forma global
 * Optimizado para consultas en tiempo real sin caché
 * Adaptado a la nueva estructura de tablas normalizada:
 * - currencies: Catálogo global de monedas
 * - organization_currencies: Relación organización-moneda con flags
 * - currency_rates: Tasas de cambio históricas
 * - exchange_rates_logs: Registro de actualizaciones
 */

import { supabase } from '@/lib/supabase/config';

/**
 * Valida que la API key funcione correctamente
 * @param apiKey - La API key a validar
 * @returns Promise<boolean> - true si la API key es válida
 */
export async function validarAPIKey(apiKey: string): Promise<boolean> {
  try {
    const testUrl = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&symbols=EUR`;
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GO-Admin-ERP/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    console.log('Validación de API Key - Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      return !!(data && data.rates && data.base);
    }
    
    if (response.status === 401) {
      console.error('API Key inválida o expirada');
      return false;
    }
    
    return false;
  } catch (error) {
    console.error('Error al validar API Key:', error);
    return false;
  }
}

/**
 * Obtiene las tasas de cambio actuales desde OpenExchangeRates en tiempo real
 * @param baseCurrency - Código de la moneda base (default: USD)
 * @returns Un objeto con las tasas de cambio actualizadas
 */
async function intentarSolicitudAPI(url: string, intento: number = 1): Promise<Response> {
  console.log(`Intento ${intento} de solicitud a OpenExchangeRates`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Accept': 'application/json',
        'User-Agent': 'GO-Admin-ERP/1.0'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000) // 15 segundos timeout
    });
    
    return response;
  } catch (error: any) {
    if (intento < 3) {
      console.log(`Intento ${intento} falló, reintentando en 2 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return intentarSolicitudAPI(url, intento + 1);
    }
    throw error;
  }
}

export async function obtenerTasasDeCambio(baseCurrency: string = 'USD') {
  // Obtenemos la API key de las variables de entorno
  const API_KEY = process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY;
  
  console.log('Iniciando consulta en tiempo real para tasas de cambio con base:', baseCurrency);
  console.log('API Key disponible:', API_KEY ? 'Sí (***masked***)' : 'No');
  
  if (!API_KEY) {
    console.error('API key no encontrada en variables de entorno');
    throw new Error('API key de OpenExchangeRates no configurada');
  }

  // Validar API key antes de proceder
  console.log('Validando API key...');
  const esAPIKeyValida = await validarAPIKey(API_KEY);
  if (!esAPIKeyValida) {
    throw new Error('API key de OpenExchangeRates es inválida o ha expirado. Verifique su configuración.');
  }
  console.log('API key validada exitosamente');

  try {
    // NOTA: La API gratuita solo permite USD como base
    // Si se requiere otra moneda base, se hace la conversión manualmente
    
    // Generamos un timestamp para evitar caché del navegador o de la red
    const timestamp = Date.now();
    const url = `https://openexchangerates.org/api/latest.json?app_id=${API_KEY}&nocache=${timestamp}`;
    console.log('URL de consulta:', url.replace(API_KEY, '[API_KEY_MASKED]'));

    // Usar la función de reintentos
    const response = await intentarSolicitudAPI(url);
    
    console.log('Status de respuesta:', response.status, response.statusText);
    console.log('Headers de respuesta:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorText = await response.text();
        console.log('Contenido de error de la API:', errorText);
        errorDetails = errorText;
      } catch (e) {
        console.log('No se pudo leer el contenido del error');
      }
      
      throw new Error(`Error al consultar API en tiempo real: ${response.status} ${response.statusText}. Detalles: ${errorDetails}`);
    }

    const data = await response.json();
    console.log('Datos en tiempo real recibidos:', { 
      base: data.base, 
      timestamp: data.timestamp, 
      fecha: new Date(data.timestamp * 1000).toISOString(),
      monedas: Object.keys(data.rates).length 
    });

    // Si la moneda base solicitada es USD, devolver los datos tal cual
    if (baseCurrency === 'USD') {
      return data;
    }

    // Si se solicitó otra moneda base, convertir las tasas
    console.log('Convirtiendo tasas a base:', baseCurrency);
    
    // Verificar que exista la tasa para la moneda base solicitada
    if (!data.rates[baseCurrency]) {
      throw new Error(`No se encontró tasa para la moneda base ${baseCurrency}`);
    }

    const baseRate = data.rates[baseCurrency];
    const convertedRates: Record<string, number> = {};

    // Convertir todas las tasas a la nueva base
    for (const [currency, rate] of Object.entries(data.rates)) {
      convertedRates[currency] = Number(rate) / baseRate;
    }

    // Agregar tasa 1.0 para la moneda base
    convertedRates[baseCurrency] = 1.0;
    
    console.log(`Conversión completada. ${Object.keys(convertedRates).length} tasas disponibles`);
    
    return {
      disclaimer: data.disclaimer,
      license: data.license,
      base: baseCurrency,
      rates: convertedRates,
      timestamp: data.timestamp
    };
  } catch (error: any) {
    console.warn('Error de conectividad detectado (usando fallback):', error.message);
    
    let errorMessage = 'Error desconocido';
    let diagnosticInfo = '';
    
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      diagnosticInfo = 'Posibles causas: 1) Sin conexión a internet, 2) API de OpenExchangeRates no disponible, 3) Bloqueado por CORS, 4) Firewall bloqueando la solicitud';
      errorMessage = 'Error de conectividad - No se puede conectar con OpenExchangeRates';
    } else if (error.name === 'NetworkError') {
      diagnosticInfo = 'Error de red detectado';
      errorMessage = 'Error de red al conectar con OpenExchangeRates';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    console.warn('Diagnóstico:', diagnosticInfo);
    console.warn('Activando sistema de fallback automático...');
    
    throw new Error(`Error en consulta de tasas: ${errorMessage}${diagnosticInfo ? '. ' + diagnosticInfo : ''}`);
  }
}

/**
 * Guarda las tasas obtenidas en la base de datos mediante RPC
 * @param rates - Objeto con las tasas de cambio
 * @param date - Fecha de las tasas (opcional)
 * @param source - Fuente de los datos (por defecto: openexchangerates)
 * @param api_timestamp - Timestamp de la API (opcional)
 * @param base_currency_code - Código de moneda base (por defecto: USD)
 * @returns Resultado de la operación
 */
export async function guardarTasasDeCambio(
  rates: Record<string, number>,
  date?: Date,
  source: string = 'openexchangerates',
  api_timestamp?: number,
  base_currency_code: string = 'USD'
) {
  const { supabase } = await import('@/lib/supabase/config');
  
  try {
    // Formatear fecha para la base de datos en formato YYYY-MM-DD
    const formattedDate = date ? new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
      .toISOString()
      .split('T')[0] : undefined;
    
    console.log('Guardando tasas con moneda base:', base_currency_code, 'para fecha:', formattedDate || 'hoy');
    
    // Validar que tenemos todos los parámetros necesarios
    const finalDate = formattedDate || new Date().toISOString().split('T')[0];
    const finalTimestamp = api_timestamp || Math.floor(Date.now() / 1000);
    
    // Ir directamente a la inserción en la tabla ya que la función RPC está desactualizada
    // y hace referencia a tablas que ya no existen (currency_templates)
    
    // Insertamos directamente en la tabla currency_rates
    console.log('Insertando datos en la tabla currency_rates');
    
    // Preparar lote de registros para insertar
    const records = Object.entries(rates).map(([code, rate]) => ({
      code,
      rate_date: finalDate,
      rate: rate.toString(),
      source,
      base_currency_code,
      api_data: {
        base: base_currency_code,
        code,
        rate,
        timestamp: finalTimestamp
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    // Usamos upsert en lugar de delete + insert para evitar errores de duplicados
    // La operación upsert actualizará registros existentes o insertará nuevos
    // definimos los campos que conforman la clave única
    const onConflict = 'code,rate_date';
    
    // Insertamos los nuevos registros en lotes de 10 para evitar límites
    const batchSize = 10;
    let inserted = 0;
    let updated = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Utilizamos upsert para manejar los registros existentes
      const { error: upsertError, data: upsertData } = await supabase
        .from('currency_rates')
        .upsert(batch, { onConflict, ignoreDuplicates: false })
        .select();
      
      if (upsertError) {
        console.error(`Error al actualizar lote ${i/batchSize + 1}:`, upsertError);
      } else {
        // Actualizamos contador
        if (upsertData) {
          inserted += upsertData.length;
          console.log(`Lote ${i/batchSize + 1}: ${upsertData.length} registros procesados`);
        }
      }
    }
    
    console.log(`Actualización completada: ${inserted} de ${records.length} registros procesados (insertados o actualizados)`);
    
    // Devolver formato similar al de la función RPC para mantener compatibilidad
    return {
      success: true,
      message: 'Tasas de cambio actualizadas exitosamente',
      updated_count: inserted,
      skipped_count: records.length - inserted,
      base_currency_code
    };
  } catch (error: any) {
    console.error('Error al guardar tasas en la base de datos:', error);
    throw new Error(`No se pudieron guardar las tasas: ${error.message}`);
  }
}

/**
 * Función de emergencia que usa RPC de Supabase para obtener tasas
 * Evita problemas de CORS y navegador usando funciones del servidor
 * @returns Resultado de la actualización de tasas
 */
export async function actualizarTasasViaRPC(): Promise<{
  success: boolean;
  message: string;
  updated_count?: number;
  timestamp?: number;
}> {
  try {
    console.log('Iniciando fallback usando función RPC de Supabase...');

    // Obtener tasas de cambio usando fetch directamente (desde servidor)
    const apiKey = process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY || process.env.OPENEXCHANGERATES_API_KEY;
    
    console.log('Verificando API key para fallback RPC:', {
      hasPublicKey: !!process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY,
      hasPrivateKey: !!process.env.OPENEXCHANGERATES_API_KEY,
      finalApiKey: apiKey ? '***' + apiKey.slice(-4) : 'NO DISPONIBLE'
    });
    
    if (!apiKey) {
      return {
        success: false,
        message: 'API key no disponible para fallback RPC'
      };
    }

    const url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`;

    // Usar fetch básico para obtener tasas (esto funciona desde el servidor)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Error HTTP ${response.status}: ${response.statusText}`
      };
    }

    const exchangeRatesData = await response.json();
    
    console.log('Datos recibidos de la API:', {
      base: exchangeRatesData.base,
      timestamp: exchangeRatesData.timestamp,
      rates_count: exchangeRatesData.rates ? Object.keys(exchangeRatesData.rates).length : 0,
      has_rates: !!exchangeRatesData.rates
    });

    if (!exchangeRatesData.rates) {
      return {
        success: false,
        message: 'Datos de tasas no válidos en respuesta de API'
      };
    }
    
    // Verificar que las tasas sean un objeto válido
    if (typeof exchangeRatesData.rates !== 'object' || exchangeRatesData.rates === null) {
      return {
        success: false,
        message: 'Formato de tasas inválido en respuesta de API'
      };
    }

    // Usar función RPC para guardar las tasas obtenidas
    const currentDate = new Date().toISOString().split('T')[0];
    
    console.log('Llamando RPC update_global_exchange_rates con:', {
      rates: Object.keys(exchangeRatesData.rates).length + ' monedas',
      source: 'openexchangerates-fallback',
      api_timestamp: exchangeRatesData.timestamp,
      rate_date: currentDate
    });
    
    const { data, error } = await supabase.rpc('update_global_exchange_rates', {
      rates: exchangeRatesData.rates,
      source: 'openexchangerates-fallback',
      api_timestamp: exchangeRatesData.timestamp || null,
      rate_date: currentDate
    });

    if (error) {
      console.error('Error en RPC update_global_exchange_rates:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return {
        success: false,
        message: `Error en función RPC: ${error.message || 'Error desconocido'}`
      };
    }

    console.log('RPC exitoso con update_global_exchange_rates:', data);
    return {
      success: true,
      message: 'Tasas actualizadas usando RPC fallback',
      updated_count: data?.updated_count || 0,
      timestamp: exchangeRatesData.timestamp
    };

  } catch (error: any) {
    console.error('Error general en fallback RPC:', {
      error,
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return {
      success: false,
      message: `Error en fallback RPC: ${error.message || 'Error desconocido en catch'}`
    };
  }
}

/**
 * Actualiza las tasas de cambio para una organización
 * Obtiene los datos de la API y los guarda en la BD
 * @param orgId - ID de la organización
 * @returns Resultado de la operación
 */
export async function actualizarTasasDeCambio(orgId: number, fecha?: Date) {
  const { supabase } = await import('@/lib/supabase/config');
  
  try {
    console.log('Iniciando actualización de tasas para organización:', orgId);
    
    // Verificar la API key en .env antes de continuar
    const API_KEY = process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY;
    if (!API_KEY) {
      console.error('No se encontró la variable de entorno NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY');
      throw new Error('API key de OpenExchangeRates no configurada en variables de entorno');
    }
    
    // Forzar USD como moneda base siempre, independientemente de la configuración
    const monedaBase = 'USD';
    console.log('Forzando USD como moneda base (política global)');
    
    // 1.1 Obtener información de configuración mediante la función RPC
    // Esta función devuelve información sobre la moneda base configurada y la API
    const { data: configData, error: configError } = await supabase
      .rpc('update_exchange_rates', { org_id: orgId });

    if (configError) {
      console.error('Error en RPC update_exchange_rates:', configError);
      throw configError;
    }
    if (!configData) {
      console.error('No se recibió configuración de update_exchange_rates');
      throw new Error('No se pudo obtener la configuración para actualizar tasas');
    }
    
    // Verificar la información recibida
    if (!configData.base_currency_id) {
      throw new Error('No se encontró ID de moneda base en la configuración');
    }
    
    console.log('Configuración obtenida:', configData);
    
    // 2. Obtener tasas de cambio de la API siempre usando USD
    console.log('Solicitando tasas para moneda base: USD (forzado)');
    const tasas = await obtenerTasasDeCambio('USD');
    
    // 3. Guardar las tasas en la base de datos para la fecha seleccionada o actual
    const fechaActual = fecha || new Date();
    console.log('Guardando tasas para fecha:', fechaActual.toISOString().split('T')[0]);
    
    // Guardar tasas usando la nueva estructura normalizada siempre con USD como base
    const resultado = await guardarTasasDeCambio(
      tasas.rates,
      fechaActual,
      'openexchangerates',
      tasas.timestamp,
      'USD' // Forzar USD como moneda base
    );
    
    console.log('Tasas guardadas exitosamente. Tasas actualizadas:', resultado.updated_count);
    
    return {
      success: true,
      updated_count: resultado.updated_count,
      base_currency: 'USD',
      base_currency_type: 'usd',
      timestamp: tasas.timestamp
    };
  } catch (error: any) {
    console.error('Error al actualizar tasas de cambio:', error);
    throw new Error(`Error al actualizar tasas de cambio: ${error.message}`);
  }
}

/**
 * Actualiza las tasas de cambio para todas las monedas del catálogo global
 * @returns Resultado con métricas de la operación global y propiedades para compatibilidad
 */
export async function actualizarTasasDeCambioGlobal(): Promise<{
  // Propiedades para compatibilidad con código existente
  success: boolean; // Añadimos success para tipos correctos
  timestamp?: number;
  updated_count?: number;
  base_currency?: string;
  message?: string;
}> {
  const { supabase } = await import('@/lib/supabase/config');
  try {
    console.log('Iniciando actualización de tasas de cambio globales');
    
    // 1. Obtener todas las tasas de cambio con USD como base desde la API
    const exchangeRatesData = await obtenerTasasDeCambio('USD');
    console.log('Tasas obtenidas desde API:', Object.keys(exchangeRatesData.rates).length, 'monedas');
    
    // 2. Obtener todas las monedas que se deben actualizar automáticamente
    const { data: activeCurrencies, error: currError } = await supabase
      .from('currencies')
      .select('code, name, symbol')
      .eq('auto_update', true);
    
    if (currError) throw new Error(`Error al obtener monedas activas: ${currError.message}`);
    if (!activeCurrencies || activeCurrencies.length === 0) {
      throw new Error('No se encontraron monedas con auto_update=true en el catálogo');
    }
    
    console.log(`Encontradas ${activeCurrencies.length} monedas para actualizar automáticamente`);
    
    // 3. Filtrar y preparar las tasas de cambio para las monedas activas
    const filteredRates: Record<string, number> = {};
    let availableCount = 0;
    let missingCount = 0;
    
    for (const currency of activeCurrencies) {
      if (currency.code === 'USD') {
        // USD siempre tiene valor 1 con base USD
        filteredRates[currency.code] = 1;
        availableCount++;
      } else if (exchangeRatesData.rates[currency.code]) {
        // Moneda disponible en la API
        filteredRates[currency.code] = exchangeRatesData.rates[currency.code];
        availableCount++;
      } else {
        // Moneda no disponible en la API
        console.warn(`Advertencia: No hay tasa disponible para ${currency.code}, no se actualizará`);
        missingCount++;
      }
    }
    
    console.log(`Monedas con tasa disponible: ${availableCount}, monedas sin tasa: ${missingCount}`);
    
    // 4. Guardar tasas en la base de datos
    const date = new Date(exchangeRatesData.timestamp * 1000);
    const formattedDate = date.toISOString().split('T')[0];
    let updatedCount = 0;
    
    // Guardar las tasas directamente en la base de datos
    console.log(`Guardando ${Object.keys(filteredRates).length} tasas con base USD`);
    const resultado = await guardarTasasDeCambio(
      filteredRates,
      date,
      'openexchangerates',
      exchangeRatesData.timestamp,
      'USD'
    );
    
    // Actualizar contador para estadísticas
    updatedCount = resultado.updated_count || 0;
    console.log(`Actualización completada. Actualizados: ${updatedCount} registros`);
    
    // 5. Registrar la ejecución
    const { error: logError } = await supabase
      .rpc('log_exchange_rates_execution', {
        p_execution_date: new Date().toISOString(),
        p_success: true,
        p_error_message: null,
        p_organizations_total: 0,
        p_organizations_success: 0,
        p_organizations_error: 0,
        p_details: [
          {
            operation: 'global_update',
            rates_updated: updatedCount,
            base_currency: 'USD',
            currencies_total: activeCurrencies.length,
            currencies_updated: availableCount
          }
        ]
      });
      
    if (logError) {
      console.warn('Error al registrar log de ejecución:', logError.message);
    }
    
    console.log(`Actualización global completada. Actualizados: ${updatedCount} registros`);
    
    // Retornar resultado compatible con la versión anterior
    return {
      success: true, // Añadimos la propiedad success para que la condición en ExchangeRatesTable.tsx funcione
      timestamp: exchangeRatesData.timestamp,
      updated_count: updatedCount,
      base_currency: 'USD',
      message: `Tasas de cambio actualizadas exitosamente. Total: ${updatedCount} registros`
    };
  } catch (error: any) {
    console.warn('Error en conexión directa a OpenExchangeRates API:', error.message);
    
    // Si el error es de conectividad (Failed to fetch, timeout, etc.), intentar RPC como fallback
    // Detectar múltiples variantes de errores de conectividad
    const isConnectivityError = 
      error.message?.includes('Failed to fetch') || 
      error.message?.includes('conectividad') || 
      error.message?.includes('timeout') ||
      error.message?.includes('NetworkError') ||
      error.message?.includes('TypeError: Failed to fetch') ||
      error.message?.includes('Error de conectividad') ||
      error.message?.includes('Error en consulta de tasas: Error de conectividad') ||
      error.message?.includes('Sin conexión a internet') ||
      error.message?.includes('Bloqueado por CORS') ||
      error.message?.includes('API de OpenExchangeRates no disponible') ||
      error.name === 'TypeError' ||
      error.code === 'FETCH_ERROR' ||
      (error instanceof TypeError && error.message?.includes('fetch'));
    
    console.log('Analizando error para fallback:', {
      message: error.message,
      name: error.name,
      type: typeof error,
      isConnectivityError
    });
    
    if (isConnectivityError) {
        
      console.log('Detectado error de conectividad, intentando fallback con RPC...');
      
      try {
        const fallbackResult = await actualizarTasasViaRPC();
        
        if (fallbackResult.success) {
          console.log('✅ ÉXITO: Sistema de fallback RPC funcionó correctamente');
          console.log(`✅ ${fallbackResult.updated_count || 0} tasas actualizadas via fallback`);
          return fallbackResult;
        } else {
          console.error('Fallback también falló:', fallbackResult.message);
        }
      } catch (fallbackError) {
        console.error('Error en fallback de RPC:', fallbackError);
      }
    }
    
    // Intentar registrar el error
    try {
      await supabase.rpc('log_exchange_rates_execution', {
        p_execution_date: new Date().toISOString(),
        p_success: false,
        p_error_message: error.message,
        p_organizations_total: 0,
        p_organizations_success: 0,
        p_organizations_error: 0,
        p_details: [
          {
            operation: 'global_update',
            error: error.message,
            fallback_attempted: true
          }
        ]
      });
    } catch (logError) {
      console.error('Error adicional al registrar fallo:', logError);
    }
    
    throw error;
  }
}

/**
 * Obtiene la moneda base para una organización con sistema de fallback
 * Implementa un sistema de 4 niveles de fallback para garantizar que siempre se encuentre una moneda base:
 * 1. Moneda marcada con is_base=true en organization_currencies
 * 2. Moneda predeterminada en preferencias de organización
 * 3. USD como fallback estándar
 * 4. Primera moneda disponible
 * 
 * @param orgId - ID de la organización
 * @returns Información de la moneda base y su tipo/origen
 */
export async function obtenerMonedaBase(orgId: number) {
  const { supabase } = await import('@/lib/supabase/config');
  
  console.log(`Buscando moneda base para organización ${orgId}`);
  
  // Validación de entrada
  if (!orgId || isNaN(orgId)) {
    throw new Error(`ID de organización inválido: ${orgId}`);
  }
  
  // Nivel 1: Buscar moneda marcada con is_base=true en organization_currencies
  console.log('Nivel 1: Buscando moneda marcada como base');
  let { data: baseMonedaInfo, error: errorBaseCurrency } = await supabase
    .from('organization_currencies')
    .select('currency_code, is_base')
    .eq('organization_id', orgId)
    .eq('is_base', true)
    .single();
    
  if (errorBaseCurrency && errorBaseCurrency.code !== 'PGRST116') { // PGRST116 = no encontrado
    console.error(`Error al buscar moneda base: ${errorBaseCurrency.message}`);
  }
    
  let tipoMonedaBase = 'base';
  let baseMoneda = null;
    
  // Si encontramos la moneda base, obtenemos sus datos completos del catálogo global
  if (baseMonedaInfo?.currency_code) {
    console.log(`Moneda base encontrada: ${baseMonedaInfo.currency_code}`);
    const { data: monedaDetalle, error: errorDetalle } = await supabase
      .from('currencies')
      .select('*')
      .eq('code', baseMonedaInfo.currency_code)
      .single();
      
    if (errorDetalle) {
      console.error(`Error al obtener detalles de moneda ${baseMonedaInfo.currency_code}: ${errorDetalle.message}`);
    }
      
    if (monedaDetalle) {
      baseMoneda = {
        ...monedaDetalle,
        is_base: true
      };
    }
  } else {
    console.log('No se encontró moneda marcada como base');
  }
  
    
  if (!baseMoneda) {
    // Nivel 2: Preferencia de organización
    console.log('Nivel 2: Buscando moneda en preferencias de organización');
    const { data: orgPrefs, error: errorPrefs } = await supabase
      .from('organization_preferences')
      .select('settings')
      .eq('organization_id', orgId)
      .single();
    
    if (errorPrefs && errorPrefs.code !== 'PGRST116') {
      console.error(`Error al obtener preferencias de organización: ${errorPrefs.message}`);
    }
      
    if (orgPrefs?.settings?.finance?.default_currency) {
      const currencyCode = orgPrefs.settings.finance.default_currency;
      console.log(`Moneda predeterminada en preferencias: ${currencyCode}`);
      
      // Verificar si existe en organization_currencies
      const { data: orgCurrencyExists, error: errorOrgCurrency } = await supabase
        .from('organization_currencies')
        .select('currency_code')
        .eq('organization_id', orgId)
        .eq('currency_code', currencyCode)
        .maybeSingle();
      
      if (errorOrgCurrency) {
        console.error(`Error al verificar si la moneda ${currencyCode} existe para la organización: ${errorOrgCurrency.message}`);
      }
        
      if (orgCurrencyExists?.currency_code) {
        console.log(`La moneda ${currencyCode} existe para la organización`);
        const { data: monedaDetalle, error: errorDetalle } = await supabase
          .from('currencies')
          .select('*')
          .eq('code', currencyCode)
          .single();
        
        if (errorDetalle) {
          console.error(`Error al obtener detalles de moneda ${currencyCode}: ${errorDetalle.message}`);
        }
          
        if (monedaDetalle) {
          baseMoneda = {
            ...monedaDetalle,
            is_base: false
          };
          tipoMonedaBase = 'preferencia';
          console.log(`Se usará la moneda de preferencia: ${currencyCode}`);
        }
      } else {
        console.log(`La moneda ${currencyCode} no está asignada a la organización`);
      }
    } else {
      console.log('No se encontró moneda predeterminada en preferencias');
    }
  }
  
  // Nivel 3: USD como fallback estándar
  if (!baseMoneda) {
    console.log('Nivel 3: Buscando USD como fallback');
    const { data: usdCurrency, error: errorUsd } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', orgId)
      .eq('currency_code', 'USD')
      .maybeSingle();
    
    if (errorUsd && errorUsd.code !== 'PGRST116') {
      console.error(`Error al buscar USD para la organización: ${errorUsd.message}`);
    }
      
    if (usdCurrency?.currency_code) {
      console.log('USD encontrado para la organización');
      const { data: usdDetalle, error: errorUsdDetalle } = await supabase
        .from('currencies')
        .select('*')
        .eq('code', 'USD')
        .single();
      
      if (errorUsdDetalle) {
        console.error(`Error al obtener detalles de USD: ${errorUsdDetalle.message}`);
      }
        
      if (usdDetalle) {
        baseMoneda = {
          ...usdDetalle,
          is_base: false
        };
        tipoMonedaBase = 'usd';
        console.log('Se usará USD como fallback');
      }
    } else {
      console.log('USD no está disponible para la organización');
    }
  }
  
  // Nivel 4: Primera moneda disponible
  if (!baseMoneda) {
    console.log('Nivel 4: Buscando cualquier moneda disponible');
    const { data: cualquierMoneda, error: errorCualquier } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (errorCualquier && errorCualquier.code !== 'PGRST116') {
      console.error(`Error al buscar cualquier moneda: ${errorCualquier.message}`);
    }
      
    if (cualquierMoneda?.currency_code) {
      console.log(`Se encontró la moneda ${cualquierMoneda.currency_code} como última opción`);
      const { data: monedaDetalle, error: errorDetalle } = await supabase
        .from('currencies')
        .select('*')
        .eq('code', cualquierMoneda.currency_code)
        .single();
      
      if (errorDetalle) {
        console.error(`Error al obtener detalles de moneda ${cualquierMoneda.currency_code}: ${errorDetalle.message}`);
      }
        
      if (monedaDetalle) {
        baseMoneda = {
          ...monedaDetalle,
          is_base: false
        };
        tipoMonedaBase = 'primera';
        console.log(`Se usará la primera moneda disponible: ${cualquierMoneda.currency_code}`);
      }
    } else {
      console.log('No se encontró ninguna moneda para la organización');
    }
  }
  
  // Nivel 5: Usar monedas del catálogo global si no hay monedas específicas de la organización
  if (!baseMoneda) {
    console.log('Nivel 5: Consultando catálogo global de monedas');
    
    // Primero intentamos con USD del catálogo global
    const { data: usdGlobal, error: errorUsdGlobal } = await supabase
      .from('currencies')
      .select('*')
      .eq('code', 'USD')
      .single();
    
    if (errorUsdGlobal && errorUsdGlobal.code !== 'PGRST116') {
      console.error(`Error al buscar USD en catálogo global: ${errorUsdGlobal.message}`);
    }
    
    if (usdGlobal) {
      console.log('Se utilizará USD del catálogo global');
      baseMoneda = {
        ...usdGlobal,
        is_base: false
      };
      tipoMonedaBase = 'global_usd';
    } else {
      // Si no hay USD, usamos la primera moneda disponible del catálogo global
      const { data: primeraGlobal, error: errorPrimeraGlobal } = await supabase
        .from('currencies')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (errorPrimeraGlobal) {
        console.error(`Error al buscar monedas en catálogo global: ${errorPrimeraGlobal.message}`);
      }
      
      if (primeraGlobal) {
        console.log(`Se utilizará ${primeraGlobal.code} del catálogo global`);
        baseMoneda = {
          ...primeraGlobal,
          is_base: false
        };
        tipoMonedaBase = 'global_primera';
      }
    }
  }
  
  // Si no se encontró ninguna moneda, lanzamos error
  if (!baseMoneda) {
    console.error(`No se encontró ninguna moneda para la organización ${orgId}`);
    throw new Error(`No se encontró ninguna moneda para la organización ${orgId}`);
  }
  
  console.log(`Moneda base final: ${baseMoneda.code} (${tipoMonedaBase})`);
  return { moneda: baseMoneda, tipo: tipoMonedaBase };
}
