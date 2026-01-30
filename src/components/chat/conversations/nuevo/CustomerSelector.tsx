'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, User, Plus, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Customer } from '@/lib/services/newConversationService';
import { debounce } from '@/utils/Utils';

interface CustomerSelectorProps {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null) => void;
  onSearchCustomers: (search: string) => Promise<Customer[]>;
  onCreateQuickCustomer: () => void;
}

export default function CustomerSelector({
  selectedCustomer,
  onSelect,
  onSearchCustomers,
  onCreateQuickCustomer
}: CustomerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const debouncedSearch = useCallback(
    debounce(async (term: string) => {
      if (term.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      try {
        const results = await onSearchCustomers(term);
        setSearchResults(results);
      } catch (error) {
        console.error('Error buscando clientes:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    [onSearchCustomers]
  );

  useEffect(() => {
    if (searchTerm.length >= 2) {
      setIsSearching(true);
      debouncedSearch(searchTerm);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, debouncedSearch]);

  const handleSelectCustomer = (customer: Customer) => {
    onSelect(customer);
    setSearchTerm('');
    setSearchResults([]);
    setShowResults(false);
  };

  const handleClearSelection = () => {
    onSelect(null);
  };

  if (selectedCustomer) {
    return (
      <div className="space-y-2">
        <Label>Cliente seleccionado</Label>
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
            {selectedCustomer.avatar_url ? (
              <img 
                src={selectedCustomer.avatar_url} 
                alt={selectedCustomer.full_name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {selectedCustomer.full_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              {selectedCustomer.email && <span className="truncate">{selectedCustomer.email}</span>}
              {selectedCustomer.phone && <span>• {selectedCustomer.phone}</span>}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearSelection}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="customer-search">Cliente</Label>
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="customer-search"
            placeholder="Buscar por nombre, email, teléfono o identificación..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-10"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>

        {showResults && (searchResults.length > 0 || searchTerm.length >= 2) && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {searchResults.length > 0 ? (
              <>
                {searchResults.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      {customer.avatar_url ? (
                        <img 
                          src={customer.avatar_url} 
                          alt={customer.full_name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <User className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {customer.full_name || `${customer.first_name} ${customer.last_name}`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {customer.email || customer.phone || customer.doc_number || 'Sin datos de contacto'}
                      </p>
                    </div>
                  </button>
                ))}
              </>
            ) : searchTerm.length >= 2 && !isSearching ? (
              <div className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                <p className="text-sm">No se encontraron clientes</p>
              </div>
            ) : null}
            
            <button
              onClick={() => {
                onCreateQuickCustomer();
                setShowResults(false);
              }}
              className="w-full px-4 py-3 flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-t border-gray-200 dark:border-gray-700"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">Crear cliente nuevo (rápido)</span>
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Escribe al menos 2 caracteres para buscar
      </p>
    </div>
  );
}
