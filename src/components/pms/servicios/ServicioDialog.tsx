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

interface ServicioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: OrgServiceView | null;
  isSaving: boolean;
  onSave: (data: { name: string; icon: string; category: string }) => void;
}

export function ServicioDialog({
  open, onOpenChange, editItem, isSaving, onSave,
}: ServicioDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('general');

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setIcon(editItem.icon || '');
      setCategory(editItem.category || 'general');
    } else {
      setName('');
      setIcon('');
      setCategory('general');
    }
  }, [editItem, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon: icon.trim(), category });
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
