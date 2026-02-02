'use client';

import { useState, useEffect } from 'react';
import { Search, User, Mail, Phone, X, UserPlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase/config';

export interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
}

interface CustomerSearchInputProps {
  organizationId: number;
  selectedCustomer?: Customer | null;
  onSelect: (customer: Customer | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomerSearchInput({
  organizationId,
  selectedCustomer,
  onSelect,
  placeholder = 'Buscar cliente...',
  disabled = false,
  className = '',
}: CustomerSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Buscar clientes con debounce
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setCustomers([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, doc_type, doc_number')
          .eq('organization_id', organizationId)
          .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,doc_number.ilike.%${searchTerm}%`)
          .order('full_name')
          .limit(10);

        if (!error && data) {
          setCustomers(data);
        }
      } catch (error) {
        console.error('Error searching customers:', error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, organizationId]);

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    setOpen(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    onSelect(null);
    setSearchTerm('');
  };

  // Si hay cliente seleccionado, mostrar su info
  if (selectedCustomer) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded-md border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ${className}`}>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {selectedCustomer.full_name}
          </p>
          {(selectedCustomer.email || selectedCustomer.phone) && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {selectedCustomer.email || selectedCustomer.phone}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled}
          className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full justify-start text-left font-normal h-10 ${className}`}
        >
          <Search className="h-4 w-4 mr-2 text-gray-400" />
          <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Nombre, email, teléfono o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="h-64">
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <span className="ml-2 text-sm text-gray-500">Buscando...</span>
              </div>
            ) : customers.length > 0 ? (
              <div className="space-y-1">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    onClick={() => handleSelect(customer)}
                    className="flex items-start gap-3 p-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {customer.full_name || 'Sin nombre'}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {customer.email && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Phone className="h-3 w-3" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : searchTerm.length >= 2 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <User className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No se encontraron clientes
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Intenta con otro término
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Escribe para buscar
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Mínimo 2 caracteres
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default CustomerSearchInput;
