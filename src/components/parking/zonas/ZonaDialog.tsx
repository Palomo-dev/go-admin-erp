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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, MapPin } from 'lucide-react';
import { ParkingZone } from './types';

interface ZonaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: ParkingZone | null;
  onSave: (data: Partial<ParkingZone>) => Promise<void>;
}

export function ZonaDialog({
  open,
  onOpenChange,
  zone,
  onSave,
}: ZonaDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState(10);
  const [rateMultiplier, setRateMultiplier] = useState(1);
  const [isCovered, setIsCovered] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!zone;

  useEffect(() => {
    if (zone) {
      setName(zone.name);
      setDescription(zone.description || '');
      setCapacity(zone.capacity);
      setRateMultiplier(zone.rate_multiplier);
      setIsCovered(zone.is_covered);
      setIsVip(zone.is_vip);
      setIsActive(zone.is_active);
    } else {
      setName('');
      setDescription('');
      setCapacity(10);
      setRateMultiplier(1);
      setIsCovered(false);
      setIsVip(false);
      setIsActive(true);
    }
  }, [zone, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        id: zone?.id,
        name: name.trim(),
        description: description.trim() || null,
        capacity,
        rate_multiplier: rateMultiplier,
        is_covered: isCovered,
        is_vip: isVip,
        is_active: isActive,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Zona' : 'Nueva Zona'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Zona A, Nivel 1, VIP"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción opcional de la zona..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacidad</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Multiplicador Tarifa</Label>
              <Input
                id="rate"
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={rateMultiplier}
                onChange={(e) => setRateMultiplier(parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Zona Cubierta</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  La zona tiene techo o protección
                </p>
              </div>
              <Switch checked={isCovered} onCheckedChange={setIsCovered} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Zona VIP</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Zona premium con beneficios especiales
                </p>
              </div>
              <Switch checked={isVip} onCheckedChange={setIsVip} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Activa</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  La zona está disponible para uso
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
