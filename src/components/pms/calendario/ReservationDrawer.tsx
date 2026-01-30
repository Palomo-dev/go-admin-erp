'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  Calendar as CalendarIcon,
  User,
  MapPin,
  LogIn,
  LogOut,
  Trash2,
  Save,
  X,
  Wrench,
  Sparkles,
  AlertTriangle,
  Clock,
  DollarSign,
  Users,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import type { TapeChartReservation, TapeChartSpace } from '@/lib/services/tapeChartService';

export interface ReservationDetails {
  id: string;
  code: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  spaceId: string;
  spaceLabel?: string;
  spaceName?: string;
  checkin: string;
  checkout: string;
  status: string;
  occupantCount?: number;
  totalEstimated?: number;
  notes?: string;
  actualCheckinAt?: string;
  actualCheckoutAt?: string;
}

interface ReservationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: ReservationDetails | null;
  spaces: TapeChartSpace[];
  onUpdate: (id: string, data: Partial<ReservationDetails>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCheckin: (id: string) => Promise<void>;
  onCheckout: (id: string) => Promise<void>;
  onCreateBlock: (spaceId: string, dateFrom: string, dateTo: string, blockType: string, reason: string) => Promise<void>;
}

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmada',
  tentative: 'Tentativa',
  checked_in: 'Check-in',
  checked_out: 'Check-out',
  cancelled: 'Cancelada',
  no_show: 'No Show',
};

const statusColors: Record<string, string> = {
  confirmed: 'bg-blue-500',
  tentative: 'bg-amber-500',
  checked_in: 'bg-green-500',
  checked_out: 'bg-gray-500',
  cancelled: 'bg-red-500',
  no_show: 'bg-red-600',
};

