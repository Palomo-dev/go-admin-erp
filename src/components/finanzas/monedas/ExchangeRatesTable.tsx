'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
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
import { cn } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/ui/date-picker';
import CurrencyConverter from './CurrencyConverter';
import { TrendingDown, TrendingUp } from 'lucide-react';

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

  // Función auxiliar para cargar datos iniciales
  const initData = async () => {
    await loadCurrencies();
    await loadRates();
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
  
  // Verificar y actualizar tasas automáticamente cada vez que se carga el componente
  useEffect(() => {
    if (organizationId) {
      checkAndUpdateRates();
    }
  }, [organizationId]);

  // Verificar si las tasas ya se actualizaron hoy y actualizarlas si es necesario
  async function checkAndUpdateRates() {
    try {
      const today = new Date();
      const formattedToday = format(today, 'yyyy-MM-dd');
      console.log('Verificando si existen tasas para hoy:', formattedToday);
      
      // Verificar si ya existen tasas para hoy
      const { data, error } = await supabase
        .from('currency_rates')
        .select('id')
        .eq('rate_date', formattedToday)
        .limit(1);
      
      if (error) throw error;
      
      // Si no hay tasas para hoy, intentar actualizarlas automáticamente
      if (!data || data.length === 0) {
        console.log('No se encontraron tasas para hoy. Actualizando automáticamente...');
        await syncRates(false); // sincronización silenciosa
      } else {
        console.log('Ya existen tasas para hoy:', data.length);
        // Si estamos en la fecha actual, recargar las tasas para asegurarnos de tener los datos más recientes
        if (format(date, 'yyyy-MM-dd') === formattedToday) {
          await loadRates();
        }
      }
    } catch (err) {
      console.error('Error al verificar/actualizar tasas automáticamente:', err);
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
      
      // Si no hay tasas para la fecha actual, intentar sincronizarlas automáticamente
      if (!data || data.length === 0) {
        console.log('No se encontraron tasas para la fecha:', formattedDate);
        
        // Verificar si la fecha seleccionada es hoy
        const today = new Date();
        const isToday = (
          date.getDate() === today.getDate() &&
          date.getMonth() === today.getMonth() &&
          date.getFullYear() === today.getFullYear()
        );
        
        if (isToday) {
          console.log('La fecha seleccionada es hoy. Intentando sincronizar automáticamente...');
          try {
            toast({
              title: 'Sincronizando automáticamente',
              description: `No hay tasas para hoy. Obteniendo datos actualizados...`,
              variant: 'default',
            });
            
            // Intentar sincronizar automáticamente
            await syncRates(true);
            
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
            
            // Si llegamos aquí, significa que no tenemos datos después de sincronizar
            throw new Error('No se pudieron obtener tasas actualizadas después de sincronizar');
          } catch (syncError) {
            console.error('Error en sincronización automática:', syncError);
            
            // Intentar una alternativa: obtener todas las monedas del catálogo global
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
              toast({
                title: 'Modo contingencia',
                description: 'Mostrando catálogo de monedas sin tasas actualizadas. Por favor intente sincronizar manualmente.',
                variant: 'destructive', // Usar una variante permitida
              });
              setLoading(false);
              return;
            }
            
            // Si no hay monedas, mostrar error
            toast({
              title: 'Error de sincronización',
              description: 'No se pudieron obtener tasas actualizadas. Intente sincronizar manualmente.',
              variant: 'destructive',
            });
            setRates([]);
            setLoading(false);
            return;
          }
        } else {
          // Si no es hoy, mostrar mensaje normal sin sincronizar
          toast({
            title: 'Sin datos',
            description: `No hay tasas de cambio disponibles para el ${format(date, 'dd/MM/yyyy')}. Intente sincronizar o seleccionar otra fecha.`,
            variant: 'default',
          });
          setRates([]);
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
      
      // Cargar tasas del día anterior para comparación
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
      
      // Buscar tasas ANTERIORES a la fecha actual (lógica mejorada como en el conversor)
      const { data, error } = await supabase
        .from('currency_rates')
        .select('*')
        .lt('rate_date', currentDate) // Buscar fechas anteriores a la actual
        .order('rate_date', { ascending: false }) // Ordenar por fecha descendente
        .limit(50); // Suficientes registros para encontrar fechas coincidentes
      
      if (error) throw error;
      
      // Agrupar por fecha para encontrar la fecha más reciente con datos
      const ratesByDate: { [key: string]: CurrencyRate[] } = {};
      
      if (data && data.length > 0) {
        data.forEach(rate => {
          const dateKey = rate.rate_date.split('T')[0];
          if (!ratesByDate[dateKey]) {
            ratesByDate[dateKey] = [];
          }
          ratesByDate[dateKey].push(rate);
        });
        
        // Obtener las tasas de la fecha más reciente disponible
        const sortedDates = Object.keys(ratesByDate).sort().reverse();
        if (sortedDates.length > 0) {
          const mostRecentDate = sortedDates[0];
          console.log(`Usando tasas del ${mostRecentDate} para comparar tendencias`);
          setPreviousRates(ratesByDate[mostRecentDate] || []);
        } else {
          setPreviousRates([]);
        }
      } else {
        setPreviousRates([]);
      }
    } catch (error) {
      console.error('Error al cargar tasas anteriores:', error);
      setPreviousRates([]);
    }
  }

  // Actualizar todas las tasas de cambio
  async function syncRates(showNotifications = true) {
    try {
      setUpdating(true);
      
      console.log('Iniciando sincronización de tasas globales para fecha:', format(date, 'yyyy-MM-dd'));
      
      // Mostrar toast de proceso iniciado solo si se solicita
      if (showNotifications) {
        toast({
          title: 'Sincronizando tasas...',
          description: 'Consultando tasas de cambio en tiempo real desde OpenExchangeRates...',
          variant: 'default',
        });
      }

      // Importar la función para actualización global de tasas
      const { actualizarTasasDeCambioGlobal } = await import('@/lib/services/openexchangerates');

      // Llamar a la función de actualización global de tasas
      const result = await actualizarTasasDeCambioGlobal();
      console.log('Resultado de sincronización en tiempo real:', result);
      
      if (result.success) {
        // Calcular tiempo de los datos
        let tiempoRelativo = '';
        if (result.timestamp) {
          const fechaDatos = new Date(result.timestamp * 1000);
          const ahora = new Date();
          const diferenciaMinutos = Math.floor((ahora.getTime() - fechaDatos.getTime()) / 60000);
          
          if (diferenciaMinutos < 5) {
            tiempoRelativo = 'hace menos de 5 minutos';
          } else if (diferenciaMinutos < 60) {
            tiempoRelativo = `hace ${diferenciaMinutos} minutos`;
          } else {
            tiempoRelativo = `hace ${Math.floor(diferenciaMinutos / 60)} horas y ${diferenciaMinutos % 60} minutos`;
          }
        }

        if (showNotifications) {
          toast({
            title: 'Tasas actualizadas en tiempo real',
            description: `Se actualizaron ${result.updated_count} tasas de cambio globales para ${format(date, 'dd/MM/yyyy')} con base en ${result.base_currency || 'USD'}. Datos obtenidos ${tiempoRelativo}.`,
            variant: 'default',
            duration: 5000
          });
        }
      } else {
        throw new Error(result.message || 'Error desconocido');
      }

      // Recargar tasas
      loadRates();
    } catch (err: any) {
      console.error('Error al sincronizar tasas de cambio globales:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron sincronizar las tasas globales: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
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
          {rates.length > 0 && (
            <div className="flex items-center">
              <div className="rounded-md bg-muted p-1 flex items-center text-xs">
                <span className="mr-1 font-medium">Fuente: </span>
                <span className="font-semibold">
                  {rates[0].source === 'openexchangerates' ? 'OpenExchangeRates API' : 'Manual'}
                </span>
                {rates[0].source === 'openexchangerates' && (
                  <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-1 animate-pulse"></div>
                    Tiempo real
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
        <Button
          variant="default"
          onClick={() => syncRates(true)}
          disabled={updating}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", updating && "animate-spin")} />
          Sincronizar
        </Button>
      </div>

      {rates.length > 0 && (
        <div className="text-sm text-muted-foreground mb-2 flex items-center justify-between">
          <div>
            <span className="font-medium">Última actualización: </span>
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
            <TableHead>Fuente</TableHead>
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
                    onClick={(e) => syncRates(true)}
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
                  <Badge 
                    variant={(rate.source === 'openexchangerates' || rate.source === 'openexchangerates-fallback') ? 'default' : 'outline'}
                    className={(rate.source === 'openexchangerates' || rate.source === 'openexchangerates-fallback') ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : ''}
                  >
                    {(rate.source === 'openexchangerates' || rate.source === 'openexchangerates-fallback') ? (
                      <div className="flex items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse"></div>
                        <span className="font-semibold">OpenExchangeRates</span>
                      </div>
                    ) : (
                      <span className="font-semibold">Manual</span>
                    )}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
