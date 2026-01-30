'use client';

import React, { useState } from 'react';
import { Search, QrCode, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';

interface CheckinSearchProps {
  onSearch: (query: string) => void;
  onScanQR?: () => void;
  isLoading?: boolean;
}

export function CheckinSearch({ onSearch, onScanQR, isLoading }: CheckinSearchProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Documento, teléfono, código o nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "pl-10 h-12 text-lg",
              "bg-gray-50 dark:bg-gray-900",
              "border-gray-300 dark:border-gray-600",
              "focus:ring-2 focus:ring-blue-500"
            )}
            autoFocus
          />
        </div>
        
        <Button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Search className="h-5 w-5 mr-2" />
              Buscar
            </>
          )}
        </Button>
        
        {onScanQR && (
          <Button
            type="button"
            variant="outline"
            onClick={onScanQR}
            className="h-12 px-4 border-gray-300 dark:border-gray-600"
          >
            <QrCode className="h-5 w-5" />
          </Button>
        )}
      </form>
      
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Busca por número de documento, teléfono, código de acceso o nombre del miembro
      </p>
    </div>
  );
}

export default CheckinSearch;
