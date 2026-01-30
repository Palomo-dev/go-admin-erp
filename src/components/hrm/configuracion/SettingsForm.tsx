'use client';

import { useState } from 'react';
import type { OrganizationHRMSettings, UpdateHRMSettingsDTO } from '@/lib/services/hrmConfigService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Save, Loader2 } from 'lucide-react';

interface SettingsFormProps {
  settings: OrganizationHRMSettings;
  countries: { code: string; name: string }[];
  frequencies: { value: string; label: string }[];
  overtimePolicies: { value: string; label: string }[];
  onSubmit: (data: UpdateHRMSettingsDTO) => Promise<void>;
  isLoading?: boolean;
}

export function SettingsForm({
  settings,
  countries,
  frequencies,
  overtimePolicies,
  onSubmit,
  isLoading,
}: SettingsFormProps) {
  const [formData, setFormData] = useState({
    country: settings.country || '',
    country_code: settings.country_code || 'CO',
    city: settings.city || '',
    nit: settings.nit || '',
    tax_id: settings.tax_id || '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Settings className="h-5 w-5 text-blue-600" />
          Configuración General
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Info */}
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">
              Información de la Organización
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Nombre</Label>
                <Input
                  value={settings.name}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Razón Social</Label>
                <Input
                  value={settings.legal_name}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country_code" className="text-gray-700 dark:text-gray-300">
                País
              </Label>
              <Select
                value={formData.country_code}
                onValueChange={(value) => {
                  const country = countries.find(c => c.code === value);
                  handleChange('country_code', value);
                  if (country) {
                    handleChange('country', country.name);
                  }
                }}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar país" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city" className="text-gray-700 dark:text-gray-300">
                Ciudad
              </Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="Ciudad principal"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Tax Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nit" className="text-gray-700 dark:text-gray-300">
                NIT
              </Label>
              <Input
                id="nit"
                value={formData.nit}
                onChange={(e) => handleChange('nit', e.target.value)}
                placeholder="NIT de la empresa"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_id" className="text-gray-700 dark:text-gray-300">
                Identificación Tributaria
              </Label>
              <Input
                id="tax_id"
                value={formData.tax_id}
                onChange={(e) => handleChange('tax_id', e.target.value)}
                placeholder="ID Tributario"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          {/* HRM Specific Settings (display only for now) */}
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-4">
              Configuración de Nómina
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-blue-700 dark:text-blue-300">Frecuencia de Pago</Label>
                <Select
                  value={settings.default_frequency || 'monthly'}
                  disabled
                >
                  <SelectTrigger className="bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {frequencies.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Configurable en próxima versión
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-blue-700 dark:text-blue-300">Política de Horas Extra</Label>
                <Select
                  value={settings.overtime_policy || 'standard'}
                  disabled
                >
                  <SelectTrigger className="bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {overtimePolicies.map((policy) => (
                      <SelectItem key={policy.value} value={policy.value}>
                        {policy.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Configurable en próxima versión
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-blue-700 dark:text-blue-300">Moneda Base</Label>
                <Input
                  value={settings.base_currency || 'COP'}
                  disabled
                  className="bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700"
                />
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Ver pestaña Monedas
                </p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
