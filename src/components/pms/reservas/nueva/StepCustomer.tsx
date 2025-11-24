'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, User, Mail, Phone, IdCard } from 'lucide-react';
import type { Customer } from '@/lib/services/reservationsService';

interface StepCustomerProps {
  selectedCustomer: Customer | null;
  onCustomerSelect: (customer: Customer) => void;
  onNext: () => void;
  onSearch: (term: string) => Promise<Customer[]>;
  onCreate: (data: Partial<Customer>) => Promise<Customer>;
}

export function StepCustomer({
  selectedCustomer,
  onCustomerSelect,
  onNext,
  onSearch,
  onCreate,
}: StepCustomerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    document_type: 'CC',
    document_number: '',
  });

  // Búsqueda automática con debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await onSearch(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Error buscando clientes:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customer = await onCreate(newCustomerData);
      onCustomerSelect(customer);
      setShowNewForm(false);
    } catch (error) {
      console.error('Error creando cliente:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Cliente
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Busca un cliente existente o crea uno nuevo
        </p>
      </div>

      {/* Cliente seleccionado */}
      {selectedCustomer && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                {selectedCustomer.first_name[0]}{selectedCustomer.last_name[0]}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedCustomer.phone}
                    </div>
                  )}
                  {selectedCustomer.document_number && (
                    <div className="flex items-center gap-1">
                      <IdCard className="h-3 w-3" />
                      {selectedCustomer.document_type}: {selectedCustomer.document_number}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCustomerSelect(null as any)}
            >
              Cambiar
            </Button>
          </div>
        </Card>
      )}

      {/* Búsqueda de cliente */}
      {!selectedCustomer && !showNewForm && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Escribe para buscar por nombre, email, teléfono... (mín. 2 caracteres)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                </div>
              )}
            </div>
          </div>

          {/* Resultados de búsqueda */}
          {searchTerm.trim().length >= 2 && !isSearching && (
            <>
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {searchResults.length} resultado(s) encontrado(s)
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {searchResults.map((customer) => (
                      <Card
                        key={customer.id}
                        className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => onCustomerSelect(customer)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <User className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {customer.first_name} {customer.last_name}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {customer.email || customer.phone || 'Sin contacto'}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="p-4 bg-gray-50 dark:bg-gray-800">
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    No se encontraron clientes con "{searchTerm}"
                  </p>
                </Card>
              )}
            </>
          )}

          {/* Botón crear nuevo */}
          <div className="text-center pt-4 border-t dark:border-gray-700">
            <Button
              variant="outline"
              onClick={() => setShowNewForm(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Nuevo Cliente
            </Button>
          </div>
        </div>
      )}

      {/* Formulario nuevo cliente */}
      {!selectedCustomer && showNewForm && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Nuevo Cliente
          </h3>
          <form onSubmit={handleCreateCustomer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name">Nombre *</Label>
                <Input
                  id="first_name"
                  value={newCustomerData.first_name}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, first_name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">Apellido *</Label>
                <Input
                  id="last_name"
                  value={newCustomerData.last_name}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, last_name: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newCustomerData.email}
                onChange={(e) =>
                  setNewCustomerData({ ...newCustomerData, email: e.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={newCustomerData.phone}
                onChange={(e) =>
                  setNewCustomerData({ ...newCustomerData, phone: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="document_type">Tipo Doc.</Label>
                <Input
                  id="document_type"
                  value={newCustomerData.document_type}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, document_type: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="document_number">Número Doc.</Label>
                <Input
                  id="document_number"
                  value={newCustomerData.document_number}
                  onChange={(e) =>
                    setNewCustomerData({ ...newCustomerData, document_number: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewForm(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Crear Cliente
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Botón continuar */}
      {selectedCustomer && (
        <div className="flex justify-end pt-4">
          <Button onClick={onNext} size="lg">
            Continuar
          </Button>
        </div>
      )}
    </div>
  );
}
