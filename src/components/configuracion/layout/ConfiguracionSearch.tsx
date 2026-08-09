'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { type ConfigModule } from '../config/configModulesRegistry';

interface ConfiguracionSearchProps {
  onResults: (filteredModules: ConfigModule[]) => void;
  allModules: ConfigModule[];
}

export function ConfiguracionSearch({ onResults, allModules }: ConfiguracionSearchProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return allModules;
    const lower = query.toLowerCase();
    return allModules.filter(
      (mod) =>
        mod.title.toLowerCase().includes(lower) ||
        mod.description.toLowerCase().includes(lower) ||
        mod.sections.some((s) => s.label.toLowerCase().includes(lower))
    );
  }, [query, allModules]);

  const handleChange = (value: string) => {
    setQuery(value);
    onResults(filtered);
  };

  return (
    <div className="px-3 py-2 relative">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Buscar configuración..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-8 h-9 text-sm"
      />
    </div>
  );
}
