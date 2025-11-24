'use client';

import React from 'react';
import { SpaceCard } from './SpaceCard';
import type { Space } from '@/lib/services/spacesService';

interface EspaciosGridProps {
  spaces: Space[];
  selectedSpaces: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onEdit: (space: Space) => void;
  onDelete: (space: Space) => void;
}

export function EspaciosGrid({
  spaces,
  selectedSpaces,
  onSelect,
  onEdit,
  onDelete,
}: EspaciosGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {spaces.map((space) => (
        <SpaceCard
          key={space.id}
          space={space}
          selected={selectedSpaces.has(space.id)}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
