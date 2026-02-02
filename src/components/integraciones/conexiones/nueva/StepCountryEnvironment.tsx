'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Globe, Server, TestTube, Building2, Check, AlertTriangle } from 'lucide-react';
import { IntegrationConnector } from '@/lib/services/integrationsService';
import { cn } from '@/lib/utils';

interface StepCountryEnvironmentProps {
  connector: IntegrationConnector | null;
  selectedCountry: string;
  selectedEnvironment: 'production' | 'sandbox' | 'test';
  selectedBranch: number | null;
  branches: Array<{ id: number; name: string }>;
  onSelectCountry: (country: string) => void;
  onSelectEnvironment: (env: 'production' | 'sandbox' | 'test') => void;
  onSelectBranch: (branchId: number | null) => void;
}

const COUNTRIES = [
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'MX', name: 'México', flag: '🇲🇽' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
];

const ENVIRONMENTS = [
  {
    value: 'sandbox' as const,
    label: 'Sandbox / Pruebas',
    description: 'Ambiente de desarrollo para probar sin afectar datos reales',
    icon: <TestTube className="h-5 w-5" />,
    color: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
  },
  {
    value: 'production' as const,
    label: 'Producción',
    description: 'Ambiente de producción con datos y transacciones reales',
    icon: <Server className="h-5 w-5" />,
    color: 'border-green-500 bg-green-50 dark:bg-green-900/20',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  },
  {
    value: 'test' as const,
    label: 'Test',
    description: 'Ambiente de pruebas internas (sin conexión externa)',
    icon: <TestTube className="h-5 w-5" />,
    color: 'border-gray-500 bg-gray-50 dark:bg-gray-800',
    badge: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  },
];

export function StepCountryEnvironment({
  connector,
  selectedCountry,
  selectedEnvironment,
  selectedBranch,
  branches,
  onSelectCountry,
  onSelectEnvironment,
  onSelectBranch,
}: StepCountryEnvironmentProps) {
  // Filtrar países según los soportados por el conector
  const supportedCountries = connector?.supported_countries || [];
  const availableCountries = supportedCountries.length > 0
    ? COUNTRIES.filter((c) => supportedCountries.includes(c.code))
    : COUNTRIES;

  const showCountryWarning = supportedCountries.length > 0 && !supportedCountries.includes(selectedCountry) && selectedCountry;

  return (
    <div className="space-y-8">
      {/* Selección de País */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            País de Operación
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Selecciona el país donde operará esta conexión
          </p>
        </div>

        {supportedCountries.length > 0 && (
          <Badge variant="outline" className="text-xs">
            Este conector soporta: {supportedCountries.join(', ')}
          </Badge>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {availableCountries.map((country) => {
            const isSelected = selectedCountry === country.code;
            const isSupported = supportedCountries.length === 0 || supportedCountries.includes(country.code);

            return (
              <Card
                key={country.code}
                className={cn(
                  'cursor-pointer transition-all',
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50 bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:border-gray-400 dark:hover:border-gray-500',
                  !isSupported && 'opacity-50'
                )}
                onClick={() => isSupported && onSelectCountry(country.code)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-2xl">{country.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {country.name}
                    </p>
                    <p className="text-xs text-gray-500">{country.code}</p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {showCountryWarning && (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Este conector puede no estar disponible en el país seleccionado</span>
          </div>
        )}

        {availableCountries.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            Este conector está disponible en todos los países
          </div>
        )}
      </div>

      {/* Selección de Ambiente */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            Ambiente
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Selecciona el ambiente para esta conexión
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ENVIRONMENTS.map((env) => {
            const isSelected = selectedEnvironment === env.value;

            return (
              <Card
                key={env.value}
                className={cn(
                  'cursor-pointer transition-all',
                  isSelected ? env.color : 'hover:border-gray-400 dark:hover:border-gray-500'
                )}
                onClick={() => onSelectEnvironment(env.value)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          isSelected ? 'text-current' : 'text-gray-400'
                        )}>
                          {env.icon}
                        </span>
                        <Badge className={cn(env.badge, 'text-xs')}>
                          {env.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {env.description}
                      </p>
                    </div>
                    {isSelected && <Check className="h-5 w-5 text-blue-600 shrink-0" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selectedEnvironment === 'production' && (
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-500 text-sm bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              En producción, las transacciones y datos serán reales. Asegúrate de tener las credenciales correctas.
            </span>
          </div>
        )}
      </div>

      {/* Selección de Sucursal (opcional) */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Sucursal (Opcional)
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Asigna esta conexión a una sucursal específica o déjala disponible para toda la organización
          </p>
        </div>

        <Select
          value={selectedBranch?.toString() || 'all'}
          onValueChange={(value) => onSelectBranch(value === 'all' ? null : parseInt(value))}
        >
          <SelectTrigger className="w-full md:w-80">
            <SelectValue placeholder="Selecciona una sucursal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                Todas las sucursales
              </div>
            </SelectItem>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id.toString()}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {branches.length === 0 && (
          <p className="text-sm text-gray-500">
            No hay sucursales configuradas. La conexión estará disponible para toda la organización.
          </p>
        )}
      </div>
    </div>
  );
}
