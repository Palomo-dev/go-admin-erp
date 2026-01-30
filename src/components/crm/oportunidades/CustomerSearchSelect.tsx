'use client';

import { useState, useEffect } from 'react';
import { Search, User, X, Mail, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { Customer } from './types';

interface CustomerSearchSelectProps {
  customers: Customer[];
  selectedCustomerId: string;
  onSelect: (customerId: string) => void;
  label?: string;
  placeholder?: string;
}

export function CustomerSearchSelect({
  customers,
  selectedCustomerId,
  onSelect,
  label = 'Cliente',
  placeholder = 'Buscar cliente...'
}: CustomerSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      customer.full_name?.toLowerCase().includes(term) ||
      customer.email?.toLowerCase().includes(term) ||
      customer.phone?.includes(term)
    );
  });

  const handleSelect = (customerId: string) => {
    onSelect(customerId);
    setOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect('');
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-gray-700 dark:text-gray-300">{label}</Label>
      )}
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-[44px] px-3 py-2 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {selectedCustomer ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <UserAvatar 
                  name={selectedCustomer.full_name} 
                  avatarUrl={selectedCustomer.avatar_url} 
                  size="sm" 
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {selectedCustomer.full_name}
                  </p>
                  {selectedCustomer.email && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {selectedCustomer.email}
                    </p>
                  )}
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  onKeyDown={(e) => e.key === 'Enter' && handleClear(e as any)}
                  className="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5 text-gray-500 hover:text-red-600" />
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <User className="h-4 w-4" />
                <span>Sin cliente</span>
              </div>
            )}
            <Search className="h-4 w-4 shrink-0 text-gray-400 ml-2" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-[350px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700" align="start">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={placeholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                autoFocus
              />
            </div>
          </div>
          
          <ScrollArea className="h-[280px]">
            <div className="p-2">
              {/* Opción sin cliente */}
              <div
                className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                  !selectedCustomerId 
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => handleSelect('')}
              >
                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </div>
                <span className="text-gray-600 dark:text-gray-400">Sin cliente</span>
              </div>
              
              {/* Lista de clientes */}
              {filteredCustomers.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {filteredCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                        customer.id === selectedCustomerId 
                          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => handleSelect(customer.id)}
                    >
                      <UserAvatar 
                        name={customer.full_name} 
                        avatarUrl={customer.avatar_url} 
                        size="sm" 
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {customer.full_name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
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
              ) : searchTerm ? (
                <div className="py-8 text-center">
                  <User className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No se encontraron clientes
                  </p>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
