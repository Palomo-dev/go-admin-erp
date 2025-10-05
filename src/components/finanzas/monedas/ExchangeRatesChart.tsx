'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface Currency {
  code: string;
  name: string;
  symbol?: string;
  decimals?: number;
  is_active?: boolean;
  is_base?: boolean;
  auto_update?: boolean;
}

interface RateHistoryItem {
  rate_date: string;
  rate: number;
  base_currency_code?: string;
  formatted_date?: string;
}

interface LogEntry {
  id: string;
  execution_date: string;
  success: boolean;
  error_message: string | null;
  organizations_total: number;
  organizations_success: number;
  organizations_error: number;
  details: any;
  created_at: string;
}

interface ExchangeRatesChartProps {
  organizationId: number;
}

const ExchangeRatesChart = ({ organizationId }: ExchangeRatesChartProps) => {
  // Estados del componente
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [rateHistory, setRateHistory] = useState<RateHistoryItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [updatingRates, setUpdatingRates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Cargar monedas al iniciar
  useEffect(() => {
    // Inicializar componente y cargar datos
    const initComponent = async () => {
      try {
        setError(null);
        console.log('Inicializando componente ExchangeRatesChart');
        await loadCurrencies();
        await loadLogs();
      } catch (err) {
        console.error('Error al inicializar el componente:', err);
        setError('Error al inicializar el componente de tasas de cambio');
      }
    };
    
    initComponent();
  }, [organizationId]); // Añadido organizationId como dependencia

  // Cargar historial de tasas cuando se selecciona una moneda
  useEffect(() => {
    if (selectedCurrency) {
      loadRateHistory(selectedCurrency);
    }
  }, [selectedCurrency]);

  // Función para cargar monedas con estructura normalizada
  async function loadCurrencies() {
    try {
      setLoading(true);
      console.log('Cargando monedas disponibles para la organización...');
      
      // 1. Cargar monedas asociadas a la organización usando organization_currencies
      const { data: orgCurrencyRel, error: orgRelError } = await supabase
        .from('organization_currencies')
        .select('currency_code, is_base, auto_update')
        .eq('organization_id', organizationId);

      if (orgRelError) {
        console.error('Error al consultar organization_currencies:', orgRelError);
        throw orgRelError;
      }
      
      console.log(`Relaciones de moneda encontradas: ${orgCurrencyRel?.length || 0}`);
      
      if (!orgCurrencyRel || orgCurrencyRel.length === 0) {
        console.warn('No se encontraron monedas asociadas a esta organización');
      }
      
      // 2. Obtener los códigos de moneda para la organización
      const currencyCodes = orgCurrencyRel?.map(rel => rel.currency_code) || [];
      console.log('Códigos de moneda para la organización:', currencyCodes);
      
      // 3. Cargar información completa de las monedas
      let currenciesData: Currency[] = [];
      
      if (currencyCodes.length > 0) {
        // Cargar las monedas específicas de la organización desde el catálogo global
        const { data: currenciesDetails, error: currenciesError } = await supabase
          .from('currencies')
          .select('code, name, symbol, decimals, is_active')
          .in('code', currencyCodes);
          
        if (currenciesError) {
          console.error('Error al cargar detalles de monedas:', currenciesError);
          throw currenciesError;
        }
        
        // Combinar detalles con información de is_base/auto_update
        currenciesData = (currenciesDetails || []).map(currency => {
          const orgRelation = orgCurrencyRel.find(rel => rel.currency_code === currency.code);
          return {
            ...currency,
            is_base: orgRelation?.is_base || false,
            auto_update: orgRelation?.auto_update || false
          };
        });
      }
      
      // Si no hay monedas para la organización, cargar todas las monedas activas como fallback
      if (currenciesData.length === 0) {
        console.log('Cargando catálogo global de monedas como fallback...');
        const { data: allCurrencies, error: allError } = await supabase
          .from('currencies')
          .select('code, name, symbol, decimals, is_active')
          .eq('is_active', true)
          .order('code');
          
        if (allError) {
          console.error('Error al cargar catálogo global de monedas:', allError);
          throw allError;
        }
        
        currenciesData = allCurrencies || [];
      }
      
      console.log(`Monedas cargadas: ${currenciesData.length}`, currenciesData);
      setCurrencies(currenciesData);
      
      // 4. Implementación del sistema de fallback para seleccionar moneda
      // Verificar si tenemos tasas disponibles para estas monedas
      const today = format(new Date(), 'yyyy-MM-dd');
      console.log('Fecha para verificar tasas:', today);
      
      const { data: tasasHoy, error: errorTasas } = await supabase
        .from('currency_rates')
        .select('code')
        .eq('rate_date', today)
        .order('code');
        
      if (!errorTasas && tasasHoy && tasasHoy.length > 0) {
        const codigosTasas = tasasHoy.map(t => t.code);
        console.log('Monedas con tasas disponibles hoy:', codigosTasas);
        
        // Preferir monedas que tengan tasas disponibles
        if (codigosTasas.includes('USD')) {
          setSelectedCurrency('USD');
          console.log('Seleccionando USD como moneda predeterminada (tiene tasas).');
          return;
        } else if (codigosTasas.length > 0) {
          setSelectedCurrency(codigosTasas[0]);
          console.log(`Seleccionando ${codigosTasas[0]} como moneda predeterminada (tiene tasas).`);
          return;
        }
      }
      
      // 5. Sistema de fallback de 4 niveles cuando no hay tasas o hay error
      // Nivel 1: Moneda marcada como base en organization_currencies
      const monedaBase = currenciesData.find(m => m.is_base);
      if (monedaBase) {
        console.log('Nivel 1: Seleccionando moneda base de la organización:', monedaBase.code);
        setSelectedCurrency(monedaBase.code);
        return;
      }
      
      // Nivel 2: Buscar preferencia de la organización
      try {
        const { data: orgPrefs } = await supabase
          .from('organization_preferences')
          .select('settings')
          .eq('organization_id', organizationId)
          .single();
          
        const defaultCurrency = orgPrefs?.settings?.finance?.default_currency;
        if (defaultCurrency && currenciesData.some(c => c.code === defaultCurrency)) {
          console.log('Nivel 2: Seleccionando moneda de preferencias de organización:', defaultCurrency);
          setSelectedCurrency(defaultCurrency);
          return;
        }
      } catch (prefError) {
        console.warn('No se encontraron preferencias para la organización');
      }
      
      // Nivel 3: Usar USD como fallback si está disponible
      if (currenciesData.some(c => c.code === 'USD')) {
        console.log('Nivel 3: Seleccionando USD como fallback');
        setSelectedCurrency('USD');
        return;
      }
      
      // Nivel 4: Usar primera moneda disponible
      if (currenciesData.length > 0) {
        console.log('Nivel 4: Seleccionando primera moneda disponible:', currenciesData[0].code);
        setSelectedCurrency(currenciesData[0].code);
      } else {
        console.warn('No se encontraron monedas disponibles');
        setError('No se encontraron monedas disponibles para la organización');
      }
    } catch (err: any) {
      console.error('Error al cargar monedas:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las monedas: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Función para cargar historial de tasas de una moneda (adaptada a estructura normalizada)
  async function loadRateHistory(currencyCode: string) {
    try {
      if (!currencyCode) {
        console.error('loadRateHistory llamado sin código de moneda');
        return;
      }
      
      setLoadingHistory(true);
      setRateHistory([]);
      
      // Calcular fecha de hace 30 días
      const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');
      
      console.log(`Cargando historial para ${currencyCode} desde ${startDate} hasta ${endDate}`);
      
      // 1. Verificar si la moneda existe en el catálogo global
      const { data: currencyExists, error: currencyError } = await supabase
        .from('currencies')
        .select('code')
        .eq('code', currencyCode)
        .single();
        
      if (currencyError && currencyError.code !== 'PGRST116') { // PGRST116 = no se encontró
        console.error(`Error al verificar si existe la moneda ${currencyCode}:`, currencyError);
      }
      
      // 2. Verificar si la moneda está asociada a la organización
      const { data: orgCurrency, error: orgCurrencyError } = await supabase
        .from('organization_currencies')
        .select('currency_code, is_base')
        .eq('organization_id', organizationId)
        .eq('currency_code', currencyCode)
        .single();
        
      const existeEnCatalogo = Boolean(currencyExists);
      const esMonedaDeOrganizacion = Boolean(orgCurrency);
      const esMonedaBase = orgCurrency?.is_base || false;
      
      console.log(`Moneda ${currencyCode} - Existe en catálogo: ${existeEnCatalogo}, ` +
        `Asignada a organización: ${esMonedaDeOrganizacion}, ` + 
        `Es moneda base: ${esMonedaBase}`);
      
      // 3. Consultar historial de tasas
      const { data, error } = await supabase
        .from('currency_rates')
        .select('rate_date, rate, base_currency_code')
        .eq('code', currencyCode)
        .gte('rate_date', startDate)
        .lte('rate_date', endDate)
        .order('rate_date', { ascending: true });

      if (error) {
        console.error(`Error al cargar historial para ${currencyCode}:`, error);
        throw error;
      }
      
      console.log(`Datos históricos obtenidos para ${currencyCode}:`, data?.length || 0, 'registros');
      
      // 4. Verificar si todos los datos tienen base_currency_code para debugging
      if (data && data.length > 0) {
        const sinBaseCurrency = data.filter(item => !item.base_currency_code).length;
        if (sinBaseCurrency > 0) {
          console.warn(`${sinBaseCurrency}/${data.length} registros sin base_currency_code`);
        } else {
          console.log('Todos los registros tienen base_currency_code correctamente definido');
        }
        
        // Verificar si hay diferentes base_currency_code
        const baseCurrencyCodes = Array.from(new Set<string>(data.map(item => item.base_currency_code || '')));
        console.log('Base currency codes encontrados:', baseCurrencyCodes.join(', '));
      }
      
      // 5. Si no hay datos, intentar consultar sin restricción de fecha para debugging
      if (!data || data.length === 0) {
        const { data: allData, error: allError } = await supabase
          .from('currency_rates')
          .select('rate_date, rate, base_currency_code')
          .eq('code', currencyCode)
          .limit(5);
          
        console.log(`Verificando si existen ALGUNOS datos para ${currencyCode}:`, 
          allData?.length || 0, 'registros', 
          allError ? `Error: ${allError.message}` : 'Sin error');
          
        // Consultar todas las monedas disponibles en la tabla currency_rates
        const { data: availableCurrencies, error: availableError } = await supabase
          .from('currency_rates')
          .select('code, base_currency_code')
          .eq('rate_date', format(new Date(), 'yyyy-MM-dd'))
          .order('code');
          
        console.log('Monedas disponibles hoy en currency_rates:', 
          availableCurrencies?.map(c => `${c.code} (base: ${c.base_currency_code || 'N/A'})`).join(', ') || 'Ninguna', 
          availableError ? `Error: ${availableError.message}` : 'Sin error');
      }
      
      // 6. Formatear datos para el gráfico
      const formattedData = (data || []).map(item => ({
        ...item,
        formatted_date: format(new Date(item.rate_date), 'dd/MM/yy'),
        rate: parseFloat(item.rate), // Asegurar que sea un número para el gráfico
      }));
      
      console.log('Datos formateados para gráfico:', formattedData.length, 'registros');
      if (formattedData.length > 0) {
        console.log('Muestra de datos:', formattedData[0]);
      }
      
      setRateHistory(formattedData);
    } catch (err: any) {
      console.error('Error al cargar historial de tasas:', err);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el historial de tasas: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingHistory(false);
    }
  }

  // Función para cargar logs de actualización
  async function loadLogs() {
    try {
      const { data, error } = await supabase
        .from('exchange_rates_logs')
        .select('*')
        .order('execution_date', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      setLogs(data || []);
    } catch (err: any) {
      console.error('Error al cargar logs:', err);
    }
  }

  // Función para formatear detalles de logs
  function formatLogDetails(details: unknown): string {
    if (!details) return 'Sin detalles';
    
    try {
      // Convertir string a objeto si es necesario
      let parsedDetails: { organizations?: Array<any> } = {};
      
      if (typeof details === 'string') {
        parsedDetails = JSON.parse(details);
      } else if (typeof details === 'object') {
        parsedDetails = details as { organizations?: Array<any> };
      }
      
      // Extraer información relevante
      const orgs = parsedDetails.organizations || [];
      return `${orgs.length} organizaciones procesadas`;
    } catch (error) {
      return 'Formato de detalles no válido';
    }
  }

  // Función para actualizar manualmente las tasas de cambio
  async function actualizarTasas() {
    try {
      setUpdatingRates(true);
      toast({
        title: "Actualizando tasas",
        description: "Obteniendo las tasas más recientes..."
      });
      
      // Importar el servicio de tasas de cambio
      const { actualizarTasasDeCambioGlobal } = await import('@/lib/services/openexchangerates');
      
      // Llamar al servicio para actualizar tasas
      const resultado = await actualizarTasasDeCambioGlobal();
      
      if (resultado.success) {
        toast({
          title: "Tasas actualizadas",
          description: `Se actualizaron ${resultado.updated_count} tasas de cambio correctamente.`,
          variant: "default"
        });
        
        // Recargar datos
        loadCurrencies();
        if (selectedCurrency) {
          loadRateHistory(selectedCurrency);
        }
        loadLogs();
      } else {
        throw new Error(resultado.message || "Error desconocido");
      }
    } catch (err: any) {
      console.error("Error al actualizar tasas:", err);
      toast({
        title: "Error",
        description: `No se pudieron actualizar las tasas: ${err.message}`,
        variant: "destructive"
      });
    } finally {
      setUpdatingRates(false);
    }
  }
  
  // Personalizar tema del gráfico según modo claro/oscuro
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Detectar tema y configurar listener para cambios
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Función para detectar el tema actual
    const checkDarkMode = () => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(isDark);
    };
    
    // Detectar tema inicial
    checkDarkMode();
    
    // Configurar listener para cambios de tema
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', checkDarkMode);
    
    // Limpiar listener al desmontar
    return () => mediaQuery.removeEventListener('change', checkDarkMode);
  }, []);

  const chartTheme = {
    gridColor: isDarkMode ? '#333' : '#e0e0e0',
    textColor: isDarkMode ? '#aaa' : '#666',
    lineColor: isDarkMode ? '#3b82f6' : '#2563eb',
    tooltipBg: isDarkMode ? '#1f2937' : '#fff',
    tooltipBorder: isDarkMode ? '#374151' : '#e5e7eb',
    tooltipText: isDarkMode ? '#f3f4f6' : '#111827',
  };

  // Componente para mostrar estado de error
  const ErrorState = ({ message }: { message: string | null }) => {
    if (!message) return null;
    
    return (
      <div className="p-6 flex flex-col items-center justify-center space-y-4 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md border border-red-200 dark:border-red-800">
          <div className="flex items-center justify-center mb-2">
            <AlertTriangle className="text-red-500 dark:text-red-400 h-5 w-5 mr-2" />
            <h3 className="text-red-600 dark:text-red-400 font-medium">Error en el componente</h3>
          </div>
          <p className="text-sm text-red-500 dark:text-red-300">{message}</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="inline-flex items-center px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Recargar página
        </button>
      </div>
    );
  };

  // Si hay un error conocido, mostrar el estado de error
  if (error) {
    return (
      <Card className="overflow-hidden border">
        <ErrorState message={error} />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border">
      <div className="p-6 space-y-6">
        <Tabs defaultValue="chart">
          <div className="flex justify-between mb-4">
            <TabsList>
              <TabsTrigger value="chart">Gráfico Histórico</TabsTrigger>
              <TabsTrigger value="logs">Logs de Actualización</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chart">
            <div className="mb-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium dark:text-gray-300">Evolución de Tasas - Últimos 30 días</h3>
                  {/* Estado de depuración */}
                  <div className="text-xs bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-1.5 py-0.5 rounded">
                    {currencies.length} monedas | {selectedCurrency || 'ninguna'} seleccionada
                  </div>
                  <button
                    onClick={actualizarTasas}
                    disabled={updatingRates}
                    className="inline-flex items-center px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    title="Actualizar tasas desde OpenExchangeRates API"
                  >
                    {updatingRates ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Actualizando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" /> Actualizar tasas
                      </>
                    )}
                  </button>
                </div>
                
                <div className="w-full sm:w-64">
                  <Select 
                    value={selectedCurrency || ''} 
                    onValueChange={(value) => {
                      console.log('Moneda seleccionada:', value);
                      setSelectedCurrency(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar moneda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Monedas ({currencies.length})</SelectLabel>
                        {currencies.length > 0 ? currencies.map(currency => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code} - {currency.name}
                          </SelectItem>
                        )) : (
                          <SelectItem value="no-data" disabled>
                            No hay monedas disponibles
                          </SelectItem>
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="p-4 dark:bg-gray-800 dark:border-gray-700">
                {loadingHistory ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <RefreshCw className="animate-spin h-6 w-6 mx-auto mb-2 dark:text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Cargando historial de tasas...</p>
                    </div>
                  </div>
                ) : rateHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos históricos disponibles para {selectedCurrency}.</p>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Posibles causas:</p>
                      <ul className="text-xs text-gray-400 dark:text-gray-500 list-disc list-inside text-left">
                        <li>La moneda no tiene datos en la tabla currency_rates</li>
                        <li>No hay registros para los últimos 30 días</li>
                        <li>La moneda no está configurada para actualización automática</li>
                      </ul>
                      {selectedCurrency && (
                        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded">
                          Moneda seleccionada: <strong>{selectedCurrency}</strong>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row justify-end gap-2 mb-4">
                        <button 
                          onClick={() => selectedCurrency && loadRateHistory(selectedCurrency)}
                          className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Reintentar carga
                        </button>
                        <button
                          onClick={actualizarTasas}
                          disabled={updatingRates}
                          className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          {updatingRates ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Actualizando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1" /> Actualizar tasas
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64">
                    {rateHistory && rateHistory.length > 0 && (
                      <div className="mb-2 flex items-center justify-end gap-2">
                        {rateHistory[0]?.base_currency_code && (
                          <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                            Moneda base: {rateHistory[0].base_currency_code}
                          </Badge>
                        )}
                        {selectedCurrency && (
                          <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                            Mostrando: {selectedCurrency}
                          </Badge>
                        )}
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={rateHistory}
                        margin={{
                          top: 5,
                          right: 20,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis 
                          dataKey="formatted_date" 
                          stroke={chartTheme.textColor}
                          tick={{ fill: chartTheme.textColor }}
                          tickFormatter={(value) => value}
                        />
                        <YAxis 
                          stroke={chartTheme.textColor} 
                          tick={{ fill: chartTheme.textColor }}
                          domain={['dataMin - 0.05', 'dataMax + 0.05']}
                        />
                        <RechartsTooltip 
                          contentStyle={{
                            backgroundColor: chartTheme.tooltipBg,
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            color: chartTheme.tooltipText,
                          fontSize: '12px',
                          borderRadius: '6px'
                        }}
                        labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                        formatter={(value) => [`${value}`, `Tasa de cambio`]}
                        labelFormatter={(label: string) => `Fecha: ${label}`}
                      />
                        <Legend />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        name={`Tasa de ${selectedCurrency}`}
                        stroke={chartTheme.lineColor}
                        dot={{ r: 2, fill: chartTheme.lineColor }}
                        activeDot={{ r: 5 }}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="logs">
            <div className="mb-4 space-y-4">
              <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium dark:text-gray-300">Histórico de Actualizaciones</h3>
              <button
                onClick={loadLogs}
                className="inline-flex items-center px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Recargar logs
              </button>
            </div>
            
            {logs.length === 0 ? (
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-100 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No hay registros de actualizaciones disponibles.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Organizaciones</TableHead>
                      <TableHead>Detalles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {format(new Date(log.execution_date), 'dd/MM/yyyy HH:mm:ss', { locale: es })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={log.success ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}
                          >
                            {log.success ? 'Éxito' : 'Error'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.organizations_success}/{log.organizations_total}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {log.error_message || formatLogDetails(log.details)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </Card>
);
}

export default ExchangeRatesChart;
