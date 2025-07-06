'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase/config';
import { TrendingUp, CalendarIcon, Loader2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
// Definir tipos para recharts hasta que se instale
interface LineChartProps {
  width?: number | string;
  height?: number | string;
  children?: React.ReactNode;
  data?: any[];
  margin?: { top: number; right: number; bottom: number; left: number };
}

interface LineProps {
  type?: string;
  dataKey: string;
  stroke?: string;
  strokeWidth?: number;
  dot?: boolean | object;
  activeDot?: boolean | object;
}

interface CartesianGridProps {
  strokeDasharray?: string;
  stroke?: string;
  vertical?: boolean;
  horizontal?: boolean;
}

interface XAxisProps {
  dataKey: string;
  stroke?: string;
  tickFormatter?: (value: any) => string;
}

interface YAxisProps {
  stroke?: string;
  tickFormatter?: (value: any) => string;
}

interface TooltipProps {
  formatter?: (value: number, name: string) => [string, string];
  labelFormatter?: (label: string) => string;
  contentStyle?: React.CSSProperties;
}

interface ResponsiveContainerProps {
  width?: string | number;
  height?: string | number;
  children?: React.ReactNode;
}

// Estos componentes son para mockear recharts hasta que se instale
const Line: React.FC<LineProps> = () => null;
const LineChart: React.FC<LineChartProps> = ({ children }) => <div>{children}</div>;
const CartesianGrid: React.FC<CartesianGridProps> = () => null;
const XAxis: React.FC<XAxisProps> = () => null;
const YAxis: React.FC<YAxisProps> = () => null;
const Tooltip: React.FC<TooltipProps> = () => null;
const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({ children }) => <div>{children}</div>;

import { formatCurrency } from '@/utils/Utils';

interface PreciosTabProps {
  producto: any;
}

interface PriceHistory {
  id: number;
  product_id: number;
  price: number; // Current price
  previous_price?: number; // Calculated from previous record
  percentage_change?: number; // Calculated
  effective_from: string;
  effective_to: string | null;
}

/**
 * Pestaña para visualizar el historial de precios del producto
 */
// Hook personalizado para organización
function useOrganization() {
  const [organization, setOrganization] = useState<any>(null);

  useEffect(() => {
    // Obtener la organización desde el localStorage o sessionStorage
    const fetchOrganization = async () => {
      try {
        const session = await supabase.auth.getSession();
        if (session?.data?.session?.user) {
          const userId = session.data.session.user.id;
          const { data } = await supabase
            .from('organization_members')
            .select('organizations(*)')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
            
          if (data && data.organizations) {
            setOrganization(data.organizations);
          }
        }
      } catch (error) {
        console.error('Error al cargar la organización:', error);
      }
    };
    
    fetchOrganization();
  }, []);

  return { organization };
}

const PreciosTab: React.FC<PreciosTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [updating, setUpdating] = useState<boolean>(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [newPrice, setNewPrice] = useState<string>(producto.price?.toString() || '');
  
  useEffect(() => {
    const fetchPriceHistory = async () => {
      try {
        setLoading(true);
        
        // Obtener historial de precios desde product_prices
        const { data: priceData, error: priceError } = await supabase
          .from('product_prices')
          .select('*')
          .eq('product_id', producto.id)
          .order('effective_from', { ascending: false });
        
        if (priceError) throw priceError;
        
        if (!priceData || priceData.length === 0) {
          setPriceHistory([]);
          return;
        }

        // Procesar los datos para calcular los cambios de precio
        const processedData: PriceHistory[] = priceData.map((item: any, index: number) => {
          // El precio anterior es del siguiente registro (más antiguo)
          const previousItem = priceData[index + 1];
          const previousPrice = previousItem ? previousItem.price : null;
          const percentageChange = previousPrice && previousPrice > 0 ?
            ((item.price - previousPrice) / previousPrice) * 100 : 0;
            
          return {
            id: item.id,
            product_id: item.product_id,
            price: item.price,
            previous_price: previousPrice || item.price, // Si no hay previo, usar el mismo
            percentage_change: percentageChange,
            effective_from: item.effective_from,
            effective_to: item.effective_to
          };
        });

        setPriceHistory(processedData);
      } catch (error: any) {
        console.error('Error al cargar historial de precios:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo cargar el historial de precios",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchPriceHistory();
  }, [producto.id]);
  
  // Actualizar precio del producto
  const handleUpdatePrice = async () => {
    if (!newPrice || isNaN(parseFloat(newPrice))) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingrese un precio válido",
      });
      return;
    }
    
    try {
      setUpdating(true);
      const priceValue = parseFloat(newPrice);
      const now = new Date().toISOString();
      
      // 1. Cerrar el precio vigente actual estableciendo su effective_to
      const { data: currentPriceData } = await supabase
        .from('product_prices')
        .select('id')
        .eq('product_id', producto.id)
        .is('effective_to', null)
        .order('effective_from', { ascending: false })
        .limit(1);
        
      if (currentPriceData && currentPriceData.length > 0) {
        const { error: closeError } = await supabase
          .from('product_prices')
          .update({ effective_to: now })
          .eq('id', currentPriceData[0].id);
          
        if (closeError) throw closeError;
      }
      
      // 2. Insertar nuevo precio efectivo desde ahora
      const { error: newPriceError } = await supabase
        .from('product_prices')
        .insert({
          product_id: producto.id,
          price: priceValue,
          effective_from: now,
          effective_to: null // Precio actualmente vigente
        });
      
      if (newPriceError) throw newPriceError;
      
      // 3. Actualizar el precio de referencia en la tabla de productos
      const { error: updateError } = await supabase
        .from('products')
        .update({
          price: priceValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', producto.id)
        .eq('organization_id', organization?.id);
      
      if (updateError) throw updateError;
      
      // 3. Actualizar registro en product_variants si es principal
      const { error: variantError } = await supabase
        .from('product_variants')
        .update({ price: priceValue })
        .eq('product_id', producto.id)
        .eq('is_primary', true);
      
      // No bloqueamos por error en variantes
      if (variantError) console.error('Error al actualizar variante:', variantError);
      
      toast({
        title: "Precio actualizado",
        description: `El precio se ha actualizado a ${formatCurrency(priceValue)}`,
      });
      
      // Actualizar la interfaz
      const percentageChange = producto.price > 0 
        ? ((priceValue - producto.price) / producto.price) * 100 
        : 0;
      
      const newHistoryItem: PriceHistory = {
        id: Date.now(), // ID temporal
        product_id: producto.id,
        price: priceValue,
        previous_price: producto.price || 0,
        percentage_change: parseFloat(percentageChange.toFixed(2)),
        effective_from: new Date().toISOString(),
        effective_to: null
      };
      
      setPriceHistory([newHistoryItem, ...priceHistory]);
      producto.price = priceValue; // Actualizar precio en objeto de producto
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Error al actualizar precio:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo actualizar el precio",
      });
    } finally {
      setUpdating(false);
    }
  };
  
  // Formatear fecha
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy, HH:mm', { locale: es });
    } catch (e) {
      return 'Fecha inválida';
    }
  };
  
  // Preparar datos para el gráfico
  const chartData = [...priceHistory]
    .sort((a, b) => new Date(a.effective_from).getTime() - new Date(b.effective_from).getTime())
    .map(item => ({
      date: format(new Date(item.effective_from), 'dd/MM/yy'),
      precio: item.price
    }));
  
  // Si hay precio actual pero no hay historial, añadirlo al gráfico
  if (chartData.length === 0) {
    // Usar el precio más reciente (del historial o el del producto)
    const currentPrice = (priceHistory && priceHistory.length > 0) ? 
      priceHistory[0].price : producto.price || 0;
    
    if (currentPrice > 0) {
      chartData.push({
        date: 'Actual',
        precio: currentPrice
      });
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Precio actual y botón de actualización */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <Card className={`w-full md:w-1/3 ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}`}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg">Precio Actual</CardTitle>
            <CardDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
              Último precio establecido
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-3xl font-semibold">
              {formatCurrency(
                // Usar el precio más reciente del historial o el precio base si no hay historial
                (priceHistory && priceHistory.length > 0) ? 
                  priceHistory[0].price : producto.price || 0
              )}
            </p>
          </CardContent>
        </Card>
        
        <div className="flex flex-col justify-center gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <TrendingUp className="h-4 w-4 mr-2" />
                Actualizar Precio
              </Button>
            </DialogTrigger>
            <DialogContent className={`sm:max-w-md ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}`}>
              <DialogHeader>
                <DialogTitle>Actualizar precio</DialogTitle>
                <DialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
                  Ingrese el nuevo precio de venta del producto.
                  El cambio quedará registrado en el historial.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="current-price">Precio Actual</Label>
                  <Input
                    id="current-price"
                    value={formatCurrency(producto.price || 0)}
                    disabled
                    className={`bg-gray-100 dark:bg-gray-800 ${theme === 'dark' ? 'border-gray-700' : ''}`}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="new-price">Nuevo Precio</Label>
                  <Input
                    id="new-price"
                    type="number"
                    step="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                  />
                </div>
              </div>
              
              <DialogFooter className="sm:justify-between">
                <Button 
                  variant="outline" 
                  className={theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : ''}
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button onClick={handleUpdatePrice} disabled={updating}>
                  {updating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Guardar Precio
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Gráfico de evolución de precios */}
      {chartData.length > 0 && (
        <Card className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
          <CardHeader className="p-4 pb-0">
            <CardTitle className="text-lg">Evolución de Precios</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#444' : '#ccc'} />
                  <XAxis 
                    dataKey="date" 
                    stroke={theme === 'dark' ? '#aaa' : '#666'}
                  />
                  <YAxis 
                    stroke={theme === 'dark' ? '#aaa' : '#666'}
                    tickFormatter={(value) => formatCurrency(value).replace('$', '')}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Precio']}
                    labelFormatter={(label: string) => `Fecha: ${label}`}
                    contentStyle={theme === 'dark' 
                      ? { backgroundColor: '#333', borderColor: '#555', color: '#fff' }
                      : { backgroundColor: '#fff', borderColor: '#ddd' }
                    }
                  />
                  <Line 
                    type="monotone" 
                    dataKey="precio" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Tabla de historial de precios */}
      <div className={`rounded-md border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
        <Table>
          <TableHeader className={theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}>
            <TableRow>
              <TableHead>Válido Desde</TableHead>
              <TableHead>Válido Hasta</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Precio Anterior</TableHead>
              <TableHead>Cambio %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">Cargando historial...</p>
                </TableCell>
              </TableRow>
            ) : priceHistory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  <p className="text-sm text-gray-500">No hay registro de cambios de precio</p>
                </TableCell>
              </TableRow>
            ) : (
              priceHistory.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">
                    <div className="flex items-center">
                      <CalendarIcon className="h-3 w-3 mr-1 text-gray-400" />
                      {formatDate(item.effective_from)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.effective_to ? formatDate(item.effective_to) : 'Vigente'}
                  </TableCell>
                  <TableCell className="font-semibold">{formatCurrency(item.price)}</TableCell>
                  <TableCell>{formatCurrency(item.previous_price || 0)}</TableCell>
                  <TableCell>
                    <span 
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                        ${item.percentage_change > 0 
                          ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                          : item.percentage_change < 0
                            ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
                    >
                      {item.percentage_change > 0 ? '+' : ''}
                      {item.percentage_change?.toFixed(2)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PreciosTab;
