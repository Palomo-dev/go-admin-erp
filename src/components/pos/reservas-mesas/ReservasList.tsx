'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import {
  MoreVertical,
  Users,
  Clock,
  Phone,
  Mail,
  MapPin,
  Edit,
  Trash2,
  CheckCircle,
  UserCheck,
  XCircle,
  AlertTriangle,
  CalendarRange,
} from 'lucide-react';
import {
  RESERVATION_STATUS_LABELS,
  RESERVATION_SOURCE_LABELS,
  type RestaurantReservation,
  type ReservationStatus,
} from './reservasMesasService';

interface ReservasListProps {
  reservations: RestaurantReservation[];
  isLoading: boolean;
  onEdit: (reservation: RestaurantReservation) => void;
  onChangeStatus: (id: string, status: ReservationStatus, reason?: string) => void;
  onDelete: (id: string) => void;
}

function getStatusBadgeClasses(status: ReservationStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'confirmed':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'seated':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'no_show':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function ReservasList({
  reservations,
  isLoading,
  onEdit,
  onChangeStatus,
  onDelete,
}: ReservasListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <div className="p-4 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  if (reservations.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="p-12 text-center">
          <CalendarRange className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            No hay reservas para mostrar
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Crea una nueva reserva o ajusta los filtros
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {reservations.map((r) => (
          <Card
            key={r.id}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Info principal */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                      {r.customer_name}
                    </span>
                    <Badge className={getStatusBadgeClasses(r.status)}>
                      {RESERVATION_STATUS_LABELS[r.status]}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">
                      {RESERVATION_SOURCE_LABELS[r.source]}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(r.reservation_date)} · {formatTime(r.reservation_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {r.party_size} {r.party_size === 1 ? 'persona' : 'personas'}
                    </span>
                    {r.restaurant_table && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {r.restaurant_table.name}
                        {r.restaurant_table.zone && ` (${r.restaurant_table.zone})`}
                      </span>
                    )}
                    {r.customer_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {r.customer_phone}
                      </span>
                    )}
                    {r.customer_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {r.customer_email}
                      </span>
                    )}
                  </div>

                  {(r.notes || r.special_requests) && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 italic truncate">
                      {r.special_requests || r.notes}
                    </p>
                  )}
                </div>

                {/* Acciones */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                    <DropdownMenuItem onClick={() => onEdit(r)} className="dark:hover:bg-gray-700">
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="dark:border-gray-700" />

                    {r.status === 'pending' && (
                      <DropdownMenuItem
                        onClick={() => onChangeStatus(r.id, 'confirmed')}
                        className="dark:hover:bg-gray-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2 text-blue-500" />
                        Confirmar
                      </DropdownMenuItem>
                    )}

                    {['pending', 'confirmed'].includes(r.status) && (
                      <DropdownMenuItem
                        onClick={() => onChangeStatus(r.id, 'seated')}
                        className="dark:hover:bg-gray-700"
                      >
                        <UserCheck className="h-4 w-4 mr-2 text-indigo-500" />
                        Marcar como sentada
                      </DropdownMenuItem>
                    )}

                    {r.status === 'seated' && (
                      <DropdownMenuItem
                        onClick={() => onChangeStatus(r.id, 'completed')}
                        className="dark:hover:bg-gray-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                        Completar
                      </DropdownMenuItem>
                    )}

                    {!['completed', 'cancelled', 'no_show'].includes(r.status) && (
                      <>
                        <DropdownMenuItem
                          onClick={() => onChangeStatus(r.id, 'cancelled')}
                          className="dark:hover:bg-gray-700"
                        >
                          <XCircle className="h-4 w-4 mr-2 text-red-500" />
                          Cancelar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onChangeStatus(r.id, 'no_show')}
                          className="dark:hover:bg-gray-700"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2 text-orange-500" />
                          No se presentó
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuSeparator className="dark:border-gray-700" />

                    <DropdownMenuItem
                      onClick={() => setDeleteId(r.id)}
                      className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-100">
              ¿Eliminar reserva?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. La reserva será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
