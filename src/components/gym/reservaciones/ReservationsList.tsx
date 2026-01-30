'use client';

import { Card, CardContent } from '@/components/ui/card';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Check, 
  X, 
  Trash2, 
  Eye, 
  MoreVertical, 
  Edit, 
  Copy, 
  UserCheck,
  Users,
  BookOpen
} from 'lucide-react';
import {
  ClassReservation,
  getReservationStatusColor,
  getReservationStatusLabel,
  getClassTypeLabel,
} from '@/lib/services/gymService';
import { formatDate } from '@/utils/Utils';

interface ReservationsListProps {
  reservations: ClassReservation[];
  onMarkAttendance: (reservation: ClassReservation, attended: boolean) => void;
  onCancel: (reservation: ClassReservation) => void;
  onViewClass: (reservation: ClassReservation) => void;
  onEdit?: (reservation: ClassReservation) => void;
  onDuplicate?: (reservation: ClassReservation) => void;
  onCheckIn?: (reservation: ClassReservation) => void;
  isLoading?: boolean;
}

export function ReservationsList({
  reservations,
  onMarkAttendance,
  onCancel,
  onViewClass,
  onEdit,
  onDuplicate,
  onCheckIn,
  isLoading,
}: ReservationsListProps) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  if (reservations.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BookOpen className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No hay reservaciones
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Clase</TableHead>
              <TableHead>Cupos</TableHead>
              <TableHead>Fecha/Hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((reservation) => {
              const gymClass = reservation.gym_classes;
              const capacity = gymClass?.capacity || 0;
              const reservedCount = gymClass?.reservations_count || 0;
              const availableSpots = capacity - reservedCount;
              
              return (
                <TableRow key={reservation.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {reservation.customers?.first_name} {reservation.customers?.last_name}
                      </p>
                      {reservation.customers?.email && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {reservation.customers.email}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {gymClass?.title}
                      </p>
                      {gymClass?.class_type && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {getClassTypeLabel(gymClass.class_type)}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className={`text-sm font-medium ${availableSpots <= 2 ? 'text-orange-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {reservedCount}/{capacity}
                      </span>
                      {availableSpots <= 0 && (
                        <Badge variant="destructive" className="text-xs ml-1">Lleno</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {gymClass && (
                      <div className="text-sm">
                        <p>{formatDate(gymClass.start_at)}</p>
                        <p className="text-gray-500 dark:text-gray-400">
                          {formatTime(gymClass.start_at)} - {formatTime(gymClass.end_at)}
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={getReservationStatusColor(reservation.status)}>
                      {getReservationStatusLabel(reservation.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {reservation.checkin_time ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <UserCheck className="h-4 w-4" />
                        <span className="text-xs">
                          {formatTime(reservation.checkin_time)}
                        </span>
                      </div>
                    ) : reservation.status === 'booked' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCheckIn?.(reservation)}
                        className="text-green-600 border-green-200 hover:bg-green-50 h-7 text-xs"
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        Check-in
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {reservation.status === 'booked' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onMarkAttendance(reservation, true)}
                            className="text-green-600 hover:text-green-700"
                            title="Marcar asistencia"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onMarkAttendance(reservation, false)}
                            className="text-orange-600 hover:text-orange-700"
                            title="Marcar no asistencia"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onViewClass(reservation)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Clase
                          </DropdownMenuItem>
                          {onEdit && reservation.status === 'booked' && (
                            <DropdownMenuItem onClick={() => onEdit(reservation)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {onDuplicate && (
                            <DropdownMenuItem onClick={() => onDuplicate(reservation)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                          )}
                          {reservation.status === 'booked' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => onCancel(reservation)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Cancelar
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
