'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import {
  Package,
  Users,
  FileText,
  MessageSquare,
  Truck,
  CreditCard,
  Shield,
  Calendar,
  Building2,
  Clock,
  Hash,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface EntityInfoProps {
  entityType: string;
  entityId: string;
  entityData?: Record<string, unknown> | null;
  loading?: boolean;
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

// Campos relevantes por tipo de entidad
const ENTITY_FIELDS: Record<string, Array<{ key: string; label: string; format?: 'date' | 'currency' | 'boolean' }>> = {
  product: [
    { key: 'name', label: 'Nombre' },
    { key: 'sku', label: 'SKU' },
    { key: 'price', label: 'Precio', format: 'currency' },
    { key: 'stock', label: 'Stock' },
    { key: 'category', label: 'Categoría' },
  ],
  customer: [
    { key: 'full_name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'created_at', label: 'Cliente desde', format: 'date' },
  ],
  invoice: [
    { key: 'invoice_number', label: 'Número' },
    { key: 'total', label: 'Total', format: 'currency' },
    { key: 'status', label: 'Estado' },
    { key: 'created_at', label: 'Fecha', format: 'date' },
  ],
  sale: [
    { key: 'sale_number', label: 'Número' },
    { key: 'total', label: 'Total', format: 'currency' },
    { key: 'status', label: 'Estado' },
    { key: 'created_at', label: 'Fecha', format: 'date' },
  ],
  conversation: [
    { key: 'title', label: 'Título' },
    { key: 'status', label: 'Estado' },
    { key: 'channel', label: 'Canal' },
    { key: 'created_at', label: 'Iniciada', format: 'date' },
  ],
  trip: [
    { key: 'trip_number', label: 'Número' },
    { key: 'status', label: 'Estado' },
    { key: 'origin', label: 'Origen' },
    { key: 'destination', label: 'Destino' },
  ],
  shipment: [
    { key: 'tracking_number', label: 'Tracking' },
    { key: 'status', label: 'Estado' },
    { key: 'created_at', label: 'Fecha', format: 'date' },
  ],
  employee: [
    { key: 'full_name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'position', label: 'Cargo' },
    { key: 'department', label: 'Departamento' },
  ],
};

export function EntityInfo({ entityType, entityId, entityData, loading }: EntityInfoProps) {
  const IconComponent = ENTITY_ICONS[entityType.toLowerCase()] || FileText;
  const fields = ENTITY_FIELDS[entityType.toLowerCase()] || [];

  const formatValue = (value: unknown, format?: 'date' | 'currency' | 'boolean'): string => {
    if (value === null || value === undefined) return '-';
    
    if (format === 'date' && typeof value === 'string') {
      try {
        return format(new Date(value), "dd MMM yyyy", { locale: es });
      } catch {
        return String(value);
      }
    }
    
    if (format === 'currency' && typeof value === 'number') {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
      }).format(value);
    }
    
    if (format === 'boolean') {
      return value ? 'Sí' : 'No';
    }
    
    return String(value);
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!entityData) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="text-center text-gray-500 dark:text-gray-400 py-4">
            <IconComponent className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No se pudo cargar la información de la entidad</p>
            <p className="text-xs font-mono mt-1">{entityId}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        {/* Header con icono */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <IconComponent className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {(entityData.name || entityData.full_name || entityData.title || entityData.invoice_number || entityData.tracking_number || `ID: ${entityId.substring(0, 8)}`) as string}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {entityId}
            </p>
          </div>
        </div>

        {/* Campos */}
        {fields.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => {
              const value = entityData[field.key];
              if (value === undefined) return null;
              
              return (
                <div key={field.key} className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{field.label}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {formatValue(value, field.format)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <pre className="bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-auto max-h-32">
              {JSON.stringify(entityData, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
