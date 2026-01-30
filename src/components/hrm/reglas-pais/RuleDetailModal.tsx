'use client';

import type { CountryPayrollRules } from '@/lib/services/hrmConfigService';
import { formatCurrency, formatDate } from '@/utils/Utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Globe, DollarSign, Percent, Clock, FileText } from 'lucide-react';

interface RuleDetailModalProps {
  rule: CountryPayrollRules | null;
  open: boolean;
  onClose: () => void;
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
};

export function RuleDetailModal({
  rule,
  open,
  onClose,
}: RuleDetailModalProps) {
  if (!rule) return null;

  const pctFormat = (val: number | null) => ((val || 0) * 100).toFixed(2) + '%';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-gray-800 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Globe className="h-5 w-5 text-blue-600" />
            {rule.name}
            {rule.is_active && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 ml-2">
                Activo
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">País</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {countryNames[rule.country_code] || rule.country_code}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Año</p>
              <p className="font-medium text-gray-900 dark:text-white">{rule.year}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Vigencia</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatDate(rule.valid_from)} - {rule.valid_to ? formatDate(rule.valid_to) : 'Indefinido'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Moneda</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {rule.minimum_wage_currency || 'COP'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Salaries */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-green-600" />
              Salarios y Subsidios
            </h4>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Salario Mínimo</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(rule.minimum_wage || 0, rule.minimum_wage_currency || 'COP')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Auxilio de Transporte</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(rule.transport_allowance || 0, rule.minimum_wage_currency || 'COP')}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aplica hasta salario de:
                </p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(rule.transport_allowance_threshold || 0, rule.minimum_wage_currency || 'COP')}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Employee Deductions */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Percent className="h-4 w-4 text-red-600" />
              Aportes del Empleado
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
              <div>
                <p className="text-sm text-red-700 dark:text-red-300">Salud</p>
                <p className="text-lg font-bold text-red-800 dark:text-red-200">
                  {pctFormat(rule.health_employee_pct)}
                </p>
              </div>
              <div>
                <p className="text-sm text-red-700 dark:text-red-300">Pensión</p>
                <p className="text-lg font-bold text-red-800 dark:text-red-200">
                  {pctFormat(rule.pension_employee_pct)}
                </p>
              </div>
            </div>
          </div>

          {/* Employer Contributions */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Percent className="h-4 w-4 text-blue-600" />
              Aportes del Empleador
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300">Salud</p>
                <p className="text-lg font-bold text-blue-800 dark:text-blue-200">
                  {pctFormat(rule.health_employer_pct)}
                </p>
              </div>
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300">Pensión</p>
                <p className="text-lg font-bold text-blue-800 dark:text-blue-200">
                  {pctFormat(rule.pension_employer_pct)}
                </p>
              </div>
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300">ARL</p>
                <p className="text-lg font-bold text-blue-800 dark:text-blue-200">
                  {pctFormat(rule.arl_base_pct)}
                </p>
              </div>
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300">Parafiscales</p>
                <p className="text-lg font-bold text-blue-800 dark:text-blue-200">
                  {pctFormat(rule.parafiscales_pct)}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Overtime Multipliers */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-amber-600" />
              Recargos y Horas Extra
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Extra Diurna</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  x{rule.overtime_day_multiplier || 1.25}
                </p>
              </div>
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Extra Nocturna</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  x{rule.overtime_night_multiplier || 1.75}
                </p>
              </div>
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Recargo Nocturno</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  x{rule.night_surcharge_multiplier || 1.35}
                </p>
              </div>
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Dominical/Festivo</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  x{rule.sunday_holiday_multiplier || 1.75}
                </p>
              </div>
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Extra Fest. Día</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  x{rule.overtime_holiday_day_multiplier || 2.0}
                </p>
              </div>
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Extra Fest. Noche</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  x{rule.overtime_holiday_night_multiplier || 2.5}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Provisions */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-purple-600" />
              Provisiones
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <div>
                <p className="text-sm text-purple-700 dark:text-purple-300">Cesantías</p>
                <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                  {pctFormat(rule.severance_rate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-purple-700 dark:text-purple-300">Int. Cesantías</p>
                <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                  {pctFormat(rule.severance_interest_rate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-purple-700 dark:text-purple-300">Vacaciones</p>
                <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                  {pctFormat(rule.vacation_rate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-purple-700 dark:text-purple-300">Prima</p>
                <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                  {pctFormat(rule.bonus_rate)}
                </p>
              </div>
            </div>
          </div>

          {/* Tax Brackets */}
          {rule.tax_brackets && rule.tax_brackets.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Tabla de Retención en la Fuente (UVT)
                </h4>
                <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Desde UVT</th>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Hasta UVT</th>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Tarifa</th>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Base UVT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rule.tax_brackets.map((bracket, idx) => (
                        <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                          <td className="px-4 py-2 text-gray-900 dark:text-white">{bracket.from_uvt}</td>
                          <td className="px-4 py-2 text-gray-900 dark:text-white">
                            {bracket.to_uvt || '∞'}
                          </td>
                          <td className="px-4 py-2 text-gray-900 dark:text-white">
                            {(bracket.rate * 100).toFixed(0)}%
                          </td>
                          <td className="px-4 py-2 text-gray-900 dark:text-white">{bracket.base_uvt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
