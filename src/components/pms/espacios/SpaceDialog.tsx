'use client';

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Space, SpaceType, SpaceStatus } from '@/lib/services/spacesService';

interface SpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: Space | null;
  spaceTypes: SpaceType[];
  availableZones?: string[];
  onSave: (data: any) => Promise<void>;
  onCreateType?: () => void;
}

const STATUS_OPTIONS: { value: SpaceStatus; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'occupied', label: 'Ocupado' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'out_of_order', label: 'Fuera de Servicio' },
];

export function SpaceDialog({ open, onOpenChange, space, spaceTypes, availableZones = [], onSave, onCreateType }: SpaceDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewZoneInput, setShowNewZoneInput] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    space_type_id: '',
    floor_zone: '',
    status: 'available' as SpaceStatus,
    maintenance_notes: '',
  });

  useEffect(() => {
    if (space) {
      setFormData({
        label: space.label,
        space_type_id: space.space_type_id,
        floor_zone: space.floor_zone || '',
        status: space.status,
        maintenance_notes: space.maintenance_notes || '',
      });
    } else {
      setFormData({
        label: '',
        space_type_id: '',
        floor_zone: '',
        status: 'available',
        maintenance_notes: '',
      });
    }
  }, [space, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.label || !formData.space_type_id) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
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
            <DialogTitle>
              {space ? 'Editar Espacio' : 'Nuevo Espacio'}
            </DialogTitle>
            <DialogDescription>
              {space
                ? 'Modifica los detalles del espacio'
                : 'Crea un nuevo espacio en el inventario'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Etiqueta */}
            <div className="grid gap-2">
              <Label htmlFor="label">
                Etiqueta <span className="text-red-500">*</span>
              </Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value })
                }
                placeholder="Ej: Habitación 101"
                required
              />
            </div>

            {/* Tipo */}
            <div className="grid gap-2">
              <Label htmlFor="space_type_id">
                Tipo <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.space_type_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, space_type_id: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {spaceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                      {type.category && ` (${type.category.display_name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {onCreateType && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCreateType}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Nuevo Tipo
                </Button>
              )}
            </div>

            {/* Piso/Zona */}
            <div className="grid gap-2">
              <Label htmlFor="floor_zone">Piso/Zona</Label>
              {showNewZoneInput ? (
                <div className="space-y-2">
                  <Input
                    id="floor_zone"
                    value={formData.floor_zone}
                    onChange={(e) =>
                      setFormData({ ...formData, floor_zone: e.target.value })
                    }
                    placeholder="Ej: Piso 1, Zona A"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewZoneInput(false);
                      setFormData({ ...formData, floor_zone: '' });
                    }}
                    className="w-full"
                  >
                    Cancelar - Seleccionar zona existente
                  </Button>
                </div>
              ) : (
                <>
                  <Select
                    value={formData.floor_zone}
                    onValueChange={(value) => {
                      if (value === '__create_new__') {
                        setShowNewZoneInput(true);
                        setFormData({ ...formData, floor_zone: '' });
                      } else {
                        setFormData({ ...formData, floor_zone: value });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una zona" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableZones.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone}
                        </SelectItem>
                      ))}
                      <SelectItem value="__create_new__">
                        <span className="flex items-center">
                          <Plus className="h-4 w-4 mr-2" />
                          Crear Nueva Zona
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.floor_zone && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Zona seleccionada: {formData.floor_zone}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Estado */}
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value: SpaceStatus) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notas de mantenimiento */}
            {(formData.status === 'maintenance' || formData.status === 'out_of_order') && (
              <div className="grid gap-2">
                <Label htmlFor="maintenance_notes">Notas de Mantenimiento</Label>
                <Textarea
                  id="maintenance_notes"
                  value={formData.maintenance_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, maintenance_notes: e.target.value })
                  }
                  placeholder="Describe el problema o mantenimiento requerido"
                  rows={3}
                />
              </div>
            )}
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
              {isSubmitting ? 'Guardando...' : space ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
