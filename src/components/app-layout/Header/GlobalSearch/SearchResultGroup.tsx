'use client';

import { CommandGroup } from '@/components/ui/command';
import { SearchResult, SearchResultType } from './types';
import { SearchResultItem } from './SearchResultItem';

interface SearchResultGroupProps {
  heading: string;
  resultType: SearchResultType;
  results: SearchResult[];
  onSelect: (item: SearchResult) => void;
}

/**
 * Componente que agrupa y renderiza resultados de búsqueda por tipo
 * Esto elimina la duplicación de las secciones de resultados en el componente principal
 */
export const SearchResultGroup = ({ heading, resultType, results, onSelect }: SearchResultGroupProps) => {
  // Filtrar resultados por tipo
  const filteredResults = results.filter(r => r.type === resultType);
  
  // No renderizar nada si no hay resultados de este tipo
  if (filteredResults.length === 0) return null;

  return (
    <CommandGroup 
      heading={heading} 
      className="px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 group/resultgroup relative z-0 pointer-events-auto"
    >
      {filteredResults.map(item => (
        <SearchResultItem 
          key={`${resultType}-${item.id}`}
          item={item}
          onSelect={onSelect}
        />
      ))}
    </CommandGroup>
  );
};
