'use client';

import React from 'react';
import { SpaceTypeCard } from './SpaceTypeCard';
import type { SpaceType } from '@/lib/services/spaceTypesService';

interface SpaceTypesGridProps {
  spaceTypes: SpaceType[];
  onEdit: (spaceType: SpaceType) => void;
  onDelete: (spaceType: SpaceType) => void;
  onToggleActive: (spaceType: SpaceType, isActive: boolean) => void;
}

export function SpaceTypesGrid({
  spaceTypes,
  onEdit,
  onDelete,
  onToggleActive,
}: SpaceTypesGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {spaceTypes.map((spaceType) => (
        <SpaceTypeCard
          key={spaceType.id}
          spaceType={spaceType}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />
      ))}
    </div>
  );
}
