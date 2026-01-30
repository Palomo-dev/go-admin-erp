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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Group } from '@/lib/services/groupReservationsService';

interface GroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: Group | null;
  onSave: (data: {
    name: string;
    company?: string;
    pickupDate?: string;
    releaseDate?: string;
    roomNights?: number;
  }) => Promise<void>;
}

export function GroupDialog({ open, onOpenChange, group, onSave }: GroupDialogProps) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [pickupDate, setPickupDate] = useState<Date | undefined>();
  const [releaseDate, setReleaseDate] = useState<Date | undefined>();
  const [roomNights, setRoomNights] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setCompany(group.company || '');
      setPickupDate(group.pickupDate ? new Date(group.pickupDate) : undefined);
      setReleaseDate(group.releaseDate ? new Date(group.releaseDate) : undefined);
      setRoomNights(group.roomNights?.toString() || '');
    } else {
      setName('');
      setCompany('');
      setPickupDate(undefined);
      setReleaseDate(undefined);
      setRoomNights('');
    }
  }, [group, open]);

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        company: company.trim() || undefined,
        pickupDate: pickupDate ? format(pickupDate, 'yyyy-MM-dd') : undefined,
        releaseDate: releaseDate ? format(releaseDate, 'yyyy-MM-dd') : undefined,
        roomNights: roomNights ? parseInt(roomNights) : undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {group ? 'Editar Grupo' : 'Nuevo Grupo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del grupo *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Congreso 2024"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Empresa / Organización</Label>
            <Input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Ej: ACME Corp"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha de Pickup</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {pickupDate ? format(pickupDate, 'dd/MM/yyyy') : 'Seleccionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={pickupDate}
                    onSelect={setPickupDate}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Fecha de Release</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {releaseDate ? format(releaseDate, 'dd/MM/yyyy') : 'Seleccionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={releaseDate}
                    onSelect={setReleaseDate}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="roomNights">Room Nights contratados</Label>
            <Input
              id="roomNights"
              type="number"
              value={roomNights}
              onChange={(e) => setRoomNights(e.target.value)}
              placeholder="Ej: 50"
              min="0"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {group ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
