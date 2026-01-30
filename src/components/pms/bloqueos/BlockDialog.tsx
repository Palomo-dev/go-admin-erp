'use client';

import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ReservationBlock, BlockType, CreateBlockData } from '@/lib/services/reservationBlocksService';

interface Space {
  id: string;
  label: string;
  floor_zone?: string;
  space_types?: {
    name: string;
  };
}

interface SpaceType {
  id: string;
  name: string;
}

interface BlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: ReservationBlock | null;
  spaces: Space[];
  spaceTypes: SpaceType[];
  organizationId: number;
  branchId: number;
  onSave: (data: CreateBlockData) => Promise<void>;
}

const blockTypes: { value: BlockType; label: string }[] = [
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'owner', label: 'Uso del Propietario' },
  { value: 'event', label: 'Evento Privado' },
  { value: 'ota_hold', label: 'Hold OTA' },
  { value: 'other', label: 'Otro' },
];

export function BlockDialog({
  open,
  onOpenChange,
  block,
  spaces,
  spaceTypes,
  organizationId,
  branchId,
  onSave,
}: BlockDialogProps) {
  const [blockMode, setBlockMode] = useState<'space' | 'type'>('space');
  const [spaceId, setSpaceId] = useState<string>('');
  const [spaceTypeId, setSpaceTypeId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [blockType, setBlockType] = useState<BlockType>('maintenance');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (block) {
      setBlockMode(block.space_id ? 'space' : 'type');
      setSpaceId(block.space_id || '');
      setSpaceTypeId(block.space_type_id || '');
      setDateFrom(new Date(block.date_from));
      setDateTo(new Date(block.date_to));
      setBlockType(block.block_type);
      setReason(block.reason || '');
    } else {
      setBlockMode('space');
      setSpaceId('');
      setSpaceTypeId('');
      setDateFrom(new Date());
      setDateTo(new Date());
      setBlockType('maintenance');
      setReason('');
    }
  }, [block, open]);

  const handleSave = async () => {
    if (!dateFrom || !dateTo) return;
    if (blockMode === 'space' && !spaceId) return;
    if (blockMode === 'type' && !spaceTypeId) return;

    setIsSaving(true);
    try {
      await onSave({
        organization_id: organizationId,
        branch_id: branchId,
        space_id: blockMode === 'space' ? spaceId : null,
        space_type_id: blockMode === 'type' ? spaceTypeId : null,
        date_from: format(dateFrom, 'yyyy-MM-dd'),
        date_to: format(dateTo, 'yyyy-MM-dd'),
        block_type: blockType,
        reason: reason || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando bloqueo:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {block ? 'Editar Bloqueo' : 'Nuevo Bloqueo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Modo de bloqueo */}
          <div className="space-y-2">
            <Label>Tipo de Bloqueo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={blockMode === 'space' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setBlockMode('space')}
              >
                Espacio Específico
              </Button>
              <Button
                type="button"
                variant={blockMode === 'type' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setBlockMode('type')}
              >
                Tipo de Espacio
              </Button>
            </div>
          </div>

          {/* Selector de espacio o tipo */}
          {blockMode === 'space' ? (
            <div className="space-y-2">
              <Label>Espacio</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar espacio" />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.label} - {space.space_types?.name}
                      {space.floor_zone && ` (${space.floor_zone})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Tipo de Espacio (bloquea todos)</Label>
              <Select value={spaceTypeId} onValueChange={setSpaceTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {spaceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha Inicio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Seleccionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Fecha Fin</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Seleccionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    locale={es}
                    disabled={(date) => dateFrom ? date < dateFrom : false}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Razón del bloqueo */}
          <div className="space-y-2">
            <Label>Razón del Bloqueo</Label>
            <Select value={blockType} onValueChange={(v) => setBlockType(v as BlockType)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar razón" />
              </SelectTrigger>
              <SelectContent>
                {blockTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label>Descripción (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe el motivo del bloqueo..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !dateFrom || !dateTo || (blockMode === 'space' ? !spaceId : !spaceTypeId)}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {block ? 'Guardar Cambios' : 'Crear Bloqueo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
