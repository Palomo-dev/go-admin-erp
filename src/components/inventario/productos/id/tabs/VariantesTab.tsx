'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Plus, Trash2, PlusCircle, Save, Edit, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/utils/Utils';

interface VariantesTabProps {
  producto: any;
}

// Interfaz para variantes (productos hijos en tabla products)
interface Variante {
  id: number;
  parent_product_id: number;
  sku: string;
  name: string;
  price?: number;
  cost?: number;
  stock?: number;
  barcode?: string;
  variant_data?: any;
  status?: string;
}

/**
 * Pestaña para gestionar las variantes del producto
 * Permite crear, editar y eliminar variantes
 */
const VariantesTab: React.FC<VariantesTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingVariante, setEditingVariante] = useState<Variante | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  
  // Cargar variantes al montar el componente
  // Las variantes son productos hijos en tabla products con parent_product_id
  useEffect(() => {
    const fetchVariantes = async () => {
      try {
        setLoading(true);
        
        // Si el producto tiene variantes pre-cargadas (children), usarlas
        if (producto.children && producto.children.length > 0) {
          const mappedVariants = producto.children.map((child: any) => ({
            id: child.id,
            parent_product_id: producto.id,
            sku: child.sku,
            name: child.name,
            price: child.price || child.product_prices?.[0]?.price || 0,
            cost: child.cost || child.product_costs?.[0]?.cost || 0,
            stock: child.stock || child.stock_levels?.reduce((sum: number, sl: any) => sum + (sl.qty_on_hand || 0), 0) || 0,
            barcode: child.barcode,
            variant_data: child.variant_data,
            status: child.status || 'active',
          }));
          setVariantes(mappedVariants);
          setLoading(false);
          return;
        }

        // Si no hay children pre-cargados, consultar la base de datos
        const { data, error } = await supabase
          .from('products')
          .select(`
            id, sku, name, barcode, status, variant_data,
            product_prices(price, effective_from, effective_to),
            product_costs(cost, effective_from, effective_to),
            stock_levels(qty_on_hand, branch_id)
          `)
          .eq('parent_product_id', producto.id)
          .order('created_at');
        
        if (error) throw error;
        
        // Mapear los datos a la interfaz Variante
        const mappedVariants: Variante[] = (data || []).map((child: any) => {
          const currentPrice = child.product_prices?.[0]?.price || 0;
          const currentCost = child.product_costs?.[0]?.cost || 0;
          const totalStock = child.stock_levels?.reduce((sum: number, sl: any) => sum + (sl.qty_on_hand || 0), 0) || 0;
          
          return {
            id: child.id,
            parent_product_id: producto.id,
            sku: child.sku,
            name: child.name,
            price: currentPrice,
            cost: currentCost,
            stock: totalStock,
            barcode: child.barcode,
            variant_data: child.variant_data,
            status: child.status,
          };
        });
        
        setVariantes(mappedVariants);
      } catch (error) {
        console.error('Error al cargar variantes:', error);
        // No mostrar toast si simplemente no hay variantes
      } finally {
        setLoading(false);
      }
    };
    
    fetchVariantes();
  }, [producto.id, producto.children]);
  
  // Abrir diálogo para crear variante
  const handleNewVariante = () => {
    const newVariante: Variante = {
      id: 0, // Temporal, se asignará al crear
      parent_product_id: producto.id,
      sku: `${producto.sku}-V${variantes.length + 1}`,
      name: `${producto.name} - Variante ${variantes.length + 1}`,
      price: producto.price || 0,
      cost: producto.cost || 0,
      stock: 0,
      status: 'active',
    };
    setEditingVariante(newVariante);
    setDialogMode('create');
    setIsDialogOpen(true);
  };
  
  // Abrir diálogo para editar variante
  const handleEditVariante = (variante: Variante) => {
    setEditingVariante({ ...variante });
    setDialogMode('edit');
    setIsDialogOpen(true);
  };
  
  // Guardar variante (crear o editar)
  const handleSaveVariante = async () => {
    if (!editingVariante) return;
    
    try {
      setLoading(true);
      
      if (dialogMode === 'create') {
        // Crear nueva variante como producto hijo en tabla products
        const { data, error } = await supabase
          .from('products')
          .insert({
            organization_id: organization?.id,
            sku: editingVariante.sku,
            name: editingVariante.name,
            barcode: editingVariante.barcode,
            parent_product_id: producto.id,
            is_parent: false,
            category_id: producto.category_id,
            unit_code: producto.unit_code,
            status: 'active',
            variant_data: editingVariante.variant_data,
          })
          .select()
          .single();
        
        if (error) throw error;
        
        // Crear precio inicial si hay precio definido
        if (editingVariante.price && editingVariante.price > 0) {
          await supabase.from('product_prices').insert({
            product_id: data.id,
            price: editingVariante.price,
            effective_from: new Date().toISOString(),
          });
        }
        
        // Crear costo inicial si hay costo definido
        if (editingVariante.cost && editingVariante.cost > 0) {
          await supabase.from('product_costs').insert({
            product_id: data.id,
            cost: editingVariante.cost,
            effective_from: new Date().toISOString(),
          });
        }

        const newVariante: Variante = {
          id: data.id,
          parent_product_id: producto.id,
          sku: data.sku,
          name: data.name,
          price: editingVariante.price,
          cost: editingVariante.cost,
          stock: 0,
          barcode: data.barcode,
          variant_data: data.variant_data,
          status: data.status,
        };
        
        setVariantes([...variantes, newVariante]);
        
        toast({
          title: "Variante creada",
          description: "La variante se ha creado correctamente",
        });
      } else {
        // Actualizar variante existente en tabla products
        const { error } = await supabase
          .from('products')
          .update({
            sku: editingVariante.sku,
            name: editingVariante.name,
            barcode: editingVariante.barcode,
            variant_data: editingVariante.variant_data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingVariante.id);
        
        if (error) throw error;
        
        // Actualizar lista de variantes
        setVariantes(
          variantes.map((v) => (v.id === editingVariante.id ? editingVariante : v))
        );
        
        toast({
          title: "Variante actualizada",
          description: "La variante se ha actualizado correctamente",
        });
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Error al guardar variante:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo guardar la variante",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Eliminar variante
  const handleDeleteVariante = async (id: number) => {
    try {
      setLoading(true);
      
      // Eliminar de tabla products (producto hijo)
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .eq('parent_product_id', producto.id);
      
      if (error) throw error;
      
      // Actualizar lista de variantes
      setVariantes(variantes.filter((v) => v.id !== id));
      
      toast({
        title: "Variante eliminada",
        description: "La variante se ha eliminado correctamente",
      });
    } catch (error: any) {
      console.error('Error al eliminar variante:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo eliminar la variante",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Actualizar campo de variante en formulario
  const handleVarianteChange = (field: keyof Variante, value: any) => {
    if (!editingVariante) return;
    
    setEditingVariante({
      ...editingVariante,
      [field]: value,
    });
  };
  
  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Variantes de Producto</h3>
        <Button onClick={handleNewVariante}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Variante
        </Button>
      </div>
      
      {/* Tabla de variantes */}
      <div className={`rounded-md border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
        <Table>
          <TableHeader className={theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}>
            <TableRow>
              <TableHead className="w-[100px]">SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-center">Stock</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                </TableCell>
              </TableRow>
            ) : variantes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center justify-center p-4">
                    <p className="mb-2">Este producto no tiene variantes</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleNewVariante}
                      className={theme === 'dark' ? 'border-gray-800 hover:bg-gray-800' : ''}
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Crear primera variante
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              variantes.map((variante) => (
                <TableRow key={variante.id}>
                  <TableCell className="font-mono">{variante.sku}</TableCell>
                  <TableCell>{variante.name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(variante.price || 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(variante.cost || 0)}</TableCell>
                  <TableCell className="text-center">{variante.stock || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditVariante(variante)}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                            <AlertDialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
                              Esta acción eliminará la variante permanentemente y no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className={theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : ''}>
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              onClick={() => variante.id && handleDeleteVariante(variante.id)}
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Diálogo para crear/editar variantes */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className={`sm:max-w-md ${theme === 'dark' ? 'bg-gray-900 border-gray-800 text-gray-100' : ''}`}>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Crear nueva variante' : 'Editar variante'}
            </DialogTitle>
            <DialogDescription className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
              {dialogMode === 'create'
                ? 'Completa los datos para crear una variante del producto'
                : 'Modifica los datos de la variante'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU de Variante</Label>
              <Input
                id="sku"
                value={editingVariante?.sku || ''}
                onChange={(e) => handleVarianteChange('sku', e.target.value)}
                placeholder="SKU único para esta variante"
                className={`font-mono ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de Variante</Label>
              <Input
                id="name"
                value={editingVariante?.name || ''}
                onChange={(e) => handleVarianteChange('name', e.target.value)}
                placeholder="Nombre descriptivo"
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Precio</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={editingVariante?.price || 0}
                  onChange={(e) => handleVarianteChange('price', parseFloat(e.target.value))}
                  className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cost">Costo</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  value={editingVariante?.cost || 0}
                  onChange={(e) => handleVarianteChange('cost', parseFloat(e.target.value))}
                  className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stock">Stock Inicial</Label>
              <Input
                id="stock"
                type="number"
                value={editingVariante?.stock || 0}
                onChange={(e) => handleVarianteChange('stock', parseInt(e.target.value, 10))}
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                disabled={dialogMode === 'edit'}
              />
              {dialogMode === 'edit' && (
                <p className="text-xs text-gray-500">El stock se gestiona desde movimientos de inventario</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="barcode">Código de Barras (opcional)</Label>
              <Input
                id="barcode"
                value={editingVariante?.barcode || ''}
                onChange={(e) => handleVarianteChange('barcode', e.target.value)}
                placeholder="Código de barras específico"
                className={`font-mono ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}
              />
            </div>
          </div>
          
          <DialogFooter className="sm:justify-between">
            <DialogClose asChild>
              <Button variant="outline" className={theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : ''}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSaveVariante} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {dialogMode === 'create' ? 'Crear Variante' : 'Guardar Cambios'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VariantesTab;
