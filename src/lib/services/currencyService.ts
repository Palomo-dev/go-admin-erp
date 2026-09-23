import { supabase } from '@/lib/supabase/config';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { todayInTz } from '@/lib/utils/timezone';
import { resolveOrgCurrency, resetOrgCurrencyCache } from '@/lib/services/monedaOrganizacion';
import { formatMoneda } from '@/lib/utils/moneda';

// ============================================================
// Fase B, tanda 10. Ojo con la diferencia respecto a `openexchangerates.ts`:
// alli la tabla es `currency_rates`, el catalogo GLOBAL, cuyo dia es el del
// sistema (ADR-004). Aqui la tabla es `exchange_rates`, que SI lleva
// `organization_id` (verificado en `information_schema.columns`), asi que su
// `effective_date` —una columna `date`— es el dia calendario de esa
// organizacion. `exchange_rates` no lleva `branch_id`: la tasa es de la
// organizacion entera, no de una sucursal.
//
// La zona entra por identidad (ADR-003): `organizationId` ya estaba en las dos
// firmas, no se anade ningun `timezone?: string`.
// ============================================================

export interface ExchangeRate {
  id: number;
  organization_id: number;
  base_currency: string;
  target_currency: string;
  rate: number;
  is_default: boolean;
  source: string;
  effective_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * Clase para manejo de conversión de monedas y operaciones relacionadas
 */
class CurrencyService {
  private exchangeRatesCache: Map<string, ExchangeRate> = new Map();
  private cacheExpiration: Date = new Date();

  /**
   * Obtiene la moneda base para una organización.
   * Delegado en la fuente única `resolveOrgCurrency`
   * (`src/lib/services/monedaOrganizacion.ts`). Antes devolvía 'USD' siempre,
   * sin leer `organization_currencies`.
   * @param organizationId ID de la organización
   * @returns Código de moneda base (ISO 4217)
   */
  async getBaseCurrency(organizationId: number): Promise<string> {
    return (await resolveOrgCurrency(supabase, organizationId)).code;
  }

  /**
   * Obtiene la tasa de cambio más reciente para un par de monedas
   * @param organizationId ID de la organización
   * @param fromCurrency Moneda de origen
   * @param toCurrency Moneda de destino
   * @returns Tasa de cambio o null si no se encuentra
   */
  async getExchangeRate(
    organizationId: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    // Si es la misma moneda, la tasa es 1
    if (fromCurrency === toCurrency) {
      return 1;
    }

    // Buscar en caché primero
    const cacheKey = `${organizationId}:${fromCurrency}:${toCurrency}`;
    if (this.exchangeRatesCache.has(cacheKey) && new Date() < this.cacheExpiration) {
      return this.exchangeRatesCache.get(cacheKey)?.rate || null;
    }

    try {
      // Buscar la tasa de cambio más reciente
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('base_currency', fromCurrency)
        .eq('target_currency', toCurrency)
        .order('effective_date', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        // Intentar ruta inversa (convertir de B a A usando el inverso de A a B)
        return await this.getInverseExchangeRate(organizationId, fromCurrency, toCurrency);
      }

      // Guardar en caché
      this.exchangeRatesCache.set(cacheKey, data[0]);
      return data[0].rate;
    } catch (error) {
      console.error('Error al obtener tasa de cambio:', error);
      return null;
    }
  }

  /**
   * Intenta encontrar una tasa inversa cuando no existe la directa
   */
  private async getInverseExchangeRate(
    organizationId: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    try {
      // Buscar la tasa inversa
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('base_currency', toCurrency)
        .eq('target_currency', fromCurrency)
        .order('effective_date', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        // Intentar buscar una ruta de conversión a través de USD
        return await this.getIndirectExchangeRate(organizationId, fromCurrency, toCurrency);
      }

      // Invertir la tasa y guardar en caché
      const inverseRate = 1 / data[0].rate;
      const cacheKey = `${organizationId}:${fromCurrency}:${toCurrency}`;
      
      const exchangeRate: ExchangeRate = {
        ...data[0],
        base_currency: fromCurrency,
        target_currency: toCurrency,
        rate: inverseRate
      };
      
      this.exchangeRatesCache.set(cacheKey, exchangeRate);
      return inverseRate;
    } catch (error) {
      console.error('Error al obtener tasa de cambio inversa:', error);
      return null;
    }
  }

