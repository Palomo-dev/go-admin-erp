'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import HRMConfigService from '@/lib/services/hrmConfigService';
import type { OrganizationHRMSettings, OrganizationCurrency, UpdateHRMSettingsDTO } from '@/lib/services/hrmConfigService';
import { SettingsForm, CurrenciesCard } from '@/components/hrm/configuracion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Globe, DollarSign } from 'lucide-react';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';

export function HRMConfigPanel() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();
  const t = useTranslations('configuracionTextos.hrmConfigPanel');
  const service = useMemo(() => new HRMConfigService(), []);

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
    } catch {
      console.error('Error loading data');
      toast({ title: t('error'), description: t('errorCargar'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast, service, t]);

  useEffect(() => {
    if (organization?.id && !orgLoading) loadData();
  }, [organization?.id, orgLoading, loadData]);

  const handleSaveSettings = async (data: UpdateHRMSettingsDTO) => {
    if (!organization?.id) return;
    try {
      await service.updateOrganizationSettings(organization.id, data);
      toast({ title: t('guardada') });
      await loadData();
    } catch (error) {
      toast({ title: t('error'), description: t('errorGuardar'), variant: 'destructive' });
      throw error;
    }
  };

  const handleSetBaseCurrency = async (currencyCode: string) => {
    if (!organization?.id) return;
    try {
      await service.setBaseCurrency(organization.id, currencyCode);
      toast({ title: t('monedaBaseEstablecida', { moneda: currencyCode }) });
      await loadData();
    } catch {
      toast({ title: t('error'), description: t('errorMonedaBase'), variant: 'destructive' });
    }
  };

  const handleAddCurrency = async (currencyCode: string) => {
    if (!organization?.id) return;
    try {
      await service.addCurrency(organization.id, currencyCode);
      toast({ title: t('monedaAgregada', { moneda: currencyCode }) });
      await loadData();
    } catch {
      toast({ title: t('error'), description: t('errorAgregar'), variant: 'destructive' });
    }
  };

  const handleRemoveCurrency = async (currencyCode: string) => {
    if (!organization?.id) return;
    try {
      await service.removeCurrency(organization.id, currencyCode);
      toast({ title: t('monedaEliminada', { moneda: currencyCode }) });
      await loadData();
    } catch {
      toast({ title: t('error'), description: t('errorEliminar'), variant: 'destructive' });
    }
  };

  const frequencies = service.getFrequencyOptions();
  const overtimePolicies = service.getOvertimePolicies();

  if (orgLoading || isLoading) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={4} columns="2" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Configuración General */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">{t('configuracionGeneral')}</h3>
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

        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{t('reglasPais.titulo')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('reglasPais.descripcion')}
                  </p>
                </div>
              </div>
              <Link href="/app/hrm/reglas-pais">
                <Button variant="outline">{t('reglasPais.ver')}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monedas */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">{t('monedas')}</h3>
        <CurrenciesCard
          currencies={currencies}
          availableCurrencies={currenciesList}
          onSetBase={handleSetBaseCurrency}
          onAdd={handleAddCurrency}
          onRemove={handleRemoveCurrency}
          isLoading={isLoading}
        />

        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <DollarSign className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-100">{t('sobreMonedas.titulo')}</p>
                <ul className="text-sm text-amber-700 dark:text-amber-300 mt-2 space-y-1">
                  <li>• {t.rich('sobreMonedas.base', { b: (c) => <strong>{c}</strong> })}</li>
                  <li>• {t('sobreMonedas.multiples')}</li>
                  <li>• {t('sobreMonedas.tasas')}</li>
                  <li>• {t('sobreMonedas.noEliminarBase')}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
