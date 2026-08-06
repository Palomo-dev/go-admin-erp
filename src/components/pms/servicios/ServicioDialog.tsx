'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SERVICE_CATEGORIES, OrgServiceView } from '@/lib/services/spaceServicesService';
import { supabase } from '@/lib/supabase/config';

interface ServicioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: OrgServiceView | null;
  isSaving: boolean;
  onSave: (data: { name: string; icon: string; category: string; price?: number; linked_product_id?: number | null }) => void;
  organizationId?: number;
}

export function ServicioDialog({
  open, onOpenChange, editItem, isSaving, onSave, organizationId,
}: ServicioDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState(0);
  const [linkedProductId, setLinkedProductId] = useState<number | null>(null);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setIcon(editItem.icon || '');
      setCategory(editItem.category || 'general');
      setPrice(editItem.price || 0);
      setLinkedProductId(editItem.linked_product_id || null);
    } else {
      setName('');
      setIcon('');
      setCategory('general');
      setPrice(0);
      setLinkedProductId(null);
    }
  }, [editItem, open]);

  useEffect(() => {
    if (open && organizationId) {
      supabase
        .from('products')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name')
        .limit(100)
        .then(({ data }) => {
          if (data) setProducts(data);
        });
    }
  }, [open, organizationId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon: icon.trim(), category, price, linked_product_id: linkedProductId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editItem ? 'Editar Servicio' : 'Nuevo Servicio Personalizado'}
            </DialogTitle>
            <DialogDescription>
              {editItem
                ? 'Modifica los datos del servicio personalizado'
                : 'Crea un servicio específico para tu organización'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="svc_name">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="svc_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Jacuzzi, Vista al Mar"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="svc_icon">Icono (nombre lucide)</Label>
              <Input
                id="svc_icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Ej: waves, palm-tree, sparkles"
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Usa nombres de iconos de lucide-react (opcional)
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="svc_category">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="svc_price">Precio del servicio</Label>
              <Input
                id="svc_price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Precio que se cobrará como extra en las reservas. 0 = cortesía
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="svc_product">Producto del POS vinculado</Label>
              <Select
                value={linkedProductId ? String(linkedProductId) : 'none'}
                onValueChange={(val) => setLinkedProductId(val === 'none' ? null : parseInt(val, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin vincular" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vincular</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Al vincular un producto, el POS detectará si ya está incluido en la reserva
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? 'Guardando...' : editItem ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
