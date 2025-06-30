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
  old_price: number;
  new_price: number;
  percentage_change: number;
  changed_at: string;
  changed_by_id: string;
  changed_by_name: string;
  notes?: string;
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
        
        // 1. Primero obtenemos el historial de precios
        const { data: priceData, error: priceError } = await supabase
          .from('price_history')
          .select('*')
          .eq('product_id', producto.id)
          .order('changed_at', { ascending: false });
        
        if (priceError) throw priceError;
        
        // 2. Obtenemos un mapa de usuarios con sus IDs
        const userIds = priceData
          .map((item: any) => item.changed_by_id)
          .filter((id: string) => id !== null);
        
        // Filtrar IDs únicos sin usar Set para evitar problemas de compatibilidad
        const uniqueUserIds: string[] = userIds.filter((id, index) => {
          return userIds.indexOf(id) === index;
        });
        
        // Solo hacemos la consulta de usuarios si hay IDs
        let userMap: {[key: string]: any} = {};
        
        if (uniqueUserIds.length > 0) {
          const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('id, email, first_name, last_name')
            .in('id', uniqueUserIds);
          
          if (userError) {
            console.warn('Error al cargar usuarios:', userError);
            // Continuamos con la ejecución aunque no se carguen los usuarios
          } else if (userData) {
            // Crear mapa de IDs a nombres de usuario
            userMap = userData.reduce((acc: {[key: string]: any}, user: any) => {
              acc[user.id] = {
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
                email: user.email
              };
              return acc;
            }, {});
          }
        }
        
        // 3. Combinamos los datos y calculamos el porcentaje de cambio
        const formattedHistory = priceData.map((item: any) => {
          const percentageChange = item.old_price > 0 
            ? ((item.new_price - item.old_price) / item.old_price) * 100 
            : 0;
            
          const user = userMap[item.changed_by_id] || {};
          
          return {
            ...item,
            percentage_change: parseFloat(percentageChange.toFixed(2)),
            changed_by_name: user.name || 'Usuario desconocido',
            user_email: user.email
          };
        });
        
        setPriceHistory(formattedHistory);
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
      
      // 1. Registrar en historial de precios
      const { error: historyError } = await supabase
        .from('price_history')
        .insert({
          product_id: producto.id,
          old_price: producto.price || 0,
          new_price: priceValue,
          changed_at: new Date().toISOString(),
          changed_by_id: (await supabase.auth.getUser()).data.user?.id,
          notes: 'Actualización manual de precio'
        });
      
      if (historyError) throw historyError;
      
      // 2. Actualizar precio en producto
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
        old_price: producto.price || 0,
        new_price: priceValue,
        percentage_change: parseFloat(percentageChange.toFixed(2)),
        changed_at: new Date().toISOString(),
        changed_by_id: (await supabase.auth.getUser()).data.user?.id || '',
        changed_by_name: 'Tu (Ahora)',
        notes: 'Actualización manual de precio'
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
    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())
    .map(item => ({
      date: format(new Date(item.changed_at), 'dd/MM/yy'),
      precio: item.new_price
    }));
  
  // Si hay precio actual pero no hay historial, añadirlo al gráfico
  if (chartData.length === 0 && producto.price) {
    chartData.push({
      date: 'Actual',
      precio: producto.price
    });
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
            <p className="text-3xl font-semibold">{formatCurrency(producto.price || 0)}</p>
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
              <TableHead className="w-[180px]">Fecha</TableHead>
              <TableHead>Precio Anterior</TableHead>
              <TableHead>Nuevo Precio</TableHead>
              <TableHead className="text-center">Cambio</TableHead>
              <TableHead>Actualizado Por</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                </TableCell>
              </TableRow>
            ) : priceHistory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center justify-center p-4">
                    <p className="mb-2">No hay historial de cambios de precio disponible</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              priceHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center">
                      <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                      {formatDate(item.changed_at)}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(item.old_price)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(item.new_price)}</TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      item.percentage_change > 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : item.percentage_change < 0
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {item.percentage_change > 0 && '+'}
                      {item.percentage_change}%
                    </span>
                  </TableCell>
                  <TableCell>{item.changed_by_name}</TableCell>
                  <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                    {item.notes || '-'}
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
