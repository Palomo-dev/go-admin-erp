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
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/NumericInput';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface ConfiguracionUmbralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProductoItem {
  id: number;
  sku: string;
  name: string;
  branch_id: number;
  branch_name: string;
  min_level: number;
}

/**
 * Modal para configurar umbrales de stock mínimo por producto y sucursal
 */
export default function ConfiguracionUmbralModal({
  open,
  onOpenChange
}: ConfiguracionUmbralModalProps) {
  const [productos, setProductos] = useState<ProductoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<boolean>(false);
  const [umbralValues, setUmbralValues] = useState<Record<string, number>>({});
  
  const organizationData = useOrganization();
  const orgId = organizationData?.organization?.id;

  // Cargar productos y sus niveles mínimos
  useEffect(() => {
    if (!open || !orgId) return;
    
    const fetchProductos = async () => {
      try {
        setLoading(true);
        
        // Consultar productos y sus niveles mínimos configurados
        const { data, error } = await supabase.rpc('get_products_min_stock_config', {
          p_organization_id: orgId
        });
        
        if (error) {
          console.error('Error al cargar productos:', error);
          return;
        }
        
        // Formatear datos
        const formattedProducts = data.map((item: any) => ({
          id: item.product_id,
          sku: item.sku || 'N/A',
          name: item.name,
          branch_id: item.branch_id,
          branch_name: item.branch_name,
          min_level: parseFloat(item.min_level) || 0
        }));
        
        setProductos(formattedProducts);
        
        // Inicializar valores de umbral
        const initialValues: Record<string, number> = {};
        formattedProducts.forEach(producto => {
          initialValues[`${producto.id}-${producto.branch_id}`] = producto.min_level;
        });
        
        setUmbralValues(initialValues);
      } catch (err) {
        console.error('Error inesperado:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProductos();
  }, [open, orgId]);

  // Filtrar productos por búsqueda
  const filteredProductos = productos.filter(producto => 
    producto.name.toLowerCase().includes(search.toLowerCase()) || 
    producto.sku.toLowerCase().includes(search.toLowerCase())
  );
  
  // Manejar cambio en umbral
  const handleUmbralChange = (productId: number, branchId: number, value: number) => {
    setUmbralValues(prev => ({
      ...prev,
      [`${productId}-${branchId}`]: value
    }));
  };
  
  // Guardar configuración de umbrales
  const handleSave = async () => {
    if (!orgId) return;
    
    try {
      setSaving(true);
      
      // Preparar datos para actualización
      const updates = Object.entries(umbralValues).map(([key, value]) => {
        const [productId, branchId] = key.split('-').map(Number);
        return {
          product_id: productId,
          branch_id: branchId,
          min_level: value
        };
      });
      
      // Actualizar en Supabase
      const { error } = await supabase.rpc('update_product_min_stock', {
        p_items: updates
      });
      
      if (error) {
        console.error('Error al guardar umbrales:', error);
        return;
      }
      
      onOpenChange(false);
    } catch (err) {
      console.error('Error inesperado al guardar:', err);
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configuración de Stock Mínimo</DialogTitle>
          <DialogDescription>
            Define el nivel mínimo de stock para cada producto por sucursal
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {/* Búsqueda */}
          <div className="flex items-center relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 text-gray-400" />
            <Input 
              placeholder="Buscar por nombre o SKU" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Tabla de productos */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                <p className="text-gray-500 dark:text-gray-400">Cargando productos...</p>
              </div>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">SKU</TableHead>
                    <TableHead className="min-w-[220px]">Producto</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead className="w-[150px] text-right">Stock Mínimo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProductos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        {search ? 
                          `No se encontraron productos para "${search}".` : 
                          'No hay productos disponibles.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProductos.map((producto) => (
                      <TableRow key={`${producto.id}-${producto.branch_id}`}>
                        <TableCell className="font-mono text-sm">{producto.sku}</TableCell>
                        <TableCell className="font-medium">{producto.name}</TableCell>
                        <TableCell>{producto.branch_name}</TableCell>
                        <TableCell className="text-right">
                          <NumericInput 
                            value={umbralValues[`${producto.id}-${producto.branch_id}`] || 0}
                            onValueChange={(value) => handleUmbralChange(producto.id, producto.branch_id, value)}
                            className="w-24 text-right"
                            min={0}
                            step={1}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <span className="animate-spin inline-block h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                Guardando...
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
