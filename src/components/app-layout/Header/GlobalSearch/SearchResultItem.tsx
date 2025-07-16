'use client';

import { CommandItem } from '@/components/ui/command';
import { ArrowUpRight, Building, Building2, Briefcase, Layers, ShoppingBasket, ShoppingCart, Users } from 'lucide-react';
import { SearchResult } from './types';
import { UserAvatar } from './UserAvatar';
import { ProductImage } from './ProductImage';

interface SearchResultItemProps {
  item: SearchResult;
  onSelect: (item: SearchResult) => void;
}

/**
 * Componente que renderiza un resultado individual de búsqueda
 */
export const SearchResultItem = ({ item, onSelect }: SearchResultItemProps) => {
  // Determinar qué icono mostrar según el tipo de resultado
  const getIcon = () => {
    switch (item.type) {
      case 'page':
        return <ShoppingCart className="mr-2 h-4 w-4" />;
      case 'organization':
        return <Building2 className="mr-2 h-4 w-4" />;
      case 'branch':
        return <Building className="mr-2 h-4 w-4" />;
      case 'user':
        return <Users className="mr-2 h-4 w-4" />;
      case 'customer':
        return <Users className="mr-2 h-4 w-4" />;
      case 'product':
        return <ShoppingBasket className="mr-2 h-4 w-4" />;
      case 'supplier':
        return <Briefcase className="mr-2 h-4 w-4" />;
      case 'category':
        return <Layers className="mr-2 h-4 w-4" />;
      default:
        return <ShoppingCart className="mr-2 h-4 w-4" />;
    }
  };

  // Handler para manejo explícito del clic mejorado para capturar todos los eventos
  const handleItemSelect = () => {
    console.log('Item seleccionado:', item.name, '| URL:', item.url);
    // Solo continuar si hay un item válido con URL
    if (!item || !item.url) {
      console.error('Error: Intento de navegar a un resultado sin URL');
      return;
    }
    
    // Primero llamar a onSelect para cerrar el diálogo inmediatamente
    onSelect(item);
    
    // Navegación con setTimeout para asegurar que el diálogo se cierre primero
    setTimeout(() => {
      // Usar un elemento <a> real para navegación robusta
      const link = document.createElement('a');
      link.href = item.url;
      link.setAttribute('data-search-result', item.type);
      link.setAttribute('data-search-id', String(item.id));
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('Navegación iniciada a:', item.url);
    }, 10);
  };
  
  // Generar iniciales para avatar si es usuario o cliente
  const getInitials = () => {
    if (!item.name) return '';
    const nameParts = item.name.trim().split(/\s+/);
    if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();
    return (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase();
  };
  
  // Determinar si mostrar avatar o icono según el tipo de resultado
  const renderItemIcon = () => {
    if (item.type === 'user' || item.type === 'customer') {
      return (
        <UserAvatar 
          name={item.name} 
          avatarUrl={item.avatarUrl} 
          size="sm" 
          className="flex-shrink-0" 
        />
      );
    } else if (item.type === 'product') {
      return (
        <ProductImage 
          name={item.name} 
          imagePath={item.imagePath} 
          size="sm" 
          className="flex-shrink-0" 
        />
      );
    } else {
      return <span className="flex-shrink-0">{getIcon()}</span>;
    }
  };

  // Handler para manejo directo de eventos de mouse
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleItemSelect();
  };

  // Handler para evento de teclado (Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleItemSelect();
    }
  };

  return (
    <CommandItem
      key={`${item.type}-${item.id}`}
      value={`${item.type}-${item.id}-${item.name}`}
      onSelect={handleItemSelect}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex items-center px-3 py-3 cursor-pointer rounded-md opacity-80 hover:opacity-100 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 data-[selected=true]:bg-blue-100 dark:data-[selected=true]:bg-blue-800/30 data-[selected=true]:opacity-100 data-[selected=true]:shadow-md border border-transparent hover:border-blue-200 dark:hover:border-blue-700 group !pointer-events-auto relative z-10"
      tabIndex={0}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {renderItemIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
            {item.name}
          </p>
          {item.description && (
            <p className="text-xs truncate text-gray-500 dark:text-gray-400">
              {item.description}
            </p>
          )}
        </div>
        <div className="flex items-center justify-center p-1.5 bg-blue-100 dark:bg-blue-800/40 rounded-full hover:bg-blue-200 dark:hover:bg-blue-700/60 transition-colors group-hover:scale-110">
          <ArrowUpRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
        </div>
      </div>
    </CommandItem>
  );
};
