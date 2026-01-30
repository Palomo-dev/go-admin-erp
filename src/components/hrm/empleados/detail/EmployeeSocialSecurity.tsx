'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, CreditCard, AlertTriangle } from 'lucide-react';

interface EmployeeSocialSecurityProps {
  employee: {
    eps_code: string | null;
    afp_code: string | null;
    arl_code: string | null;
    arl_risk_level: number | null;
    severance_fund_code: string | null;
    bank_name: string | null;
    bank_account_type: string | null;
    bank_account_number: string | null;
  };
}

const ARL_RISK_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Nivel I - Mínimo', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  2: { label: 'Nivel II - Bajo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  3: { label: 'Nivel III - Medio', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  4: { label: 'Nivel IV - Alto', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  5: { label: 'Nivel V - Máximo', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  savings: 'Ahorros',
  checking: 'Corriente',
};

export function EmployeeSocialSecurity({ employee }: EmployeeSocialSecurityProps) {
  const hasAnySocialSecurity =
    employee.eps_code ||
    employee.afp_code ||
    employee.arl_code ||
    employee.severance_fund_code;

  const hasAnyBankInfo =
    employee.bank_name || employee.bank_account_type || employee.bank_account_number;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Seguridad Social */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
            <Shield className="h-5 w-5 text-blue-600" />
            Seguridad Social
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAnySocialSecurity ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">EPS</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {employee.eps_code || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">AFP</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {employee.afp_code || '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">ARL</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {employee.arl_code || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Nivel de Riesgo</p>
                  {employee.arl_risk_level ? (
                    <Badge
                      variant="secondary"
                      className={ARL_RISK_LABELS[employee.arl_risk_level]?.color}
                    >
                      {ARL_RISK_LABELS[employee.arl_risk_level]?.label}
                    </Badge>
                  ) : (
                    <span className="text-gray-900 dark:text-white">-</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fondo de Cesantías</p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {employee.severance_fund_code || '-'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                No hay información de seguridad social registrada
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Datos Bancarios */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Datos Bancarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAnyBankInfo ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Banco</p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {employee.bank_name || '-'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo de Cuenta</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {employee.bank_account_type
                      ? ACCOUNT_TYPE_LABELS[employee.bank_account_type] || employee.bank_account_type
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Número de Cuenta</p>
                  <p className="text-gray-900 dark:text-white font-mono">
                    {employee.bank_account_number
                      ? `****${employee.bank_account_number.slice(-4)}`
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                No hay datos bancarios registrados
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default EmployeeSocialSecurity;
