'use client';

import React, { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SpaceType, SpaceCategory } from '@/lib/services/spaceTypesService';

interface SpaceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceType: SpaceType | null;
  categories: SpaceCategory[];
  onSave: (data: any) => Promise<void>;
}

export function SpaceTypeDialog({
  open,
  onOpenChange,
  spaceType,
  categories,
  onSave,
}: SpaceTypeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    category_code: '',
    base_rate: '',
    capacity: '2',
    area_sqm: '',
    is_active: true,
    // Amenities comunes
    wifi: false,
    ac: false,
    tv: false,
    minibar: false,
    safe: false,
    balcony: false,
    kitchen: false,
    parking: false,
  });

  useEffect(() => {
    if (spaceType) {
      setFormData({
        name: spaceType.name,
        short_name: spaceType.short_name || '',
        category_code: spaceType.category_code,
        base_rate: spaceType.base_rate.toString(),
        capacity: spaceType.capacity.toString(),
        area_sqm: spaceType.area_sqm?.toString() || '',
        is_active: spaceType.is_active,
        wifi: spaceType.amenities?.wifi || false,
        ac: spaceType.amenities?.ac || false,
        tv: spaceType.amenities?.tv || false,
        minibar: spaceType.amenities?.minibar || false,
        safe: spaceType.amenities?.safe || false,
        balcony: spaceType.amenities?.balcony || false,
        kitchen: spaceType.amenities?.kitchen || false,
        parking: spaceType.amenities?.parking || false,
      });
    } else {
      setFormData({
        name: '',
        short_name: '',
        category_code: categories[0]?.code || '',
        base_rate: '',
        capacity: '2',
        area_sqm: '',
        is_active: true,
        wifi: false,
        ac: false,
        tv: false,
        minibar: false,
        safe: false,
        balcony: false,
        kitchen: false,
        parking: false,
      });
    }
  }, [spaceType, categories, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const amenities = {
        wifi: formData.wifi,
        ac: formData.ac,
        tv: formData.tv,
        minibar: formData.minibar,
        safe: formData.safe,
        balcony: formData.balcony,
        kitchen: formData.kitchen,
        parking: formData.parking,
      };

      const data = {
        name: formData.name,
        short_name: formData.short_name || null,
        category_code: formData.category_code,
        base_rate: parseFloat(formData.base_rate),
        capacity: parseInt(formData.capacity),
        area_sqm: formData.area_sqm ? parseFloat(formData.area_sqm) : null,
        is_active: formData.is_active,
        amenities,
      };

      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando tipo:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {spaceType ? 'Editar Tipo de Espacio' : 'Nuevo Tipo de Espacio'}
            </DialogTitle>
            <DialogDescription>
              {spaceType
                ? 'Actualiza los detalles del tipo de espacio'
                : 'Crea un nuevo tipo de espacio para tu organización'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Información básica */}
            <div className="grid grid-cols-2 gap-4">
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
                  placeholder="Ej: Habitación Doble Superior"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="short_name">Nombre Corto</Label>
                <Input
                  id="short_name"
                  value={formData.short_name}
                  onChange={(e) =>
                    setFormData({ ...formData, short_name: e.target.value })
                  }
                  placeholder="Ej: Doble Sup."
                />
              </div>
            </div>

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
                <SelectTrigger id="category_code">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.code} value={category.code}>
                      {category.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Detalles numéricos */}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="base_rate">
                  Tarifa Base <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="base_rate"
                  type="number"
                  step="0.01"
                  value={formData.base_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, base_rate: e.target.value })
                  }
                  placeholder="120000"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="capacity">Capacidad</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={formData.capacity}
                  onChange={(e) =>
                    setFormData({ ...formData, capacity: e.target.value })
                  }
                  placeholder="2"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="area_sqm">Área (m²)</Label>
                <Input
                  id="area_sqm"
                  type="number"
                  step="0.01"
                  value={formData.area_sqm}
                  onChange={(e) =>
                    setFormData({ ...formData, area_sqm: e.target.value })
                  }
                  placeholder="25"
                />
              </div>
            </div>

            {/* Amenidades */}
            <div className="grid gap-3">
              <Label>Amenidades</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="wifi" className="cursor-pointer flex-1">
                    WiFi
                  </Label>
                  <Switch
                    id="wifi"
                    checked={formData.wifi}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, wifi: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="ac" className="cursor-pointer flex-1">
                    Aire Acondicionado
                  </Label>
                  <Switch
                    id="ac"
                    checked={formData.ac}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, ac: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="tv" className="cursor-pointer flex-1">
                    TV
                  </Label>
                  <Switch
                    id="tv"
                    checked={formData.tv}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, tv: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="minibar" className="cursor-pointer flex-1">
                    Minibar
                  </Label>
                  <Switch
                    id="minibar"
                    checked={formData.minibar}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, minibar: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="safe" className="cursor-pointer flex-1">
                    Caja Fuerte
                  </Label>
                  <Switch
                    id="safe"
                    checked={formData.safe}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, safe: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="balcony" className="cursor-pointer flex-1">
                    Balcón
                  </Label>
                  <Switch
                    id="balcony"
                    checked={formData.balcony}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, balcony: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="kitchen" className="cursor-pointer flex-1">
                    Cocina
                  </Label>
                  <Switch
                    id="kitchen"
                    checked={formData.kitchen}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, kitchen: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                  <Label htmlFor="parking" className="cursor-pointer flex-1">
                    Estacionamiento
                  </Label>
                  <Switch
                    id="parking"
                    checked={formData.parking}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, parking: checked })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Estado */}
            <div className="flex items-center justify-between space-x-2 p-3 rounded-md border border-gray-200 dark:border-gray-700">
              <div>
                <Label htmlFor="is_active" className="cursor-pointer">
                  Estado Activo
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Los tipos inactivos no estarán disponibles para nuevas reservas
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : spaceType ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
