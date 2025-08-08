'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { 
  obtenerTasasDeCambio, 
  guardarTasasDeCambio,
  llenarFechasFaltantesConDatosReales
} from '@/lib/services/openexchangerates';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { CalendarIcon, Loader2, RefreshCw, Edit, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/ui/date-picker';
import CurrencyConverter from './CurrencyConverter';
import { TrendingDown, TrendingUp } from 'lucide-react';

// Componente de minigráfica interactiva para mostrar histórico de 5 días
const MiniSparkline = ({ currencyCode }: { currencyCode: string }) => {
  const [historicalData, setHistoricalData] = React.useState<{rate: number, date: string}[]>([]);
  const [hoveredPoint, setHoveredPoint] = React.useState<{rate: number, date: string, x: number, y: number} | null>(null);

  React.useEffect(() => {
    const fetchHistoricalData = async () => {
      const { data, error } = await supabase
        .from('currency_rates')
        .select('rate, rate_date')
        .eq('code', currencyCode)
        .gte('rate_date', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('rate_date', { ascending: true })
        .limit(6);

      if (!error && data) {
        setHistoricalData(data.map(d => ({
          rate: parseFloat(d.rate.toString()),
          date: d.rate_date
        })));
      }
    };

    fetchHistoricalData();
  }, [currencyCode]);

  if (historicalData.length < 2) {
    return <div className="w-16 h-8 bg-gray-100 rounded animate-pulse"></div>;
  }

  const rates = historicalData.map(d => d.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 1;

  // Crear puntos para la línea SVG
  const points = historicalData.map((item, index) => {
    const x = (index / (historicalData.length - 1)) * 60;
    const y = 24 - ((item.rate - min) / range) * 20;
    return `${x},${y}`;
  }).join(' ');

  const isUpTrend = historicalData[historicalData.length - 1].rate > historicalData[0].rate;

  return (
    <div className="w-16 h-8 relative group">
      {/* Área de hover invisible sobre toda la gráfica */}
      <div 
        className="absolute inset-0 z-10"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const relativeX = (mouseX / rect.width) * 60;
          
          // Encontrar el punto más cercano
          let closestIndex = 0;
          let closestDistance = Infinity;
          
          historicalData.forEach((item, index) => {
            const pointX = (index / (historicalData.length - 1)) * 60;
            const distance = Math.abs(relativeX - pointX);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = index;
            }
          });
          
          if (closestDistance < 8) { // Solo mostrar si está cerca
            const closestItem = historicalData[closestIndex];
            const x = (closestIndex / (historicalData.length - 1)) * 60;
            const y = 24 - ((closestItem.rate - min) / range) * 20;
            
            setHoveredPoint({
              rate: closestItem.rate,
              date: closestItem.date,
              x: x,
              y: y
            });
          } else {
            setHoveredPoint(null);
          }
        }}
        onMouseLeave={() => setHoveredPoint(null)}
      />
      
      <svg viewBox="0 0 60 24" className="w-full h-full">
        <polyline
          fill="none"
          stroke={isUpTrend ? "#10b981" : "#ef4444"}
          strokeWidth="1.5"
          points={points}
        />
        
        {/* Puntos de datos */}
        {historicalData.map((item, index) => {
          const x = (index / (historicalData.length - 1)) * 60;
          const y = 24 - ((item.rate - min) / range) * 20;
          const isHovered = hoveredPoint && hoveredPoint.x === x && hoveredPoint.y === y;
          
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={isHovered ? "3" : "1.5"}
              fill={isUpTrend ? "#10b981" : "#ef4444"}
              className={isHovered ? "opacity-100" : "opacity-50"}
            />
          );
        })}
        
        {/* Punto actual destacado */}
        <circle
          cx={60}
          cy={24 - ((historicalData[historicalData.length - 1].rate - min) / range) * 20}
          r="2"
          fill={isUpTrend ? "#10b981" : "#ef4444"}
          className="opacity-100"
        />
      </svg>
      
      {/* Tooltip */}
      {hoveredPoint && (
        <div 
          className="absolute bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50 pointer-events-none whitespace-nowrap"
          style={{
            left: `${(hoveredPoint.x / 60) * 100}%`,
            top: '-45px',
            transform: 'translateX(-50%)'
          }}
        >
          <div className="font-medium">{hoveredPoint.rate.toFixed(6)}</div>
          <div className="text-gray-300">
            {format(new Date(hoveredPoint.date), 'dd/MM', { locale: es })}
          </div>
          {/* Flecha del tooltip */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

interface CurrencyRate {
  id: string;
  code: string;
  rate: number;
  rate_date: string;
  source: string;
  base_currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  auto_update: boolean;
  is_base: boolean;
  org_auto_update: boolean;
}

interface ExchangeRatesTableProps {
  organizationId: number;
}

export default function ExchangeRatesTable({ organizationId }: ExchangeRatesTableProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [previousRates, setPreviousRates] = useState<CurrencyRate[]>([]);
  const [tipoMonedaBase, setTipoMonedaBase] = useState<'base'|'preferencia'|'usd'|'primera'|'global'>('base');
  const { toast } = useToast();

  // Estado para datos reales
  const [fillingRealData, setFillingRealData] = useState(false);

  // Función para llenar fechas faltantes con datos reales
  async function handleFillRealData() {
    try {
      setFillingRealData(true);
      
      toast({
        title: '🔄 Iniciando llenado de datos reales',
        description: 'Detectando fechas faltantes y obteniendo datos del API...',
        variant: 'default',
        duration: 3000
      });

      await llenarFechasFaltantesConDatosReales();
      
      toast({
        title: '✅ Datos reales completados',
        description: 'Se han llenado todas las fechas faltantes con datos reales del API.',
        variant: 'default',
        duration: 5000
      });

      // Recargar datos para mostrar los nuevos
      await loadRates();
      
    } catch (error) {
      console.error('Error llenando datos reales:', error);
      toast({
        title: '❌ Error al llenar datos reales',
        description: 'Hubo un error al obtener los datos reales del API.',
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      setFillingRealData(false);
    }
  }
  
  // Estado para manejo inteligente de precarga
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [dailyDataStatus, setDailyDataStatus] = useState<'checking' | 'available' | 'missing' | 'syncing'>('checking');

  // 🚀 Función auxiliar para verificación inteligente de datos diarios
  async function checkDailyDataAvailability() {
    try {
      setDailyDataStatus('checking');
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('currency_rates')
        .select('id, source')
        .eq('rate_date', today)
        .limit(1);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        console.log('📊 Sin datos para hoy - iniciando precarga automática');
        setDailyDataStatus('missing');
        return false;
      } else {
        console.log('✅ Datos diarios disponibles:', data[0].source);
        setDailyDataStatus('available');
        return true;
      }
    } catch (error) {
      console.error('Error verificando datos diarios:', error);
      setDailyDataStatus('missing');
      return false;
    }
  }
  
  // 🚀 Precarga inteligente automática
  async function intelligentPreload() {
    if (autoSyncAttempted) return;
    
    const hasDataToday = await checkDailyDataAvailability();
    
    if (!hasDataToday) {
      console.log('🔄 Iniciando sincronización automática silenciosa...');
      setAutoSyncAttempted(true);
      setDailyDataStatus('syncing');
      
      try {
        await syncRatesViaEdgeFunction(false); // Sin notificaciones para UX suave
        setDailyDataStatus('available');
        
        // Recargar datos después de sincronización exitosa
        setTimeout(() => loadRates(), 2000);
      } catch (error) {
        console.error('Error en precarga automática:', error);
        setDailyDataStatus('missing');
      }
    }
  }
  
  // Función auxiliar para cargar datos iniciales
  const initData = async () => {
    await loadCurrencies();
    await loadRates();
    
    // 🚀 Iniciar precarga inteligente después de cargar datos básicos
    await intelligentPreload();
  };
  
  // Cargar monedas y tasas de cambio al iniciar
  useEffect(() => {
    if (organizationId) {
      (async () => {
        await loadCurrencies();
        await loadRates();
      })();
    }
  }, [organizationId, date]);
  
  // Estado para información de la actualización automática
  const [lastAutoUpdateInfo, setLastAutoUpdateInfo] = useState<{
    lastUpdate: Date | null;
    nextUpdate: Date | null;
    source: string;
  }>({ lastUpdate: null, nextUpdate: null, source: '' });

  // Cargar información de actualización automática al inicializar
  useEffect(() => {
    if (organizationId) {
      loadAutoUpdateInfo();
    }
  }, [organizationId]);

  // Cargar información sobre la última actualización automática
  async function loadAutoUpdateInfo() {
    try {
      // Obtener el log más reciente de actualizaciones automáticas
      const { data: logs, error: logsError } = await supabase
        .from('exchange_rates_logs')
        .select('execution_date, success, details')
        .eq('success', true)
        .order('execution_date', { ascending: false })
        .limit(1);
      
      if (logsError) throw logsError;
      
      if (logs && logs.length > 0) {
        const lastLog = logs[0];
        const lastUpdate = new Date(lastLog.execution_date);
        
        // Calcular próxima actualización (diaria a las 2:00 AM UTC)
        const nextUpdate = new Date(lastUpdate);
        nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
        nextUpdate.setUTCHours(2, 0, 0, 0);
        
        // Determinar fuente de los datos
        const source = lastLog.details?.source || 'automática';
        
        setLastAutoUpdateInfo({
          lastUpdate,
          nextUpdate,
          source
        });
        
        console.log('Información de actualización automática cargada:', {
          lastUpdate: lastUpdate.toISOString(),
          nextUpdate: nextUpdate.toISOString(),
          source
        });
      }
    } catch (err) {
      console.error('Error al cargar información de actualización automática:', err);
    }
  }
  
  // Cargar monedas
  async function loadCurrencies() {
    try {
      // Primero intenta cargar monedas específicas de la organización
      const { data: orgCurrencies, error: orgError } = await supabase
        .rpc('get_organization_currencies', { p_organization_id: organizationId });

      if (orgError && orgError.code !== 'PGRST116') {
        throw orgError;
      }

      // Si no hay monedas asociadas a la organización o si hay un error, cargar del catálogo global
      if (!orgCurrencies || orgCurrencies.length === 0) {
        console.log('No se encontraron monedas para la organización, cargando catálogo global');
        
        // Consulta directa a la tabla currencies (catálogo global)
        const { data: globalCurrencies, error: globalError } = await supabase
          .from('currencies')
          .select('code, name, symbol, decimals, auto_update');
          
        if (globalError) throw globalError;
        
        // Formatear monedas globales para que sean compatibles con la estructura esperada
        const formattedGlobalCurrencies = globalCurrencies.map(c => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          decimals: c.decimals,
          auto_update: c.auto_update || false,
          is_base: false,
          org_auto_update: false
        }));
        
        setCurrencies(formattedGlobalCurrencies || []);
        
        // Para monedas globales, intentar usar USD como base o la primera disponible
        const usdGlobal = formattedGlobalCurrencies?.find(c => c.code === 'USD');
        if (usdGlobal) {
          setBaseCurrency(usdGlobal);
          setTipoMonedaBase('global');
          console.log('Usando moneda global USD como base');
        } else if (formattedGlobalCurrencies && formattedGlobalCurrencies.length > 0) {
          setBaseCurrency(formattedGlobalCurrencies[0]);
          setTipoMonedaBase('global');
          console.log(`Usando primera moneda global disponible (${formattedGlobalCurrencies[0].code}) como base`);
        }
        
        toast({
          title: 'Información',
          description: 'Se está usando el catálogo global de monedas porque no hay monedas específicas configuradas para esta organización.',
          variant: 'default',
          duration: 5000
        });
      } else {
        // Si hay monedas asociadas a la organización, usar esas
        setCurrencies(orgCurrencies);
        
        // Identificar moneda base
        const base = orgCurrencies?.find((c: Currency) => c.is_base);
        if (base) {
          setBaseCurrency(base);
          setTipoMonedaBase('base');
          console.log('Usando moneda marcada como base para la organización:', base.code);
        } else {
          // Si no hay base explícita, usar USD o primera disponible
          const usd = orgCurrencies?.find((c: Currency) => c.code === 'USD');
          if (usd) {
            setBaseCurrency(usd);
            setTipoMonedaBase('usd');
            console.log('Usando USD como moneda base (fallback)');
          } else if (orgCurrencies && orgCurrencies.length > 0) {
            setBaseCurrency(orgCurrencies[0]);
            setTipoMonedaBase('primera');
            console.log(`Usando primera moneda disponible (${orgCurrencies[0].code}) como base (fallback último recurso)`);
          }
          
          // Mostrar mensaje al usuario sobre el tipo de moneda base que se está usando
          toast({
            title: 'Moneda base',
            description: `No se encontró una moneda marcada como base para esta organización. Se está usando ${tipoMonedaBase === 'usd' ? 'USD' : 'la primera disponible'} como alternativa.`,
            variant: 'default',
            duration: 5000
          });
        }
      }
    } catch (err: any) {
      console.error('Error al cargar monedas:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las monedas: ' + err.message,
        variant: 'destructive',
      });
    }
  }

  // Cargar tasas de cambio globales
  async function loadRates() {
    try {
      setLoading(true);
      
      // 🚀 CACHE: Verificar cache primero (solo para fechas que pueden tener datos)
      const today = new Date();
      const isFutureDate = date > today;
      
      // Para fechas futuras no cargamos datos
      if (isFutureDate) {
        setRates([]);
        setLoading(false);
        return;
      }
      
      // Si no hay monedas cargadas, esperar a que se carguen primero
      if (currencies.length === 0) {
        await loadCurrencies();
      }
      const formattedDate = format(date, 'yyyy-MM-dd');
      console.log('Cargando tasas globales para fecha:', formattedDate);
      
      // Comprobar si tenemos una moneda base configurada
      if (!baseCurrency?.code) {
        console.warn('No se ha configurado una moneda base, usando USD por defecto');
      }

      // Obtener tasas de cambio para la fecha seleccionada
      const { data, error } = await supabase
        .from('currency_rates')
        .select(`
          id, code, rate, rate_date, source, base_currency_code
        `)
        .eq('rate_date', formattedDate);

      if (error) throw error;
      
      // Si no hay tasas para la fecha actual, manejar según el tipo de fecha
      if (!data || data.length === 0) {
        console.log('No se encontraron tasas para la fecha:', formattedDate);
        
        // Verificar si la fecha seleccionada es hoy
        const today = new Date();
        const isToday = (
          date.getDate() === today.getDate() &&
          date.getMonth() === today.getMonth() &&
          date.getFullYear() === today.getFullYear()
        );
        
        // Verificar si la fecha es futura
        const isFutureDate = date > today;
        
        if (isFutureDate) {
          // Para fechas futuras, mostrar mensaje específico
          setRates([]);
          setPreviousRates([]);
          toast({
            title: 'Fecha futura',
            description: 'No hay tasas de cambio disponibles para fechas futuras.',
            variant: 'default',
          });
          setLoading(false);
          return;
        }
        
        if (isToday) {
          console.log('La fecha seleccionada es hoy. Intentando sincronizar automáticamente...');
          try {
            toast({
              title: 'Sincronizando automáticamente',
              description: `No hay tasas para hoy. Obteniendo datos actualizados...`,
              variant: 'default',
            });
            
            // Intentar sincronizar automáticamente
            await syncRatesViaEdgeFunction(true);
            
            // Volver a cargar las tasas después de la sincronización
            const { data: refreshedData, error: refreshError } = await supabase
              .from('currency_rates')
              .select(`id, code, rate, rate_date, source, base_currency_code`)
              .eq('rate_date', formattedDate);
            
            console.log('Datos refrescados después de sincronización:', refreshedData?.length || 0);
              
            if (!refreshError && refreshedData && refreshedData.length > 0) {
              // Mostrar las tasas actualizadas
              toast({
                title: 'Datos actualizados',
                description: `Se encontraron ${refreshedData.length} tasas de cambio para hoy.`,
                variant: 'default',
              });
              
              // Procesar y mostrar los datos actualizados
              await processAndShowRates(refreshedData, formattedDate);
              return; // Terminar la función aquí ya que hemos procesado los datos
            }
            
            // Si llegamos aquí, usar fallback con datos de la fecha más reciente
            console.log('Sincronización falló, buscando datos de fechas anteriores...');
            
            // Buscar la fecha más reciente con datos disponibles
            const { data: recentData, error: recentError } = await supabase
              .from('currency_rates')
              .select('*')
              .lt('rate_date', formattedDate)
              .order('rate_date', { ascending: false })
              .limit(20);
            
            if (!recentError && recentData && recentData.length > 0) {
              // Usar datos de la fecha más reciente
              const latestDate = recentData[0].rate_date;
              const latestRates = recentData.filter(r => r.rate_date === latestDate);
              
              console.log(`Usando datos de ${latestDate} como fallback (${latestRates.length} tasas)`);
              
              // Procesar datos con indicación de que son datos anteriores
              await processAndShowRates(latestRates, formattedDate);
              
              toast({
                title: 'Datos de fecha anterior',
                description: `Se muestran tasas del ${format(new Date(latestDate), 'dd/MM/yyyy', { locale: es })} (más reciente disponible)`,
                variant: 'default',
              });
              return;
            }
          } catch (syncError) {
            console.error('Error en sincronización automática:', syncError);
            
            // Para la fecha actual, mostrar modo contingencia
            const { data: currencies } = await supabase
              .from('currencies')
              .select('code, name, symbol')
              .eq('is_active', true);
            
            // Si hay monedas, crear datos temporales para mostrar
            if (currencies && currencies.length > 0) {
              console.log('Usando datos temporales del catálogo de monedas:', currencies.length);
              
              // Crear datos temporales para mostrar
              const tempRates = currencies.map(curr => ({
                id: crypto.randomUUID(),
                code: curr.code,
                rate: curr.code === 'USD' ? 1 : 0, // Usar number en lugar de string
                rate_date: formattedDate,
                source: 'manual',
                base_currency_code: 'USD',
                currency_name: curr.name,
                currency_symbol: curr.symbol,
              }));
              
              // Convertir explícitamente al tipo CurrencyRate[]
              setRates(tempRates as any);
              setPreviousRates([]);
              toast({
                title: 'Modo contingencia',
                description: 'Mostrando catálogo de monedas sin tasas actualizadas. Por favor intente sincronizar manualmente.',
                variant: 'destructive',
              });
              setLoading(false);
              return;
            }
            
            // Si no hay monedas tampoco, mostrar error completo
            setRates([]);
            setPreviousRates([]);
            toast({
              title: 'Error de sincronización',
              description: 'No se pudieron obtener tasas actualizadas. Intente sincronizar manualmente.',
              variant: 'destructive',
            });
            setLoading(false);
            return;
          }
        } else {
          // Para fechas pasadas sin datos, mostrar mensaje informativo y limpiar estados
          setRates([]);
          setPreviousRates([]);
          toast({
            title: 'Sin datos',
            description: `No hay tasas de cambio disponibles para el ${format(date, 'dd/MM/yyyy', { locale: es })}. Intente sincronizar o seleccionar otra fecha.`,
            variant: 'default',
          });
          setLoading(false);
          return;
        }
      }
      
      console.log('Tasas encontradas en base de datos:', data.length, data);

      // Obtener información de todas las monedas del catálogo global
      const { data: templates, error: templatesError } = await supabase
        .from('currencies')
        .select('code, name, symbol');
        
      if (templatesError) throw templatesError;
      
      // Crear un mapa de monedas para acceso rápido
      const templateMap = templates.reduce((acc: Record<string, any>, curr: any) => {
        acc[curr.code] = curr;
        return acc;
      }, {});

      // Procesar y mostrar los datos obtenidos
      await processAndShowRates(data, formattedDate);
    } catch (err: any) {
      console.error('Error al cargar tasas de cambio:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tasas de cambio: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }
  
  // Procesar y mostrar las tasas de cambio
  async function processAndShowRates(data: any[], formattedDate: string) {
    try {
      // Obtener información de todas las monedas del catálogo global
      const { data: templates, error: templatesError } = await supabase
        .from('currencies')
        .select('code, name, symbol');
        
      if (templatesError) throw templatesError;
      
      // Crear un mapa de monedas para acceso rápido
      const templateMap = templates.reduce((acc: Record<string, any>, curr: any) => {
        acc[curr.code] = curr;
        return acc;
      }, {});
      
      // Formatear los datos para el componente
      const enhancedRates = data.map((r: any) => ({
        id: r.id,
        code: r.code,
        rate: r.rate,
        rate_date: r.rate_date,
        source: r.source,
        base_currency_code: r.base_currency_code || 'USD',
        currency_name: templateMap[r.code]?.name || r.code,
        currency_symbol: templateMap[r.code]?.symbol || '',
      }));

      console.log('Tasas formateadas para mostrar:', enhancedRates.length);
      setRates(enhancedRates);
      
      // Cargar tasas del día anterior para comparación de tendencias
      console.log('🔄 Cargando tasas previas para tendencias...');
      await loadPreviousRates();
    } catch (err) {
      console.error('Error al procesar tasas:', err);
      throw err;
    }
  }

  // Cargar tasas del día anterior para comparar tendencias
  async function loadPreviousRates() {
    try {
      const currentDate = format(date, 'yyyy-MM-dd');
      console.log(`🔍 Buscando tasas anteriores a: ${currentDate}`);
      
      // Buscar tasas ANTERIORES a la fecha actual
      const { data, error } = await supabase
        .from('currency_rates')
        .select('*')
        .lt('rate_date', currentDate)
        .order('rate_date', { ascending: false })
        .limit(100); // Aumentar límite para mejor cobertura
      
      if (error) {
        console.error('Error en query de tasas anteriores:', error);
        throw error;
      }
      
      console.log(`📄 Encontrados ${data?.length || 0} registros de fechas anteriores`);
      
      if (!data || data.length === 0) {
        console.log('⚠️ No hay tasas anteriores disponibles para calcular tendencias');
        setPreviousRates([]);
        return;
      }
      
      // Agrupar por fecha para encontrar la fecha más reciente con datos
      const ratesByDate: { [key: string]: CurrencyRate[] } = {};
      
      data.forEach(rate => {
        const dateKey = rate.rate_date.split('T')[0];
        if (!ratesByDate[dateKey]) {
          ratesByDate[dateKey] = [];
        }
        ratesByDate[dateKey].push(rate);
      });
      
      // Obtener las tasas de la fecha más reciente disponible
      const sortedDates = Object.keys(ratesByDate).sort().reverse();
      console.log(`📅 Fechas anteriores encontradas: ${sortedDates.join(', ')}`);
      
      if (sortedDates.length > 0) {
        const mostRecentDate = sortedDates[0];
        const previousRatesData = ratesByDate[mostRecentDate] || [];
        
        console.log(`✅ Usando ${previousRatesData.length} tasas del ${mostRecentDate} para comparar tendencias`);
        setPreviousRates(previousRatesData);
        
        // Debug: mostrar algunas tasas para verificación
        console.log('🔎 Muestra de tasas anteriores:', 
          previousRatesData.slice(0, 3).map(r => `${r.code}: ${r.rate}`).join(', ')
        );
      } else {
        console.log('⚠️ No se encontraron fechas válidas en los datos anteriores');
        setPreviousRates([]);
      }
    } catch (error) {
      console.error('❌ Error al cargar tasas anteriores:', error);
      setPreviousRates([]);
    }
  }

  // Actualizar tasas usando Edge Function (recomendado)
  async function syncRatesViaEdgeFunction(showNotifications = true) {

    // 🔒 GUARD: Prevenir actualizaciones concurrentes
    if (updating) {
      if (showNotifications) {
        toast({
          title: '⏳ Actualización en progreso',
          description: 'Ya hay una actualización en progreso, por favor espere.',
          variant: 'default',
          duration: 3000
        });
      }
      return;
    }

    try {
      setUpdating(true);
      
      if (showNotifications) {
        toast({
          title: 'Ejecutando actualización automática...',
          description: 'Llamando al servicio de actualización diaria de tasas de cambio...',
          variant: 'default',
        });
      }

      // Llamar a la Edge Function usando el cliente de Supabase
      const { data, error } = await supabase.functions.invoke('actualizar-tasas-cambio', {
        body: {
          source: 'manual_sync',
          triggered_by: 'user_request'
        }
      });
      
      if (error) {
        console.error('Error llamando a Edge Function:', error);
        throw new Error(error.message || 'Error en la Edge Function');
      }
      
      console.log('Resultado de Edge Function:', data);
      
      if (data?.success) {
        const performanceInfo = data.performance || {};
        const resultsInfo = data.results || data; // Manejar ambos formatos
        
        if (showNotifications) {
          toast({
            title: '✅ Actualización automática completada',
            description: `${data.message || 'Tasas actualizadas correctamente'} • ⚡ ${performanceInfo.total_time_ms || 'N/A'}ms`,
            variant: 'default',
            duration: 6000
          });
          
          // Mostrar métricas detalladas si están disponibles
          if (resultsInfo.updated_count || resultsInfo.inserted_count) {
            setTimeout(() => {
              toast({
                title: '📊 Estadísticas de actualización',
                description: `${resultsInfo.updated_count || 0} actualizadas • ${resultsInfo.inserted_count || 0} insertadas • ${resultsInfo.skipped_count || 0} omitidas`,
                variant: 'default',
                duration: 4000
              });
            }, 1000);
          }
        }
        
        console.log('📈 Métricas de Edge Function:', {
          performance: performanceInfo,
          results: resultsInfo,
          source: data.source,
          api_timestamp: data.api_timestamp
        });
        
        // Recargar información de actualización automática y tasas
        await loadAutoUpdateInfo();
        await loadRates();
      } else {
        throw new Error(data?.message || 'Error en la actualización automática');
      }

    } catch (err: any) {
      console.error('Error al ejecutar Edge Function:', err);
      
      if (showNotifications) {
        toast({
          title: 'Intentando método alternativo...',
          description: 'La actualización automática falló, usando método de respaldo.',
          variant: 'default',
        });
      }
      
      // Fallback: usar el método anterior si la Edge Function falla
      console.log('Intentando fallback con método anterior...');
      await syncRatesLegacy(showNotifications);
    } finally {
      setUpdating(false);
    }
  }

  // Método de respaldo (anterior)
  async function syncRatesLegacy(showNotifications = true) {
    try {
      console.log('Usando método de sincronización de respaldo...');
      
      // Importar la función para actualización global de tasas
      const { actualizarTasasDeCambioGlobal } = await import('@/lib/services/openexchangerates');

      // Llamar a la función de actualización global de tasas
      const result = await actualizarTasasDeCambioGlobal();
      console.log('Resultado de sincronización de respaldo:', result);
      
      if (result.success) {
        if (showNotifications) {
          toast({
            title: 'Tasas actualizadas (método de respaldo)',
            description: `Se actualizaron ${result.updated_count || 0} tasas de cambio usando el método de respaldo.`,
            variant: 'default',
            duration: 5000
          });
        }
        
        // Recargar tasas
        await loadRates();
      } else {
        throw new Error(result.message || 'Error desconocido en método de respaldo');
      }

    } catch (err: any) {
      console.error('Error en método de respaldo:', err);
      toast({
        title: 'Error en actualización',
        description: `No se pudieron actualizar las tasas: ${err.message}`,
        variant: 'destructive',
        duration: 7000
      });
    }
  }

  // Calcular tendencia de la tasa comparada con el día anterior
  function calculateTrend(code: string, currentRate: number) {
    if (previousRates.length === 0) return null;
    
    const prevRate = previousRates.find(r => r.code === code);
    if (!prevRate) return null;
    
    const diff = currentRate - parseFloat(prevRate.rate.toString());
    const percentChange = (diff / parseFloat(prevRate.rate.toString())) * 100;
    
    return {
      diff,
      percentChange,
      isUp: diff > 0
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <DatePicker
            date={date}
            onSelect={(selectedDate: Date | undefined) => selectedDate && setDate(selectedDate)}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Moneda base: </span>
            <span className="font-bold">{baseCurrency?.code || 'USD'}</span>
            {tipoMonedaBase && (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  tipoMonedaBase === 'base' && "bg-green-50 text-green-700 border-green-200",
                  tipoMonedaBase === 'usd' && "bg-blue-50 text-blue-700 border-blue-200",
                  tipoMonedaBase === 'primera' && "bg-orange-50 text-orange-700 border-orange-200",
                  tipoMonedaBase === 'global' && "bg-purple-50 text-purple-700 border-purple-200"
                )}
              >
                {tipoMonedaBase === 'base' && 'Base preferida'}
                {tipoMonedaBase === 'usd' && 'USD (fallback)'}
                {tipoMonedaBase === 'primera' && 'Primera disponible'}
                {tipoMonedaBase === 'global' && 'Catálogo global'}
              </Badge>
            )}
          </div>

        </div>
        <div className="flex items-center gap-3">



          

        </div>
      </div>

      {rates.length > 0 && (
        <div className="text-sm text-muted-foreground mb-4 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div>
                <span className="font-medium">Datos de tasas: </span>
                {new Date(rates[0].rate_date).toLocaleDateString('es', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
              <div>
                <span className="font-medium">Base: </span>
                <Badge variant="outline" className="ml-1">
                  {rates[0].base_currency_code || 'USD'}
                </Badge>
              </div>
              <div>
                <span className="font-medium">Fuente: </span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "ml-1",
                    rates[0].source.includes('openexchangerates') && "bg-green-50 text-green-700 border-green-200",
                    rates[0].source === 'manual' && "bg-blue-50 text-blue-700 border-blue-200"
                  )}
                >
                  {rates[0].source === 'openexchangerates' ? 'API Automática' : 
                   rates[0].source === 'openexchangerates-fallback' ? 'API Respaldo' : 
                   rates[0].source}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              <span><strong>Información:</strong> Las tasas se actualizan automáticamente cada día a las 2:00 AM UTC. Use "Sincronizar Ahora" solo si necesita datos más recientes.</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2">
          {rates.length > 0 && currencies.length > 0 && (
            <CurrencyConverter 
              rates={rates} 
              currencies={currencies.map(c => ({ code: c.code, name: c.name, symbol: c.symbol }))}
              date={date}
            />
          )}
        </div>
      </div>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Moneda</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Tasa</TableHead>
            <TableHead>Tendencia</TableHead>
            <TableHead>Histórico (5d)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center">
                <div className="ml-auto flex gap-1">
                  <Button
                    className="h-8 px-2 text-xs ml-auto"
                    variant="outline"
                    onClick={(e) => syncRatesViaEdgeFunction(true)}
                    disabled={updating}
                  >
                    {updating ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Sincronizar
                      </>
                    )}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rates.map((rate) => (
              <TableRow key={rate.code}>
                <TableCell className="font-medium">
                  <div className="flex items-center">
                    <span className="mr-2">{rate.currency_name || rate.code}</span>
                    {rate.currency_symbol && (
                      <Badge variant="secondary" className="text-xs">
                        {rate.currency_symbol}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{rate.code}</TableCell>
                <TableCell>
                  <span className="font-mono">{rate.rate.toFixed(6)}</span>
                </TableCell>
                <TableCell>
                  {(() => {
                    const trend = calculateTrend(rate.code, parseFloat(rate.rate.toString()));
                    if (!trend) return <span>-</span>;
                    
                    return (
                      <div className="flex items-center">
                        {trend.isUp ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +{trend.percentChange.toFixed(2)}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            {trend.percentChange.toFixed(2)}%
                          </Badge>
                        )}
                      </div>
                    );
                  })()} 
                </TableCell>
                <TableCell>
                  <MiniSparkline currencyCode={rate.code} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
