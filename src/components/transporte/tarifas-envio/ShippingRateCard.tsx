'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Truck,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  MapPin,
  Scale,
  Calendar,
  Percent,
  DollarSign,
  Package,
} from 'lucide-react';
import type { ShippingRateWithCarrier } from '@/lib/services/shippingRatesService';

interface ShippingRateCardProps {
  rate: ShippingRateWithCarrier;
  onEdit: (rate: ShippingRateWithCarrier) => void;
  onDuplicate: (rate: ShippingRateWithCarrier) => void;
  onDelete: (rate: ShippingRateWithCarrier) => void;
  onToggleActive: (rate: ShippingRateWithCarrier, isActive: boolean) => void;
}

const SERVICE_LEVEL_LABELS: Record<string, string> = {
  express: 'Express',
  standard: 'Estándar',
  economy: 'Económico',
  overnight: 'Día siguiente',
  same_day: 'Mismo día',
};

const CALCULATION_METHOD_LABELS: Record<string, string> = {
  weight: 'Por peso',
  volume: 'Por volumen',
  dimensional: 'Peso dimensional',
  flat: 'Tarifa fija',
};

export function ShippingRateCard({
  rate,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
}: ShippingRateCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: rate.currency || 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const isExpired = rate.valid_until && new Date(rate.valid_until) < new Date();
  const isUpcoming = rate.valid_from && new Date(rate.valid_from) > new Date();

  return (
    <Card className={`relative transition-all hover:shadow-md ${!rate.is_active ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${rate.is_active ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
              <Truck className={`h-5 w-5 ${rate.is_active ? 'text-blue-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {rate.rate_name}
              </h3>
              {rate.rate_code && (
                <p className="text-xs text-gray-500">Código: {rate.rate_code}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={rate.is_active}
              onCheckedChange={(checked) => onToggleActive(rate, checked)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(rate)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(rate)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(rate)}
                  className="text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Badges de estado */}
        <div className="flex flex-wrap gap-2">
          {rate.transport_carriers && (
            <Badge variant="outline" className="text-xs">
              <Truck className="h-3 w-3 mr-1" />
              {rate.transport_carriers.name}
            </Badge>
          )}
          {rate.service_level && (
            <Badge variant="secondary" className="text-xs">
              {SERVICE_LEVEL_LABELS[rate.service_level] || rate.service_level}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            <Scale className="h-3 w-3 mr-1" />
            {CALCULATION_METHOD_LABELS[rate.calculation_method] || rate.calculation_method}
          </Badge>
          {isExpired && (
            <Badge variant="destructive" className="text-xs">Expirada</Badge>
          )}
          {isUpcoming && (
            <Badge className="text-xs bg-amber-500">Próximamente</Badge>
          )}
        </div>

        {/* Origen/Destino */}
        {(rate.origin_city || rate.destination_city || rate.origin_zone || rate.destination_zone) && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4 text-blue-500" />
            <span>
              {rate.origin_city || rate.origin_zone || 'Cualquier origen'}
              {' → '}
              {rate.destination_city || rate.destination_zone || 'Cualquier destino'}
            </span>
          </div>
        )}

        {/* Precios */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
            <p className="text-xs text-gray-500">Base</p>
            <p className="font-semibold text-blue-600">{formatCurrency(rate.base_rate || 0)}</p>
          </div>
          {rate.rate_per_kg > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Por kg</p>
              <p className="font-semibold">{formatCurrency(rate.rate_per_kg)}</p>
            </div>
          )}
          {rate.rate_per_m3 > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Por m³</p>
              <p className="font-semibold">{formatCurrency(rate.rate_per_m3)}</p>
            </div>
          )}
          {rate.min_charge > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Mínimo</p>
              <p className="font-semibold">{formatCurrency(rate.min_charge)}</p>
            </div>
          )}
        </div>

        {/* Recargos */}
        {(rate.fuel_surcharge_percent > 0 || rate.insurance_percent > 0) && (
          <div className="flex items-center gap-4 text-sm">
            {rate.fuel_surcharge_percent > 0 && (
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <Percent className="h-3 w-3" />
                Combustible: {rate.fuel_surcharge_percent}%
              </span>
            )}
            {rate.insurance_percent > 0 && (
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <Package className="h-3 w-3" />
                Seguro: {rate.insurance_percent}%
              </span>
            )}
          </div>
        )}

        {/* Rango de peso */}
        {(rate.min_weight_kg || rate.max_weight_kg) && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Scale className="h-4 w-4" />
            <span>
              Peso: {rate.min_weight_kg || 0} - {rate.max_weight_kg || '∞'} kg
            </span>
          </div>
        )}

        {/* Vigencia */}
        {(rate.valid_from || rate.valid_until) && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t dark:border-gray-700">
            <Calendar className="h-3 w-3" />
            <span>
              {rate.valid_from && `Desde: ${format(new Date(rate.valid_from), 'dd MMM yyyy', { locale: es })}`}
              {rate.valid_from && rate.valid_until && ' | '}
              {rate.valid_until && `Hasta: ${format(new Date(rate.valid_until), 'dd MMM yyyy', { locale: es })}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ShippingRateCard;
