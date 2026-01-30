'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tag,
  Package,
  Printer,
  Download,
  Copy,
  RefreshCw,
  MoreVertical,
  Truck,
  Ban,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LabelWithDetails } from '@/lib/services/labelsService';

interface LabelCardProps {
  label: LabelWithDetails;
  onView: (label: LabelWithDetails) => void;
  onPrint: (label: LabelWithDetails) => void;
  onDownload: (label: LabelWithDetails) => void;
  onDuplicate: (label: LabelWithDetails) => void;
  onRegenerate: (label: LabelWithDetails) => void;
  onVoid: (label: LabelWithDetails) => void;
}

export function LabelCard({
  label,
  onView,
  onPrint,
  onDownload,
  onDuplicate,
  onRegenerate,
  onVoid,
}: LabelCardProps) {
  const getStatusBadge = () => {
    if (label.is_void) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Anulada
        </Badge>
      );
    }
    if (label.is_printed) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Impresa ({label.print_count})
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Pendiente
      </Badge>
    );
  };

  const getTypeBadge = () => {
    const types: Record<string, { label: string; color: string }> = {
      shipping: { label: 'Envío', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      return: { label: 'Devolución', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
      customs: { label: 'Aduanas', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    };
    const type = types[label.label_type] || types.shipping;
    return <Badge className={type.color}>{type.label}</Badge>;
  };

  return (
    <Card className={`p-4 ${label.is_void ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Icono y número */}
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${label.is_void ? 'bg-gray-100 dark:bg-gray-800' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <Tag className={`h-5 w-5 ${label.is_void ? 'text-gray-400' : 'text-blue-600 dark:text-blue-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 dark:text-white">
                {label.label_number}
              </p>
              {getTypeBadge()}
              {getStatusBadge()}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Formato: {label.format?.toUpperCase()} • {label.width_mm}x{label.height_mm}mm
            </p>
          </div>
        </div>

        {/* Menú de acciones */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(label)}>
              <Eye className="h-4 w-4 mr-2" />
              Ver detalles
            </DropdownMenuItem>
            {!label.is_void && (
              <>
                <DropdownMenuItem onClick={() => onPrint(label)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(label)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDuplicate(label)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRegenerate(label)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-generar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onVoid(label)} className="text-red-600">
                  <Ban className="h-4 w-4 mr-2" />
                  Anular
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Info del envío */}
      {label.shipments && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-gray-400" />
            <span className="font-medium">{label.shipments.shipment_number}</span>
            {label.shipments.tracking_number && (
              <span className="text-gray-500">• {label.shipments.tracking_number}</span>
            )}
          </div>
          {label.shipments.delivery_contact_name && (
            <p className="text-sm text-gray-500 mt-1 ml-6">
              {label.shipments.delivery_contact_name}
              {label.shipments.delivery_city && ` - ${label.shipments.delivery_city}`}
            </p>
          )}
        </div>
      )}

      {/* Info del carrier */}
      {label.transport_carriers && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4 text-gray-400" />
          <span className="text-gray-600 dark:text-gray-400">
            {label.transport_carriers.name}
          </span>
          {label.carrier_tracking && (
            <Badge variant="outline" className="text-xs">
              {label.carrier_tracking}
            </Badge>
          )}
        </div>
      )}

      {/* Footer con fecha y acciones rápidas */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Creada: {format(new Date(label.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
        </p>
        {!label.is_void && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPrint(label)}
              className="h-7 px-2"
            >
              <Printer className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDownload(label)}
              className="h-7 px-2"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Razón de anulación */}
      {label.is_void && label.void_reason && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
          Razón: {label.void_reason}
        </div>
      )}
    </Card>
  );
}

export default LabelCard;
