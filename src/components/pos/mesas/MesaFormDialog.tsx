'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import type { RestaurantTable, MesaFormData } from './types';

interface MesaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: MesaFormData) => Promise<void>;
  mesa?: RestaurantTable | null;
  zonas: string[];
}

export function MesaFormDialog({
  open,
  onOpenChange,
  onSubmit,
  mesa,
  zonas,
}: MesaFormDialogProps) {
  const [formData, setFormData] = useState<MesaFormData>({
    name: '',
    zone: '',
    capacity: 4,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nuevaZona, setNuevaZona] = useState('');
  const [mostrarNuevaZona, setMostrarNuevaZona] = useState(false);

  useEffect(() => {
    if (mesa) {
      setFormData({
        name: mesa.name,
        // Convertir null o vacío a "sin-zona" para el select
        zone: mesa.zone || 'sin-zona',
        capacity: mesa.capacity,
        position_x: mesa.position_x || undefined,
        position_y: mesa.position_y || undefined,
      });
    } else {
      setFormData({
        name: '',
        zone: 'sin-zona',
        capacity: 4,
      });
    }
    setNuevaZona('');
    setMostrarNuevaZona(false);
  }, [mesa, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const zoneValue = mostrarNuevaZona ? nuevaZona : formData.zone;
      const dataToSubmit = {
        ...formData,
        // Convertir "sin-zona" a string vacío para la BD
        zone: zoneValue === 'sin-zona' ? '' : zoneValue,
      };
      await onSubmit(dataToSubmit);
      onOpenChange(false);
    } catch (error) {
      console.error('Error en formulario:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mesa ? 'Editar Mesa' : 'Nueva Mesa'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de Mesa *</Label>
            <Input
              id="name"
              placeholder="Ej: Mesa 1, Mesa VIP"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          {/* Zona */}
          <div className="space-y-2">
            <Label htmlFor="zone">Zona</Label>
            {!mostrarNuevaZona ? (
              <div className="flex gap-2">
                <Select
                  value={formData.zone}
                  onValueChange={(value) => {
                    if (value === 'nueva') {
                      setMostrarNuevaZona(true);
                    } else {
                      setFormData({ ...formData, zone: value });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar zona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sin-zona">Sin zona</SelectItem>
                    {zonas.map((zona) => (
                      <SelectItem key={zona} value={zona}>
                        {zona}
                      </SelectItem>
                    ))}
                    <SelectItem value="nueva">+ Nueva zona</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre de nueva zona"
                  value={nuevaZona}
                  onChange={(e) => setNuevaZona(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMostrarNuevaZona(false);
                    setNuevaZona('');
                  }}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          {/* Capacidad */}
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacidad *</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              max="50"
              value={formData.capacity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  capacity: parseInt(e.target.value) || 4,
                })
              }
              required
            />
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
              {isSubmitting ? 'Guardando...' : mesa ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
