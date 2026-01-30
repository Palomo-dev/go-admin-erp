'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Package, Plus, Trash2, Loader2 } from 'lucide-react';

interface ShipmentItem {
  id: string;
  description: string;
  sku?: string;
  qty: number;
  unit?: string;
  unit_value?: number;
  total_value?: number;
  weight_kg?: number;
  notes?: string;
  products?: { id: number; name: string; sku: string };
}

interface ShipmentItemsProps {
  items: ShipmentItem[];
  isLoading: boolean;
  canEdit: boolean;
  onAddItem: (item: Omit<ShipmentItem, 'id' | 'products'>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

export function ShipmentItems({ items, isLoading, canEdit, onAddItem, onDeleteItem }: ShipmentItemsProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    sku: '',
    qty: 1,
    unit: 'und',
    unit_value: 0,
    weight_kg: 0,
    notes: '',
  });

  const handleSubmit = async () => {
    if (!formData.description) return;
    
    setIsSubmitting(true);
    try {
      await onAddItem(formData);
      setShowDialog(false);
      setFormData({
        description: '',
        sku: '',
        qty: 1,
        unit: 'und',
        unit_value: 0,
        weight_kg: 0,
        notes: '',
      });
    } catch (error) {
      console.error('Error adding item:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalValue = items.reduce((sum, item) => sum + (item.total_value || 0), 0);
  const totalWeight = items.reduce((sum, item) => sum + ((item.weight_kg || 0) * (item.qty || 1)), 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="h-4 w-4" />
          Items del Envío ({items.length})
        </h3>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Item
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No hay items registrados</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Valor Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Peso</TableHead>
                {canEdit && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.products?.name || item.description}
                  </TableCell>
                  <TableCell className="text-gray-500">{item.sku || item.products?.sku || '-'}</TableCell>
                  <TableCell className="text-right">{item.qty} {item.unit}</TableCell>
                  <TableCell className="text-right">
                    {item.unit_value
                      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.unit_value)
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {item.total_value
                      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.total_value)
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">{item.weight_kg ? `${item.weight_kg} kg` : '-'}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onDeleteItem(item.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 pt-4 border-t flex justify-between text-sm">
            <span className="text-gray-500">Peso Total: <strong>{totalWeight.toFixed(2)} kg</strong></span>
            <span className="text-gray-500">
              Valor Total: <strong className="text-blue-600">
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(totalValue)}
              </strong>
            </span>
          </div>
        </>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descripción del producto"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData((p) => ({ ...p, sku: e.target.value }))}
                  placeholder="Código"
                />
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={formData.qty}
                  onChange={(e) => setFormData((p) => ({ ...p, qty: Number(e.target.value) || 1 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor Unitario</Label>
                <Input
                  type="number"
                  value={formData.unit_value}
                  onChange={(e) => setFormData((p) => ({ ...p, unit_value: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData((p) => ({ ...p, weight_kg: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !formData.description}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
