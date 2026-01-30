'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import HRMConfigService from '@/lib/services/hrmConfigService';
import type { OrganizationHRMSettings, OrganizationCurrency, UpdateHRMSettingsDTO } from '@/lib/services/hrmConfigService';
import { SettingsForm, CurrenciesCard } from '@/components/hrm/configuracion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  Settings,
  ArrowLeft,
  DollarSign,
  Globe,
} from 'lucide-react';

export default function ConfiguracionHRMPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();
  const service = new HRMConfigService();

  const [settings, setSettings] = useState<OrganizationHRMSettings | null>(null);
  const [currencies, setCurrencies] = useState<OrganizationCurrency[]>([]);
  const [countriesList, setCountriesList] = useState<{ code: string; name: string; currency: string }[]>([]);
  const [currenciesList, setCurrenciesList] = useState<{ code: string; name: string; symbol: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const [settingsData, currenciesData, countriesData, availableCurrenciesData] = await Promise.all([
        service.getOrganizationSettings(organization.id),
        service.getOrganizationCurrencies(organization.id),
        service.getAvailableCountriesFromDB().catch(() => service.getAvailableCountries()),
        service.getAvailableCurrenciesFromDB().catch(() => service.getAvailableCurrencies()),
      ]);

      setSettings(settingsData);
      setCurrencies(currenciesData);
      setCountriesList(countriesData);
      setCurrenciesList(availableCurrenciesData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleSaveSettings = async (data: UpdateHRMSettingsDTO) => {
    if (!organization?.id) return;

    try {
      await service.updateOrganizationSettings(organization.id, data);
      toast({ title: 'Configuración guardada correctamente' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSetBaseCurrency = async (currencyCode: string) => {
    if (!organization?.id) return;

    try {
      await service.setBaseCurrency(organization.id, currencyCode);
      toast({ title: `${currencyCode} establecida como moneda base` });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo establecer la moneda base',
        variant: 'destructive',
      });
    }
  };

  const handleAddCurrency = async (currencyCode: string) => {
    if (!organization?.id) return;

    try {
      await service.addCurrency(organization.id, currencyCode);
      toast({ title: `${currencyCode} agregada` });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo agregar la moneda',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveCurrency = async (currencyCode: string) => {
    if (!organization?.id) return;

    try {
      await service.removeCurrency(organization.id, currencyCode);
      toast({ title: `${currencyCode} eliminada` });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la moneda',
        variant: 'destructive',
      });
    }
  };

  const frequencies = service.getFrequencyOptions();
  const overtimePolicies = service.getOvertimePolicies();

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

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
              <Settings className="h-7 w-7 text-blue-600" />
              Configuración HRM
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Configuración de la Organización
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <TabsTrigger value="general" className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900">
            <Settings className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="currencies" className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900">
            <DollarSign className="mr-2 h-4 w-4" />
            Monedas
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          {settings && (
            <SettingsForm
              settings={settings}
              countries={countriesList}
              frequencies={frequencies}
              overtimePolicies={overtimePolicies}
              onSubmit={handleSaveSettings}
              isLoading={isLoading}
            />
          )}

          {/* Country Rules Link */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-6 w-6 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Reglas de País
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Consulta las reglas legales de nómina por país (salario mínimo, aportes, etc.)
                    </p>
                  </div>
                </div>
                <Link href="/app/hrm/reglas-pais">
                  <Button variant="outline">
                    Ver Reglas
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Currencies Tab */}
        <TabsContent value="currencies" className="space-y-6">
          <CurrenciesCard
            currencies={currencies}
            availableCurrencies={currenciesList}
            onSetBase={handleSetBaseCurrency}
            onAdd={handleAddCurrency}
            onRemove={handleRemoveCurrency}
            isLoading={isLoading}
          />

          {/* Currency Info */}
          <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    Sobre las Monedas
                  </p>
                  <ul className="text-sm text-amber-700 dark:text-amber-300 mt-2 space-y-1">
                    <li>• La <strong>moneda base</strong> se usa para cálculos de nómina y reportes.</li>
                    <li>• Puede agregar múltiples monedas para operaciones internacionales.</li>
                    <li>• Las tasas de cambio se pueden configurar manualmente o auto-actualizar.</li>
                    <li>• No puede eliminar la moneda base; primero cambie a otra.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← Volver a HRM
              </Button>
            </Link>
            <Link href="/app/hrm/reglas-pais">
              <Button variant="outline" size="sm">
                Reglas de País
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
    </div>
  );
}
