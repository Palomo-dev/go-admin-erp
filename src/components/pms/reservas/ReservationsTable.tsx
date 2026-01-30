'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Eye, 
  Edit, 
  LogIn, 
  LogOut, 
  XCircle, 
  MoreVertical,
  Calendar,
  User,
  DoorOpen
} from 'lucide-react';
import { type ReservationListItem } from '@/lib/services/reservationListService';

interface ReservationsTableProps {
  reservations: ReservationListItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  onCancel: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  tentative: { label: 'Tentativa', variant: 'outline' },
  confirmed: { label: 'Confirmada', variant: 'default' },
  checked_in: { label: 'Check-in', variant: 'secondary' },
  checked_out: { label: 'Check-out', variant: 'secondary' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'destructive' },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
  direct: { label: 'Directo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  booking: { label: 'Booking', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  airbnb: { label: 'Airbnb', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  expedia: { label: 'Expedia', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
  other: { label: 'Otro', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
};

export function ReservationsTable({
  reservations,
  selectedIds,
  onSelectionChange,
  onView,
  onEdit,
  onCheckIn,
  onCheckOut,
  onCancel,
}: ReservationsTableProps) {
  const allSelected = reservations.length > 0 && reservations.every((r) => selectedIds.has(r.id));
  const someSelected = reservations.some((r) => selectedIds.has(r.id)) && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(reservations.map((r) => r.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    onSelectionChange(newSelection);
  };
  const formatDate = (dateString: string) => {
    // Agregar hora para evitar problemas de zona horaria
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const canCheckIn = (status: string) => status === 'confirmed';
  const canCheckOut = (status: string) => status === 'checked_in';
  const canCancel = (status: string) => ['tentative', 'confirmed'].includes(status);

  return (
    <div className="rounded-md border dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                ref={(el) => {
                  if (el) (el as any).indeterminate = someSelected;
                }}
                onCheckedChange={handleSelectAll}
                aria-label="Seleccionar todas"
              />
            </TableHead>
            <TableHead className="font-semibold">Código</TableHead>
            <TableHead className="font-semibold">Huésped</TableHead>
            <TableHead className="font-semibold">Fechas</TableHead>
            <TableHead className="font-semibold">Espacios</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold">Canal</TableHead>
            <TableHead className="font-semibold text-right">Total</TableHead>
            <TableHead className="font-semibold text-right">Saldo</TableHead>
            <TableHead className="font-semibold text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8 text-gray-500 dark:text-gray-400">
                No se encontraron reservas
              </TableCell>
            </TableRow>
          ) : (
            reservations.map((reservation) => (
              <TableRow
                key={reservation.id}
                className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                  selectedIds.has(reservation.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                }`}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(reservation.id)}
                    onCheckedChange={() => handleSelectOne(reservation.id)}
                    aria-label={`Seleccionar reserva ${reservation.code}`}
                  />
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => onView(reservation.id)}
                    className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {reservation.code}
                  </button>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {reservation.customer_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {reservation.customer_email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDate(reservation.checkin)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {reservation.nights} noche{reservation.nights !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {reservation.space_types.join(', ') || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {reservation.spaces.length} espacio{reservation.spaces.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <Badge variant={STATUS_CONFIG[reservation.status]?.variant || 'default'}>
                    {STATUS_CONFIG[reservation.status]?.label || reservation.status}
                  </Badge>
                </TableCell>
                
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    CHANNEL_CONFIG[reservation.channel]?.color || CHANNEL_CONFIG.other.color
                  }`}>
                    {CHANNEL_CONFIG[reservation.channel]?.label || reservation.channel}
                  </span>
                </TableCell>
                
                <TableCell className="text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(reservation.total_estimated)}
                </TableCell>
                
                <TableCell className="text-right">
                  <span className={`font-semibold ${
                    reservation.balance > 0 
                      ? 'text-orange-600 dark:text-orange-400' 
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    {formatCurrency(reservation.balance)}
                  </span>
                </TableCell>
                
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem onClick={() => onView(reservation.id)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver detalles
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem onClick={() => onEdit(reservation.id)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      {canCheckIn(reservation.status) && (
                        <DropdownMenuItem 
                          onClick={() => onCheckIn(reservation.id)}
                          className="text-green-600 dark:text-green-400"
                        >
                          <LogIn className="mr-2 h-4 w-4" />
                          Check-in
                        </DropdownMenuItem>
                      )}
                      
                      {canCheckOut(reservation.status) && (
                        <DropdownMenuItem 
                          onClick={() => onCheckOut(reservation.id)}
                          className="text-blue-600 dark:text-blue-400"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Check-out
                        </DropdownMenuItem>
                      )}
                      
                      {canCancel(reservation.status) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => onCancel(reservation.id)}
                            className="text-red-600 dark:text-red-400"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancelar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
