'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  User,
  X,
  Printer,
  DollarSign,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ShipmentPagination } from './ShipmentPagination';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';
import { SHIPMENT_STATUSES } from './shipmentStatuses';

interface ShipmentsListProps {
  shipments: ShipmentWithDetails[];
  isLoading: boolean;
  onEdit: (shipment: ShipmentWithDetails) => void;
  onStatusChange: (shipment: ShipmentWithDetails, status: string) => void;
  onPrintLabel: (shipment: ShipmentWithDetails) => void;
  onCancel: (shipment: ShipmentWithDetails) => void;
  onDuplicate?: (shipment: ShipmentWithDetails) => void;
  onMarkReturned?: (shipment: ShipmentWithDetails) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onBulkAssignDriver?: () => void;
  onBulkStatusChange?: (status: string) => void;
  onBulkCancel?: () => void;
  onBulkMarkReturned?: () => void;
  onBulkPrintLabels?: () => void;
  onBulkMarkPaid?: () => void;
  onBulkAddIncident?: () => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  package: <Package className="h-3 w-3" />,
  truck: <Truck className="h-3 w-3" />,
  check: <CheckCircle className="h-3 w-3" />,
  x: <XCircle className="h-3 w-3" />,
  rotate: <RotateCcw className="h-3 w-3" />,
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = Object.fromEntries(
  Object.entries(SHIPMENT_STATUSES).map(([key, config]) => [
    key,
    { label: config.label, color: config.color, icon: STATUS_ICONS[config.icon] || <Package className="h-3 w-3" /> },
  ])
);

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
  selectedIds,
  onSelectionChange,
  onBulkAssignDriver,
  onBulkStatusChange,
  onBulkCancel,
  onBulkMarkReturned,
  onBulkPrintLabels,
  onBulkMarkPaid,
  onBulkAddIncident,
  page = 1,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
}: ShipmentsListProps) {
  const router = useRouter();
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [showSelectMenu, setShowSelectMenu] = useState(false);
  const selected = selectedIds ?? internalSelected;
  const setSelected = (ids: Set<string>) => {
    if (onSelectionChange) onSelectionChange(ids);
    else setInternalSelected(ids);
  };

  const totalPages = Math.ceil(shipments.length / pageSize);
  const currentPage = Math.min(page, totalPages || 1);
  const paginatedShipments = shipments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const pageIds = paginatedShipments.map((s) => s.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectPage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      pageIds.forEach((id) => next.delete(id));
    } else {
      pageIds.forEach((id) => next.add(id));
    }
    setSelected(next);
  };

  const selectAllShipments = () => {
    setSelected(new Set(shipments.map((s) => s.id)));
    setShowSelectMenu(false);
  };

  const clearSelection = () => setSelected(new Set());

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
    <>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-blue-50 dark:bg-blue-950/30 px-4 py-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selected.size} envío{selected.size > 1 ? 's' : ''} seleccionado{selected.size > 1 ? 's' : ''}
            </span>
            {onBulkAssignDriver && (
              <Button size="sm" variant="outline" onClick={onBulkAssignDriver} className="border-blue-500 text-blue-600">
                <User className="h-4 w-4 mr-1" />
                Asignar Conductor
              </Button>
            )}
            {onBulkStatusChange && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Package className="h-4 w-4 mr-1" />
                    Cambiar Estado
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onBulkStatusChange('pending')}>Pendiente</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkStatusChange('assigned')}>Asignado</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkStatusChange('dispatched')}>Despachado</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkStatusChange('in_transit')}>En Tránsito</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkStatusChange('out_for_delivery')}>En Entrega</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkStatusChange('delivered')}>Entregado</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onBulkMarkPaid && (
              <Button size="sm" variant="outline" onClick={onBulkMarkPaid} className="border-green-500 text-green-600">
                <DollarSign className="h-4 w-4 mr-1" />
                Marcar Pagado
              </Button>
            )}
            {onBulkMarkReturned && (
              <Button size="sm" variant="outline" onClick={onBulkMarkReturned} className="border-orange-500 text-orange-600">
                <RotateCcw className="h-4 w-4 mr-1" />
                Devolución
              </Button>
            )}
            {onBulkPrintLabels && (
              <Button size="sm" variant="outline" onClick={onBulkPrintLabels}>
                <Printer className="h-4 w-4 mr-1" />
                Imprimir Etiquetas
              </Button>
            )}
            {onBulkAddIncident && (
              <Button size="sm" variant="outline" onClick={onBulkAddIncident} className="border-yellow-500 text-yellow-600">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Incidentes
              </Button>
            )}
            {onBulkCancel && (
              <Button size="sm" variant="outline" onClick={onBulkCancel} className="border-red-500 text-red-600">
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="text-gray-500">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 relative">
              <div className="flex items-center gap-1">
                <Checkbox
                  checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleSelectPage}
                />
                <DropdownMenu open={showSelectMenu} onOpenChange={setShowSelectMenu}>
                  <DropdownMenuTrigger asChild>
                    <button className="ml-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={toggleSelectPage}>
                      Seleccionar {pageSize} de esta página
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={selectAllShipments}>
                      Seleccionar todos los envíos ({shipments.length})
                    </DropdownMenuItem>
                    {selected.size > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { clearSelection(); setShowSelectMenu(false); }}>
                          Limpiar selección
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableHead>
            <TableHead>Tracking</TableHead>
            <TableHead>Remitente</TableHead>
            <TableHead>Destinatario</TableHead>
            <TableHead>Tramo</TableHead>
            <TableHead>Conductor</TableHead>
            <TableHead>Peso</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedShipments.map((shipment) => {
            const status = STATUS_CONFIG[shipment.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
            const payment = PAYMENT_CONFIG[shipment.payment_status as keyof typeof PAYMENT_CONFIG] || PAYMENT_CONFIG.pending;

            return (
              <TableRow
                key={shipment.id}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => router.push(`/app/transporte/envios/${shipment.id}`)}
              >
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(shipment.id)}
                    onCheckedChange={() => toggleSelect(shipment.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <span className="text-blue-600 dark:text-blue-400">{shipment.tracking_number}</span>
                  </div>
                  {shipment.shipment_number && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Envío: {shipment.shipment_number}
                    </p>
                  )}
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
                    <p>{shipment.origin_stop?.name || shipment.sender_name || 'Sucursal'}</p>
                    <p className="text-gray-500">→ {shipment.destination_stop?.name || shipment.delivery_address || shipment.receiver_name || '-'}</p>
                    {shipment.delivery_city && !shipment.destination_stop && (
                      <p className="text-gray-400 text-xs">{shipment.delivery_city}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {shipment.driver_name ? (
                    <div className="flex items-center gap-1 text-sm">
                      <User className="h-3 w-3 text-gray-400" />
                      <span>{shipment.driver_name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Sin asignar</span>
                  )}
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
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'assigned')}>
                          <Package className="h-4 w-4 mr-2 text-cyan-600" />
                          Marcar Asignado
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'assigned' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'dispatched')}>
                          <Truck className="h-4 w-4 mr-2 text-indigo-600" />
                          Despachar
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'dispatched' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'in_transit')}>
                          <Truck className="h-4 w-4 mr-2 text-purple-600" />
                          En Tránsito
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'in_transit' && (
                        <DropdownMenuItem onClick={() => onStatusChange(shipment, 'out_for_delivery')}>
                          <MapPin className="h-4 w-4 mr-2 text-orange-600" />
                          En Entrega
                        </DropdownMenuItem>
                      )}
                      {shipment.status === 'out_for_delivery' && (
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
        {onPageChange && onPageSizeChange && (
          <ShipmentPagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={shipments.length}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
    </Card>
    </>
  );
}
