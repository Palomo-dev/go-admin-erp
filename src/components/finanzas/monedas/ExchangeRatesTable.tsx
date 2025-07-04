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
  id: string;
  code: string;
  name: string;
  symbol: string;
  is_base: boolean;
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
  const { toast } = useToast();

  // Cargar monedas y tasas de cambio al iniciar
  useEffect(() => {
    if (organizationId) {
      loadCurrencies();
      loadRates();
    }
  }, [organizationId, date]);

  // Cargar monedas
  async function loadCurrencies() {
    try {
      const { data, error } = await supabase
        .from('currencies')
        .select('*')
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .order('is_base', { ascending: false });

      if (error) throw error;

      setCurrencies(data || []);
      
      // Identificar moneda base
      const base = data?.find(c => c.is_base && c.organization_id === organizationId);
      if (base) {
        setBaseCurrency(base);
      } else {
        // Si no hay base explícita, usar USD o primera disponible
        const usd = data?.find(c => c.code === 'USD');
        if (usd) {
          setBaseCurrency(usd);
        } else if (data && data.length > 0) {
          setBaseCurrency(data[0]);
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

  // Cargar tasas de cambio globales (sin filtro por organización)
  async function loadRates() {
    try {
      setLoading(true);
      const formattedDate = format(date, 'yyyy-MM-dd');
      console.log('Cargando tasas globales para fecha:', formattedDate);
      
      const { data, error } = await supabase
        .from('currency_rates')
        .select(`
          id, code, rate, rate_date, source, base_currency_code
        `)
        .eq('rate_date', formattedDate);

      if (error) throw error;
      
      console.log('Tasas encontradas en base de datos:', data?.length || 0, data);

      // Obtener información de las monedas desde currency_templates
      const { data: templates, error: templatesError } = await supabase
        .from('currency_templates')
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
      loadPreviousRates();
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

  // Cargar tasas del día anterior para comparar tendencias
  async function loadPreviousRates() {
    try {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('currency_rates')
        .select('*')
        .eq('rate_date', yesterdayStr);

      if (error) throw error;
      setPreviousRates(data || []);
    } catch (err) {
      console.error('Error al cargar tasas anteriores:', err);
      setPreviousRates([]);
    }
  }

  // Actualizar todas las tasas de cambio
  async function syncRates() {
    try {
      setUpdating(true);
      
      console.log('Iniciando sincronización de tasas globales para fecha:', format(date, 'yyyy-MM-dd'));
      
      // Comprobar configuración de API en la BD
      const { data: configData } = await supabase
        .from('openexchangerates_config')
        .select('api_key')
        .limit(1);
        
      console.log('Configuración API encontrada:', Array.isArray(configData) && configData.length > 0 ? 'Sí' : 'No');
      
      if (Array.isArray(configData) && configData.length > 0 && configData[0].api_key === 'UTILIZAR_VARIABLE_ENTORNO') {
        console.log('La API key está configurada para usar variable de entorno');
        // Verificar que la variable de entorno esté configurada
        const apiKeyEnv = process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY;
        if (!apiKeyEnv) {
          console.error('Variable de entorno NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY no configurada');
          toast({
            title: 'Error de configuración',
            description: 'La API key de OpenExchangeRates no está configurada. Contacte al administrador.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Mostrar toast de proceso iniciado
      toast({
        title: 'Sincronizando tasas...',
        description: 'Consultando tasas de cambio en tiempo real desde OpenExchangeRates...',
        variant: 'default',
      });

      // Importar la función para actualización global de tasas
      const { actualizarTasasDeCambioGlobal } = await import('@/lib/services/openexchangerates');

      // Llamar a la función de actualización global de tasas con la fecha seleccionada
      const result = await actualizarTasasDeCambioGlobal(date);
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

        toast({
          title: 'Tasas actualizadas en tiempo real',
          description: `Se actualizaron ${result.updated_count} tasas de cambio globales para ${format(date, 'dd/MM/yyyy')} con base en ${result.base_currency || 'USD'}. Datos obtenidos ${tiempoRelativo}.`,
          variant: 'default',
          duration: 5000
        });
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
          <div>
            <span className="text-sm font-medium">Moneda base: </span>
            <span className="font-bold">{baseCurrency?.code || 'USD'}</span>
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
          onClick={syncRates}
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
              currencies={currencies}
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
                {loading ? (
                  <div className="flex justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando tasas...
                  </div>
                ) : (
                  'No hay tasas de cambio disponibles para esta fecha'
                )}
              </TableCell>
            </TableRow>
          ) : (
            rates.map((rate) => (
              <TableRow key={rate.id}>
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
                    variant={rate.source === 'openexchangerates' ? 'default' : 'outline'}
                    className={rate.source === 'openexchangerates' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : ''}
                  >
                    {rate.source === 'openexchangerates' ? (
                      <div className="flex items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse"></div>
                        API
                      </div>
                    ) : 'Manual'}
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
