import React, { useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-md border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <h2 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Filtros</h2>
      
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Filtro por rol */}
        <div>
          <Select 
            value={roleFilter || ""} 
            onValueChange={(value) => onRoleFilterChange(value || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Todos los roles</SelectItem>
                {uniqueRoles.map(role => (
                  <SelectItem key={role} value={role}>
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
            value={tagFilter || ""} 
            onValueChange={(value) => onTagFilterChange(value || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Todas las etiquetas</SelectItem>
                {uniqueTags.map(tag => (
                  <SelectItem key={tag} value={tag}>
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
            value={cityFilter || ""} 
            onValueChange={(value) => onCityFilterChange(value || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Ciudad" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Todas las ciudades</SelectItem>
                {uniqueCities.map(city => (
                  <SelectItem key={city} value={city}>
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
            value={balanceFilter || ""} 
            onValueChange={(value) => onBalanceFilterChange(value || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Saldo" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Todos los saldos</SelectItem>
                <SelectItem value="pending">Con saldo pendiente</SelectItem>
                <SelectItem value="paid">Sin saldo pendiente</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Botón para limpiar filtros */}
        <div>
          <Button
            variant="outline"
            className="w-full flex items-center"
            onClick={handleClearFilters}
            disabled={!searchQuery && !roleFilter && !tagFilter && !cityFilter && !balanceFilter}
          >
            <Filter className="mr-2 h-4 w-4" />
            Limpiar filtros
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ClientesFilter;
