'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Plus, Trash2, Star, StarOff, Save, Loader2, Edit } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface ProveedoresTabProps {
  producto: any;
}

interface ProductSupplier {
  id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_nit?: string;
  cost: number;
  lead_time_days: number;
  min_order_qty: number;
  is_preferred: boolean;
  supplier_sku: string | null;
  notes: string | null;
}

interface Supplier {
  id: number;
  name: string;
  nit?: string;
}

/**
 * Pestaña para gestionar los proveedores de un producto
 * Permite agregar, editar, eliminar proveedores y marcar uno como preferido
 */
const ProveedoresTab: React.FC<ProveedoresTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const { organization } = useOrganization();

  const [proveedores, setProveedores] = useState<ProductSupplier[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<Partial<ProductSupplier> | null>(null);

  // Cargar proveedores del producto y lista general de proveedores
  useEffect(() => {
    const fetchData = async () => {
      if (!organization?.id) return;
      setLoading(true);

      try {
        // Proveedores del producto
        const { data: psData, error: psError } = await supabase
          .from('product_suppliers')
          .select(`
            id, supplier_id, cost, lead_time_days, min_order_qty, 
            is_preferred, supplier_sku, notes,
            supplier:suppliers(id, name, nit)
          `)
          .eq('product_id', producto.id)
          .order('is_preferred', { ascending: false });

        if (psError) throw psError;

        const mapped: ProductSupplier[] = (psData || []).map((ps: any) => ({
          id: ps.id,
          supplier_id: ps.supplier_id,
          supplier_name: ps.supplier?.name || 'Desconocido',
          supplier_nit: ps.supplier?.nit,
          cost: parseFloat(ps.cost) || 0,
          lead_time_days: ps.lead_time_days || 0,
          min_order_qty: parseFloat(ps.min_order_qty) || 1,
          is_preferred: ps.is_preferred || false,
          supplier_sku: ps.supplier_sku,
          notes: ps.notes,
        }));
        setProveedores(mapped);

        // Lista general de proveedores de la organización
        const { data: suppData } = await supabase
          .from('suppliers')
          .select('id, name, nit')
          .eq('organization_id', organization.id)
          .order('name');

        if (suppData) setAllSuppliers(suppData);
      } catch (error) {
        console.error('Error cargando proveedores:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [producto.id, organization?.id]);

  // Abrir dialog para agregar proveedor
  const handleAdd = () => {
    setEditingItem({
      supplier_id: 0,
      cost: producto.cost || 0,
      lead_time_days: 0,
      min_order_qty: 1,
      is_preferred: proveedores.length === 0,
      supplier_sku: '',
      notes: '',
    });
    setDialogMode('create');
    setIsDialogOpen(true);
  };

  // Abrir dialog para editar proveedor
  const handleEdit = (item: ProductSupplier) => {
    setEditingItem({ ...item });
    setDialogMode('edit');
    setIsDialogOpen(true);
  };

  // Guardar proveedor (crear o editar)
  const handleSave = async () => {
    if (!editingItem) return;
    if (dialogMode === 'create' && (!editingItem.supplier_id || editingItem.supplier_id === 0)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Selecciona un proveedor' });
      return;
    }

    // Verificar duplicado
    if (dialogMode === 'create') {
      const exists = proveedores.some(p => p.supplier_id === editingItem.supplier_id);
      if (exists) {
        toast({ variant: 'destructive', title: 'Error', description: 'Este proveedor ya está asignado al producto' });
        return;
      }
    }

    try {
      setSaving(true);

      if (dialogMode === 'create') {
        const { data, error } = await supabase
          .from('product_suppliers')
          .insert({
            product_id: producto.id,
            supplier_id: editingItem.supplier_id,
            cost: editingItem.cost || 0,
            lead_time_days: editingItem.lead_time_days || 0,
            min_order_qty: editingItem.min_order_qty || 1,
            is_preferred: editingItem.is_preferred || false,
            supplier_sku: editingItem.supplier_sku || null,
            notes: editingItem.notes || null,
          })
          .select(`
            id, supplier_id, cost, lead_time_days, min_order_qty, 
            is_preferred, supplier_sku, notes,
            supplier:suppliers(id, name, nit)
          `)
          .single();

        if (error) throw error;

        const newItem: ProductSupplier = {
          id: data.id,
          supplier_id: data.supplier_id,
          supplier_name: (data as any).supplier?.name || 'Desconocido',
          supplier_nit: (data as any).supplier?.nit,
          cost: parseFloat(data.cost) || 0,
          lead_time_days: data.lead_time_days || 0,
          min_order_qty: parseFloat(data.min_order_qty) || 1,
          is_preferred: data.is_preferred || false,
          supplier_sku: data.supplier_sku,
          notes: data.notes,
        };

        setProveedores(prev => [...prev, newItem]);
        toast({ title: 'Proveedor agregado', description: 'El proveedor se asignó al producto' });
      } else {
        // Editar
        const { error } = await supabase
          .from('product_suppliers')
          .update({
            cost: editingItem.cost || 0,
            lead_time_days: editingItem.lead_time_days || 0,
            min_order_qty: editingItem.min_order_qty || 1,
            supplier_sku: editingItem.supplier_sku || null,
            notes: editingItem.notes || null,
          })
          .eq('id', editingItem.id);

        if (error) throw error;

        setProveedores(prev =>
          prev.map(p => (p.id === editingItem.id ? { ...p, ...editingItem } as ProductSupplier : p))
        );
        toast({ title: 'Proveedor actualizado', description: 'Los datos del proveedor se actualizaron' });
      }

      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Error guardando proveedor:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  // Marcar como preferido
  const handleSetPreferred = async (id: number) => {
    try {
      // Quitar preferido de todos
      await supabase
        .from('product_suppliers')
        .update({ is_preferred: false })
        .eq('product_id', producto.id);

      // Marcar el seleccionado
      await supabase
        .from('product_suppliers')
        .update({ is_preferred: true })
        .eq('id', id);

      setProveedores(prev =>
        prev.map(p => ({ ...p, is_preferred: p.id === id }))
      );

      toast({ title: 'Proveedor preferido actualizado' });
    } catch (error) {
      console.error('Error al cambiar preferido:', error);
    }
  };

  // Eliminar proveedor
  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase
        .from('product_suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProveedores(prev => prev.filter(p => p.id !== id));
      toast({ title: 'Proveedor eliminado', description: 'El proveedor se desvinculó del producto' });
    } catch (error: any) {
      console.error('Error eliminando proveedor:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  // Proveedores disponibles (no asignados)
  const availableSuppliers = allSuppliers.filter(
    s => !proveedores.some(p => p.supplier_id === s.id)
  );

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium dark:text-white">Proveedores del Producto</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestiona los proveedores y sus condiciones comerciales
          </p>
        </div>
        <Button onClick={handleAdd} disabled={availableSuppliers.length === 0 && proveedores.length > 0}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar Proveedor
        </Button>
      </div>

      {/* Tabla de proveedores */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-900">
            <TableRow>
              <TableHead className="dark:text-gray-300">Proveedor</TableHead>
              <TableHead className="dark:text-gray-300 text-right">Costo</TableHead>
              <TableHead className="dark:text-gray-300 text-center">Días Entrega</TableHead>
              <TableHead className="dark:text-gray-300 text-center">Pedido Mín.</TableHead>
              <TableHead className="dark:text-gray-300">SKU Proveedor</TableHead>
              <TableHead className="dark:text-gray-300 text-center">Preferido</TableHead>
              <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                </TableCell>
              </TableRow>
            ) : proveedores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center justify-center p-4">
                    <p className="mb-2">Este producto no tiene proveedores asignados</p>
                    <Button variant="outline" size="sm" onClick={handleAdd}>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar primer proveedor
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              proveedores.map((prov) => (
                <TableRow key={prov.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium dark:text-white">{prov.supplier_name}</p>
                      {prov.supplier_nit && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">NIT: {prov.supplier_nit}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium dark:text-white">{formatCurrency(prov.cost)}</TableCell>
                  <TableCell className="text-center dark:text-gray-200">{prov.lead_time_days} días</TableCell>
                  <TableCell className="text-center dark:text-gray-200">{prov.min_order_qty}</TableCell>
                  <TableCell className="font-mono text-xs dark:text-gray-200">{prov.supplier_sku || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetPreferred(prov.id)}
                      className={prov.is_preferred ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}
                    >
                      {prov.is_preferred ? (
                        <Star className="h-4 w-4 fill-yellow-500" />
                      ) : (
                        <StarOff className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(prov)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se desvinculará a <strong>{prov.supplier_name}</strong> de este producto.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              onClick={() => handleDelete(prov.id)}
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

      {/* Dialog crear/editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Agregar Proveedor' : 'Editar Proveedor'}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {dialogMode === 'create'
                ? 'Selecciona un proveedor y define las condiciones comerciales'
                : 'Modifica las condiciones comerciales del proveedor'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Selector de proveedor (solo en crear) */}
            {dialogMode === 'create' && (
              <div className="space-y-2">
                <Label>Proveedor *</Label>
                <Select
                  value={editingItem?.supplier_id?.toString() || ''}
                  onValueChange={(val) =>
                    setEditingItem(prev => prev ? { ...prev, supplier_id: parseInt(val) } : null)
                  }
                >
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name} {s.nit ? `(${s.nit})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dialogMode === 'edit' && (
              <div className="space-y-1">
                <Label className="text-gray-500 dark:text-gray-400">Proveedor</Label>
                <p className="font-medium dark:text-white">{editingItem?.supplier_name}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Costo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingItem?.cost || 0}
                  onChange={(e) =>
                    setEditingItem(prev => prev ? { ...prev, cost: parseFloat(e.target.value) || 0 } : null)
                  }
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Días de Entrega</Label>
                <Input
                  type="number"
                  value={editingItem?.lead_time_days || 0}
                  onChange={(e) =>
                    setEditingItem(prev => prev ? { ...prev, lead_time_days: parseInt(e.target.value) || 0 } : null)
                  }
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pedido Mínimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingItem?.min_order_qty || 1}
                  onChange={(e) =>
                    setEditingItem(prev => prev ? { ...prev, min_order_qty: parseFloat(e.target.value) || 1 } : null)
                  }
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU del Proveedor</Label>
                <Input
                  value={editingItem?.supplier_sku || ''}
                  onChange={(e) =>
                    setEditingItem(prev => prev ? { ...prev, supplier_sku: e.target.value } : null)
                  }
                  placeholder="SKU opcional"
                  className="font-mono dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={editingItem?.notes || ''}
                onChange={(e) =>
                  setEditingItem(prev => prev ? { ...prev, notes: e.target.value } : null)
                }
                placeholder="Notas sobre este proveedor..."
                className="dark:bg-gray-800 dark:border-gray-700"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <DialogClose asChild>
              <Button variant="outline" className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {dialogMode === 'create' ? 'Agregar' : 'Guardar Cambios'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProveedoresTab;
