'use client';

import { useState, useEffect } from 'react';
import { MapPin, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/config';

interface Municipality {
  id: string;
  code: string;
  name: string;
  state_name: string;
}

interface MunicipalitySearchProps {
  value: string;
  onChange: (municipalityId: string) => void;
  className?: string;
  compact?: boolean;
}

const BOGOTA_ID = 'aa4b6637-0060-41bb-9459-bc95f9789e08';

export function MunicipalitySearch({ value, onChange, className, compact = false }: MunicipalitySearchProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Municipality[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Cargar nombre del municipio seleccionado al montar
  useEffect(() => {
    if (!value) return;
    async function loadName() {
      const { data } = await supabase
        .from('municipalities')
        .select('name, state_name')
        .eq('id', value)
        .single();
      if (data) setSearch(`${data.name} - ${data.state_name}`);
    }
    loadName();
  }, []);

  // Buscar municipios con debounce
  useEffect(() => {
    if (search.length < 2) {
      setResults(prev => prev.length === 0 ? prev : []);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('municipalities')
        .select('id, code, name, state_name')
        .ilike('name', `%${search}%`)
        .order('name')
        .limit(15);
      if (data) setResults(data);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const handleSelect = (muni: Municipality) => {
    onChange(muni.id);
    setSearch(`${muni.name} - ${muni.state_name}`);
    setShowDropdown(false);
  };

  const handleClear = () => {
    onChange(BOGOTA_ID);
    setSearch('');
  };

  const labelSize = compact ? 'text-xs' : 'text-sm';
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const inputHeight = compact ? 'h-8 text-xs' : 'h-10 text-sm';

  return (
    <div className={`space-y-2 relative ${className || ''}`}>
      <Label className={`${labelSize} font-medium flex items-center gap-1`}>
        <MapPin className={iconSize} /> Municipio
      </Label>
      <div className="relative">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
            if (!e.target.value) {
              onChange(BOGOTA_ID);
            }
          }}
          onFocus={() => search.length >= 2 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Buscar municipio... (Bogotá D.C. por defecto)"
          className={`${inputHeight} bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 pr-8`}
          autoComplete="off"
        />
        {value && value !== BOGOTA_ID && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {results.map((muni) => (
            <button
              key={muni.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(muni)}
            >
              <span className="font-medium">{muni.name}</span>
              <span className="text-gray-500 dark:text-gray-400 ml-1 text-xs">({muni.code}) - {muni.state_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
