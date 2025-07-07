'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Plus, ArrowUp, ArrowDown, History, Loader2 } from 'lucide-react';

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
          .eq('product_id', producto.id);
        
        if (stockError) throw stockError;
        
        // Mapear y combinar datos de sucursales con stock
        const stockData: StockLevel[] = branches.map((branch) => {
          const branchStock = stock?.find(s => s.branch_id === branch.id);
          const qtyOnHand = branchStock?.qty_on_hand || 0;
          const qtyReserved = branchStock?.qty_reserved || 0;
          
          return {
            id: branchStock?.id || 0,
            branch_id: branch.id,
            branch_name: branch.name,
            qty_on_hand: qtyOnHand,
            qty_reserved: qtyReserved,
            qty_available: qtyOnHand - qtyReserved,
            last_movement_date: branchStock?.updated_at || '',
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
  }, [organization?.id, producto.id, producto.track_stock]);
  
  // Redireccionar a página de ajuste de stock
  const handleAdjustStock = (type: 'entrada' | 'salida', branchId?: number) => {
    const params = new URLSearchParams();
    params.append('productId', producto.id);
    params.append('type', type);
    if (branchId) params.append('branchId', branchId.toString());
    
    router.push(`/app/inventario/ajustes/nuevo?${params.toString()}`);
  };
  
  // Ver historial de movimientos
  const handleViewHistory = () => {
    router.push(`/app/inventario/kardex?producto=${producto.id}`);
  };
  
  return (
    <div className="space-y-6">
      {!producto.track_stock ? (
        <div className={`p-6 text-center rounded-md border ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <h3 className="text-lg font-medium mb-2">Control de Stock Desactivado</h3>
          <p className="text-gray-500 dark:text-gray-400">
            Este producto no tiene habilitado el seguimiento de stock.
            Puede activarlo en la pestaña de Detalles.
          </p>
        </div>
      ) : (
        <>
          {/* Resumen de Stock */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg">Stock Total</CardTitle>
                <CardDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
                  En todas las sucursales
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-3xl font-semibold">{totalStock.total}</p>
              </CardContent>
            </Card>
            
            <Card className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg">Reservado</CardTitle>
                <CardDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
                  En procesos de venta
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-3xl font-semibold">{totalStock.reserved}</p>
              </CardContent>
            </Card>
            
            <Card className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg">Disponible</CardTitle>
                <CardDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
                  Para la venta
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-3xl font-semibold">{totalStock.available}</p>
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
            
            <Button variant="outline" onClick={handleViewHistory} className={theme === 'dark' ? 'border-gray-800 hover:bg-gray-800' : ''}>
              <History className="h-4 w-4 mr-2" />
              Ver Historial
            </Button>
          </div>
          
          {/* Tabla de Stock por Sucursal */}
          <div className={`rounded-md border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
            <Table>
              <TableHeader className={theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}>
                <TableRow>
                  <TableHead>Sucursal</TableHead>
                  <TableHead className="text-right">En Existencia</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
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
                    <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                      No hay sucursales configuradas para mostrar stock
                    </TableCell>
                  </TableRow>
                ) : (
                  stockLevels.map((stock) => (
                    <TableRow key={stock.branch_id}>
                      <TableCell>{stock.branch_name}</TableCell>
                      <TableCell className="text-right">{stock.qty_on_hand}</TableCell>
                      <TableCell className="text-right">{stock.qty_reserved}</TableCell>
                      <TableCell className="text-right">{stock.qty_available}</TableCell>
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
      )}
    </div>
  );
};

export default StockTab;
