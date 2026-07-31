'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  Truck, 
  Building2, 
  Globe, 
  Phone, 
  Mail,
  Copy,
  Power,
  PowerOff,
  ExternalLink,
  Key
} from 'lucide-react';
import { TransportCarrier } from '@/lib/services/transportService';

interface CarriersListProps {
  carriers: TransportCarrier[];
  isLoading?: boolean;
  onEdit: (carrier: TransportCarrier) => void;
  onDelete: (carrier: TransportCarrier) => void;
  onDuplicate: (carrier: TransportCarrier) => void;
  onToggleStatus: (carrier: TransportCarrier) => void;
  onTestTracking: (carrier: TransportCarrier) => void;
  onManageCredentials: (carrier: TransportCarrier) => void;
}

export function CarriersList({ 
  carriers, 
  isLoading, 
  onEdit, 
  onDelete,
  onDuplicate,
  onToggleStatus,
  onTestTracking,
  onManageCredentials
}: CarriersListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (carriers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Truck className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay transportadoras
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Crea tu primera transportadora para gestionar tu flota o proveedores externos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const carrierTypeLabels: Record<string, string> = {
    own_fleet: 'Flota Propia',
    third_party: 'Tercero',
  };

  const serviceTypeLabels: Record<string, string> = {
    cargo: 'Carga',
    passenger: 'Pasajeros',
    both: 'Ambos',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {carriers.map((carrier) => (
        <Card
          key={carrier.id}
          className="hover:shadow-md transition-shadow"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  {carrier.carrier_type === 'own_fleet' ? (
                    <Truck className="h-5 w-5" />
                  ) : (
                    <Building2 className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {carrier.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {carrier.code}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(carrier)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(carrier)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onToggleStatus(carrier)}>
                    {carrier.is_active ? (
                      <>
                        <PowerOff className="h-4 w-4 mr-2" />
                        Desactivar
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4 mr-2" />
                        Activar
                      </>
                    )}
                  </DropdownMenuItem>
                  {carrier.tracking_url_template && (
                    <DropdownMenuItem onClick={() => onTestTracking(carrier)}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Probar Tracking
                    </DropdownMenuItem>
                  )}
                  {carrier.api_provider && (
                    <DropdownMenuItem onClick={() => onManageCredentials(carrier)}>
                      <Key className="h-4 w-4 mr-2" />
                      Credenciales API
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(carrier)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="outline">
                {carrierTypeLabels[carrier.carrier_type] || carrier.carrier_type}
              </Badge>
              <Badge variant="secondary">
                {serviceTypeLabels[carrier.service_type] || carrier.service_type}
              </Badge>
              <Badge variant={carrier.is_active ? 'default' : 'destructive'}>
                {carrier.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>

            {carrier.tax_id && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                NIT: {carrier.tax_id}
              </p>
            )}

            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              {carrier.contact_name && (
                <p className="flex items-center gap-2">
                  <span className="font-medium">Contacto:</span> {carrier.contact_name}
                </p>
              )}
              {carrier.contact_phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-3 w-3" />
                  {carrier.contact_phone}
                </p>
              )}
              {carrier.contact_email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  {carrier.contact_email}
                </p>
              )}
              {carrier.api_provider && (
                <p className="flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  API: {carrier.api_provider}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
