'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import SelectorSucursal from './SelectorSucursal';
import SelectorProductos from './SelectorProductos';
import ListaProductosTraslado from './ListaProductosTraslado';
import { Button } from '@/components/ui/button';
// Usar div con borde como separador en lugar de un componente dedicado
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, CheckCircle2, Printer, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Product {
  id: number;
  name: string;
  sku?: string;
  quantity: number;
  lot_id?: number | null;
}

interface TrasladorSucursalesProps {
  organizationId?: number;
}

export default function TrasladorSucursales({ organizationId }: TrasladorSucursalesProps) {
  const [originBranchId, setOriginBranchId] = useState<number>(0);
  const [destBranchId, setDestBranchId] = useState<number>(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [transferId, setTransferId] = useState<number | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleAddProduct = (product: Product) => {
    // Verificar si el producto ya existe en la lista
    const existingProductIndex = products.findIndex(p => p.id === product.id && p.lot_id === product.lot_id);
    
    if (existingProductIndex >= 0) {
      // Si existe, actualizar la cantidad
      const updatedProducts = [...products];
      updatedProducts[existingProductIndex].quantity += product.quantity;
      setProducts(updatedProducts);
    } else {
      // Si no existe, agregar a la lista
      setProducts([...products, product]);
    }
  };
  
  const handleUpdateQuantity = (index: number, newQuantity: number) => {
    const updatedProducts = [...products];
    updatedProducts[index].quantity = newQuantity;
    setProducts(updatedProducts);
  };
  
  const handleRemoveProduct = (index: number) => {
    const updatedProducts = products.filter((_, i) => i !== index);
    setProducts(updatedProducts);
  };
  
  const handleSubmitTransfer = async () => {
    if (!organizationId || !originBranchId || !destBranchId) {
      toast({
        title: "Error",
        description: !organizationId 
          ? "No se pudo determinar la organización activa" 
          : "Selecciona las sucursales de origen y destino.",
        variant: "destructive",
      });
      return;
    }
    
    if (products.length === 0) {
      toast({
        title: "Error",
        description: "Agrega al menos un producto para realizar el traslado.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // 1. Crear el registro de traslado
      // Asegurarnos de tener organizationId como número
      if (typeof organizationId !== 'number') {
        throw new Error('ID de organización no válido');
      }

      const { data: transferData, error: transferError } = await supabase
        .from('inventory_transfers')
        .insert({
          organization_id: organizationId,
          origin_branch_id: originBranchId,
          dest_branch_id: destBranchId,
          status: 'pending', // Estados: pending, in_transit, received
          notes: notes.trim() || null,
          // No incluir created_at/updated_at ya que la DB tiene defaults
        })
        .select('id')
        .single();
      
      if (transferError) throw transferError;
      
      const inventoryTransferId = transferData.id;
      setTransferId(inventoryTransferId);
      
      // 2. Crear los items del traslado
      const transferItems = products.map(product => {
        // Crear objeto base sin el campo lot_id primero
        const item = {
          inventory_transfer_id: inventoryTransferId,
          product_id: product.id,
          quantity: product.quantity,
          status: 'pending'
          // No incluir created_at/updated_at ya que la DB tiene valores por defecto
        };
        
        // Añadir lot_id solo si existe
        if (product.lot_id) {
          return { ...item, lot_id: product.lot_id };
        }
        
        return item;
      });
      
      const { error: itemsError } = await supabase
        .from('transfer_items')
        .insert(transferItems);
      
      if (itemsError) throw itemsError;
      
      // 3. Registrar los movimientos de stock (salida en origen)
      const stockMovements = products.map(product => {
        // Crear objeto base sin el campo lot_id primero
        const movement = {
          organization_id: organizationId,
          branch_id: originBranchId,
          product_id: product.id,
          direction: 'out',
          qty: product.quantity,
          source: 'transfer',
          source_id: inventoryTransferId.toString(),
          note: `Traslado #${inventoryTransferId} a sucursal ${destBranchId}`,
          created_at: new Date().toISOString()
        };
        
        // Añadir lot_id solo si existe
        if (product.lot_id) {
          return { ...movement, lot_id: product.lot_id };
        }
        
        return movement;
      });
      
      const { error: movementsError } = await supabase
        .from('stock_movements')
        .insert(stockMovements);
      
      if (movementsError) throw movementsError;
      
      // 4. Actualizar los niveles de stock en la sucursal de origen
      for (const product of products) {
        // Buscar el registro de stock actual
        let query = supabase
          .from('stock_levels')
          .select('*')
          .eq('branch_id', originBranchId)
          .eq('product_id', product.id);
        
        // Manejar correctamente lot_id que puede ser nulo
        if (product.lot_id) {
          query = query.eq('lot_id', product.lot_id);
        } else {
          query = query.is('lot_id', null);
        }
        
        const { data: stockData, error: stockError } = await query.single();
          
        if (stockError && stockError.code !== 'PGRST116') { // PGRST116 = Not found
          throw stockError;
        }
        
        if (stockData) {
          // Actualizar el registro existente
          const { error: updateError } = await supabase
            .from('stock_levels')
            .update({ 
              qty_on_hand: stockData.qty_on_hand - product.quantity,
              updated_at: new Date().toISOString()
            })
            .eq('id', stockData.id);
          
          if (updateError) throw updateError;
        } else {
          // Este caso no debería ocurrir normalmente, pero lo manejamos por si acaso
          toast({
            title: "Advertencia",
            description: `No se encontró registro de stock para el producto ID ${product.id} en la sucursal de origen.`,
            variant: "warning",
          });
        }
      }
      
      setSuccess(true);
      toast({
        title: "Traslado creado",
        description: `Se ha creado el traslado #${inventoryTransferId} exitosamente.`,
        variant: "default",
      });
      
    } catch (err: any) {
      console.error('Error al crear traslado:', err);
      setError(err.message || 'Error al crear el traslado');
      toast({
        title: "Error",
        description: err.message || "No se pudo completar el traslado",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handlePrint = () => {
    // Implementar la impresión de la lista de picking
    router.push(`/app/inventario/traslados/print/${transferId}`);
  };
  
  const handleReset = () => {
    // Reiniciar el formulario para un nuevo traslado
    setOriginBranchId(0);
    setDestBranchId(0);
    setProducts([]);
    setNotes('');
    setSuccess(false);
    setTransferId(null);
  };
  
  // Si se ha completado exitosamente, mostrar la confirmación
  if (success) {
    return (
      <div className="space-y-6">
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>¡Traslado creado correctamente!</AlertTitle>
          <AlertDescription>
            El traslado ha sido registrado y se ha actualizado el inventario en la sucursal de origen.
            La sucursal de destino deberá recibir y confirmar los productos.
          </AlertDescription>
        </Alert>
        
        <div className="flex flex-col md:flex-row gap-4 mt-6">
          <Button 
            onClick={handlePrint} 
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Imprimir Lista de Picking
          </Button>
          <Button variant="outline" onClick={handleReset}>
            Crear Nuevo Traslado
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="space-y-6">
        <SelectorSucursal 
          organizationId={organizationId}
          onOriginChange={setOriginBranchId}
          onDestChange={setDestBranchId}
          originBranchId={originBranchId}
          destBranchId={destBranchId}
          disabled={isSubmitting}
        />
        
        {originBranchId > 0 && destBranchId > 0 && (
          <>
            <div className="h-px w-full bg-gray-200 dark:bg-gray-800 my-6" />
            
            <SelectorProductos 
              organizationId={organizationId}
              branchId={originBranchId}
              onAddProduct={handleAddProduct}
              disabled={isSubmitting}
            />
            
            <div className="h-px w-full bg-gray-200 dark:bg-gray-800 my-6" />
            
            <div>
              <Label htmlFor="notes">Notas o instrucciones</Label>
              <Textarea
                id="notes"
                placeholder="Añade notas o instrucciones especiales para este traslado"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                className="mt-2"
              />
            </div>
            
            <ListaProductosTraslado 
              products={products}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveProduct={handleRemoveProduct}
              disabled={isSubmitting}
            />
            
            {products.length > 0 && (
              <div className="flex justify-end mt-6">
                <Button 
                  onClick={handleSubmitTransfer} 
                  disabled={isSubmitting || products.length === 0}
                  className="flex items-center gap-2"
                >
                  {isSubmitting && <span className="animate-spin">◌</span>}
                  <Save className="h-4 w-4" />
                  {isSubmitting ? 'Procesando...' : 'Guardar Traslado'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
