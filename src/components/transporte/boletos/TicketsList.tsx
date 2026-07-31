'use client';

import { Card } from '@/components/ui/card';
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
  MoreVertical,
  Eye,
  Edit,
  UserCheck,
  UserX,
  XCircle,
  RefreshCw,
  QrCode,
  Ticket,
  Phone,
  Copy,
  Send,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TicketWithDetails } from '@/lib/services/ticketsService';

interface TicketsListProps {
  tickets: TicketWithDetails[];
  isLoading: boolean;
  onView: (ticket: TicketWithDetails) => void;
  onEdit: (ticket: TicketWithDetails) => void;
  onConfirm: (ticket: TicketWithDetails) => void;
  onBoard: (ticket: TicketWithDetails) => void;
  onNoShow: (ticket: TicketWithDetails) => void;
  onCancel: (ticket: TicketWithDetails) => void;
  onRefund: (ticket: TicketWithDetails) => void;
  onDuplicate?: (ticket: TicketWithDetails) => void;
  onResendQR?: (ticket: TicketWithDetails) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  reserved: { label: 'Reservado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  boarded: { label: 'Abordado', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  completed: { label: 'Completado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  no_show: { label: 'No Show', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
  partial: { label: 'Parcial', color: 'bg-orange-100 text-orange-800' },
  refunded: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export function TicketsList({
  tickets,
  isLoading,
  onView,
  onEdit,
  onConfirm,
  onBoard,
  onNoShow,
  onCancel,
  onRefund,
  onDuplicate,
  onResendQR,
}: TicketsListProps) {
  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando boletos...</span>
        </div>
      </Card>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center">
          <Ticket className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay boletos</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            No se encontraron boletos con los filtros aplicados.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Pasajero</TableHead>
            <TableHead>Viaje</TableHead>
            <TableHead>Asiento</TableHead>
            <TableHead>Tramo</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.reserved;
            const payment = PAYMENT_CONFIG[ticket.payment_status] || PAYMENT_CONFIG.pending;

            return (
              <TableRow key={ticket.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-gray-400" />
                    <span className="text-blue-600 dark:text-blue-400">{ticket.ticket_number}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {ticket.passenger_name || ticket.customers?.full_name || 'Sin nombre'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {ticket.passenger_doc && <span>{ticket.passenger_doc}</span>}
                      {ticket.passenger_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {ticket.passenger_phone}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{ticket.trips?.trip_code || '-'}</p>
                    <p className="text-xs text-gray-500">
                      {ticket.trips?.trip_date && format(new Date(ticket.trips.trip_date), 'dd/MM/yyyy', { locale: es })}
                      {ticket.trips?.scheduled_departure && ` ${format(new Date(ticket.trips.scheduled_departure), 'HH:mm')}`}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{ticket.seat_number || '-'}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p>{ticket.boarding_stop?.name || '-'}</p>
                    <p className="text-gray-500">→ {ticket.alighting_stop?.name || '-'}</p>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: ticket.currency || 'COP',
                    minimumFractionDigits: 0,
                  }).format(ticket.total || 0)}
                </TableCell>
                <TableCell>
                  <Badge className={status.color}>{status.label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={payment.color}>{payment.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView(ticket)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(ticket)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {ticket.status === 'reserved' && (
                        <DropdownMenuItem onClick={() => onConfirm(ticket)}>
                          <UserCheck className="h-4 w-4 mr-2 text-green-600" />
                          Confirmar
                        </DropdownMenuItem>
                      )}
                      {['reserved', 'confirmed'].includes(ticket.status) && (
                        <>
                          <DropdownMenuItem onClick={() => onBoard(ticket)}>
                            <UserCheck className="h-4 w-4 mr-2 text-purple-600" />
                            Marcar Abordado
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onNoShow(ticket)}>
                            <UserX className="h-4 w-4 mr-2 text-red-600" />
                            Marcar No Show
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      {onDuplicate && (
                        <DropdownMenuItem onClick={() => onDuplicate(ticket)}>
                          <Copy className="h-4 w-4 mr-2 text-blue-600" />
                          Duplicar
                        </DropdownMenuItem>
                      )}
                      {onResendQR && ticket.status !== 'cancelled' && (
                        <DropdownMenuItem onClick={() => onResendQR(ticket)}>
                          <Send className="h-4 w-4 mr-2 text-green-600" />
                          Re-enviar QR
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {ticket.payment_status === 'paid' && ticket.status !== 'cancelled' && (
                        <DropdownMenuItem onClick={() => onRefund(ticket)}>
                          <RefreshCw className="h-4 w-4 mr-2 text-orange-600" />
                          Reembolsar
                        </DropdownMenuItem>
                      )}
                      {ticket.status !== 'cancelled' && (
                        <DropdownMenuItem onClick={() => onCancel(ticket)} className="text-red-600">
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancelar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
