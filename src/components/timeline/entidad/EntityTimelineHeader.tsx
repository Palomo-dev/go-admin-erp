'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Package,
  Users,
  FileText,
  MessageSquare,
  Truck,
  CreditCard,
  Shield,
  Calendar,
  Building2,
} from 'lucide-react';

interface EntityTimelineHeaderProps {
  entityType: string;
  entityId: string;
  entityName?: string;
  totalEvents: number;
  onBack: () => void;
  onNavigateToEntity: () => void;
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  product: Package,
  products: Package,
  customer: Users,
  customers: Users,
  invoice: FileText,
  invoices: FileText,
  sale: CreditCard,
  sales: CreditCard,
  conversation: MessageSquare,
  conversations: MessageSquare,
  trip: Truck,
  trips: Truck,
  shipment: Truck,
  shipments: Truck,
  employee: Users,
  employees: Users,
  role: Shield,
  roles: Shield,
  reservation: Calendar,
  reservations: Calendar,
  branch: Building2,
  branches: Building2,
};

const ENTITY_LABELS: Record<string, string> = {
  product: 'Producto',
  products: 'Producto',
  customer: 'Cliente',
  customers: 'Cliente',
  invoice: 'Factura',
  invoices: 'Factura',
  sale: 'Venta',
  sales: 'Venta',
  conversation: 'Conversación',
  conversations: 'Conversación',
  trip: 'Viaje',
  trips: 'Viaje',
  shipment: 'Envío',
  shipments: 'Envío',
  employee: 'Empleado',
  employees: 'Empleado',
  role: 'Rol',
  roles: 'Rol',
  reservation: 'Reservación',
  reservations: 'Reservación',
  branch: 'Sucursal',
  branches: 'Sucursal',
};

const ENTITY_COLORS: Record<string, string> = {
  product: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  products: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  customer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  customers: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  invoice: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  invoices: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  sale: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  sales: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  conversation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  conversations: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  trip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  trips: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipment: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  shipments: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  employee: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  employees: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  role: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  roles: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function EntityTimelineHeader({
  entityType,
  entityId,
  entityName,
  totalEvents,
  onBack,
  onNavigateToEntity,
}: EntityTimelineHeaderProps) {
  const [copiedId, setCopiedId] = React.useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(entityId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const IconComponent = ENTITY_ICONS[entityType.toLowerCase()] || FileText;
  const entityLabel = ENTITY_LABELS[entityType.toLowerCase()] || entityType;
  const entityColor = ENTITY_COLORS[entityType.toLowerCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Navegación */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Timeline
          </Button>
        </div>

        {/* Contenido principal */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Icono de entidad */}
            <div className={cn('p-3 rounded-lg', entityColor)}>
              <IconComponent className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              {/* Badge de tipo */}
              <Badge variant="secondary" className={cn('text-sm font-medium', entityColor)}>
                {entityLabel}
              </Badge>

              {/* Título */}
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {entityName || `${entityLabel} ${entityId.substring(0, 8)}...`}
              </h1>

              {/* ID y acciones */}
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                  {entityId.length > 36 ? `${entityId.substring(0, 36)}...` : entityId}
                </code>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyId}
                        className="h-7 w-7 p-0"
                      >
                        {copiedId ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{copiedId ? 'Copiado!' : 'Copiar ID'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onNavigateToEntity}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Ver entidad
                </Button>
              </div>

              {/* Contador de eventos */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {totalEvents.toLocaleString('es-CO')} eventos registrados
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