export function ReservationDrawer({
  open,
  onOpenChange,
  reservation,
  spaces,
  onUpdate,
  onDelete,
  onCheckin,
  onCheckout,
  onCreateBlock,
}: ReservationDrawerProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  
  // Form state
  const [checkin, setCheckin] = useState<Date | undefined>();
  const [checkout, setCheckout] = useState<Date | undefined>();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const [occupantCount, setOccupantCount] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  
  // Block form state
  const [blockType, setBlockType] = useState<string>('maintenance');
  const [blockReason, setBlockReason] = useState<string>('');

  useEffect(() => {
    if (reservation) {
      setCheckin(new Date(reservation.checkin + 'T00:00:00'));
      setCheckout(new Date(reservation.checkout + 'T00:00:00'));
      setSelectedSpaceId(reservation.spaceId);
      setOccupantCount(reservation.occupantCount || 1);
      setNotes(reservation.notes || '');
      setStatus(reservation.status);
      setIsEditing(false);
    }
  }, [reservation]);

  const handleSave = async () => {
    if (!reservation || !checkin || !checkout) return;
    
    setIsSaving(true);
    try {
      await onUpdate(reservation.id, {
        checkin: format(checkin, 'yyyy-MM-dd'),
        checkout: format(checkout, 'yyyy-MM-dd'),
        spaceId: selectedSpaceId,
        occupantCount,
        notes,
        status,
      });
      
      toast({
        title: 'Reserva actualizada',
        description: 'Los cambios se han guardado correctamente',
      });
      setIsEditing(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la reserva',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!reservation) return;
    
    try {
      await onDelete(reservation.id);
      toast({
        title: 'Reserva eliminada',
        description: 'La reserva ha sido eliminada correctamente',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la reserva',
        variant: 'destructive',
      });
    }
    setShowDeleteDialog(false);
  };

  const handleCheckin = async () => {
    if (!reservation) return;
    
    try {
      await onCheckin(reservation.id);
      toast({
        title: 'Check-in realizado',
        description: 'El huésped ha sido registrado correctamente',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo realizar el check-in',
        variant: 'destructive',
      });
    }
  };

  const handleCheckout = async () => {
    if (!reservation) return;
    
    try {
      await onCheckout(reservation.id);
      toast({
        title: 'Check-out realizado',
        description: 'El huésped ha sido dado de baja correctamente',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo realizar el check-out',
        variant: 'destructive',
      });
    }
  };

  const handleCreateBlock = async () => {
    if (!reservation) return;
    
    try {
      await onCreateBlock(
        reservation.spaceId,
        reservation.checkout,
        reservation.checkout,
        blockType,
        blockReason
      );
      toast({
        title: 'Bloqueo creado',
        description: `El espacio ha sido marcado para ${blockType === 'maintenance' ? 'mantenimiento' : blockType === 'cleaning' ? 'limpieza' : 'reparación'}`,
      });
      setShowBlockDialog(false);
      setBlockReason('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el bloqueo',
        variant: 'destructive',
      });
    }
  };

  if (!reservation) return null;

  const nights = checkin && checkout 
    ? Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const canCheckin = reservation.status === 'confirmed' || reservation.status === 'tentative';
  const canCheckout = reservation.status === 'checked_in';
  const canEdit = reservation.status !== 'checked_out' && reservation.status !== 'cancelled';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl">
                Reserva {reservation.code}
              </SheetTitle>
              <Badge className={cn('text-white', statusColors[reservation.status])}>
                {statusLabels[reservation.status] || reservation.status}
              </Badge>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Customer Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <User className="h-4 w-4" />
                Cliente
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="font-medium text-gray-900 dark:text-white">
                  {reservation.customerName}
                </p>
                {reservation.customerEmail && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {reservation.customerEmail}
                  </p>
                )}
                {reservation.customerPhone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {reservation.customerPhone}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Space and Dates */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Espacio y Fechas
              </h3>

              {/* Space Selection */}
              <div className="space-y-2">
                <Label>Espacio asignado</Label>
                {isEditing ? (
                  <Select value={selectedSpaceId} onValueChange={setSelectedSpaceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar espacio" />
                    </SelectTrigger>
                    <SelectContent>
                      {spaces.map((space) => (
                        <SelectItem key={space.id} value={space.id}>
                          {space.label} - {space.spaceTypeName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                    <p className="font-medium">
                      {spaces.find(s => s.id === reservation.spaceId)?.label || reservation.spaceName || 'Sin asignar'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {spaces.find(s => s.id === reservation.spaceId)?.spaceTypeName}
                    </p>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  {isEditing ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !checkin && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {checkin ? format(checkin, 'dd/MM/yyyy') : 'Seleccionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={checkin}
                          onSelect={setCheckin}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                      <p className="font-medium">
                        {format(new Date(reservation.checkin + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}
                      </p>
                      {reservation.actualCheckinAt && (
                        <p className="text-xs text-green-600">
                          Registrado: {format(new Date(reservation.actualCheckinAt), 'HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Check-out</Label>
                  {isEditing ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !checkout && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {checkout ? format(checkout, 'dd/MM/yyyy') : 'Seleccionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={checkout}
                          onSelect={setCheckout}
                          locale={es}
                          disabled={(date) => checkin ? date <= checkin : false}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                      <p className="font-medium">
                        {format(new Date(reservation.checkout + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}
                      </p>
                      {reservation.actualCheckoutAt && (
                        <p className="text-xs text-green-600">
                          Registrado: {format(new Date(reservation.actualCheckoutAt), 'HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Nights & Occupancy */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Noches
                  </Label>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                    <p className="font-medium">{nights} noche(s)</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Ocupantes
                  </Label>
                  {isEditing ? (
                    <Input
                      type="number"
                      min={1}
                      value={occupantCount}
                      onChange={(e) => setOccupantCount(parseInt(e.target.value) || 1)}
                    />
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                      <p className="font-medium">{reservation.occupantCount || 1} persona(s)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Total */}
              {reservation.totalEstimated && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Total estimado
                  </Label>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                    <p className="font-medium text-lg">
                      ${reservation.totalEstimated.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Status (when editing) */}
            {isEditing && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tentative">Tentativa</SelectItem>
                    <SelectItem value="confirmed">Confirmada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notas
              </Label>
              {isEditing ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales..."
                  rows={3}
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 min-h-[60px]">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {reservation.notes || 'Sin notas'}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Acciones
              </h3>

              {/* Check-in / Check-out */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canCheckin}
                  onClick={handleCheckin}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Check-in
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canCheckout}
                  onClick={handleCheckout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Check-out
                </Button>
              </div>

              {/* Maintenance / Cleaning */}
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setBlockType('cleaning');
                    setShowBlockDialog(true);
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  Limpieza
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setBlockType('maintenance');
                    setShowBlockDialog(true);
                  }}
                >
                  <Wrench className="h-4 w-4 mr-1" />
                  Mantenim.
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setBlockType('out_of_order');
                    setShowBlockDialog(true);
                  }}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Reparación
                </Button>
              </div>

              {/* Edit / Save / Delete */}
              <div className="flex gap-3 pt-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsEditing(false)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsEditing(true)}
                      disabled={!canEdit}
                    >
                      Editar reserva
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La reserva {reservation.code} será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockType === 'cleaning' && 'Marcar para limpieza'}
              {blockType === 'maintenance' && 'Marcar para mantenimiento'}
              {blockType === 'out_of_order' && 'Marcar para reparación'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se creará un bloqueo en el espacio después del check-out de esta reserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Razón (opcional)</Label>
            <Textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Describe el motivo del bloqueo..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateBlock}>
              Crear bloqueo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
