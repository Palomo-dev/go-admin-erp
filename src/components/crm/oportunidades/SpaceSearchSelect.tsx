'use client';

import { useState } from 'react';
import { Search, Home, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/utils/Utils';

interface Space {
  id: string;
  label: string;
  floor_zone?: string;
  status: string;
  type_name?: string;
  base_rate: number;
}

interface SpaceSearchSelectProps {
  spaces: Space[];
  selectedSpaceId: string;
  onSelect: (spaceId: string, space?: Space) => void;
  placeholder?: string;
}

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  occupied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  reserved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cleaning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const statusLabels: Record<string, string> = {
  available: 'Disponible',
  occupied: 'Ocupado',
  reserved: 'Reservado',
  cleaning: 'Limpieza',
  maintenance: 'Mantenimiento',
};

export function SpaceSearchSelect({
  spaces,
  selectedSpaceId,
  onSelect,
  placeholder = 'Seleccionar espacio'
}: SpaceSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  const filteredSpaces = spaces.filter(space => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      space.label?.toLowerCase().includes(term) ||
      space.type_name?.toLowerCase().includes(term) ||
      space.floor_zone?.toLowerCase().includes(term)
    );
  });

  const handleSelect = (space: Space) => {
    onSelect(space.id, space);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-[44px] px-3 py-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {selectedSpace ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Home className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {selectedSpace.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedSpace.type_name}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Home className="h-4 w-4" />
              <span>{placeholder}</span>
            </div>
          )}
          <Search className="h-4 w-4 shrink-0 text-gray-400 ml-2" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[420px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-xl" align="start" sideOffset={8}>
        {/* Header con búsqueda */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Seleccionar espacio</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, tipo o zona..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              autoFocus
            />
          </div>
        </div>
        
        {/* Lista de espacios */}
        <ScrollArea className="h-[320px]">
          <div className="p-3 space-y-2">
            {filteredSpaces.length > 0 ? (
              filteredSpaces.map((space) => (
                <button
                  type="button"
                  key={space.id}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-150 text-left ${
                    space.id === selectedSpaceId 
                      ? 'bg-purple-50 dark:bg-purple-900/30 border-2 border-purple-400 dark:border-purple-600 shadow-sm' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(space);
                  }}
                >
                  {/* Icono del espacio */}
                  <div className="w-14 h-14 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-700">
                    <Home className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                  </div>
                  
                  {/* Info del espacio */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base">
                        {space.label}
                      </p>
                      <Badge className={`text-xs ${statusColors[space.status] || 'bg-gray-100 text-gray-700'}`}>
                        {statusLabels[space.status] || space.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {space.type_name}
                    </p>
                    {space.floor_zone && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {space.floor_zone}
                      </div>
                    )}
                  </div>
                  
                  {/* Tarifa */}
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(space.base_rate)}
                    </p>
                    <p className="text-xs text-gray-500">/ noche</p>
                  </div>
                </button>
              ))
            ) : searchTerm ? (
              <div className="py-12 text-center">
                <Home className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  No se encontraron espacios
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Intenta con otro término de búsqueda
                </p>
              </div>
            ) : (
              <div className="py-12 text-center">
                <Home className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {spaces.length} espacios disponibles
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Escribe para filtrar o selecciona uno
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
