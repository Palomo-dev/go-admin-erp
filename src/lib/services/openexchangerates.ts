/**
 * Servicio para interactuar con la API de OpenExchangeRates
 * Proporciona funcionalidades para obtener, guardar y actualizar tasas de cambio
 * tanto para organizaciones individuales como de forma global
 * Optimizado para consultas en tiempo real sin caché
 */

/**
 * Obtiene las tasas de cambio actuales desde OpenExchangeRates en tiempo real
 * @param baseCurrency - Código de la moneda base (default: USD)
 * @returns Un objeto con las tasas de cambio actualizadas
 */
export async function obtenerTasasDeCambio(baseCurrency: string = 'USD') {
  // Obtenemos la API key de las variables de entorno
  const API_KEY = process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY;
  
  console.log('Iniciando consulta en tiempo real para tasas de cambio con base:', baseCurrency);
  
  if (!API_KEY) {
    console.error('API key no encontrada en variables de entorno');
    throw new Error('API key de OpenExchangeRates no configurada');
  }

  try {
    // NOTA: La API gratuita solo permite USD como base
    // Si se requiere otra moneda base, se hace la conversión manualmente
    
    // Generamos un timestamp para evitar caché del navegador o de la red
    const timestamp = Date.now();
    const url = `https://openexchangerates.org/api/latest.json?app_id=${API_KEY}&nocache=${timestamp}`;
    console.log('URL de consulta:', url.replace(API_KEY, '[API_KEY]'));

    // Configurar la solicitud para evitar caché en todos los niveles
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Error al consultar API en tiempo real: ${response.status} ${response.statusText}`);
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
    console.error('Error al obtener tasas de cambio en tiempo real:', error);
    throw new Error(`Error en consulta de tasas: ${error.message}`);
  }
}

/**
 * Guarda las tasas obtenidas en la base de datos mediante RPC
 * @param orgId - ID de la organización
 * @param baseCurrencyId - ID de la moneda base
 * @param rates - Objeto con las tasas de cambio
 * @returns Resultado de la operación
 */
export async function guardarTasasDeCambio(orgId: number, baseCurrencyId: string, rates: Record<string, number>, timestamp?: number, date?: Date, baseCurrency: string = 'USD') {
  const { supabase } = await import('@/lib/supabase/config');
  
  try {
    // Formatear fecha para la base de datos en formato YYYY-MM-DD
    const formattedDate = date ? new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
      .toISOString()
      .split('T')[0] : undefined;
    
    console.log('Guardando tasas con moneda base:', baseCurrency, 'para fecha:', formattedDate);
    
    const { data, error } = await supabase.rpc('save_exchange_rates', {
      org_id: orgId,
      base_currency_id: baseCurrencyId,
      rates: rates,
      source: 'openexchangerates',
      api_timestamp: timestamp || Math.floor(Date.now() / 1000),
      rate_date: formattedDate,
      base_currency_code: baseCurrency
    });

    if (error) throw error;
    
    return data;
  } catch (error: any) {
    console.error('Error al guardar tasas en la base de datos:', error);
    throw new Error(`No se pudieron guardar las tasas: ${error.message}`);
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
    
    // 1. Obtener moneda base con sistema de fallback robusto
    const { moneda: baseMoneda, tipo: tipoMonedaBase } = await obtenerMonedaBase(orgId);
    console.log('Moneda base determinada:', baseMoneda, '(tipo:', tipoMonedaBase, ')');
    
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
    
    // 2. Obtener tasas de cambio de la API
    console.log('Solicitando tasas para moneda base:', configData.base_currency);
    const tasas = await obtenerTasasDeCambio(configData.base_currency);
    
    // 3. Guardar las tasas en la base de datos para la fecha seleccionada o actual
    const fechaActual = fecha || new Date();
    console.log('Guardando tasas para fecha:', fechaActual.toISOString().split('T')[0]);
    
    // Importante: Pasar el código de moneda base (no el ID) para que se guarde correctamente
    const resultado = await guardarTasasDeCambio(
      orgId, 
      configData.base_currency_id,
      tasas.rates,
      tasas.timestamp,
      fechaActual,
      configData.base_currency // Pasar el código de moneda base como último parámetro
    );
    
    console.log('Tasas guardadas exitosamente. Tasas actualizadas:', resultado.updated_count);
    
    return {
      success: true,
      updated_count: resultado.updated_count,
      base_currency: configData.base_currency,
      base_currency_type: tipoMonedaBase,
      timestamp: tasas.timestamp
    };
  } catch (error: any) {
    console.error('Error al actualizar tasas de cambio:', error);
    throw new Error(`Error al actualizar tasas de cambio: ${error.message}`);
  }
}

/**
 * Actualiza las tasas de cambio para todas las organizaciones utilizando USD como base
 * Siempre consulta la API en tiempo real para obtener los datos más actualizados
 * @param fecha - Fecha para la que se quieren actualizar las tasas (opcional)
 * @returns Resultado de la operación con detalles de cada actualización
 */
export async function actualizarTasasDeCambioGlobal(fecha?: Date) {
  try {
    // 1. Obtener las tasas de cambio desde la API en tiempo real (siempre con USD como base)
    console.log('Solicitando tasas globales en tiempo real para moneda base: USD');
    const tasas = await obtenerTasasDeCambio('USD');
    
    // 2. Preparar los datos para guardar
    const fechaActual = fecha || new Date();
    console.log('Actualizando tasas globales para fecha:', fechaActual.toISOString().split('T')[0]);
    console.log('Timestamp de datos recibidos:', tasas.timestamp, '→', new Date(tasas.timestamp * 1000).toISOString());
    
    // 3. Llamar a la función RPC que actualiza para todas las organizaciones
    const { supabase } = await import('@/lib/supabase/config');
    const { data, error } = await supabase.rpc('update_global_exchange_rates', {
      rates: tasas.rates,
      source: 'openexchangerates',
      api_timestamp: tasas.timestamp,
      rate_date: fechaActual ? new Date(fechaActual.getTime() - (fechaActual.getTimezoneOffset() * 60000))
        .toISOString()
        .split('T')[0] : undefined
    });

    if (error) throw error;
    
    console.log('Tasas globales actualizadas exitosamente. Detalles:', data);
    
    return {
      success: true,
      message: 'Tasas de cambio globales actualizadas exitosamente en tiempo real',
      updated_count: data.updated_count,
      skipped_count: data.skipped_count,
      base_currency: data.base_currency,
      timestamp: tasas.timestamp,
      fecha_consulta: new Date(tasas.timestamp * 1000).toISOString()
    };
  } catch (error: any) {
    console.error('Error en actualización global de tasas en tiempo real:', error);
    return {
      success: false,
      message: `Error al actualizar tasas globalmente: ${error.message}`
    };
  }
}

/**
 * Obtiene la moneda base para una organización con sistema de fallback
 * Implementa un sistema de 4 niveles de fallback para garantizar que siempre se encuentre una moneda base:
 * 1. Moneda marcada con is_base=true
 * 2. Moneda predeterminada en preferencias de organización
 * 3. USD como fallback estándar
 * 4. Primera moneda disponible
 * 
 * @param orgId - ID de la organización
 * @returns Información de la moneda base y su tipo/origen
 */
export async function obtenerMonedaBase(orgId: number) {
  const { supabase } = await import('@/lib/supabase/config');
  
  // Nivel 1: Buscar moneda marcada con is_base=true
  let { data: baseMoneda } = await supabase
    .from('currencies')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_base', true)
    .single();

  let tipoMonedaBase = 'base';
    
  if (!baseMoneda) {
    // Nivel 2: Preferencia de organización
    const { data: orgPrefs } = await supabase
      .from('organization_preferences')
      .select('settings')
      .eq('organization_id', orgId)
      .single();
      
    if (orgPrefs?.settings?.finance?.default_currency) {
      baseMoneda = await supabase
        .from('currencies')
        .select('*')
        .eq('organization_id', orgId)
        .eq('code', orgPrefs.settings.finance.default_currency)
        .single()
        .then(res => res.data);
        
      tipoMonedaBase = 'preferencia';
    }
  }
    
  // Niveles 3 y 4: USD o primera disponible
  if (!baseMoneda) {
    // Nivel 3: Intentar USD como fallback
    baseMoneda = await supabase
      .from('currencies')
      .select('*')
      .eq('organization_id', orgId)
      .eq('code', 'USD')
      .single()
      .then(res => res.data);
      
    if (baseMoneda) {
      tipoMonedaBase = 'usd';
    } else {
      // Nivel 4: Primera moneda disponible
      baseMoneda = await supabase
        .from('currencies')
        .select('*')
        .eq('organization_id', orgId)
        .limit(1)
        .single()
        .then(res => res.data);
        
      tipoMonedaBase = 'primera';
    }
  }
    
  if (!baseMoneda) {
    throw new Error('No se encontró ninguna moneda para la organización');
  }
    
  return { moneda: baseMoneda, tipo: tipoMonedaBase };
}
