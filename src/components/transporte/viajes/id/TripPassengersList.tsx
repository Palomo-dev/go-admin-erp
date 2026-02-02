'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreVertical,
  UserCheck,
  UserX,
  QrCode,
  Phone,
  Mail,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import type { TripTicket } from '@/lib/services/tripsService';

interface TripPassengersListProps {
  tickets: TripTicket[];
  isLoading: boolean;
  onBoard: (ticket: TripTicket) => void;
  onNoShow: (ticket: TripTicket) => void;
  onScanQR: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  reserved: {
    label: 'Reservado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  },
  confirmed: {
    label: 'Confirmado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  },
  boarded: {
    label: 'Abordado',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  },
  completed: {
    label: 'Completado',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  },
  no_show: {
    label: 'No Show',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
  partial: { label: 'Parcial', color: 'bg-orange-100 text-orange-800' },
  refunded: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export function TripPassengersList({
  tickets,
  isLoading,
  onBoard,
  onNoShow,
  onScanQR,
}: TripPassengersListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      ticket.ticket_number?.toLowerCase().includes(search) ||
      ticket.passenger_name?.toLowerCase().includes(search) ||
      ticket.passenger_doc?.toLowerCase().includes(search) ||
      ticket.seat_number?.toLowerCase().includes(search) ||
      ticket.customers?.full_name?.toLowerCase().includes(search)
    );
  });

  const stats = {
    total: tickets.length,
    boarded: tickets.filter((t) => t.status === 'boarded').length,
    pending: tickets.filter((t) => ['reserved', 'confirmed'].includes(t.status)).length,
    noShow: tickets.filter((t) => t.status === 'no_show').length,
  };

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando pasajeros...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="h-5 w-5" />
              Pasajeros
            </h3>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">{stats.boarded} abordados</Badge>
              <Badge variant="outline">{stats.pending} pendientes</Badge>
              {stats.noShow > 0 && (
                <Badge variant="outline" className="text-red-600">
                  {stats.noShow} no show
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar pasajero..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={onScanQR} className="bg-blue-600 hover:bg-blue-700">
              <QrCode className="h-4 w-4 mr-2" />
              Escanear QR
            </Button>
          </div>
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {tickets.length === 0
              ? 'No hay pasajeros registrados para este viaje'
              : 'No se encontraron pasajeros con los criterios de búsqueda'}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asiento</TableHead>
              <TableHead>Pasajero</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.map((ticket) => {
              const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.reserved;
              const payment = PAYMENT_CONFIG[ticket.payment_status] || PAYMENT_CONFIG.pending;

              return (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium">
                    {ticket.seat_number || '-'}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {ticket.passenger_name || ticket.customers?.full_name || 'Sin nombre'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {ticket.passenger_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {ticket.passenger_phone}
                          </span>
                        )}
                        {ticket.customers?.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {ticket.customers.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{ticket.passenger_doc || '-'}</TableCell>
                  <TableCell>
                    {ticket.boarding_stop?.name || '-'}
                  </TableCell>
                  <TableCell>
                    {ticket.alighting_stop?.name || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={status.color}>{status.label}</Badge>
                    {ticket.boarded_at && (
                      <p className="text-xs text-gray-500 mt-1">
                        {format(new Date(ticket.boarded_at), 'HH:mm')}
                      </p>
                    )}
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
                        {['reserved', 'confirmed'].includes(ticket.status) && (
                          <>
                            <DropdownMenuItem onClick={() => onBoard(ticket)}>
                              <UserCheck className="h-4 w-4 mr-2 text-green-600" />
                              Marcar Abordado
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onNoShow(ticket)}>
                              <UserX className="h-4 w-4 mr-2 text-red-600" />
                              Marcar No Show
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem>
                          <QrCode className="h-4 w-4 mr-2" />
                          Ver QR
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
