'use client';

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MoreVertical,
  Edit,
  Copy,
  ToggleLeft,
  ToggleRight,
  Trash2,
  QrCode,
  MapPin,
  Smartphone,
  Fingerprint,
  CreditCard,
  RefreshCw,
  Cpu,
  Monitor,
} from 'lucide-react';
import type { TimeClock } from '@/lib/services/timeClocksService';

interface DeviceTableProps {
  devices: TimeClock[];
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onRegenerateQr: (id: string) => void;
  onOpenFullscreen?: (id: string) => void;
  isLoading?: boolean;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof QrCode; color: string }> = {
  qr_dynamic: { label: 'Código QR', icon: QrCode, color: 'text-blue-600' },
  qr_static: { label: 'QR Estático', icon: QrCode, color: 'text-cyan-600' },
  app: { label: 'App Móvil', icon: Smartphone, color: 'text-green-600' },
  biometric: { label: 'Biométrico', icon: Fingerprint, color: 'text-purple-600' },
  nfc: { label: 'NFC', icon: CreditCard, color: 'text-orange-600' },
  rfid: { label: 'RFID', icon: CreditCard, color: 'text-amber-600' },
  manual: { label: 'Manual', icon: Smartphone, color: 'text-gray-600' },
};

export function DeviceTable({
  devices,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  onRegenerateQr,
  onOpenFullscreen,
  isLoading,
}: DeviceTableProps) {
  const isQrExpired = (device: TimeClock) => {
    if (!device.qr_token_expires_at) return true;
    return new Date(device.qr_token_expires_at) < new Date();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Cpu className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay dispositivos registrados</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Sede</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Geofence</TableHead>
              <TableHead className="text-center">QR</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => {
              const typeConfig = TYPE_CONFIG[device.type] || TYPE_CONFIG.manual;
              const TypeIcon = typeConfig.icon;

              return (
                <TableRow
                  key={device.id}
                  className={!device.is_active ? 'opacity-60' : ''}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {device.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {device.code ? (
                      <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {device.code}
                      </code>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {typeConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {device.branch_name || 'Sin asignar'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {device.location_description || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {device.geo_fence ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`gap-1 ${
                              device.require_geo_validation
                                ? 'border-green-200 text-green-700 dark:border-green-800 dark:text-green-400'
                                : 'border-gray-200 text-gray-500'
                            }`}
                          >
                            <MapPin className="h-3 w-3" />
                            {device.geo_fence.radius}m
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            Lat: {device.geo_fence.lat.toFixed(6)}, Lng:{' '}
                            {device.geo_fence.lng.toFixed(6)}
                          </p>
                          <p>Radio: {device.geo_fence.radius} metros</p>
                          <p>
                            Validación:{' '}
                            {device.require_geo_validation ? 'Requerida' : 'Opcional'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {(device.type === 'qr_dynamic' || device.type === 'qr_static') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRegenerateQr(device.id)}
                        className={`gap-1 ${
                          isQrExpired(device)
                            ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400'
                            : 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400'
                        }`}
                      >
                        <QrCode className="h-3 w-3" />
                        {device.current_qr_token
                          ? isQrExpired(device)
                            ? 'Expirado'
                            : 'Ver QR'
                          : 'Generar'}
                      </Button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={device.is_active ? 'default' : 'secondary'}
                      className={
                        device.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }
                    >
                      {device.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEdit(device.id)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicate(device.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        {(device.type === 'qr_dynamic' || device.type === 'qr_static') && (
                          <>
                            <DropdownMenuItem onClick={() => onRegenerateQr(device.id)}>
                              <QrCode className="h-4 w-4 mr-2" />
                              Ver Código QR
                            </DropdownMenuItem>
                            {onOpenFullscreen && (
                              <DropdownMenuItem onClick={() => onOpenFullscreen(device.id)}>
                                <Monitor className="h-4 w-4 mr-2" />
                                Pantalla Completa
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        <DropdownMenuItem onClick={() => onToggleActive(device.id)}>
                          {device.is_active ? (
                            <>
                              <ToggleLeft className="h-4 w-4 mr-2" />
                              Desactivar
                            </>
                          ) : (
                            <>
                              <ToggleRight className="h-4 w-4 mr-2" />
                              Activar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(device.id)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

export default DeviceTable;
