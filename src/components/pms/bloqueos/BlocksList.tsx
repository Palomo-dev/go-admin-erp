'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, MapPin, Calendar, Wrench, User, PartyPopper, Clock, HelpCircle } from 'lucide-react';
import { ReservationBlock, BlockType } from '@/lib/services/reservationBlocksService';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface BlocksListProps {
  blocks: ReservationBlock[];
  isLoading?: boolean;
  onEdit: (block: ReservationBlock) => void;
  onDelete: (block: ReservationBlock) => void;
}

const blockTypeConfig: Record<BlockType, { label: string; color: string; icon: any }> = {
  maintenance: {
    label: 'Mantenimiento',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    icon: Wrench,
  },
  owner: {
    label: 'Propietario',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    icon: User,
  },
  event: {
    label: 'Evento',
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    icon: PartyPopper,
  },
  ota_hold: {
    label: 'Hold OTA',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    icon: Clock,
  },
  other: {
    label: 'Otro',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    icon: HelpCircle,
  },
};

function isActiveToday(dateFrom: string, dateTo: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateFrom <= today && dateTo >= today;
}

export function BlocksList({ blocks, isLoading, onEdit, onDelete }: BlocksListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
            <Calendar className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            No hay bloqueos
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Crea un bloqueo para reservar espacios sin crear una reserva formal.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => {
        const config = blockTypeConfig[block.block_type];
        const Icon = config.icon;
        const isActive = isActiveToday(block.date_from, block.date_to);
        const spaceName = block.spaces?.label || block.space_types?.name || 'Todos los espacios';

        return (
          <Card
            key={block.id}
            className={`transition-all hover:shadow-md ${
              isActive ? 'border-l-4 border-l-red-500' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {spaceName}
                      </h3>
                      <Badge className={config.color}>
                        {config.label}
                      </Badge>
                      {isActive && (
                        <Badge variant="destructive">Activo</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {format(parseISO(block.date_from), 'dd MMM', { locale: es })} -{' '}
                          {format(parseISO(block.date_to), 'dd MMM yyyy', { locale: es })}
                        </span>
                      </div>
                      {block.spaces?.floor_zone && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{block.spaces.floor_zone}</span>
                        </div>
                      )}
                    </div>

                    {block.reason && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        {block.reason}
                      </p>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(block)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(block)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
