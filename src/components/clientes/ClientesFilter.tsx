import React, { useMemo } from 'react';
import { Search, Filter, SortDesc, Clock } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
  municipality_name?: string;
  roles?: string[];
  tags?: string[];
  is_active?: boolean;
}

interface ClientesFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  roleFilter: string | null;
  onRoleFilterChange: (role: string | null) => void;
  tagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
  cityFilter: string | null;
  onCityFilterChange: (city: string | null) => void;
  balanceFilter: string | null;
  onBalanceFilterChange: (balance: string | null) => void;
  sortOrder?: string | null;
  onSortOrderChange?: (sortOrder: string | null) => void;
  customers: Customer[];
}

const ClientesFilter: React.FC<ClientesFilterProps> = ({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  tagFilter,
  onTagFilterChange,
  cityFilter,
  onCityFilterChange,
  balanceFilter,
  onBalanceFilterChange,
  sortOrder = null,
  onSortOrderChange = () => {},
  customers,
}) => {
  // Extraer opciones únicas de los clientes para los filtros
  const uniqueRoles = useMemo(() => {
    const rolesSet = new Set<string>();
    customers.forEach(customer => {
      if (customer.roles?.length) {
        customer.roles.forEach(role => rolesSet.add(role));
      }
    });
    return Array.from(rolesSet).sort();
  }, [customers]);

  const uniqueTags = useMemo(() => {
    const tagsSet = new Set<string>();
    customers.forEach(customer => {
      if (customer.tags?.length) {
        customer.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet).sort();
  }, [customers]);

  const uniqueCities = useMemo(() => {
    const citiesSet = new Set<string>();
    customers.forEach(customer => {
      const label = customer.municipality_name;
      if (label) {
        citiesSet.add(label);
      }
    });
    return Array.from(citiesSet).sort();
  }, [customers]);

  const handleClearFilters = () => {
    onSearchChange('');
    onRoleFilterChange(null);
    onTagFilterChange(null);
    onCityFilterChange(null);
    onBalanceFilterChange(null);
    onSortOrderChange(null);
  };
  
  // Calcular si hay filtros activos
  const hasActiveFilters = searchQuery || roleFilter || tagFilter || cityFilter || balanceFilter || sortOrder;

  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3 sm:space-y-4">
      <div className="flex flex-row justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">Filtros y opciones</h2>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
              {Object.values({searchQuery, roleFilter, tagFilter, cityFilter, balanceFilter, sortOrder}).filter(Boolean).length}
            </Badge>
          )}
        </div>
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearFilters} 
            className="text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 min-h-[36px]"
          >
            <span className="hidden sm:inline">Limpiar todo</span>
            <span className="sm:hidden">Limpiar</span>
          </Button>
        )}
      </div>
      
      {/* Búsqueda global */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />
        <Input
          type="search"
          placeholder="Buscar clientes..."
          className="pl-9 sm:pl-10 h-11 sm:h-12 text-sm sm:text-base bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      
      {/* Filtros avanzados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {/* Filtro por rol */}
        <div>
          <Select 
            value={roleFilter || "all_roles"} 
            onValueChange={(value) => onRoleFilterChange(value === "all_roles" ? null : value)}
          >
            <SelectTrigger className="w-full h-11 sm:h-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-sm">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="all_roles" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Todos los roles</SelectItem>
                {uniqueRoles.map(role => (
                  <SelectItem key={role} value={role} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                    {role}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Filtro por etiqueta */}
        <div>
          <Select 
            value={tagFilter || "all_tags"} 
            onValueChange={(value) => onTagFilterChange(value === "all_tags" ? null : value)}
          >
            <SelectTrigger className="w-full h-11 sm:h-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-sm">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="all_tags" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Todas las etiquetas</SelectItem>
                {uniqueTags.map(tag => (
                  <SelectItem key={tag} value={tag} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                    {tag}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Filtro por ciudad */}
        <div>
          <Select 
            value={cityFilter || "all_cities"} 
            onValueChange={(value) => onCityFilterChange(value === "all_cities" ? null : value)}
          >
            <SelectTrigger className="w-full h-11 sm:h-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-sm">
              <SelectValue placeholder="Ciudad" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="all_cities" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Todos los municipios</SelectItem>
                {uniqueCities.map(city => (
                  <SelectItem key={city} value={city} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                    {city}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Filtro por saldo */}
        <div>
          <Select 
            value={balanceFilter || "all_balances"} 
            onValueChange={(value) => onBalanceFilterChange(value === "all_balances" ? null : value)}
          >
            <SelectTrigger className="w-full h-11 sm:h-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-sm">
              <SelectValue placeholder="Saldo" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="all_balances" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Todos los saldos</SelectItem>
                <SelectItem value="pending" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Con saldo pendiente</SelectItem>
                <SelectItem value="paid" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Sin saldo pendiente</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Ordenar por última compra */}
        <div>
          <Select 
            value={sortOrder || "no_sort"} 
            onValueChange={(value) => onSortOrderChange(value === "no_sort" ? null : value)}
          >
            <SelectTrigger className="w-full h-11 sm:h-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-sm">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="no_sort" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Sin orden específico</SelectItem>
                <SelectItem value="latest_purchase" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Última compra (más reciente)</SelectItem>
                <SelectItem value="oldest_purchase" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Última compra (más antigua)</SelectItem>
                <SelectItem value="balance_desc" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Mayor saldo</SelectItem>
                <SelectItem value="balance_asc" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Menor saldo</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Contador de filtros activos con tooltip */}
        <div className="hidden lg:block">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-full h-11 sm:h-10 flex items-center justify-center text-sm text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors ${hasActiveFilters ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : ''}`}
                  onClick={handleClearFilters}
                  disabled={!hasActiveFilters}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  {hasActiveFilters ? 'Filtros aplicados' : 'Sin filtros'}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-700 dark:border-gray-300">
                <div className="text-xs sm:text-sm">
                  {searchQuery && <div>• Búsqueda: "{searchQuery}"</div>}
                  {roleFilter && <div>• Rol: {roleFilter}</div>}
                  {tagFilter && <div>• Etiqueta: {tagFilter}</div>}
                  {cityFilter && <div>• Municipio: {cityFilter}</div>}
                  {balanceFilter && <div>• Saldo: {balanceFilter === 'pending' ? 'Con pendientes' : 'Sin pendientes'}</div>}
                  {sortOrder && <div>• Orden: {sortOrder}</div>}
                  {hasActiveFilters && <div className="mt-1 pt-1 border-t border-gray-600 dark:border-gray-400">Click para limpiar todo</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default ClientesFilter;
