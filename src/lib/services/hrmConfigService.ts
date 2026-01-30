'use client';

import { supabase } from '@/lib/supabase/config';

export interface CountryPayrollRules {
  id: string;
  country_code: string;
  name: string;
  year: number;
  minimum_wage: number | null;
  minimum_wage_currency: string | null;
  health_employee_pct: number | null;
  pension_employee_pct: number | null;
  health_employer_pct: number | null;
  pension_employer_pct: number | null;
  arl_base_pct: number | null;
  parafiscales_pct: number | null;
  transport_allowance: number | null;
  transport_allowance_threshold: number | null;
  overtime_day_multiplier: number | null;
  overtime_night_multiplier: number | null;
  overtime_holiday_day_multiplier: number | null;
  overtime_holiday_night_multiplier: number | null;
  night_surcharge_multiplier: number | null;
  sunday_holiday_multiplier: number | null;
  tax_brackets: TaxBracket[] | null;
  severance_rate: number | null;
  severance_interest_rate: number | null;
  vacation_rate: number | null;
  bonus_rate: number | null;
  metadata: Record<string, any> | null;
  is_active: boolean;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxBracket {
  from_uvt: number;
  to_uvt: number | null;
  rate: number;
  base_uvt: number;
}

export interface OrganizationCurrency {
  organization_id: number;
  currency_code: string;
  is_base: boolean;
  auto_update: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationHRMSettings {
  id: number;
  name: string;
  legal_name: string;
  country: string | null;
  country_code: string | null;
  city: string | null;
  nit: string | null;
  tax_id: string | null;
  // HRM specific (from metadata or settings table)
  default_frequency?: string;
  overtime_policy?: string;
  base_currency?: string;
}

export interface UpdateHRMSettingsDTO {
  country?: string;
  country_code?: string;
  city?: string;
  nit?: string;
  tax_id?: string;
}

class HRMConfigService {
  // Country Payroll Rules (read-only for most users)
  async getCountryRules(filters?: { 
    country_code?: string; 
    year?: number;
    is_active?: boolean;
  }): Promise<CountryPayrollRules[]> {
    let query = supabase
      .from('country_payroll_rules')
      .select('*')
      .order('year', { ascending: false })
      .order('country_code');

    if (filters?.country_code) {
      query = query.eq('country_code', filters.country_code);
    }
    if (filters?.year) {
      query = query.eq('year', filters.year);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getCountryRuleById(id: string): Promise<CountryPayrollRules | null> {
    const { data, error } = await supabase
      .from('country_payroll_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getCurrentRulesForCountry(countryCode: string): Promise<CountryPayrollRules | null> {
    const currentYear = new Date().getFullYear();
    const { data, error } = await supabase
      .from('country_payroll_rules')
      .select('*')
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .eq('year', currentYear)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Super Admin only - Update rules
  async updateCountryRule(id: string, updates: Partial<CountryPayrollRules>): Promise<CountryPayrollRules> {
    const { data, error } = await supabase
      .from('country_payroll_rules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Super Admin only - Create rules
  async createCountryRule(rule: Omit<CountryPayrollRules, 'id' | 'created_at' | 'updated_at'>): Promise<CountryPayrollRules> {
    const { data, error } = await supabase
      .from('country_payroll_rules')
      .insert(rule)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Organization Settings
  async getOrganizationSettings(organizationId: number): Promise<OrganizationHRMSettings | null> {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, legal_name, country, country_code, city, nit, tax_id')
      .eq('id', organizationId)
      .single();

    if (error) throw error;
    
    // Get base currency
    const { data: currencyData } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', organizationId)
      .eq('is_base', true)
      .single();

    return data ? {
      ...data,
      base_currency: currencyData?.currency_code || 'COP',
      default_frequency: 'monthly',
      overtime_policy: 'standard',
    } : null;
  }

  async updateOrganizationSettings(organizationId: number, dto: UpdateHRMSettingsDTO): Promise<void> {
    const { error } = await supabase
      .from('organizations')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (error) throw error;
  }

  // Organization Currencies
  async getOrganizationCurrencies(organizationId: number): Promise<OrganizationCurrency[]> {
    const { data, error } = await supabase
      .from('organization_currencies')
      .select('*')
      .eq('organization_id', organizationId)
      .order('is_base', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async setBaseCurrency(organizationId: number, currencyCode: string): Promise<void> {
    // First, unset all base currencies
    await supabase
      .from('organization_currencies')
      .update({ is_base: false })
      .eq('organization_id', organizationId);

    // Check if currency exists
    const { data: existing } = await supabase
      .from('organization_currencies')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('currency_code', currencyCode)
      .single();

    if (existing) {
      // Update existing
      await supabase
        .from('organization_currencies')
        .update({ is_base: true, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('currency_code', currencyCode);
    } else {
      // Insert new
      await supabase
        .from('organization_currencies')
        .insert({
          organization_id: organizationId,
          currency_code: currencyCode,
          is_base: true,
          auto_update: true,
        });
    }
  }

  async addCurrency(organizationId: number, currencyCode: string): Promise<void> {
    const { error } = await supabase
      .from('organization_currencies')
      .insert({
        organization_id: organizationId,
        currency_code: currencyCode,
        is_base: false,
        auto_update: true,
      });

    if (error) throw error;
  }

  async removeCurrency(organizationId: number, currencyCode: string): Promise<void> {
    const { error } = await supabase
      .from('organization_currencies')
      .delete()
      .eq('organization_id', organizationId)
      .eq('currency_code', currencyCode)
      .eq('is_base', false); // Can't delete base currency

    if (error) throw error;
  }

  // Helper methods - cargar desde BD
  async getAvailableCountriesFromDB(): Promise<{ code: string; name: string; currency: string }[]> {
    const { data, error } = await supabase
      .from('countries')
      .select('code, name, default_currency_code')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return (data || []).map(c => ({
      code: c.code,
      name: c.name,
      currency: c.default_currency_code || 'USD',
    }));
  }

  async getAvailableCurrenciesFromDB(): Promise<{ code: string; name: string; symbol: string }[]> {
    const { data, error } = await supabase
      .from('currencies')
      .select('code, name, symbol')
      .eq('is_active', true)
      .order('code');

    if (error) throw error;
    return data || [];
  }

  // Fallback para compatibilidad
  getAvailableCountries(): { code: string; name: string; currency: string }[] {
    return [
      { code: 'COL', name: 'Colombia', currency: 'COP' },
      { code: 'MEX', name: 'México', currency: 'MXN' },
      { code: 'USA', name: 'Estados Unidos', currency: 'USD' },
      { code: 'ESP', name: 'España', currency: 'EUR' },
      { code: 'CHL', name: 'Chile', currency: 'CLP' },
      { code: 'BRA', name: 'Brasil', currency: 'BRL' },
    ];
  }

  getAvailableCurrencies(): { code: string; name: string; symbol: string }[] {
    return [
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
      { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'MXN', name: 'Peso mexicano', symbol: '$' },
    ];
  }

  // Mapeo entre códigos ISO 2 y 3 letras
  private countryCodeMap: Record<string, string> = {
    'CO': 'COL', 'COL': 'CO',
    'MX': 'MEX', 'MEX': 'MX',
    'US': 'USA', 'USA': 'US',
    'ES': 'ESP', 'ESP': 'ES',
    'CL': 'CHL', 'CHL': 'CL',
    'BR': 'BRA', 'BRA': 'BR',
    'AR': 'ARG', 'ARG': 'AR',
    'PE': 'PER', 'PER': 'PE',
    'AU': 'AUS', 'AUS': 'AU',
    'CA': 'CAN', 'CAN': 'CA',
    'GB': 'GBR', 'GBR': 'GB',
    'JP': 'JPN', 'JPN': 'JP',
  };

  // Convertir código ISO3 a ISO2 para country_payroll_rules
  convertToISO2(code: string): string {
    if (code.length === 2) return code;
    return this.countryCodeMap[code] || code.substring(0, 2);
  }

  // Convertir código ISO2 a ISO3 para tabla countries
  convertToISO3(code: string): string {
    if (code.length === 3) return code;
    return this.countryCodeMap[code] || code;
  }

  getFrequencyOptions(): { value: string; label: string }[] {
    return [
      { value: 'daily', label: 'Diario' },
      { value: 'weekly', label: 'Semanal' },
      { value: 'biweekly', label: 'Quincenal' },
      { value: 'monthly', label: 'Mensual' },
    ];
  }

  getOvertimePolicies(): { value: string; label: string }[] {
    return [
      { value: 'standard', label: 'Estándar (según ley)' },
      { value: 'flexible', label: 'Flexible (compensatorio)' },
      { value: 'strict', label: 'Estricto (preaprobación)' },
    ];
  }
}

export default HRMConfigService;
