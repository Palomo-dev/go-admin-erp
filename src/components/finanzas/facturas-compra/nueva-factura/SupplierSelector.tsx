'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Building2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { FacturasCompraService } from '../FacturasCompraService';
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
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Memoizar organizationId para evitar recalculations
  const organizationId = useMemo(() => getOrganizationId(), []);
  const proveedoresRef = useRef(proveedores);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    nit: '',
    contact: '',
    phone: '',
    email: '',
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
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

  const handleInputChange = (field: string, value: string) => {
    setNewSupplier(prev => ({ ...prev, [field]: value }));
    
    // Limpiar error del campo si existe
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!newSupplier.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (newSupplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newSupplier.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateSupplier = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const nuevoProveedor = await FacturasCompraService.crearProveedor(newSupplier);
      
      // Notificar al componente padre
      onProveedorCreado(nuevoProveedor);
      
      // Actualizar también la lista filtrada si el nuevo proveedor coincide con la búsqueda actual
      if (searchTerm.trim() === '' || 
          nuevoProveedor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (nuevoProveedor.nit && nuevoProveedor.nit.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (nuevoProveedor.contact && nuevoProveedor.contact.toLowerCase().includes(searchTerm.toLowerCase()))) {
        // Agregar al estado de proveedores original a través de la prop onNewSupplier
      // No necesitamos actualizar searchResults aquí
      }
      
      // Cerrar dialog y limpiar formulario
      setShowNewSupplierDialog(false);
      setNewSupplier({
        name: '',
        nit: '',
        contact: '',
        phone: '',
        email: '',
        notes: ''
      });
      setErrors({});
    } catch (error) {
      console.error('Error creando proveedor:', error);
      alert('Error al crear el proveedor. Por favor, inténtelo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowNewSupplierDialog(false);
    setNewSupplier({
      name: '',
      nit: '',
      contact: '',
      phone: '',
      email: '',
      notes: ''
    });
    setErrors({});
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

  // Callbacks memoizados para cada campo del formulario
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('name', e.target.value);
  }, []);

  const handleNitChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('nit', e.target.value);
  }, []);

  const handleContactChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('contact', e.target.value);
  }, []);

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('phone', e.target.value);
  }, []);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('email', e.target.value);
  }, []);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('notes', e.target.value);
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
        
        <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300"
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-3">
              <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">
                Crear Nuevo Proveedor
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 sm:space-y-4 py-2">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="supplier_name" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  Nombre del Proveedor *
                </Label>
                <Input
                  id="supplier_name"
                  value={newSupplier.name}
                  onChange={handleNameChange}
                  placeholder="Nombre del proveedor"
                  className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                {errors.name && (
                  <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                )}
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="supplier_nit" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  NIT
                </Label>
                <Input
                  id="supplier_nit"
                  value={newSupplier.nit}
                  onChange={handleNitChange}
                  placeholder="Número de identificación tributaria"
                  className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="supplier_contact" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  Contacto
                </Label>
                <Input
                  id="supplier_contact"
                  value={newSupplier.contact}
                  onChange={handleContactChange}
                  placeholder="Nombre del contacto"
                  className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="supplier_phone" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    Teléfono
                  </Label>
                  <Input
                    id="supplier_phone"
                    value={newSupplier.phone}
                    onChange={handlePhoneChange}
                    placeholder="Teléfono"
                    className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="supplier_email" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    Email
                  </Label>
                  <Input
                    id="supplier_email"
                    type="email"
                    value={newSupplier.email}
                    onChange={handleEmailChange}
                    placeholder="email@ejemplo.com"
                    className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  {errors.email && (
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.email}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="supplier_notes" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  Notas
                </Label>
                <Input
                  id="supplier_notes"
                  value={newSupplier.notes}
                  onChange={handleNotesChange}
                  placeholder="Notas adicionales"
                  className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={loading}
                  className="w-full sm:w-auto h-9 text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateSupplier}
                  disabled={loading}
                  className="w-full sm:w-auto h-9 text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 border-b-2 border-white mr-2"></div>
                      <span>Creando...</span>
                    </>
                  ) : (
                    'Crear Proveedor'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
