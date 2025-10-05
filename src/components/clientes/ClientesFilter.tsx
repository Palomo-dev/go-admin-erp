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
  city?: string;
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
      if (customer.city) {
        citiesSet.add(customer.city);
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
    <div className="bg-white dark:bg-gray-800/50 rounded-md border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex flex-row justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-gray-800 dark:text-gray-200">Filtros y opciones</h2>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {Object.values({searchQuery, roleFilter, tagFilter, cityFilter, balanceFilter, sortOrder}).filter(Boolean).length} activos
            </Badge>
          )}
        </div>
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearFilters} 
            className="text-xs h-8 px-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Limpiar todo
          </Button>
        )}
      </div>
      
      {/* Búsqueda global */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
        <Input
          type="search"
          placeholder="Buscar por nombre, email, teléfono o documento..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      
      {/* Filtros avanzados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Filtro por rol */}
        <div>
          <Select 
            value={roleFilter || "all_roles"} 
            onValueChange={(value) => onRoleFilterChange(value === "all_roles" ? null : value)}
          >
            <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
              <SelectGroup>
                <SelectItem value="all_roles" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Todos los roles</SelectItem>
                {uniqueRoles.map(role => (
                  <SelectItem key={role} value={role} className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
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
            <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
              <SelectGroup>
                <SelectItem value="all_tags" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Todas las etiquetas</SelectItem>
                {uniqueTags.map(tag => (
                  <SelectItem key={tag} value={tag} className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
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
            <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Ciudad" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
              <SelectGroup>
                <SelectItem value="all_cities" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Todas las ciudades</SelectItem>
                {uniqueCities.map(city => (
                  <SelectItem key={city} value={city} className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
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
            <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Saldo" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
              <SelectGroup>
                <SelectItem value="all_balances" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Todos los saldos</SelectItem>
                <SelectItem value="pending" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Con saldo pendiente</SelectItem>
                <SelectItem value="paid" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Sin saldo pendiente</SelectItem>
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
            <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
              <SelectGroup>
                <SelectItem value="no_sort" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Sin orden específico</SelectItem>
                <SelectItem value="latest_purchase" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Última compra (más reciente)</SelectItem>
                <SelectItem value="oldest_purchase" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Última compra (más antigua)</SelectItem>
                <SelectItem value="balance_desc" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Mayor saldo</SelectItem>
                <SelectItem value="balance_asc" className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Menor saldo</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Contador de filtros activos con tooltip */}
        <div className="hidden sm:block">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-full flex items-center text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 ${hasActiveFilters ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : ''}`}
                  onClick={handleClearFilters}
                  disabled={!hasActiveFilters}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  {hasActiveFilters ? 'Filtros aplicados' : 'Sin filtros'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  {searchQuery && <div>• Búsqueda: "{searchQuery}"</div>}
                  {roleFilter && <div>• Rol: {roleFilter}</div>}
                  {tagFilter && <div>• Etiqueta: {tagFilter}</div>}
                  {cityFilter && <div>• Ciudad: {cityFilter}</div>}
                  {balanceFilter && <div>• Saldo: {balanceFilter === 'pending' ? 'Con pendientes' : 'Sin pendientes'}</div>}
                  {sortOrder && <div>• Orden: {sortOrder}</div>}
                  {hasActiveFilters && <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">Click para limpiar todo</div>}
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
