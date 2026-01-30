'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, MapPin, Plus, RefreshCw, Upload, Search, Users } from 'lucide-react';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
}

interface AddressesHeaderProps {
  onRefresh: () => void;
  onNewAddress: () => void;
  onImport?: () => void;
  isLoading?: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCustomerId: string;
  onCustomerChange: (value: string) => void;
  customers: Customer[];
}

export function AddressesHeader({ 
  onRefresh, 
  onNewAddress, 
  onImport,
  isLoading,
  searchTerm,
  onSearchChange,
  selectedCustomerId,
  onCustomerChange,
  customers,
}: AddressesHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/transporte">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
              Direcciones de Clientes
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Transporte / Direcciones de Clientes
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {onImport && (
            <Button variant="outline" onClick={onImport}>
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>
          )}
          <Button onClick={onNewAddress} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Dirección
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por dirección, ciudad..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={selectedCustomerId} onValueChange={onCustomerChange}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <Users className="h-4 w-4 mr-2 text-gray-400" />
            <SelectValue placeholder="Todos los clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.first_name} {customer.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
