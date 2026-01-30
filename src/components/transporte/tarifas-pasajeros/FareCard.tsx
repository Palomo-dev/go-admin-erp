'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DollarSign,
  MapPin,
  Calendar,
  Clock,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Percent,
  User,
  Route,
  Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { FareWithDetails } from '@/lib/services/faresService';

interface FareCardProps {
  fare: FareWithDetails;
  onEdit: (fare: FareWithDetails) => void;
  onDuplicate: (fare: FareWithDetails) => void;
  onDelete: (fare: FareWithDetails) => void;
  onToggleActive: (fare: FareWithDetails, isActive: boolean) => void;
}

const FARE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  regular: {
    label: 'Regular',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: <User className="h-3 w-3" />,
  },
  student: {
    label: 'Estudiante',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <User className="h-3 w-3" />,
  },
  senior: {
    label: 'Adulto Mayor',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: <User className="h-3 w-3" />,
  },
  child: {
    label: 'Niño',
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    icon: <User className="h-3 w-3" />,
  },
  promo: {
    label: 'Promoción',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <Percent className="h-3 w-3" />,
  },
  special: {
    label: 'Especial',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: <Tag className="h-3 w-3" />,
  },
};

const DAY_NAMES = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function FareCard({ fare, onEdit, onDuplicate, onDelete, onToggleActive }: FareCardProps) {
  const typeConfig = FARE_TYPE_CONFIG[fare.fare_type] || FARE_TYPE_CONFIG.regular;
  
  const hasDiscount = (fare.discount_percent && fare.discount_percent > 0) || 
                      (fare.discount_amount && fare.discount_amount > 0);
  
  const finalPrice = hasDiscount
    ? fare.amount - (fare.discount_amount || (fare.amount * (fare.discount_percent || 0)) / 100)
    : fare.amount;

  const isExpired = fare.valid_until && new Date(fare.valid_until) < new Date();
  const isNotStarted = fare.valid_from && new Date(fare.valid_from) > new Date();

  return (
    <Card className={`p-4 transition-all hover:shadow-md ${!fare.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {fare.fare_name}
            </h3>
            <Badge className={typeConfig.color}>
              <span className="flex items-center gap-1">
                {typeConfig.icon}
                {typeConfig.label}
              </span>
            </Badge>
            {!fare.is_active && (
              <Badge variant="secondary">Inactiva</Badge>
            )}
            {isExpired && (
              <Badge variant="destructive">Vencida</Badge>
            )}
            {isNotStarted && (
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                Próxima
              </Badge>
            )}
          </div>

          {/* Código */}
          {fare.fare_code && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Código: {fare.fare_code}
            </p>
          )}

          {/* Ruta */}
          {fare.transport_routes && (
            <div className="flex items-center gap-1 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <Route className="h-4 w-4" />
              <span>{fare.transport_routes.name}</span>
              {fare.transport_routes.code && (
                <span className="text-gray-400">({fare.transport_routes.code})</span>
              )}
            </div>
          )}

          {/* Tramo */}
          {(fare.from_stop || fare.to_stop) && (
            <div className="flex items-center gap-1 mt-1 text-sm text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4" />
              <span>
                {fare.from_stop?.name || 'Cualquier origen'}
                {' → '}
                {fare.to_stop?.name || 'Cualquier destino'}
              </span>
            </div>
          )}

          {/* Precio */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1">
              <DollarSign className="h-5 w-5 text-green-600" />
              {hasDiscount ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600">
                    ${finalPrice.toLocaleString()}
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    ${fare.amount.toLocaleString()}
                  </span>
                  {fare.discount_percent && fare.discount_percent > 0 && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      -{fare.discount_percent}%
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  ${fare.amount.toLocaleString()}
                </span>
              )}
              <span className="text-xs text-gray-400 ml-1">{fare.currency}</span>
            </div>
          </div>

          {/* Vigencia */}
          {(fare.valid_from || fare.valid_until) && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
              <Calendar className="h-3 w-3" />
              <span>
                {fare.valid_from && format(new Date(fare.valid_from), "dd MMM yyyy", { locale: es })}
                {fare.valid_from && fare.valid_until && ' - '}
                {fare.valid_until && format(new Date(fare.valid_until), "dd MMM yyyy", { locale: es })}
                {!fare.valid_until && fare.valid_from && ' (Sin fecha fin)'}
              </span>
            </div>
          )}

          {/* Días aplicables */}
          {fare.applicable_days && fare.applicable_days.length < 7 && (
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>
                {fare.applicable_days.map(d => DAY_NAMES[d]).join(', ')}
              </span>
            </div>
          )}

          {/* Horarios */}
          {(fare.applicable_from_time || fare.applicable_to_time) && (
            <div className="text-xs text-gray-500 mt-1">
              Horario: {fare.applicable_from_time || '00:00'} - {fare.applicable_to_time || '23:59'}
            </div>
          )}

          {/* Requisitos */}
          {(fare.requires_id || fare.requires_approval || fare.min_age || fare.max_age) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {fare.requires_id && (
                <Badge variant="outline" className="text-xs">Requiere ID</Badge>
              )}
              {fare.requires_approval && (
                <Badge variant="outline" className="text-xs">Requiere aprobación</Badge>
              )}
              {(fare.min_age || fare.max_age) && (
                <Badge variant="outline" className="text-xs">
                  Edad: {fare.min_age || 0} - {fare.max_age || '∞'} años
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Switch
            checked={fare.is_active}
            onCheckedChange={(checked) => onToggleActive(fare, checked)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(fare)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(fare)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(fare)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

export default FareCard;
