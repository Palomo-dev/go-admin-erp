'use client';

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from '@/components/ui/NumericInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { ProductoBajoUmbral } from './StockMinimoReporte';

interface OrdenesCompraModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly selectedProducts: ProductoBajoUmbral[];
}

/**
 * Modal para generar órdenes de compra en lote
 */
export default function OrdenesCompraModal({
  open,
  onOpenChange,
  selectedProducts
}: OrdenesCompraModalProps) {
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [proveedorId, setProveedorId] = useState<string>('');
  const [proveedores, setProveedores] = useState<{id: number, name: string}[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const organizationData = useOrganization();
  const orgId = organizationData?.organization?.id;
  const branchId = organizationData?.branch_id;

  // Cargar proveedores
  useEffect(() => {
    if (!open || !orgId) return;
    
    const fetchProveedores = async () => {
      try {
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, name')
          .eq('organization_id', orgId)
          .order('name');
          
        if (error) {
          console.error('Error al cargar proveedores:', error);
          return;
        }
        
        setProveedores(data || []);
      } catch (err) {
        console.error('Error inesperado:', err);
      }
    };
    
    fetchProveedores();
    
    // Inicializar cantidades con la diferencia entre stock mínimo y stock actual
    const initialCantidades: Record<number, number> = {};
    selectedProducts.forEach(producto => {
      initialCantidades[producto.id] = Math.max(0, producto.diferencia);
    });
    setCantidades(initialCantidades);
    
  }, [open, orgId, selectedProducts]);

  // Manejar cambio en cantidad
  const handleCantidadChange = (id: number, value: number) => {
    setCantidades(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Generar orden de compra
  const handleGenerar = async () => {
    if (!orgId || !proveedorId) {
      setError('Por favor seleccione un proveedor');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Verificar que haya cantidades válidas
      const hasValidQuantities = selectedProducts.some(
        p => (cantidades[p.id] || 0) > 0
      );
      
      if (!hasValidQuantities) {
        setError('Ingrese al menos una cantidad válida mayor a cero');
        setLoading(false);
        return;
      }
      
      // Agrupar productos por proveedor
      const productosPorProveedor: Record<string, { product_id: number; quantity: number; unit_cost: number }[]> = {};
      
      selectedProducts.forEach(producto => {
        const cantidad = cantidades[producto.id] || 0;
        if (cantidad <= 0) return;
        
        // Usar el proveedor seleccionado (requerido)
        const provId = proveedorId;
        
        if (!productosPorProveedor[provId]) {
          productosPorProveedor[provId] = [];
        }
        
        productosPorProveedor[provId].push({
          product_id: producto.product_id,
          quantity: cantidad,
          unit_cost: 0 // Se establecerá al recibir la orden
        });
      });
      
      // Crear órdenes de compra por proveedor
      for (const [providerId, items] of Object.entries(productosPorProveedor) as [string, { product_id: number; quantity: number; unit_cost: number }[]][]) {
        if (!providerId || items.length === 0) continue;
        
        // Crear orden de compra
        const { data: orderData, error: orderError } = await supabase
          .from('purchase_orders')
          .insert({
            organization_id: orgId,
            branch_id: branchId || selectedProducts[0]?.branch_id,
            supplier_id: parseInt(providerId),
            status: 'draft',
            notes: 'Generada automáticamente desde reabastecimiento',
            created_by: (await supabase.auth.getUser()).data.user?.id
          })
          .select('id')
          .single();
          
        if (orderError) {
          console.error('Error al crear orden de compra:', orderError);
          setError('Error al crear orden de compra');
          continue;
        }
        
        // Agregar items a la orden
        const orderItems = items.map(item => ({
          ...item,
          purchase_order_id: orderData.id
        }));
        
        const { error: itemsError } = await supabase
          .from('po_items')
          .insert(orderItems);
          
        if (itemsError) {
          console.error('Error al agregar items:', itemsError);
          setError('Error al agregar productos a la orden');
        }
      }
      
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 2000);
      
    } catch (err: unknown) {
      console.error('Error inesperado:', err);
      setError(err instanceof Error ? err.message : 'Ha ocurrido un error al generar las órdenes');
    } finally {
      setLoading(false);
    }
  };
  
  // Calcular totales
  const totalProductos = selectedProducts.length;
  const totalCantidad = Object.values(cantidades).reduce((sum, qty) => sum + (qty || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!loading) onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generar Órdenes de Compra</DialogTitle>
          <DialogDescription>
            Crea órdenes de compra para los productos seleccionados
          </DialogDescription>
        </DialogHeader>
        
        {success ? (
          <div className="py-8">
            <div className="flex flex-col items-center justify-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
                <CheckIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-medium">¡Órdenes de compra generadas!</h3>
              <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                Las órdenes de compra han sido creadas con éxito.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Seleccionar proveedor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="proveedor-select" className="block text-sm font-medium mb-1">
                  Proveedor por defecto
                </label>
                <Select value={proveedorId} onValueChange={setProveedorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map(proveedor => (
                      <SelectItem key={proveedor.id} value={proveedor.id.toString()}>
                        {proveedor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Si no se selecciona, se utilizará el proveedor asignado a cada producto
                </p>
              </div>
              
              <div className="flex flex-col justify-center">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded p-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Productos</div>
                    <div className="text-lg font-medium">{totalProductos}</div>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded p-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Cantidad total</div>
                    <div className="text-lg font-medium">{totalCantidad}</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Tabla de productos */}
            <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">SKU</TableHead>
                    <TableHead className="min-w-[220px]">Producto</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead className="text-right">Stock Actual</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right w-[150px]">Cantidad a pedir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedProducts.map((producto) => (
                    <TableRow key={producto.id}>
                      <TableCell className="font-mono text-sm">{producto.sku}</TableCell>
                      <TableCell className="font-medium">{producto.name}</TableCell>
                      <TableCell>{producto.branch_name}</TableCell>
                      <TableCell className="text-right">{producto.qty_on_hand}</TableCell>
                      <TableCell className="text-right">{producto.min_level}</TableCell>
                      <TableCell className="text-right">
                        <NumericInput 
                          value={cantidades[producto.id] || 0}
                          onValueChange={(value) => handleCantidadChange(producto.id, value)}
                          className="w-24 text-right"
                          min={0}
                          step={1}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerar} 
            disabled={loading || success}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                {' '}
                Generando...
              </>
            ) : (
              'Generar Órdenes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
