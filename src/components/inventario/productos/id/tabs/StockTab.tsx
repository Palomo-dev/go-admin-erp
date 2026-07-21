'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Plus, ArrowUp, ArrowDown, History, Loader2, PackageCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface StockTabProps {
  producto: any;
}

interface StockLevel {
  id: number;
  branch_id: number;
  branch_name: string;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  last_movement_date: string;
  updated_at?: string; // Añadida para resolver el error de TypeScript
}

/**
 * Pestaña para mostrar y gestionar el stock del producto por sucursal
 */
const StockTab: React.FC<StockTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [totalStock, setTotalStock] = useState({
    total: 0,
    reserved: 0,
    available: 0
  });
  
  useEffect(() => {
    const fetchStockLevels = async () => {
      if (!organization?.id) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // Obtener sucursales de la organización
        const { data: branches, error: branchesError } = await supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organization.id)
          .eq('is_active', true);
        
        if (branchesError) throw branchesError;
        if (!branches || branches.length === 0) {
          setLoading(false);
          return;
        }
        
        // Obtener IDs de productos a consultar (padre + hijos si es producto padre)
        const productIds = [producto.id];
        if (producto.is_parent && producto.children && producto.children.length > 0) {
          producto.children.forEach((child: any) => productIds.push(child.id));
        }
        
        // Obtener niveles de stock por sucursal
        const { data: stock, error: stockError } = await supabase
          .from('stock_levels')
          .select(`
            id, 
            branch_id, 
            qty_on_hand, 
            qty_reserved,
            updated_at
          `)
          .in('product_id', productIds);
        
        if (stockError) throw stockError;
        
        // Mapear y combinar datos de sucursales con stock (sumando hijos por sucursal)
        const stockData: StockLevel[] = branches.map((branch) => {
          const branchStocks = stock?.filter(s => s.branch_id === branch.id) || [];
          const qtyOnHand = branchStocks.reduce((sum, s) => sum + (s.qty_on_hand || 0), 0);
          const qtyReserved = branchStocks.reduce((sum, s) => sum + (s.qty_reserved || 0), 0);
          const latestStock = branchStocks.sort((a, b) => 
            (b.updated_at || '').localeCompare(a.updated_at || '')
          )[0];
          
          return {
            id: latestStock?.id || 0,
            branch_id: branch.id,
            branch_name: branch.name,
            qty_on_hand: qtyOnHand,
            qty_reserved: qtyReserved,
            qty_available: qtyOnHand - qtyReserved,
            last_movement_date: latestStock?.updated_at || '',
          };
        });
        
        setStockLevels(stockData);
        
        // Calcular totales
        const totals = stockData.reduce(
          (acc, curr) => {
            return {
              total: acc.total + curr.qty_on_hand,
              reserved: acc.reserved + curr.qty_reserved,
              available: acc.available + (curr.qty_on_hand - curr.qty_reserved)
            };
          },
          { total: 0, reserved: 0, available: 0 }
        );
        
        setTotalStock(totals);
      } catch (error) {
        console.error('Error al cargar datos de stock:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo cargar la información de inventario",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchStockLevels();
  }, [organization?.id, producto.id]);
  
  // Redireccionar a página de ajuste de stock
  const handleAdjustStock = (type: 'entrada' | 'salida', branchId?: number) => {
    const params = new URLSearchParams();
    params.append('productId', producto.id.toString());
    params.append('type', type);
    if (branchId) params.append('branchId', branchId.toString());
    
    router.push(`/app/inventario/ajustes/nuevo?${params.toString()}`);
  };
  
  // Ver historial de movimientos
  const handleViewHistory = () => {
    router.push(`/app/inventario/kardex?producto=${producto.id}`);
  };
  
  if (producto.track_stock === false) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <PackageCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-2">
            Inventario sin seguimiento
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Este producto no requiere control de inventario. Las ventas y compras no afectan el stock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <>
          {/* Resumen de Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg dark:text-white">Stock Total</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  En todas las sucursales
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-3xl font-semibold dark:text-white">{totalStock.total}</p>
              </CardContent>
            </Card>
            
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg dark:text-white">Reservado</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  En procesos de venta
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-3xl font-semibold dark:text-white">{totalStock.reserved}</p>
              </CardContent>
            </Card>
            
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg dark:text-white">Disponible</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Para la venta
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-3xl font-semibold dark:text-white">{totalStock.available}</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleAdjustStock('entrada')}>
              <ArrowUp className="h-4 w-4 mr-2" />
              Registrar Entrada
            </Button>
            
            <Button onClick={() => handleAdjustStock('salida')}>
              <ArrowDown className="h-4 w-4 mr-2" />
              Registrar Salida
            </Button>
            
            <Button variant="outline" onClick={handleViewHistory} className="dark:border-gray-800 dark:hover:bg-gray-800">
              <History className="h-4 w-4 mr-2" />
              Ver Historial
            </Button>
          </div>
          
          {/* Tabla de Stock por Sucursal */}
          <div className="rounded-md border border-gray-200 dark:border-gray-800">
            <Table>
              <TableHeader className="bg-gray-50 dark:bg-gray-900">
                <TableRow>
                  <TableHead className="dark:text-gray-300">Sucursal</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">En Existencia</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Reservado</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Disponible</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                    </TableCell>
                  </TableRow>
                ) : stockLevels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-gray-500 dark:text-gray-400">
                      No hay sucursales configuradas para mostrar stock
                    </TableCell>
                  </TableRow>
                ) : (
                  stockLevels.map((stock) => (
                    <TableRow key={stock.branch_id}>
                      <TableCell className="dark:text-gray-200">{stock.branch_name}</TableCell>
                      <TableCell className="text-right dark:text-gray-200">{stock.qty_on_hand}</TableCell>
                      <TableCell className="text-right dark:text-gray-200">{stock.qty_reserved}</TableCell>
                      <TableCell className="text-right dark:text-gray-200">{stock.qty_available}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAdjustStock('entrada', stock.branch_id)}
                          >
                            <ArrowUp className="h-4 w-4" />
                            <span className="sr-only">Entrada</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAdjustStock('salida', stock.branch_id)}
                          >
                            <ArrowDown className="h-4 w-4" />
                            <span className="sr-only">Salida</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
    </div>
  );
};

export default StockTab;
