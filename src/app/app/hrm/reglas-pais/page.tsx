'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import HRMConfigService from '@/lib/services/hrmConfigService';
import type { CountryPayrollRules } from '@/lib/services/hrmConfigService';
import { RulesTable, RuleDetailModal, RulesPagination } from '@/components/hrm/reglas-pais';
import { formatCurrency } from '@/utils/Utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  Globe,
  ArrowLeft,
  DollarSign,
  Calendar,
  Shield,
} from 'lucide-react';

export default function ReglasPaisPage() {
  const { toast } = useToast();
  const service = new HRMConfigService();

  const [rules, setRules] = useState<CountryPayrollRules[]>([]);
  const [countriesList, setCountriesList] = useState<{ code: string; name: string; currency: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [selectedRule, setSelectedRule] = useState<CountryPayrollRules | null>(null);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (countryFilter && countryFilter !== 'all') {
        // Convertir ISO-3 (COL) a ISO-2 (CO) para country_payroll_rules
        filters.country_code = service.convertToISO2(countryFilter);
      }
      if (yearFilter && yearFilter !== 'all') {
        filters.year = parseInt(yearFilter);
      }

      const [rulesData, countriesData] = await Promise.all([
        service.getCountryRules(filters),
        service.getAvailableCountriesFromDB().catch(() => service.getAvailableCountries()),
      ]);
      setRules(rulesData);
      setCountriesList(countriesData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las reglas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [countryFilter, yearFilter, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get unique years from rules
  const years = Array.from(new Set(rules.map(r => r.year))).sort((a, b) => b - a);

  // Paginación
  const totalPages = Math.ceil(rules.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRules = rules.slice(startIndex, startIndex + pageSize);

  // Reset page cuando cambia pageSize o filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, countryFilter, yearFilter]);

  // Current Colombia rules for quick reference (soporta CO y COL)
  const currentCoRules = rules.find(r => (r.country_code === 'CO' || r.country_code === 'COL') && r.is_active && r.year === new Date().getFullYear());

  // Helper para obtener nombre del país desde código ISO2 o ISO3
  const getCountryName = (code: string): string => {
    const country = countriesList.find(c => c.code === code || service.convertToISO2(c.code) === code);
    return country?.name || code;
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="h-7 w-7 text-blue-600" />
              Reglas de País
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Reglas Legales por País
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info Banner - Solo Lectura */}
      <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                📋 Catálogo de Reglas Legales (Solo Lectura)
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Estas son las reglas oficiales de nómina por país y año, mantenidas por el equipo de GO Admin.
                Incluyen salarios mínimos, porcentajes de deducciones y multiplicadores de horas extra para 
                cada país. Estas reglas se actualizan anualmente y son utilizadas para el cálculo automático de nómina.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Reference - Current Colombia */}
      {currentCoRules && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">SMLV {currentCoRules.year}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(currentCoRules.minimum_wage || 0, 'COP')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Aux. Transporte</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(currentCoRules.transport_allowance || 0, 'COP')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                  <Calendar className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Salud + Pensión Emp.</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {(((currentCoRules.health_employee_pct || 0) + (currentCoRules.pension_employee_pct || 0)) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Globe className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">País Activo</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    🇨🇴 Colombia
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-full md:w-48 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="País" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todos los países</SelectItem>
                {countriesList.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-full md:w-36 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todos</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <RulesTable
            rules={paginatedRules}
            onView={(rule) => setSelectedRule(rule)}
            isLoading={isLoading}
          />
          {rules.length > 0 && (
            <RulesPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={rules.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← Volver a HRM
              </Button>
            </Link>
            <Link href="/app/hrm/configuracion">
              <Button variant="outline" size="sm">
                Configuración HRM
              </Button>
            </Link>
            <Link href="/app/hrm/nomina">
              <Button variant="outline" size="sm">
                Nómina
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <RuleDetailModal
        rule={selectedRule}
        open={!!selectedRule}
        onClose={() => setSelectedRule(null)}
      />
    </div>
  );
}
