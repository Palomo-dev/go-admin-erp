'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRightLeft, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';

interface Currency {
  code: string;
  name: string;
  symbol?: string;
  decimals?: number;
  is_active?: boolean;
  auto_update?: boolean;
}

interface CurrencyRate {
  id?: string;
  code: string;
  rate: string | number;
  rate_date: string;
  base_currency_code?: string;
  api_data?: any;
}

interface RatesByDate {
  [date: string]: CurrencyRate[];
}

interface CurrencyConverterProps {
  rates?: any[];
  currencies?: Currency[];
  date?: Date;
  loadGlobalCurrencies?: boolean; // Si es true, carga las monedas globales directamente
}

// Declaración para TypeScript para permitir el almacenamiento temporal
declare global {
  interface Window {
    lastConversionRate?: number;
    lastRateDiff?: number;
    lastRateDiffDirection?: 'up' | 'down' | 'neutral';
  }
}

// Componente mejorado con mejor diseño empresarial y completamente responsive
export default function CurrencyConverter({ rates = [], currencies = [], date = new Date(), loadGlobalCurrencies = true }: CurrencyConverterProps) {
  const [fromCurrency, setFromCurrency] = useState<string>('USD');
  const [toCurrency, setToCurrency] = useState<string>('COP');
  const [amount, setAmount] = useState<number>(1000);
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [previousRate, setPreviousRate] = useState<number | null>(null);
  const [rateDiff, setRateDiff] = useState<number | null>(null);
  // Añadir un key único para forzar re-renderizado
  const [updateKey, setUpdateKey] = useState<number>(Date.now());
  const [localRates, setLocalRates] = useState<any[]>(rates);
  const [localCurrencies, setLocalCurrencies] = useState<Currency[]>(currencies);
  const [loading, setLoading] = useState<boolean>(loadGlobalCurrencies);

  // Cargar monedas y tasas cuando el componente se monta
  useEffect(() => {
    // Siempre cargar las monedas globales al inicializar el componente
    loadGlobalData();
    
    // Limpiar la variable global cuando el componente se desmonte
    return () => {
      delete window.lastConversionRate;
    };
  }, []);  // Se eliminó la dependencia loadGlobalCurrencies para forzar la carga de monedas globales

  // Cargar datos globales de monedas y tasas
  const loadGlobalData = async () => {
    try {
      setLoading(true);
      const { supabase } = await import('@/lib/supabase/config');
      
      // Cargar todas las monedas activas del catálogo global, sin filtrar por organización
      const { data: globalCurrencies, error: currencyError } = await supabase
        .from('currencies')
        .select('code, name, symbol, decimals, auto_update')
        .eq('is_active', true)
        .order('code');

      if (currencyError) throw currencyError;
      
      console.log('Monedas globales cargadas:', globalCurrencies?.length || 0);
      
      // Cargar tasas actuales usando la fecha proporcionada o la fecha actual
      const formattedDate = date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      console.log('Cargando tasas para la fecha:', formattedDate);
      
      const { data: currentRates, error: ratesError } = await supabase
        .from('currency_rates')
        .select('*')
        .eq('rate_date', formattedDate);

      if (ratesError) throw ratesError;
      
      // Si no hay tasas para la fecha seleccionada, intentar con la fecha más reciente
      if (!currentRates || currentRates.length === 0) {
        console.log('No hay tasas para la fecha seleccionada, buscando la fecha más reciente');
        const { data: latestDate } = await supabase
          .from('currency_rates')
          .select('rate_date')
          .order('rate_date', { ascending: false })
          .limit(1);
        
        if (latestDate && latestDate.length > 0) {
          const mostRecentDate = latestDate[0].rate_date;
          console.log('Fecha más reciente encontrada:', mostRecentDate);
          
          const { data: fallbackRates } = await supabase
            .from('currency_rates')
            .select('*')
            .eq('rate_date', mostRecentDate);
          
          if (fallbackRates && fallbackRates.length > 0) {
            console.log(`Usando tasas de ${mostRecentDate} como alternativa`);
            setLocalRates(fallbackRates);
          }
        }
      } else {
        console.log(`Encontradas ${currentRates.length} tasas para la fecha ${formattedDate}`);
        setLocalRates(currentRates);
      }
      
      // Actualizar estados locales
      if (globalCurrencies?.length) {
        setLocalCurrencies(globalCurrencies);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar datos globales:', error);
      setLoading(false);
    }
  };

  // Efecto para sincronizar el valor de window.lastRateDiff cuando cambia rateDiff
  useEffect(() => {
    if (rateDiff !== null) {
      console.log('Actualizando window.lastRateDiff:', rateDiff);
      
      // Almacenar en el objeto global window para acceso desde cualquier componente
      window.lastRateDiff = rateDiff;
      
      // Almacenar también la información sobre la dirección (subida/bajada)
      window.lastRateDiffDirection = rateDiff > 0 ? 'up' : (rateDiff < 0 ? 'down' : 'neutral');
      
      // Emitir un evento para que otros componentes puedan reaccionar
      const event = new CustomEvent('ratediffchange', { 
        detail: { 
          value: rateDiff,
          direction: window.lastRateDiffDirection,
          formattedValue: `${rateDiff > 0 ? '+' : ''}${rateDiff.toFixed(4)}%`,
          timestamp: new Date().getTime()
        } 
      });
      window.dispatchEvent(event);
      
      // Guardar en localStorage para persistencia entre recargas de página
      try {
        localStorage.setItem('lastRateDiff', JSON.stringify({
          value: rateDiff,
          direction: window.lastRateDiffDirection,
          timestamp: new Date().getTime()
        }));
      } catch (e) {
        console.error('Error al guardar rateDiff en localStorage:', e);
      }
    }
  }, [rateDiff]);

  // Convertir el monto cuando cambia alguno de los parámetros
  useEffect(() => {
    if (localRates.length > 0) {
      convertAmount();
    }
  }, [fromCurrency, toCurrency, amount, localRates]);
  
  // Efecto separado para cargar la tasa del día anterior
  useEffect(() => {
    const loadPreviousRateData = async () => {
      if (localRates.length > 0 && fromCurrency && toCurrency) {
        // Cargar tasa del día anterior
        const loadYesterdayRate = async () => {
          // Restaurar estado antes de cargar nuevas tasas
          setPreviousRate(null);
          setRateDiff(null);
          // Incrementar el updateKey para forzar re-renderizado
          setUpdateKey(Date.now());
          
          // Asegurar que yesterday sea realmente el día anterior
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          
          console.log('Cargando tasas de ayer:', yesterday.toISOString().split('T')[0], 
                     'para comparar con fecha actual:', today.toISOString().split('T')[0]);
          
          await loadPreviousRate(yesterday);
        };
        
        loadYesterdayRate();
      }
    };
    
    loadPreviousRateData();
  }, [fromCurrency, toCurrency, localRates, date]);

  // Cargar la tasa del día anterior para comparación
  const loadPreviousRate = async (previousDate: Date) => {
    try {
      console.log('Cargando tasas del día anterior para', fromCurrency, 'a', toCurrency);
      const { supabase } = await import('@/lib/supabase/config');
      
      // Obtener la fecha actual y la del día anterior
      const today = new Date(previousDate);
      const todayFormatted = today.toISOString().split('T')[0];
      
      // Resetear los valores previos antes de cargar nuevos
      setRateDiff(null);
      setPreviousRate(null);
      
      // Obtener las tasas actuales para referencia
      const fromRateObj = localRates.find(r => r.code === fromCurrency);
      const toRateObj = localRates.find(r => r.code === toCurrency);
      
      if (!fromRateObj || !toRateObj) {
        console.log('No se encontraron tasas actuales para', fromCurrency, 'o', toCurrency);
        return;
      }
      
      const currentFromRate = Number(fromRateObj.rate);
      const currentToRate = Number(toRateObj.rate);
      
      // Verificar que tengamos tasas actuales válidas
      if (isNaN(currentFromRate) || isNaN(currentToRate) || currentFromRate <= 0 || currentToRate <= 0) {
        console.log('Tasas actuales no válidas:', currentFromRate, currentToRate);
        return;
      }
      
      // Mostrar información de tasas actuales para debugging
      console.log('Tasas actuales:', { 
        from: `${fromCurrency}: ${currentFromRate}`, 
        to: `${toCurrency}: ${currentToRate}` 
      });
      
      // Calcular tasa de conversión actual
      const currentRate = currentToRate / currentFromRate;
      
      // Buscar tasas ANTERIORES a la fecha actual
      console.log('BUSCANDO TASAS PARA FECHA ANTERIOR A:', todayFormatted);
      
      // Consultar todas las tasas anteriores a la fecha actual
      const { data, error } = await supabase
        .from('currency_rates')
        .select('code, rate, base_currency_code, rate_date')
        .lt('rate_date', todayFormatted) // IMPORTANTE: Menor que la fecha actual
        .order('rate_date', { ascending: false }) // Ordenadas por fecha descendente
        .in('code', [fromCurrency, toCurrency]) // Solo las monedas que nos interesan
        .limit(20); // Suficientes para encontrar fechas coincidentes
      
      if (error) {
        console.error('Error al consultar tasas anteriores:', error);
        return;
      }
      
      console.log('Tasas ANTERIORES encontradas:', data?.length || 0, 'registros', data);
      
      // Si no hay datos, terminamos
      if (!data || data.length === 0) {
        console.log('No hay tasas anteriores para comparar');
        return;
      }
      
      // Agrupar por fecha para asegurarnos de comparar tasas del mismo día
      const ratesByDate: { [key: string]: CurrencyRate[] } = {};
      
      data.forEach(rate => {
        // Usar solo la fecha sin la hora
        const dateKey = rate.rate_date.split('T')[0];
        if (!ratesByDate[dateKey]) {
          ratesByDate[dateKey] = [];
        }
        ratesByDate[dateKey].push(rate);
      });
      
      console.log('Tasas agrupadas por fecha:', Object.keys(ratesByDate));
      
      // Buscar la fecha anterior más reciente que tenga ambas monedas
      for (const dateKey of Object.keys(ratesByDate).sort().reverse()) {
        const ratesForDate = ratesByDate[dateKey];
        const prevFromRateObj = ratesForDate.find(r => r.code === fromCurrency);
        const prevToRateObj = ratesForDate.find(r => r.code === toCurrency);
        
        // Verificar que tengamos ambas monedas para esta fecha
        if (prevFromRateObj && prevToRateObj) {
          console.log(`*** COMPARANDO - Actual (${todayFormatted}) con Anterior (${dateKey}) ***`);
          
          const prevFromRate = Number(prevFromRateObj.rate);
          const prevToRate = Number(prevToRateObj.rate);
          
          if (isNaN(prevFromRate) || isNaN(prevToRate) || prevFromRate <= 0 || prevToRate <= 0) {
            console.log('Tasas anteriores inválidas:', prevFromRate, prevToRate);
            continue; // Intentar con la siguiente fecha
          }
          
          // Calcular tasa anterior y guardarla
          const prevRate = prevToRate / prevFromRate;
          setPreviousRate(prevRate);
          
          // Calcular porcentaje de cambio
          const diff = ((currentRate - prevRate) / prevRate) * 100;
          const roundedDiff = parseFloat(diff.toFixed(4));
          
          console.log('Cambio porcentual calculado:', roundedDiff.toFixed(4) + '%');
          console.log('Actual:', currentRate.toFixed(6), `(${currentToRate}/${currentFromRate})`);
          console.log('Anterior:', prevRate.toFixed(6), `(${prevToRate}/${prevFromRate})`);
          
          // Actualizar estado con el valor calculado
          setRateDiff(roundedDiff);
          setUpdateKey(Date.now());
          
          console.log('Estado actualizado: rateDiff =', roundedDiff.toFixed(4) + '%');
          console.log('Cambio detectado entre', dateKey, 'y', todayFormatted + ':', 
            fromCurrency, '/', toCurrency, 
            prevRate.toFixed(6), '->', currentRate.toFixed(6));
          
          // Establecer dirección para el estilo visual
          window.lastRateDiffDirection = roundedDiff > 0 ? 'up' : (roundedDiff < 0 ? 'down' : 'neutral');
          
          // Salir del ciclo una vez encontrada una fecha válida
          return;
        }
      }
      
      console.log('No se encontró ninguna fecha anterior con ambas monedas');
    } catch (error) {
      console.error('Error al cargar tasa anterior:', error);
    }
  };

  const convertAmount = useCallback(() => {
    if (!fromCurrency || !toCurrency || !amount) {
      setConvertedAmount(null);
      return;
    }

    const fromRateObj = localRates.find(r => r.code === fromCurrency);
    const toRateObj = localRates.find(r => r.code === toCurrency);

    if (!fromRateObj || !toRateObj) {
      console.log('No se encontraron tasas para las monedas seleccionadas');
      setConvertedAmount(null);
      return;
    }

    const fromRateValue = Number(fromRateObj.rate);
    const toRateValue = Number(toRateObj.rate);

    if (isNaN(fromRateValue) || isNaN(toRateValue) || fromRateValue <= 0 || toRateValue <= 0) {
      console.log('Tasas no válidas:', fromRateValue, toRateValue);
      setConvertedAmount(null);
      return;
    }

    const conversionRate = toRateValue / fromRateValue;
    const result = amount * conversionRate;
    setConvertedAmount(result);
    
    // Guardar la tasa actual para comparación
    window.lastConversionRate = conversionRate;
    
    console.log(`Conversión: ${amount} ${fromCurrency} = ${result.toFixed(2)} ${toCurrency}`);
    console.log(`Tasa de conversión: ${conversionRate.toFixed(6)} (${toRateValue}/${fromRateValue})`);
  }, [fromCurrency, toCurrency, amount, localRates]);

  // Añadir un evento para actualizar cuando cambia el monto o las monedas
  useEffect(() => {
    if (localCurrencies.length > 0 && localRates.length > 0) {
      convertAmount();
    }
  }, [amount, fromCurrency, toCurrency, localRates, convertAmount]);

  // Intercambiar monedas
  const swapCurrencies = () => {
    const tempFrom = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(tempFrom);
    // Forzar re-renderizado cuando se intercambien monedas
    setUpdateKey(Date.now());
  };

  // Función para obtener el símbolo de moneda con fallback mejorado
  const getCurrencySymbol = (code: string) => {
    const currency = localCurrencies.find(c => c.code === code);
    return currency?.symbol || '$';
  };
  
  // Función para obtener el nombre completo de la moneda
  const getCurrencyName = (code: string) => {
    const currency = localCurrencies.find(c => c.code === code);
    return currency?.name || code;
  };

  return (
    <Card className="shadow-md border-t-4 border-t-primary">
      <CardHeader className="bg-gray-50">
        <CardTitle className="flex items-center text-primary">
          <ArrowRightLeft className="mr-2 h-5 w-5" />
          Conversor de Monedas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <div className="flex justify-center items-center p-6">
            <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent"></div>
            <span className="ml-2 text-gray-600">Cargando monedas...</span>
          </div>
        ) : (
              <div className="grid grid-cols-1 gap-6">
                {/* Sección superior con etiquetas descriptivas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-500">
                  <div className="text-center md:text-left">Monto</div>
                  <div className="text-center">Monedas</div>
                  <div className="text-center md:text-right">Resultado</div>
                </div>
                
                {/* Sección principal del conversor */}
                <div className="grid grid-cols-1 gap-4 max-w-full overflow-hidden">
                  {/* Primera fila: Input de monto en móviles */}
                  <div className="md:hidden grid grid-cols-1 gap-3">
                    <div className="flex items-center w-full">
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                        className="text-right font-medium text-base border-gray-300 hover:border-gray-400 focus:border-primary w-full"
                        placeholder="Ingrese un monto"
                        min="0"
                        step="100"
                        aria-label="Monto a convertir"
                      />
                    </div>
                  
                    {/* Selectores de moneda en móviles */}
                    <div className="flex flex-row items-center justify-between space-x-2 w-full">
                      <div className="w-[42%] flex-shrink-0">
                        <Select value={fromCurrency} onValueChange={setFromCurrency}>
                          <SelectTrigger className="w-full text-xs px-2">
                            <SelectValue placeholder="Moneda" />
                          </SelectTrigger>
                          <SelectContent>
                            {localCurrencies.map((currency, index) => (
                              <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                                <div className="flex items-center">
                                  <span className="mr-1">{currency.symbol}</span>
                                  <span>{currency.code}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={swapCurrencies} 
                        className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors h-8 w-8 flex-shrink-0"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                      </Button>
                      
                      <div className="w-[42%] flex-shrink-0">
                        <Select value={toCurrency} onValueChange={setToCurrency}>
                          <SelectTrigger className="w-full text-xs px-2">
                            <SelectValue placeholder="Moneda" />
                          </SelectTrigger>
                          <SelectContent>
                            {localCurrencies.map((currency, index) => (
                              <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                                <div className="flex items-center">
                                  <span className="mr-1">{currency.symbol}</span>
                                  <span>{currency.code}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Resultado en móviles */}
                    <div className="flex flex-col items-center w-full">
                      {convertedAmount !== null ? (
                        <div className="text-lg font-bold text-center break-words w-full">
                          {getCurrencySymbol(toCurrency)}{' '}
                          {convertedAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </div>
                      ) : (
                        <div className="text-lg font-bold text-gray-400 text-center">---</div>
                      )}
                      
                      {/* Nombre de moneda en móviles */}
                      <div className="text-xs text-gray-500 mt-1 text-center w-full">
                        {getCurrencyName(toCurrency)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Diseño para pantallas medianas y grandes */}
                  <div className="hidden md:grid md:grid-cols-3 md:gap-4 md:w-full">
                    {/* Columna 1: Input de monto */}
                    <div className="flex items-center w-full">
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                        className="text-right font-medium text-base border-gray-300 hover:border-gray-400 focus:border-primary w-[95%] h-8"
                        placeholder="Ingrese un monto"
                        min="0"
                        step="100"
                        aria-label="Monto a convertir"
                      />
                    </div>
                    
                    {/* Columna 2: Selectores de moneda con botón de intercambio */}
                    <div className="flex flex-row items-center justify-center space-x-1 w-full">
                      <div className="w-auto">
                        <Select value={fromCurrency} onValueChange={setFromCurrency}>
                          <SelectTrigger className="w-[90px] text-xs px-2 h-8">
                            <SelectValue placeholder="Moneda" />
                          </SelectTrigger>
                          <SelectContent>
                            {localCurrencies.map((currency, index) => (
                              <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                                <div className="flex items-center text-xs">
                                  <span className="mr-1">{currency.symbol}</span>
                                  <span>{currency.code}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={swapCurrencies} 
                        className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors h-7 w-7 flex-shrink-0 mx-1"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                      </Button>
                      
                      <div className="w-auto">
                        <Select value={toCurrency} onValueChange={setToCurrency}>
                          <SelectTrigger className="w-[90px] text-xs px-2 h-8">
                            <SelectValue placeholder="Moneda" />
                          </SelectTrigger>
                          <SelectContent>
                            {localCurrencies.map((currency, index) => (
                              <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                                <div className="flex items-center text-xs">
                                  <span className="mr-1">{currency.symbol}</span>
                                  <span>{currency.code}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Columna 3: Resultado de la conversión */}
                    <div className="flex flex-col items-end w-full">
                      {convertedAmount !== null ? (
                        <div className="text-2xl font-bold text-right break-words w-full">
                          {getCurrencySymbol(toCurrency)}{' '}
                          {convertedAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </div>
                      ) : (
                        <div className="text-2xl font-bold text-gray-400 text-right">---</div>
                      )}
                      
                      {/* Mostrar nombre completo de la moneda de destino */}
                      <div className="text-sm text-gray-500 mt-1 text-right w-full">
                        {getCurrencyName(toCurrency)}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Sección inferior con información adicional */}
                <div className="border-t pt-4 mt-2">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    {/* Información sobre la tasa de cambio actual */}
                    <div className="text-sm text-gray-600">
                      1 {fromCurrency} = {(convertedAmount !== null && amount > 0) ? (convertedAmount / amount).toFixed(6) : '0.00'} {toCurrency}
                    </div>
                    
                    {/* Badge que muestra la diferencia porcentual */}
                    <div className="flex items-center justify-center" key={`badge-container-${updateKey}`}>
                      {rateDiff !== null && (
                        <div className="mt-4 flex items-center justify-center">
                          <Badge
                            id="rate-diff-badge"
                            data-rate-diff={rateDiff.toFixed(4)}
                            data-direction={rateDiff > 0 ? 'up' : (rateDiff < 0 ? 'down' : 'neutral')}
                            data-from-currency={fromCurrency}
                            data-to-currency={toCurrency}
                            data-timestamp={new Date().getTime()}
                            variant="outline"
                            className={cn(
                              "py-1 px-2 text-xs font-semibold",
                              rateDiff > 0 ? "bg-green-50 text-green-700 border-green-200" :
                              rateDiff < 0 ? "bg-red-50 text-red-700 border-red-200" :
                              "bg-gray-50 text-gray-700 border-gray-200"
                            )}
                          >
                            <div className="flex items-center">
                              <span className="mr-1 whitespace-nowrap">% respecto a ayer:</span>
                              <div className="flex items-center">
                                {rateDiff > 0 ? (
                                  <TrendingUp className="mr-1 h-3 w-3 text-green-600" />
                                ) : rateDiff < 0 ? (
                                  <TrendingDown className="mr-1 h-3 w-3 text-red-600" />
                                ) : (
                                  <Minus className="mr-1 h-3 w-3 text-gray-600" />
                                )}
                                <span className="font-mono">
                                  {rateDiff > 0 ? "+" : ""}{rateDiff.toFixed(4)}%
                                </span>
                              </div>
                            </div>
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {/* Fecha de la tasa de cambio */}
                    <div className="text-xs text-gray-500">
                      Última actualización: {format(date, 'dd/MM/yyyy', { locale: es })}
                    </div>
                  </div>
                </div>
              </div>
            )}
      </CardContent>
      {/* Footer con información de la fuente de datos */}
      <div className="border-t border-gray-100 p-4 flex justify-between items-center text-xs text-gray-500">
        <div>Fuente: OpenExchangeRates API</div>
        <Button variant="ghost" size="sm" onClick={() => loadGlobalData()} className="h-8">
          <svg className="mr-1 h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
          Actualizar
        </Button>
      </div>
    </Card>
  );
}
