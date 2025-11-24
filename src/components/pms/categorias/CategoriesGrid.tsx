'use client';

import React from 'react';
import { CategoryCard } from './CategoryCard';
import type { SpaceCategory } from '@/lib/services/spaceCategoriesService';

interface CategoriesGridProps {
  categories: SpaceCategory[];
  stats: Record<string, { total_types: number; total_spaces: number }>;
  onEdit: (category: SpaceCategory) => void;
  onDelete: (category: SpaceCategory) => void;
}

export function CategoriesGrid({ categories, stats, onEdit, onDelete }: CategoriesGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {categories.map((category) => (
        <CategoryCard
          key={category.code}
          category={category}
          stats={stats[category.code]}
          onEdit={() => onEdit(category)}
          onDelete={() => onDelete(category)}
        />
      ))}
    </div>
  );
}
