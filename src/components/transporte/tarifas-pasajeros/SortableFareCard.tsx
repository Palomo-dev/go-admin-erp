'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { FareCard } from './FareCard';
import type { FareWithDetails } from '@/lib/services/faresService';

interface SortableFareCardProps {
  fare: FareWithDetails;
  onEdit: (fare: FareWithDetails) => void;
  onDuplicate: (fare: FareWithDetails) => void;
  onDelete: (fare: FareWithDetails) => void;
  onToggleActive: (fare: FareWithDetails, isActive: boolean) => void;
}

export function SortableFareCard({
  fare,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
}: SortableFareCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fare.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Handle de arrastre */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 bg-gray-50 dark:bg-gray-800 rounded-l-lg border-r border-gray-200 dark:border-gray-700 opacity-60 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-5 w-5 text-gray-400" />
      </div>
      
      {/* Contenido con margen izquierdo para el handle */}
      <div className="pl-8">
        <FareCard
          fare={fare}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />
      </div>
    </div>
  );
}

export default SortableFareCard;
