'use client';

import { useRouter } from 'next/navigation';
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
  Package,
  Truck,
  MapPin,
  CheckCircle,
  XCircle,
  RotateCcw,
  Tag,
  Phone,
  Copy,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';

interface ShipmentsListProps {
  shipments: ShipmentWithDetails[];
  isLoading: boolean;
  onEdit: (shipment: ShipmentWithDetails) => void;
  onStatusChange: (shipment: ShipmentWithDetails, status: string) => void;
  onPrintLabel: (shipment: ShipmentWithDetails) => void;
  onCancel: (shipment: ShipmentWithDetails) => void;
  onDuplicate?: (shipment: ShipmentWithDetails) => void;
  onMarkReturned?: (shipment: ShipmentWithDetails) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Package className="h-3 w-3" /> },
  received: { label: 'Recibido', color: 'bg-blue-100 text-blue-800', icon: <Package className="h-3 w-3" /> },
  in_transit: { label: 'En Tránsito', color: 'bg-purple-100 text-purple-800', icon: <Truck className="h-3 w-3" /> },
  arrived: { label: 'Llegó', color: 'bg-indigo-100 text-indigo-800', icon: <MapPin className="h-3 w-3" /> },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  returned: { label: 'Devuelto', color: 'bg-orange-100 text-orange-800', icon: <RotateCcw className="h-3 w-3" /> },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500', icon: <XCircle className="h-3 w-3" /> },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
  cod: { label: 'Contra entrega', color: 'bg-blue-100 text-blue-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export function ShipmentsList({
  shipments,
  isLoading,
  onEdit,
  onStatusChange,
  onPrintLabel,
  onCancel,
  onDuplicate,
  onMarkReturned,
}: ShipmentsListProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando envíos...</span>
        </div>
      </Card>
    );
  }

  if (shipments.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center">
          <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay envíos</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            No se encontraron envíos con los filtros aplicados.
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
            <TableHead>Tracking</TableHead>
            <TableHead>Remitente</TableHead>
            <TableHead>Destinatario</TableHead>
            <TableHead>Tramo</TableHead>
            <TableHead>Peso</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.map((shipment) => {
            const status = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.pending;
            const payment = PAYMENT_CONFIG[shipment.payment_status] || PAYMENT_CONFIG.pending;

            return (
              <TableRow
                key={shipment.id}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => router.push(`/app/transporte/envios/${shipment.id}`)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <span className="text-blue-600 dark:text-blue-400">{shipment.tracking_number}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {format(new Date(shipment.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                  </p>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{shipment.sender_name}</p>
                    {shipment.sender_phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {shipment.sender_phone}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{shipment.receiver_name}</p>
                    {shipment.receiver_phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {shipment.receiver_phone}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p>{shipment.origin_stop?.name || '-'}</p>
                    <p className="text-gray-500">→ {shipment.destination_stop?.name || '-'}</p>
                  </div>
                </TableCell>
                <TableCell>
                  {shipment.weight_kg ? `${shipment.weight_kg} kg` : '-'}
                </TableCell>
                <TableCell className="font-medium">
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: shipment.currency || 'COP',
                    minimumFractionDigits: 0,
                  }).format(shipment.total_cost || 0)}
                </TableCell>
                <TableCell>
                  <Badge className={`${status.color} flex items-center gap-1 w-fit`}>
                    {status.icon}
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={payment.color}>{payment.label}</Badge>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/app/transporte/envios/${shipment.id}`)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(shipment)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onPrintLabel(shipment)}>
                        <Tag className="h-4 w-4 mr-2" />
                        Imprimir etiqueta
                      </DropdownMenuItem>
                      {onDuplicate && (
                        <DropdownMenuItem onClick={() => onDuplicate(shipment)}>
                          <Copy className="h-4 w-4 mr-2 text-blue-600" />
                          Duplicar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {shipment.status === 'pending' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'received')}>
                          <Package className="h-4 w-4 mr-2 text-blue-600" />
                          Marcar Recibido
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'received' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'in_transit')}>
                          <Truck className="h-4 w-4 mr-2 text-purple-600" />
                          Despachar
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'in_transit' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'arrived')}>
                          <MapPin className="h-4 w-4 mr-2 text-indigo-600" />
                          Marcar Llegada
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'arrived' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'delivered')}>
                          <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                          Marcar Entregado
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {onMarkReturned && shipment.status !== 'cancelled' && shipment.status !== 'delivered' && shipment.status !== 'returned' && (
                        <DropdownMenuItem onClick={() => onMarkReturned(shipment)}>
                          <RotateCcw className="h-4 w-4 mr-2 text-orange-600" />
                          Marcar Devuelto
                        </DropdownMenuItem>
                      )}
                      {shipment.status !== 'cancelled' && shipment.status !== 'delivered' && (
                        <DropdownMenuItem onClick={() => onCancel(shipment)} className="text-red-600">
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
