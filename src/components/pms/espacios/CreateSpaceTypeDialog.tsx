'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SpaceCategory } from '@/lib/services/spacesService';

interface CreateSpaceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: SpaceCategory[];
  onSave: (data: {
    name: string;
    short_name: string;
    category_code: string;
    capacity: number;
    base_rate: number;
  }) => Promise<void>;
}

export function CreateSpaceTypeDialog({
  open,
  onOpenChange,
  categories,
  onSave,
}: CreateSpaceTypeDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    category_code: '',
    capacity: 2,
    base_rate: 100000,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.category_code) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      
      // Reset form
      setFormData({
        name: '',
        short_name: '',
        category_code: '',
        capacity: 2,
        base_rate: 100000,
      });
      
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nuevo Tipo de Espacio</DialogTitle>
            <DialogDescription>
              Crea un nuevo tipo para clasificar tus espacios
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Categoría */}
            <div className="grid gap-2">
              <Label htmlFor="category_code">
                Categoría <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.category_code}
                onValueChange={(value) =>
                  setFormData({ ...formData, category_code: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code}>
                      {cat.icon} {cat.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nombre */}
            <div className="grid gap-2">
              <Label htmlFor="name">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ej: Suite Deluxe"
                required
              />
            </div>

            {/* Nombre Corto */}
            <div className="grid gap-2">
              <Label htmlFor="short_name">Nombre Corto</Label>
              <Input
                id="short_name"
                value={formData.short_name}
                onChange={(e) =>
                  setFormData({ ...formData, short_name: e.target.value })
                }
                placeholder="Ej: Deluxe"
                maxLength={20}
              />
            </div>

            {/* Capacidad */}
            <div className="grid gap-2">
              <Label htmlFor="capacity">
                Capacidad (personas) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                max="50"
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacity: parseInt(e.target.value) || 1,
                  })
                }
                required
              />
            </div>

            {/* Tarifa Base */}
            <div className="grid gap-2">
              <Label htmlFor="base_rate">
                Tarifa Base <span className="text-red-500">*</span>
              </Label>
              <Input
                id="base_rate"
                type="number"
                min="0"
                step="1000"
                value={formData.base_rate}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    base_rate: parseInt(e.target.value) || 0,
                  })
                }
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Precio por noche/día
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear Tipo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
