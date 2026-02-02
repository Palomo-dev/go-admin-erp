<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/parking/operacion/VehicleSearch.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, QrCode, CreditCard, Car } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface VehicleSearchProps {
  onSearch: (query: string, type: 'plate' | 'qr' | 'ticket') => void;
  isLoading?: boolean;
  passInfo?: {
    isActive: boolean;
    planName: string;
    endDate: string;
  } | null;
}

export function VehicleSearch({ onSearch, isLoading, passInfo }: VehicleSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'plate' | 'qr' | 'ticket'>('plate');

  const handleSearch = () => {
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim().toUpperCase(), searchType);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Buscar Vehículo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={searchType === 'plate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('plate')}
            className={cn(
              searchType === 'plate' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <Car className="h-4 w-4 mr-1" />
            Placa
          </Button>
          <Button
            variant={searchType === 'qr' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('qr')}
            className={cn(
              searchType === 'qr' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <QrCode className="h-4 w-4 mr-1" />
            QR
          </Button>
          <Button
            variant={searchType === 'ticket' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('ticket')}
            className={cn(
              searchType === 'ticket' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Ticket
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={
              searchType === 'plate' 
                ? 'Ingrese la placa (ej: ABC123)' 
                : searchType === 'qr'
                ? 'Escanee o ingrese código QR'
                : 'Ingrese número de ticket'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
            className="flex-1 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600"
          />
          <Button 
            onClick={handleSearch} 
            disabled={isLoading || !searchQuery.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar
          </Button>
        </div>

        {passInfo && (
          <div className={cn(
            "p-3 rounded-lg border",
            passInfo.isActive 
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
              : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Estado del Abonado
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {passInfo.planName} • Vence: {passInfo.endDate}
                </p>
              </div>
              <Badge variant={passInfo.isActive ? 'default' : 'secondary'}>
                {passInfo.isActive ? 'Activo' : 'Vencido'}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
=======
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, QrCode, CreditCard, Car, LogOut, LogIn, Clock, Loader2 } from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';

export interface SearchResult {
  id: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  space_label?: string;
  is_active: boolean;
}

interface VehicleSearchProps {
  onSearch: (query: string, type: 'plate' | 'qr' | 'ticket') => void;
  onSelectResult?: (result: SearchResult) => void;
  onNewEntry?: (plate: string) => void;
  searchResults?: SearchResult[];
  isSearching?: boolean;
  isLoading?: boolean;
  passInfo?: {
    isActive: boolean;
    planName: string;
    endDate: string;
  } | null;
}

export function VehicleSearch({ 
  onSearch, 
  onSelectResult,
  onNewEntry,
  searchResults = [],
  isSearching,
  passInfo 
}: VehicleSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'plate' | 'qr' | 'ticket'>('plate');
  const [showResults, setShowResults] = useState(false);

  // Debounce search
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timer = setTimeout(() => {
        onSearch(searchQuery.trim().toUpperCase(), searchType);
        setShowResults(true);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowResults(false);
    }
  }, [searchQuery, searchType, onSearch]);

  const handleSelectResult = useCallback((result: SearchResult) => {
    setSearchQuery('');
    setShowResults(false);
    onSelectResult?.(result);
  }, [onSelectResult]);

  const handleNewEntry = useCallback(() => {
    const plate = searchQuery.trim().toUpperCase();
    setSearchQuery('');
    setShowResults(false);
    onNewEntry?.(plate);
  }, [searchQuery, onNewEntry]);

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Buscar Vehículo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={searchType === 'plate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('plate')}
            className={cn(
              searchType === 'plate' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <Car className="h-4 w-4 mr-1" />
            Placa
          </Button>
          <Button
            variant={searchType === 'qr' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('qr')}
            className={cn(
              searchType === 'qr' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <QrCode className="h-4 w-4 mr-1" />
            QR
          </Button>
          <Button
            variant={searchType === 'ticket' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('ticket')}
            className={cn(
              searchType === 'ticket' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Ticket
          </Button>
        </div>

        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder={
                  searchType === 'plate' 
                    ? 'Buscar por placa (mínimo 2 caracteres)' 
                    : searchType === 'qr'
                    ? 'Escanee o ingrese código QR'
                    : 'Ingrese número de ticket'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
                className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 pr-10"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>
          </div>

          {/* Resultados de búsqueda */}
          {showResults && searchQuery.length >= 2 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {isSearching ? (
                <div className="p-4 text-center text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Buscando...
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    Vehículos en parqueadero ({searchResults.filter(r => r.is_active).length})
                  </div>
                  {searchResults.filter(r => r.is_active).map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                          <Car className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">{result.vehicle_plate}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(result.entry_at)}
                            {result.space_label && ` • ${result.space_label}`}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        <LogOut className="h-3 w-3 mr-1" />
                        Registrar Salida
                      </Badge>
                    </button>
                  ))}
                  {searchResults.filter(r => r.is_active).length === 0 && (
                    <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                      No hay vehículos activos con esa placa
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  No se encontraron vehículos con &quot;{searchQuery}&quot;
                </div>
              )}
              
              {/* Opción para registrar nueva entrada */}
              {!isSearching && searchQuery.length >= 3 && (
                <button
                  onClick={handleNewEntry}
                  className="w-full px-3 py-3 text-left hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                >
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <LogIn className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">Registrar entrada de {searchQuery}</p>
                    <p className="text-xs text-gray-500">Crear nueva sesión de parqueo</p>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {passInfo && (
          <div className={cn(
            "p-3 rounded-lg border",
            passInfo.isActive 
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
              : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Estado del Abonado
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {passInfo.planName} • Vence: {passInfo.endDate}
                </p>
              </div>
              <Badge variant={passInfo.isActive ? 'default' : 'secondary'}>
                {passInfo.isActive ? 'Activo' : 'Vencido'}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-f372080e/src/components/parking/operacion/VehicleSearch.tsx
