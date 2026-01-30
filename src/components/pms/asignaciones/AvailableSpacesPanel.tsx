'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DoorOpen, 
  Users, 
  MapPin,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AvailableSpace } from '@/lib/services/roomAssignmentService';

interface AvailableSpacesPanelProps {
  spaces: AvailableSpace[];
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string) => void;
  onConfirmAssignment: () => void;
  isLoading?: boolean;
  reservationInfo?: {
    customerName: string;
    checkin: string;
    checkout: string;
  } | null;
}

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  occupied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cleaning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  out_of_order: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function SpaceCard({ 
  space, 
  isSelected, 
  onSelect 
}: { 
  space: AvailableSpace; 
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-all',
        space.isAvailable 
          ? isSelected 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500' 
            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
          : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
      )}
      onClick={() => space.isAvailable && onSelect()}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{space.label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{space.spaceTypeName}</p>
        </div>
        {space.isAvailable ? (
          isSelected ? (
            <div className="p-1 bg-blue-600 rounded-full">
              <Check className="h-3 w-3 text-white" />
            </div>
          ) : (
            <Badge className={statusColors[space.status] || statusColors.available}>
              Disponible
            </Badge>
          )
        ) : (
          <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700">
            <X className="h-3 w-3 mr-1" />
            No disponible
          </Badge>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {space.capacity} huésped(es)
        </span>
        {space.floorZone && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {space.floorZone}
          </span>
        )}
      </div>
      
      {!space.isAvailable && space.conflictReason && (
        <div className="flex items-center gap-1 mt-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          {space.conflictReason}
        </div>
      )}
    </div>
  );
}

function SpaceSkeleton() {
  return (
    <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="flex items-start justify-between mb-2">
        <div className="space-y-1">
          <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export function AvailableSpacesPanel({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onConfirmAssignment,
  isLoading = false,
  reservationInfo,
}: AvailableSpacesPanelProps) {
  const availableSpaces = spaces.filter(s => s.isAvailable);
  const unavailableSpaces = spaces.filter(s => !s.isAvailable);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <DoorOpen className="h-5 w-5 text-green-600" />
          Espacios Disponibles
          {availableSpaces.length > 0 && (
            <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {availableSpaces.length}
            </Badge>
          )}
        </CardTitle>
        {reservationInfo && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Para: <span className="font-medium">{reservationInfo.customerName}</span> ({reservationInfo.checkin} - {reservationInfo.checkout})
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <SpaceSkeleton />
            <SpaceSkeleton />
            <SpaceSkeleton />
            <SpaceSkeleton />
          </div>
        ) : spaces.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <DoorOpen className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Selecciona una reserva para ver espacios disponibles
            </p>
          </div>
        ) : (
          <>
            {availableSpaces.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Disponibles ({availableSpaces.length})
                </p>
                <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                  {availableSpaces.map((space) => (
                    <SpaceCard
                      key={space.id}
                      space={space}
                      isSelected={selectedSpaceId === space.id}
                      onSelect={() => onSelectSpace(space.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {unavailableSpaces.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  No disponibles ({unavailableSpaces.length})
                </p>
                <div className="grid grid-cols-2 gap-3 max-h-[200px] overflow-y-auto">
                  {unavailableSpaces.map((space) => (
                    <SpaceCard
                      key={space.id}
                      space={space}
                      isSelected={false}
                      onSelect={() => {}}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {selectedSpaceId && (
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={onConfirmAssignment}
              >
                <Check className="h-4 w-4 mr-2" />
                Confirmar Asignación
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
