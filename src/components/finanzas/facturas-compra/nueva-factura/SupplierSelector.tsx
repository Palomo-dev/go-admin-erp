'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Building2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { ProveedorFormDialog } from '@/components/shared/form-dialogs';
import { SupplierBase } from '../types';

interface SupplierSelectorProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  proveedores: SupplierBase[];
  onProveedorCreado: (proveedor: SupplierBase) => void;
}

export function SupplierSelector({ 
  value, 
  onValueChange, 
  proveedores, 
  onProveedorCreado 
}: SupplierSelectorProps) {
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Memoizar organizationId para evitar recalculations
  const organizationId = useMemo(() => getOrganizationId(), []);
  const proveedoresRef = useRef(proveedores);
  
  // Mantener referencia actualizada de proveedores solo cuando cambien
  useEffect(() => {
    proveedoresRef.current = proveedores;
  }, [proveedores]);
  
  // Estado para los resultados de búsqueda externa
  const [searchResults, setSearchResults] = useState<SupplierBase[]>([]);
  
  // Memoizar proveedores mostrados con dependencias específicas
  const displayedSuppliers = useMemo(() => {
    // Si hay término de búsqueda y resultados, mostrar resultados de búsqueda
    if (searchTerm.trim() !== '' && searchResults.length > 0) {
      return searchResults;
    }
    
    // Si no hay búsqueda, mostrar proveedores originales
    return proveedores || [];
  }, [searchTerm, searchResults, proveedores]);

  // Efecto para limpiar resultados de búsqueda cuando no hay término
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSearchResults([]);
    }
  }, [searchTerm]);

  // Efecto para búsqueda de proveedores con debounce
  useEffect(() => {
    const searchSuppliers = async () => {
      if (!organizationId) return;
      
      // Si no hay término de búsqueda, no hacer nada (se maneja en el otro useEffect)
      if (searchTerm.trim() === '') {
        return;
      }
      
      setIsSearching(true);
      
      try {
        const termino = `%${searchTerm.toLowerCase()}%`;
        
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, organization_id, name, nit, contact, phone, email, notes')
          .eq('organization_id', organizationId)
          .or(`name.ilike.${termino},nit.ilike.${termino},contact.ilike.${termino},email.ilike.${termino}`)
          .order('name', { ascending: true })
          .limit(50);
        
        if (error) throw error;
        
        const suppliersFormateados: SupplierBase[] = (data || []).map(supplier => ({
          id: supplier.id,
          organization_id: supplier.organization_id,
          name: supplier.name,
          nit: supplier.nit,
          contact: supplier.contact,
          phone: supplier.phone,
          email: supplier.email,
          notes: supplier.notes
        }));
        
        setSearchResults(suppliersFormateados);
      } catch (error) {
        console.error('Error al buscar proveedores:', error);
        // En caso de error, mostramos los proveedores originales filtrados localmente
        const filtered = (proveedoresRef.current || []).filter(proveedor => 
          proveedor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (proveedor.nit && proveedor.nit.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (proveedor.contact && proveedor.contact.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        setSearchResults(filtered);
      } finally {
        setIsSearching(false);
      }
    };
    
    // Debounce para evitar demasiadas consultas
    const timeoutId = setTimeout(() => {
      searchSuppliers();
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm, organizationId]); // organizationId es estable

  // Cuando el diálogo compartido crea un proveedor, notificar al padre con el shape SupplierBase
  const handleProveedorCreado = (supplier: any) => {
    if (!supplier) return;
    const nuevoProveedor: SupplierBase = {
      id: supplier.id,
      organization_id: supplier.organization_id,
      name: supplier.name,
      nit: supplier.nit ?? null,
      contact: supplier.contact ?? null,
      phone: supplier.phone ?? null,
      email: supplier.email ?? null,
      notes: supplier.notes ?? null,
    };
    onProveedorCreado(nuevoProveedor);
  };

  // Función para buscar proveedor sin dependencias problemáticas
  // Memoizar proveedor seleccionado
  const selectedSupplier = useMemo(() => {
    if (!value) return null;
    
    // Buscar primero en proveedores originales
    const fromOriginal = proveedores?.find(p => p.id === value);
    if (fromOriginal) return fromOriginal;
    
    // Buscar en proveedores mostrados
    return displayedSuppliers.find(p => p.id === value) || null;
  }, [value, proveedores, displayedSuppliers]);

  // Memoizar valor del Select para estabilidad completa
  const selectValue = useMemo(() => {
    return value ? value.toString() : '';
  }, [value]);

  // Memoizar callback del Select
  const handleSelectChange = useCallback((selectedValue: string) => {
    onValueChange(selectedValue ? parseInt(selectedValue) : null);
  }, [onValueChange]);

  // Memoizar callback del Input de búsqueda
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            value={selectValue}
            onValueChange={handleSelectChange}
          >
            <SelectTrigger className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
              <SelectValue placeholder="Seleccionar proveedor..." />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              {/* Campo de búsqueda */}
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <Input
                    placeholder="Buscar proveedor..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-8 h-7 sm:h-8 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  {isSearching && (
                    <div className="flex items-center justify-center py-1">
                      <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
                      <span className="ml-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Buscando...</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="max-h-[180px] sm:max-h-[200px] overflow-y-auto">
                {displayedSuppliers.length === 0 ? (
                  <div className="px-2 py-3 sm:py-4 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {isSearching ? 'Cargando proveedores...' : 'No se encontraron proveedores'}
                  </div>
                ) : (
                  displayedSuppliers.map((proveedor: SupplierBase) => (
                    <SelectItem key={proveedor.id} value={proveedor.id.toString()} className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">
                      <div className="w-full py-0.5">
                        <div className="font-medium text-xs sm:text-sm truncate text-gray-900 dark:text-gray-100">{proveedor.name}</div>
                        <div className="flex gap-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {proveedor.nit && (
                            <span className="shrink-0">NIT: {proveedor.nit}</span>
                          )}
                          {proveedor.contact && (
                            <span className="truncate">• {proveedor.contact}</span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>
        </div>
        
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowNewSupplierDialog(true)}
          className="h-8 w-8 sm:h-9 sm:w-9 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300"
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>

        {/* Diálogo compartido: reutiliza el formulario COMPLETO de proveedor */}
        <ProveedorFormDialog
          open={showNewSupplierDialog}
          onOpenChange={setShowNewSupplierDialog}
          onCreated={handleProveedorCreado}
        />
      </div>

      {/* Mostrar información del proveedor seleccionado con diseño mejorado */}
      {selectedSupplier && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {selectedSupplier.name}
                    </h4>
                    {selectedSupplier.nit && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        NIT: {selectedSupplier.nit}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Información de contacto en grid responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {selectedSupplier.contact && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Contacto:</span> {selectedSupplier.contact}
                      </span>
                    </div>
                  )}
                  
                  {selectedSupplier.phone && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Teléfono:</span> {selectedSupplier.phone}
                      </span>
                    </div>
                  )}
                  
                  {selectedSupplier.email && (
                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-300 break-all">
                        <span className="font-medium">Email:</span> {selectedSupplier.email}
                      </span>
                    </div>
                  )}
                  
                  {selectedSupplier.notes && (
                    <div className="flex items-start gap-1.5 sm:col-span-2 pt-1">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5"></div>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Notas:</span> {selectedSupplier.notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
