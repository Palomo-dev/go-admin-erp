'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  User, 
  Calendar, 
  Moon, 
  Users,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { formatDate } from '@/utils/Utils';
import { cn } from '@/utils/Utils';
import type { UnassignedReservation } from '@/lib/services/roomAssignmentService';

interface UnassignedListProps {
  reservations: UnassignedReservation[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onAssign: (reservation: UnassignedReservation) => void;
  isLoading?: boolean;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  tentative: { label: 'Tentativa', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

function ReservationItem({ 
  reservation, 
  isSelected, 
  onSelect, 
  onAssign 
}: { 
  reservation: UnassignedReservation; 
  isSelected: boolean;
  onSelect: () => void;
  onAssign: () => void;
}) {
  const status = statusConfig[reservation.status] || { label: reservation.status, color: 'bg-gray-100 text-gray-700' };
  const today = new Date().toISOString().split('T')[0];
  const isUrgent = reservation.checkin === today;

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-lg border transition-colors',
      isSelected 
        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30' 
        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
      isUrgent && !isSelected && 'border-red-200 dark:border-red-800'
    )}>
      <Checkbox
        checked={isSelected}
        onCheckedChange={onSelect}
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
            {reservation.code}
          </span>
          <Badge className={status.color}>
            {status.label}
          </Badge>
          {isUrgent && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Hoy
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-white">
          <User className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{reservation.customerName}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(reservation.checkin)} - {formatDate(reservation.checkout)}
          </span>
          <span className="flex items-center gap-1">
            <Moon className="h-3 w-3" />
            {reservation.nights} noche(s)
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {reservation.occupantCount} huésped(es)
          </span>
          {reservation.spaceTypeName && (
            <Badge variant="outline" className="text-xs">
              {reservation.spaceTypeName}
            </Badge>
          )}
        </div>
      </div>
      
      <Button
        size="sm"
        onClick={onAssign}
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        Asignar
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

function ReservationSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export function UnassignedList({
  reservations,
  selectedIds,
  onSelect,
  onSelectAll,
  onAssign,
  isLoading = false,
}: UnassignedListProps) {
  const allSelected = reservations.length > 0 && selectedIds.length === reservations.length;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Reservas Sin Asignar
            {reservations.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {reservations.length}
              </Badge>
            )}
          </CardTitle>
          {reservations.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
            >
              {allSelected ? 'Deseleccionar' : 'Seleccionar'} todas
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <>
            <ReservationSkeleton />
            <ReservationSkeleton />
            <ReservationSkeleton />
          </>
        ) : reservations.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
              <AlertTriangle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ¡Todas las reservas tienen espacio asignado!
            </p>
          </div>
        ) : (
          reservations.map((reservation) => (
            <ReservationItem
              key={reservation.id}
              reservation={reservation}
              isSelected={selectedIds.includes(reservation.id)}
              onSelect={() => onSelect(reservation.id)}
              onAssign={() => onAssign(reservation)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
