'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Star,
  MapPin,
  Phone,
  User,
  Navigation,
} from 'lucide-react';
import { CustomerAddress } from '@/lib/services/customerAddressesService';

interface AddressesListProps {
  addresses: CustomerAddress[];
  isLoading: boolean;
  onEdit: (address: CustomerAddress) => void;
  onDelete: (address: CustomerAddress) => void;
  onDuplicate: (address: CustomerAddress) => void;
  onSetDefault: (address: CustomerAddress) => void;
  onValidateCoords?: (address: CustomerAddress) => void;
}

export function AddressesList({
  addresses,
  isLoading,
  onEdit,
  onDelete,
  onDuplicate,
  onSetDefault,
  onValidateCoords,
}: AddressesListProps) {

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {addresses.length} direcciones
        </span>
      </div>

      {addresses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No hay direcciones
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Agrega la primera dirección de cliente
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {addresses.map((address) => (
            <Card key={address.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={address.is_default ? 'default' : 'outline'}>
                      {address.label}
                    </Badge>
                    {address.is_default && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(address)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(address)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      {!address.is_default && (
                        <DropdownMenuItem onClick={() => onSetDefault(address)}>
                          <Star className="h-4 w-4 mr-2" />
                          Marcar como default
                        </DropdownMenuItem>
                      )}
                      {onValidateCoords && (
                        <DropdownMenuItem onClick={() => onValidateCoords(address)}>
                          <Navigation className="h-4 w-4 mr-2" />
                          Validar coordenadas
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(address)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-gray-400 mt-0.5" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {address.customers?.first_name} {address.customers?.last_name}
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div className="text-gray-600 dark:text-gray-300">
                      <p>{address.address_line1}</p>
                      {address.address_line2 && <p>{address.address_line2}</p>}
                      <p>{address.city}{address.department ? `, ${address.department}` : ''}</p>
                    </div>
                  </div>

                  {address.recipient_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-300">
                        {address.recipient_phone}
                      </span>
                    </div>
                  )}

                  {(address.latitude && address.longitude) && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Navigation className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        Geolocalización válida
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
