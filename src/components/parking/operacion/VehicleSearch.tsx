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