  /**
   * Busca una ruta indirecta de conversión (a través de USD u otra moneda común)
   */
  private async getIndirectExchangeRate(
    organizationId: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    try {
      // Intentar convertir a través de USD (moneda puente común)
      const intermediaryCurrency = 'USD';
      
      // No hacer conversión circular
      if (fromCurrency === intermediaryCurrency || toCurrency === intermediaryCurrency) {
        return null;
      }
      
      // Obtener tasas para fromCurrency -> USD y USD -> toCurrency
      const rateToUSD = await this.getExchangeRate(organizationId, fromCurrency, intermediaryCurrency);
      const rateFromUSD = await this.getExchangeRate(organizationId, intermediaryCurrency, toCurrency);
      
      if (!rateToUSD || !rateFromUSD) {
        return null;
      }
      
      // Calcular y guardar la tasa compuesta
      const compositeRate = rateToUSD * rateFromUSD;
      const cacheKey = `${organizationId}:${fromCurrency}:${toCurrency}`;
      
      const today = todayInTz(await resolveTimezone(organizationId));

      const exchangeRate: ExchangeRate = {
        id: -1, // ID temporal, no existe realmente en la base
        organization_id: organizationId,
        base_currency: fromCurrency,
        target_currency: toCurrency,
        rate: compositeRate,
        is_default: false,
        source: 'calculated',
        effective_date: today,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      this.exchangeRatesCache.set(cacheKey, exchangeRate);
      return compositeRate;
    } catch (error) {
      console.error('Error al obtener tasa de cambio indirecta:', error);
      return null;
    }
  }

  /**
   * Convierte un monto de una moneda a otra
   * @param amount Monto a convertir
   * @param fromCurrency Moneda origen
   * @param toCurrency Moneda destino
   * @param organizationId ID de la organización
   * @returns El monto convertido o el original si la conversión no es posible
   */
  async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    organizationId: number
  ): Promise<number> {
    // Si es la misma moneda, devolver el mismo monto
    if (fromCurrency === toCurrency) {
      return amount;
    }

    try {
      const rate = await this.getExchangeRate(organizationId, fromCurrency, toCurrency);
      if (rate === null) {
        console.warn(`No se encontró tasa de cambio para ${fromCurrency} a ${toCurrency}`);
        return amount; // Devolver el monto original si no hay conversión
      }
      
      return amount * rate;
    } catch (error) {
      console.error('Error al convertir monto:', error);
      return amount; // En caso de error, devolver el monto original
    }
  }

  /**
   * Actualiza o crea una tasa de cambio
   */
  async updateExchangeRate(
    organizationId: number,
    baseCurrency: string,
    targetCurrency: string,
    rate: number,
    source: string = 'manual',
    // Sin valor por defecto en la firma: el dia depende de la organizacion, y
    // un `default` no puede esperar a `resolveTimezone`. Se resuelve dentro.
    effectiveDate?: string
  ): Promise<boolean> {
    try {
      const fechaEfectiva =
        effectiveDate ?? todayInTz(await resolveTimezone(organizationId));

      // Buscar si existe la tasa para esta fecha
      const { data: existingRate } = await supabase
        .from('exchange_rates')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('base_currency', baseCurrency)
        .eq('target_currency', targetCurrency)
        .eq('effective_date', fechaEfectiva)
        .limit(1);

      if (existingRate && existingRate.length > 0) {
        // Actualizar la tasa existente
        const { error } = await supabase
          .from('exchange_rates')
          .update({
            rate,
            source,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRate[0].id);

        if (error) {
          throw error;
        }
      } else {
        // Crear una nueva tasa
        const { error } = await supabase.from('exchange_rates').insert({
          organization_id: organizationId,
          base_currency: baseCurrency,
          target_currency: targetCurrency,
          rate,
          source,
          effective_date: fechaEfectiva,
          is_default: false
        });

        if (error) {
          throw error;
        }
      }

      // Invalidar caché
      this.invalidateCache();
      
      return true;
    } catch (error) {
      console.error('Error al actualizar tasa de cambio:', error);
      return false;
    }
  }

  /**
   * Obtiene todas las monedas disponibles para una organización
   */
  async getAvailableCurrencies(organizationId: number): Promise<string[]> {
    try {
      // Obtener todas las monedas únicas de las tasas de cambio
      const { data: baseCurrencies, error: baseError } = await supabase
        .from('exchange_rates')
        .select('base_currency')
        .eq('organization_id', organizationId)
        .order('base_currency');

      const { data: targetCurrencies, error: targetError } = await supabase
        .from('exchange_rates')
        .select('target_currency')
        .eq('organization_id', organizationId)
        .order('target_currency');

      if (baseError || targetError) {
        console.error('Error al obtener monedas:', baseError || targetError);
        return ['USD', 'EUR', 'COP']; // Monedas por defecto
      }

      // Combinar y eliminar duplicados
      const currencies = new Set<string>();
      
      baseCurrencies?.forEach(item => currencies.add(item.base_currency));
      targetCurrencies?.forEach(item => currencies.add(item.target_currency));
      
      // Asegurarse de que USD y la moneda base estén incluidas
      currencies.add('USD');
      const baseCurrency = await this.getBaseCurrency(organizationId);
      currencies.add(baseCurrency);
      
      return Array.from(currencies).sort();
    } catch (error) {
      console.error('Error al obtener monedas disponibles:', error);
      return ['USD', 'EUR', 'COP']; // Monedas por defecto en caso de error
    }
  }

  /**
   * Invalida la caché de tasas de cambio
   */
  invalidateCache(): void {
    this.exchangeRatesCache.clear();
    resetOrgCurrencyCache();
    this.cacheExpiration = new Date(0); // Fecha en el pasado para forzar recarga
  }

  /**
   * Formatea un valor monetario según la moneda (dos decimales, es-CO).
   * Delegado en `formatMoneda` (`src/lib/utils/moneda.ts`).
   */
  formatCurrency(amount: number, currency: string = 'USD'): string {
    return formatMoneda(amount, currency, { decimals: 2 });
  }
}

// Exportar instancia única
export const currencyService = new CurrencyService();
