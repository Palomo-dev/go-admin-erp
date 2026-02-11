'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';

interface CategoriesToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function CategoriesToolbar({ searchTerm, onSearchChange, onExpandAll, onCollapseAll }: CategoriesToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar categorías..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onExpandAll} className="text-xs border-gray-300 dark:border-gray-700">
          <ChevronDown className="h-3 w-3 mr-1" /> Expandir todo
        </Button>
        <Button variant="outline" size="sm" onClick={onCollapseAll} className="text-xs border-gray-300 dark:border-gray-700">
          <ChevronRight className="h-3 w-3 mr-1" /> Colapsar todo
        </Button>
      </div>
    </div>
  );
}
