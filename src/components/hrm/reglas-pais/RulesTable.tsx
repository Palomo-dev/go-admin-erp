'use client';

import type { CountryPayrollRules } from '@/lib/services/hrmConfigService';
import { formatCurrency } from '@/utils/Utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Globe } from 'lucide-react';

interface RulesTableProps {
  rules: CountryPayrollRules[];
  onView: (rule: CountryPayrollRules) => void;
  isLoading?: boolean;
}

const countryNames: Record<string, string> = {
  CO: 'Colombia',
  MX: 'México',
  PE: 'Perú',
  EC: 'Ecuador',
  CL: 'Chile',
  AR: 'Argentina',
  US: 'Estados Unidos',
  ES: 'España',
  AU: 'Australia',
  BR: 'Brasil',
  CA: 'Canadá',
  GB: 'Reino Unido',
  JP: 'Japón',
};

const countryFlags: Record<string, string> = {
  CO: '🇨🇴',
  MX: '🇲🇽',
  CL: '🇨🇱',
  US: '🇺🇸',
  ES: '🇪🇸',
  AU: '🇦🇺',
  BR: '🇧🇷',
  CA: '🇨🇦',
  GB: '🇬🇧',
  JP: '🇯🇵',
  PE: '🇵🇪',
  EC: '🇪🇨',
  AR: '🇦🇷',
};

export function RulesTable({
  rules,
  onView,
  isLoading,
}: RulesTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <Globe className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No hay reglas
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No se encontraron reglas de nómina para los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">País</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Año</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Salario Mínimo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Salud Emp.</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Pensión Emp.</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Auxilio Trans.</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow
              key={rule.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{countryFlags[rule.country_code] || '🌍'}</span>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {countryNames[rule.country_code] || rule.country_code}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {rule.name}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-medium text-gray-900 dark:text-white">
                {rule.year}
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white">
                {formatCurrency(rule.minimum_wage || 0, rule.minimum_wage_currency || 'COP')}
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {((rule.health_employee_pct || 0) * 100).toFixed(1)}%
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {((rule.pension_employee_pct || 0) * 100).toFixed(1)}%
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {formatCurrency(rule.transport_allowance || 0, rule.minimum_wage_currency || 'COP')}
              </TableCell>
              <TableCell>
                {rule.is_active ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Activo
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                    Inactivo
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onView(rule)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Ver
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
