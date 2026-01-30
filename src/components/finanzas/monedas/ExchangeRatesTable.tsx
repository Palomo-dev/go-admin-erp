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
    return <div className="w-16 h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"></div>;
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
          className="absolute bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 text-xs px-2 py-1 rounded shadow-lg z-50 pointer-events-none whitespace-nowrap border border-gray-700 dark:border-gray-600"
          style={{
            left: `${(hoveredPoint.x / 60) * 100}%`,
            top: '-45px',
            transform: 'translateX(-50%)'
          }}
        >
          <div className="font-medium">{hoveredPoint.rate.toFixed(6)}</div>
          <div className="text-gray-300 dark:text-gray-400">
            {format(new Date(hoveredPoint.date), 'dd/MM', { locale: es })}
          </div>
          {/* Flecha del tooltip */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
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
  
  // DESHABILITADO: Precarga automática - las tasas se actualizan via cron job diario
  // La página solo carga datos de la BD, no intenta sincronizar desde la API
  /*
  async function intelligentPreload() {
    if (autoSyncAttempted) return;
    
    const hasDataToday = await checkDailyDataAvailability();
    
    if (!hasDataToday) {
      console.log('🔄 Iniciando sincronización automática silenciosa...');
      setAutoSyncAttempted(true);
      setDailyDataStatus('syncing');
      
      try {
        await syncRatesViaEdgeFunction(false);
        setDailyDataStatus('available');
        setTimeout(() => loadRates(), 2000);
      } catch (error) {
        console.error('Error en precarga automática:', error);
        setDailyDataStatus('missing');
      }
    }
  }
  */
  
  // Función auxiliar para cargar datos iniciales
  const initData = async () => {
    await loadCurrencies();
    await loadRates();
    // NO sincronizar automáticamente - las tasas se actualizan via cron job diario
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
          // NO sincronizar automáticamente - solo usar datos de fechas anteriores como fallback
          console.log('No hay datos para hoy, buscando datos de fechas anteriores...');
          
          // Buscar la fecha más reciente con datos disponibles
          const { data: recentData, error: recentError } = await supabase
            .from('currency_rates')
            .select('*')
            .lt('rate_date', formattedDate)
            .order('rate_date', { ascending: false })
            .limit(200);
          
          if (!recentError && recentData && recentData.length > 0) {
            // Usar datos de la fecha más reciente
            const latestDate = recentData[0].rate_date;
            const latestRates = recentData.filter(r => r.rate_date === latestDate);
            
            console.log(`Usando datos de ${latestDate} como fallback (${latestRates.length} tasas)`);
            
            // Procesar datos con indicación de que son datos anteriores
            await processAndShowRates(latestRates, formattedDate);
            
            toast({
              title: 'Tasas de cambio',
              description: `Mostrando tasas del ${format(new Date(latestDate), 'dd/MM/yyyy', { locale: es })} (última actualización disponible)`,
              variant: 'default',
            });
            setLoading(false);
            return;
          }
          
          // Si no hay datos anteriores, mostrar catálogo de monedas vacío
          const { data: currencies } = await supabase
            .from('currencies')
            .select('code, name, symbol')
            .eq('is_active', true);
          
          // Si hay monedas, crear datos temporales para mostrar
          if (currencies && currencies.length > 0) {
            console.log('No hay tasas disponibles, mostrando catálogo de monedas:', currencies.length);
            
            // Crear datos temporales para mostrar
            const tempRates = currencies.map(curr => ({
              id: crypto.randomUUID(),
              code: curr.code,
              rate: curr.code === 'USD' ? 1 : 0,
              rate_date: formattedDate,
              source: 'pendiente',
              base_currency_code: 'USD',
              currency_name: curr.name,
              currency_symbol: curr.symbol,
            }));
              
            // Convertir explícitamente al tipo CurrencyRate[]
            setRates(tempRates as any);
            setPreviousRates([]);
            toast({
              title: 'Sin tasas disponibles',
              description: 'No hay tasas de cambio en la base de datos. Las tasas se actualizan automáticamente cada día.',
              variant: 'default',
            });
            setLoading(false);
            return;
          }
          
          // Si no hay monedas tampoco, mostrar mensaje
          setRates([]);
          setPreviousRates([]);
          toast({
            title: 'Sin datos',
            description: 'No hay tasas de cambio disponibles. Las tasas se actualizan automáticamente cada día.',
            variant: 'default',
          });
          setLoading(false);
          return;
        } else {
          // Para fechas pasadas sin datos, mostrar mensaje informativo
          setRates([]);
          setPreviousRates([]);
          toast({
            title: 'Sin datos',
            description: `No hay tasas de cambio disponibles para el ${format(date, 'dd/MM/yyyy', { locale: es })}.`,
            variant: 'default',
          });
          setLoading(false);
          return;
        }
      }
      
      // Hay datos disponibles - procesarlos
      console.log('Tasas encontradas en base de datos:', data.length);
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

  // Actualizar tasas usando el servicio directo (método confiable)
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
          title: 'Actualizando tasas de cambio...',
          description: 'Obteniendo tasas actualizadas desde OpenExchangeRates...',
          variant: 'default',
        });
      }

      // Usar directamente el método que funciona (sin Edge Function)
      console.log('Iniciando actualización de tasas de cambio...');
      
      // Importar la función para actualización global de tasas
      const { actualizarTasasDeCambioGlobal } = await import('@/lib/services/openexchangerates');

      // Llamar a la función de actualización global de tasas
      const result = await actualizarTasasDeCambioGlobal();
      console.log('Resultado de actualización:', result);
      
      if (result.success) {
        if (showNotifications) {
          toast({
            title: '✅ Tasas actualizadas correctamente',
            description: `Se actualizaron ${result.updated_count || 0} tasas de cambio exitosamente.`,
            variant: 'default',
            duration: 6000
          });
          
          // Mostrar métricas detalladas
          if (result.updated_count) {
            setTimeout(() => {
              toast({
                title: '📊 Estadísticas de actualización',
                description: `${result.updated_count} tasas actualizadas • Base: ${result.base_currency || 'USD'}`,
                variant: 'default',
                duration: 4000
              });
            }, 1000);
          }
        }
        
        console.log('📈 Métricas de actualización:', {
          updated_count: result.updated_count,
          base_currency: result.base_currency,
          timestamp: result.timestamp
        });
        
        // Recargar información de actualización automática y tasas
        await loadAutoUpdateInfo();
        await loadRates();
      } else {
        throw new Error(result.message || 'Error en la actualización de tasas');
      }

    } catch (err: any) {
      console.error('Error al actualizar tasas:', err);
      
      if (showNotifications) {
        toast({
          title: '❌ Error en actualización',
          description: `No se pudieron actualizar las tasas: ${err.message}`,
          variant: 'destructive',
          duration: 7000
        });
      }
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
      {/* Header con DatePicker y Moneda Base */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <DatePicker
            date={date}
            onSelect={(selectedDate: Date | undefined) => selectedDate && setDate(selectedDate)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm font-medium dark:text-gray-300">Moneda base:</span>
            <span className="font-bold text-sm sm:text-base dark:text-gray-100">{baseCurrency?.code || 'USD'}</span>
            {tipoMonedaBase && (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  tipoMonedaBase === 'base' && "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
                  tipoMonedaBase === 'usd' && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
                  tipoMonedaBase === 'primera' && "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
                  tipoMonedaBase === 'global' && "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                )}
              >
                <span className="hidden sm:inline">
                  {tipoMonedaBase === 'base' && 'Base preferida'}
                  {tipoMonedaBase === 'usd' && 'USD (fallback)'}
                  {tipoMonedaBase === 'primera' && 'Primera disponible'}
                  {tipoMonedaBase === 'global' && 'Catálogo global'}
                </span>
                <span className="sm:hidden">
                  {tipoMonedaBase === 'base' && 'Base'}
                  {tipoMonedaBase === 'usd' && 'USD'}
                  {tipoMonedaBase === 'primera' && 'Primera'}
                  {tipoMonedaBase === 'global' && 'Global'}
                </span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Card de información de tasas */}
      {rates.length > 0 && (
        <div className="text-sm mb-4 p-3 sm:p-4 bg-muted/30 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700">
          <div className="flex flex-col gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
              <div className="text-xs sm:text-sm dark:text-gray-300">
                <span className="font-medium">Datos de tasas:</span>{' '}
                <span className="hidden sm:inline">
                  {new Date(rates[0].rate_date).toLocaleDateString('es', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
                <span className="sm:hidden">
                  {new Date(rates[0].rate_date).toLocaleDateString('es', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-xs sm:text-sm dark:text-gray-300">
                  <span className="font-medium">Base:</span>
                  <Badge variant="outline" className="text-xs dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
                    {rates[0].base_currency_code || 'USD'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-xs sm:text-sm dark:text-gray-300">
                  <span className="font-medium">Fuente:</span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      rates[0].source.includes('openexchangerates') && "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
                      rates[0].source === 'manual' && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                    )}
                  >
                    <span className="hidden sm:inline">
                      {rates[0].source === 'openexchangerates' ? 'API Automática' : 
                       rates[0].source === 'openexchangerates-fallback' ? 'API Respaldo' : 
                       rates[0].source}
                    </span>
                    <span className="sm:hidden">
                      {rates[0].source === 'openexchangerates' ? 'API' : 
                       rates[0].source === 'openexchangerates-fallback' ? 'Respaldo' : 
                       rates[0].source}
                    </span>
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-xs dark:text-gray-400">
            <div className="flex items-start gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 mt-1 flex-shrink-0"></span>
              <span className="leading-relaxed">
                <strong className="dark:text-gray-300">Información:</strong> Las tasas se actualizan automáticamente cada día a las 2:00 AM UTC. 
                <span className="hidden sm:inline">Use "Sincronizar Ahora" solo si necesita datos más recientes.</span>
              </span>
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
      
      {/* Tabla de tasas con responsive */}
      <div className="border rounded-md dark:border-gray-700 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-xs sm:text-sm dark:text-gray-300">Moneda</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300 hidden sm:table-cell">Código</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300">Tasa</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300 hidden md:table-cell">Tendencia</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300 hidden lg:table-cell">Histórico (5d)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.length === 0 ? (
              <TableRow className="dark:border-gray-700">
                <TableCell colSpan={5} className="text-center py-8 dark:text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm dark:text-gray-300">No hay tasas de cambio disponibles para esta fecha</p>
                    <Button
                      className="h-9 px-4 text-xs sm:text-sm"
                      variant="outline"
                      onClick={(e) => syncRatesViaEdgeFunction(true)}
                      disabled={updating}
                    >
                      {updating ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                          Sincronizar Tasas
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rates.map((rate) => (
                <TableRow key={rate.code} className="dark:border-gray-700">
                  <TableCell className="font-medium text-xs sm:text-sm dark:text-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                      <span className="font-semibold">{rate.currency_name || rate.code}</span>
                      {rate.currency_symbol && (
                        <Badge variant="secondary" className="text-xs w-fit dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
                          {rate.currency_symbol}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm dark:text-gray-300 hidden sm:table-cell">{rate.code}</TableCell>
                  <TableCell className="text-xs sm:text-sm dark:text-gray-200">
                    <span className="font-mono font-semibold">{rate.rate.toFixed(6)}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(() => {
                      const trend = calculateTrend(rate.code, parseFloat(rate.rate.toString()));
                      if (!trend) return <span className="text-xs dark:text-gray-400">-</span>;
                      
                      return (
                        <div className="flex items-center">
                          {trend.isUp ? (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              +{trend.percentChange.toFixed(2)}%
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              {trend.percentChange.toFixed(2)}%
                            </Badge>
                          )}
                        </div>
                      );
                    })()} 
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <MiniSparkline currencyCode={rate.code} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
