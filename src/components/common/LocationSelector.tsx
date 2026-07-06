'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';

export interface LocationData {
  country: string;
  countryCode: string;
  state: string;
  stateCode?: string;
  city: string;
  municipalityId?: string;
}

interface LocationSelectorProps {
  value: LocationData;
  onChange: (data: LocationData) => void;
  errors?: Record<string, string>;
  layout?: 'grid' | 'stacked';
}

interface Country {
  code: string;
  name: string;
}

interface StateOption {
  state_code: string;
  state_name: string;
}

interface MunicipalityOption {
  id: string;
  code: string;
  name: string;
  state_code: string;
  state_name: string;
}

const inputBaseClass = 'block w-full rounded-lg border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 shadow-sm px-4 py-3 sm:text-sm dark:bg-white dark:text-gray-900';
const branchInputClass = 'input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white dark:bg-white dark:text-gray-900 dark:border-gray-300';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const branchLabelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const errorClass = 'border-red-300 dark:border-red-500';

export default function LocationSelector({ value, onChange, errors = {}, layout = 'grid' }: LocationSelectorProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [municipalities, setMunicipalities] = useState<MunicipalityOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);

  const isBranchStyle = layout === 'stacked';
  const inputClass = isBranchStyle ? branchInputClass : inputBaseClass;
  const lblClass = isBranchStyle ? branchLabelClass : labelClass;

  useEffect(() => {
    const fetchCountries = async () => {
      const { data } = await supabase
        .from('countries')
        .select('code, name')
        .eq('is_active', true)
        .order('name');
      if (data) setCountries(data);
    };
    fetchCountries();
  }, []);

  const fetchStates = useCallback(async (countryCode: string) => {
    if (!countryCode) {
      setStates([]);
      return;
    }
    setLoadingStates(true);
    const { data } = await supabase
      .from('municipalities')
      .select('state_code, state_name')
      .eq('country_code', countryCode)
      .order('state_name');
    if (data) {
      const uniqueStates = Array.from(
        data.reduce((map, item) => map.set(item.state_code, item), new Map<string, StateOption>())
        .values()
      ) as StateOption[];
      setStates(uniqueStates);
    } else {
      setStates([]);
    }
    setLoadingStates(false);
  }, []);

  const fetchMunicipalities = useCallback(async (countryCode: string, stateCode: string) => {
    if (!countryCode || !stateCode) {
      setMunicipalities([]);
      return;
    }
    setLoadingMunicipalities(true);
    const { data } = await supabase
      .from('municipalities')
      .select('id, code, name, state_code, state_name')
      .eq('country_code', countryCode)
      .eq('state_code', stateCode)
      .order('name');
    if (data) {
      setMunicipalities(data);
    } else {
      setMunicipalities([]);
    }
    setLoadingMunicipalities(false);
  }, []);

  useEffect(() => {
    if (value.countryCode) {
      fetchStates(value.countryCode);
      if (value.stateCode) {
        fetchMunicipalities(value.countryCode, value.stateCode);
      }
    }
  }, [value.countryCode, value.stateCode, fetchStates, fetchMunicipalities]);

  const hasStatesData = states.length > 0;

  const handleCountryChange = (countryCode: string) => {
    const country = countries.find(c => c.code === countryCode);
    setStates([]);
    setMunicipalities([]);
    onChange({
      ...value,
      countryCode,
      country: country?.name || '',
      state: '',
      stateCode: '',
      city: '',
      municipalityId: '',
    });
  };

  const handleStateChange = (stateCode: string) => {
    const state = states.find(s => s.state_code === stateCode);
    setMunicipalities([]);
    onChange({
      ...value,
      state: state?.state_name || '',
      stateCode: stateCode,
      city: '',
      municipalityId: '',
    });
  };

  const handleMunicipalityChange = (municipalityId: string) => {
    const muni = municipalities.find(m => m.id === municipalityId);
    onChange({
      ...value,
      city: muni?.name || '',
      municipalityId: municipalityId,
    });
  };

  const handleTextStateChange = (stateText: string) => {
    onChange({ ...value, state: stateText, stateCode: '', city: value.city });
  };

  const handleTextCityChange = (cityText: string) => {
    onChange({ ...value, city: cityText, municipalityId: '' });
  };

  if (isBranchStyle) {
    return (
      <div className="space-y-6">
        {/* País */}
        <div>
          <label className={lblClass}>País</label>
          <select
            value={value.countryCode}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={`${inputClass} ${errors.country ? errorClass : ''}`}
          >
            <option value="">Seleccionar país...</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          {errors.country && <p className="mt-1 text-xs text-red-500">{errors.country}</p>}
        </div>

        {/* Estado/Departamento */}
        <div>
          <label className={lblClass}>Estado / Provincia / Departamento</label>
          {hasStatesData ? (
            <select
              value={value.stateCode}
              onChange={(e) => handleStateChange(e.target.value)}
              className={`${inputClass} ${errors.state ? errorClass : ''}`}
              disabled={loadingStates}
            >
              <option value="">Seleccionar...</option>
              {states.map((s) => (
                <option key={s.state_code} value={s.state_code}>{s.state_name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={value.state}
              onChange={(e) => handleTextStateChange(e.target.value)}
              placeholder="Estado o provincia"
              className={`${inputClass} ${errors.state ? errorClass : ''}`}
            />
          )}
          {errors.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
        </div>

        {/* Ciudad/Municipio */}
        <div>
          <label className={lblClass}>Ciudad / Municipio</label>
          {hasStatesData && value.stateCode ? (
            <select
              value={value.municipalityId}
              onChange={(e) => handleMunicipalityChange(e.target.value)}
              className={`${inputClass} ${errors.city ? errorClass : ''}`}
              disabled={loadingMunicipalities}
            >
              <option value="">Seleccionar...</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={value.city}
              onChange={(e) => handleTextCityChange(e.target.value)}
              placeholder="Ciudad"
              className={`${inputClass} ${errors.city ? errorClass : ''}`}
            />
          )}
          {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* País */}
      <div className="col-span-1">
        <label className={lblClass}>País</label>
        <select
          value={value.countryCode}
          onChange={(e) => handleCountryChange(e.target.value)}
          className={`${inputClass} ${errors.country ? errorClass : ''}`}
        >
          <option value="">Seleccionar país...</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
        {errors.country && <p className="mt-1 text-xs text-red-500">{errors.country}</p>}
      </div>

      {/* Estado/Departamento */}
      <div className="col-span-1">
        <label className={lblClass}>Estado / Provincia / Departamento</label>
        {hasStatesData ? (
          <select
            value={value.stateCode}
            onChange={(e) => handleStateChange(e.target.value)}
            className={`${inputClass} ${errors.state ? errorClass : ''}`}
            disabled={loadingStates}
          >
            <option value="">Seleccionar...</option>
            {states.map((s) => (
              <option key={s.state_code} value={s.state_code}>{s.state_name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value.state}
            onChange={(e) => handleTextStateChange(e.target.value)}
            placeholder="Estado o provincia"
            className={`${inputClass} ${errors.state ? errorClass : ''}`}
          />
        )}
        {errors.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
      </div>

      {/* Ciudad/Municipio */}
      <div className="col-span-1">
        <label className={lblClass}>Ciudad / Municipio</label>
        {hasStatesData && value.stateCode ? (
          <select
            value={value.municipalityId}
            onChange={(e) => handleMunicipalityChange(e.target.value)}
            className={`${inputClass} ${errors.city ? errorClass : ''}`}
            disabled={loadingMunicipalities}
          >
            <option value="">Seleccionar...</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value.city}
            onChange={(e) => handleTextCityChange(e.target.value)}
            placeholder="Ciudad"
            className={`${inputClass} ${errors.city ? errorClass : ''}`}
          />
        )}
        {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
      </div>
    </div>
  );
}
