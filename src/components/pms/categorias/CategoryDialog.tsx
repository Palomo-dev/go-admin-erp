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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SpaceCategory } from '@/lib/services/spaceCategoriesService';

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: SpaceCategory | null;
  onSave: (data: any) => Promise<void>;
}

const ICON_OPTIONS = [
  { value: 'bed', label: 'Cama (Habitación)' },
  { value: 'home', label: 'Casa' },
  { value: 'mountain', label: 'Montaña (Cabaña)' },
  { value: 'tent', label: 'Tienda (Glamping)' },
  { value: 'building', label: 'Edificio' },
  { value: 'car', label: 'Auto (Parking)' },
  { value: 'warehouse', label: 'Bodega' },
];

export function CategoryDialog({ open, onOpenChange, category, onSave }: CategoryDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    icon: 'building',
    is_bookable: true,
    requires_checkin: true,
    sort_order: 0,
    // Configuraciones básicas
    max_nights: 30,
    min_advance_hours: 2,
    housekeeping_required: true,
    // Características
    premium_service: false,
    eco_friendly: false,
    outdoor_experience: false,
    self_contained: false,
    // Políticas de precios
    base_price: 0,
    weekend_multiplier: 1.0,
    // Políticas de impuestos
    tax_included: false,
  });

  useEffect(() => {
    if (category) {
      setFormData({
        code: category.code,
        display_name: category.display_name,
        icon: category.icon || 'building',
        is_bookable: category.is_bookable,
        requires_checkin: category.requires_checkin,
        sort_order: category.sort_order,
        max_nights: category.settings?.max_nights || 30,
        min_advance_hours: category.settings?.min_advance_hours || 2,
        housekeeping_required: category.settings?.housekeeping_required ?? true,
        premium_service: category.settings?.premium_service || false,
        eco_friendly: category.settings?.eco_friendly || false,
        outdoor_experience: category.settings?.outdoor_experience || false,
        self_contained: category.settings?.self_contained || false,
        base_price: category.settings?.pricing_policy?.base_price || 0,
        weekend_multiplier: category.settings?.pricing_policy?.weekend_multiplier || 1.0,
        tax_included: category.settings?.tax_policy?.tax_included || false,
      });
    } else {
      setFormData({
        code: '',
        display_name: '',
        icon: 'building',
        is_bookable: true,
        requires_checkin: true,
        sort_order: 0,
        max_nights: 30,
        min_advance_hours: 2,
        housekeeping_required: true,
        premium_service: false,
        eco_friendly: false,
        outdoor_experience: false,
        self_contained: false,
        base_price: 0,
        weekend_multiplier: 1.0,
        tax_included: false,
      });
    }
  }, [category, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.code || !formData.display_name) {
      return;
    }

    setIsSubmitting(true);
    try {
      const saveData = {
        code: formData.code,
        display_name: formData.display_name,
        icon: formData.icon,
        is_bookable: formData.is_bookable,
        requires_checkin: formData.requires_checkin,
        sort_order: formData.sort_order,
        settings: {
          max_nights: formData.max_nights,
          min_advance_hours: formData.min_advance_hours,
          housekeeping_required: formData.housekeeping_required,
          premium_service: formData.premium_service,
          eco_friendly: formData.eco_friendly,
          outdoor_experience: formData.outdoor_experience,
          self_contained: formData.self_contained,
          pricing_policy: {
            base_price: formData.base_price,
            weekend_multiplier: formData.weekend_multiplier,
          },
          tax_policy: {
            tax_included: formData.tax_included,
          },
        },
      };

      await onSave(saveData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error al guardar:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {category ? 'Editar Categoría' : 'Nueva Categoría'}
          </DialogTitle>
          <DialogDescription>
            Define las características y políticas de la categoría de espacios
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="features">Características</TabsTrigger>
              <TabsTrigger value="policies">Políticas</TabsTrigger>
            </TabsList>

            {/* Tab: Básico */}
            <TabsContent value="basic" className="space-y-4">
              {/* Código */}
              <div className="grid gap-2">
                <Label htmlFor="code">
                  Código <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })
                  }
                  placeholder="ej: habitacion_doble"
                  disabled={!!category}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Identificador único (no se puede cambiar después)
                </p>
              </div>

              {/* Nombre */}
              <div className="grid gap-2">
                <Label htmlFor="display_name">
                  Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                  placeholder="ej: Habitación Doble"
                  required
                />
              </div>

              {/* Icono */}
              <div className="grid gap-2">
                <Label htmlFor="icon">Icono</Label>
                <Select
                  value={formData.icon}
                  onValueChange={(value) =>
                    setFormData({ ...formData, icon: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Orden */}
              <div className="grid gap-2">
                <Label htmlFor="sort_order">Orden de Visualización</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              {/* Switches */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_bookable">Reservable</Label>
                  <Switch
                    id="is_bookable"
                    checked={formData.is_bookable}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_bookable: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="requires_checkin">Requiere Check-in</Label>
                  <Switch
                    id="requires_checkin"
                    checked={formData.requires_checkin}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, requires_checkin: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="housekeeping_required">Limpieza Requerida</Label>
                  <Switch
                    id="housekeeping_required"
                    checked={formData.housekeeping_required}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, housekeeping_required: checked })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab: Características */}
            <TabsContent value="features" className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="premium_service">Servicio Premium</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Espacios de alta gama con servicios adicionales
                    </p>
                  </div>
                  <Switch
                    id="premium_service"
                    checked={formData.premium_service}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, premium_service: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="eco_friendly">Eco-Friendly</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Enfoque en sostenibilidad ambiental
                    </p>
                  </div>
                  <Switch
                    id="eco_friendly"
                    checked={formData.eco_friendly}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, eco_friendly: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="outdoor_experience">Experiencia al Aire Libre</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Cabañas, camping, glampings
                    </p>
                  </div>
                  <Switch
                    id="outdoor_experience"
                    checked={formData.outdoor_experience}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, outdoor_experience: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="self_contained">Auto-Contenido</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Con cocina y servicios completos
                    </p>
                  </div>
                  <Switch
                    id="self_contained"
                    checked={formData.self_contained}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, self_contained: checked })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab: Políticas */}
            <TabsContent value="policies" className="space-y-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="max_nights">Máximo de Noches</Label>
                  <Input
                    id="max_nights"
                    type="number"
                    value={formData.max_nights}
                    onChange={(e) =>
                      setFormData({ ...formData, max_nights: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="min_advance_hours">Anticipo Mínimo (horas)</Label>
                  <Input
                    id="min_advance_hours"
                    type="number"
                    value={formData.min_advance_hours}
                    onChange={(e) =>
                      setFormData({ ...formData, min_advance_hours: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="base_price">Precio Base (referencia)</Label>
                  <Input
                    id="base_price"
                    type="number"
                    step="0.01"
                    value={formData.base_price}
                    onChange={(e) =>
                      setFormData({ ...formData, base_price: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="weekend_multiplier">Multiplicador Fin de Semana</Label>
                  <Input
                    id="weekend_multiplier"
                    type="number"
                    step="0.1"
                    value={formData.weekend_multiplier}
                    onChange={(e) =>
                      setFormData({ ...formData, weekend_multiplier: parseFloat(e.target.value) || 1.0 })
                    }
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    1.0 = sin cambio, 1.2 = 20% más caro
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="tax_included">Impuestos Incluidos</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Los precios mostrados incluyen impuestos
                    </p>
                  </div>
                  <Switch
                    id="tax_included"
                    checked={formData.tax_included}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, tax_included: checked })
                    }
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : category ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
