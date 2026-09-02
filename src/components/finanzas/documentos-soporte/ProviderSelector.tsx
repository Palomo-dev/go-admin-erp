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
import { mapearTipoDocADian } from '@/lib/utils/nitDv';

export interface ProviderData {
  identification_document_code: string;
  identification: string;
  dv?: string;
  trade_name?: string;
  names: string;
  address: string;
  country_code: string;
  municipality_code?: string;
  email?: string;
  phone?: string;
  legal_organization_code?: string;
  supplier_id?: number | null;
}

interface SupplierOption {
  id: number;
  organization_id: number;
  name: string;
  nit?: string | null;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  supplier_type?: 'person' | 'company' | null;
  doc_type?: string | null;
  dv?: string | null;
  municipality_code?: string | null;
  identification_document_code?: string | null;
  country_code?: string | null;
  legal_organization_code?: string | null;
  trade_name?: string | null;
}

interface ProviderSelectorProps {
  value: ProviderData;
  onChange: (data: ProviderData) => void;
}

export function ProviderSelector({ value, onChange }: ProviderSelectorProps) {
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(
    value.supplier_id ?? null
  );

  const organizationId = useMemo(() => getOrganizationId(), []);
  const suppliersRef = useRef<SupplierOption[]>([]);

  useEffect(() => {
    suppliersRef.current = suppliers;
  }, [suppliers]);

  // Cargar proveedores iniciales (sin filtro)
  const loadInitialSuppliers = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select(
          'id, organization_id, name, nit, contact, phone, email, address, city, country, supplier_type, doc_type, dv, municipality_code, identification_document_code, country_code, legal_organization_code, trade_name'
        )
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(50);

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error('Error cargando proveedores:', err);
    }
  }, [organizationId]);

  useEffect(() => {
    loadInitialSuppliers();
  }, [loadInitialSuppliers]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!organizationId) return;
    if (searchTerm.trim() === '') {
      loadInitialSuppliers();
      return;
    }

    const searchSuppliers = async () => {
      setIsSearching(true);
      try {
        const termino = `%${searchTerm.toLowerCase()}%`;
        const { data, error } = await supabase
          .from('suppliers')
          .select(
            'id, organization_id, name, nit, contact, phone, email, address, city, country, supplier_type, doc_type, dv, municipality_code, identification_document_code, country_code, legal_organization_code, trade_name'
          )
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .or(`name.ilike.${termino},nit.ilike.${termino},contact.ilike.${termino},email.ilike.${termino}`)
          .order('name', { ascending: true })
          .limit(50);

        if (error) throw error;
        setSuppliers(data || []);
      } catch (err) {
        console.error('Error al buscar proveedores:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchSuppliers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, organizationId, loadInitialSuppliers]);

  // Mapear SupplierOption → ProviderData (incluye campos fiscales DIAN)
  const mapSupplierToProvider = useCallback(
    (supplier: SupplierOption): ProviderData => {
      const idCode =
        supplier.identification_document_code ||
        (supplier.doc_type ? mapearTipoDocADian(supplier.doc_type) : '31');
      return {
        identification_document_code: idCode,
        identification: supplier.nit || '',
        dv: supplier.dv || undefined,
        trade_name: supplier.trade_name || undefined,
        names: supplier.name || '',
        address: supplier.address || '',
        country_code: supplier.country_code || 'CO',
        municipality_code: supplier.municipality_code || undefined,
        email: supplier.email || undefined,
        phone: supplier.phone || undefined,
        legal_organization_code:
          supplier.legal_organization_code ||
          (supplier.supplier_type === 'person' ? '2' : '1'),
        supplier_id: supplier.id,
      };
    },
    []
  );

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === Number(supplierId));
    if (!supplier) return;
    setSelectedSupplierId(supplier.id);
    onChange(mapSupplierToProvider(supplier));
  };

  // Cuando el diálogo crea un proveedor, refrescar lista, seleccionarlo y mapearlo
  const handleProveedorCreado = (supplier: any) => {
    if (!supplier) return;
    const nuevo: SupplierOption = {
      id: supplier.id,
      organization_id: supplier.organization_id,
      name: supplier.name,
      nit: supplier.nit ?? null,
      contact: supplier.contact ?? null,
      phone: supplier.phone ?? null,
      email: supplier.email ?? null,
      address: supplier.address ?? null,
      city: supplier.city ?? null,
      country: supplier.country ?? null,
      supplier_type: supplier.supplier_type ?? null,
      doc_type: supplier.doc_type ?? null,
      dv: supplier.dv ?? null,
      municipality_code: supplier.municipality_code ?? null,
      identification_document_code: supplier.identification_document_code ?? null,
      country_code: supplier.country_code ?? null,
      legal_organization_code: supplier.legal_organization_code ?? null,
      trade_name: supplier.trade_name ?? null,
    };
    setSuppliers((prev) => [nuevo, ...prev.filter((s) => s.id !== nuevo.id)]);
    setSelectedSupplierId(nuevo.id);
    onChange(mapSupplierToProvider(nuevo));
  };

  const selectedSupplier = useMemo(() => {
    if (!selectedSupplierId) return null;
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [selectedSupplierId, suppliers]);

  const selectValue = useMemo(
    () => (selectedSupplierId ? selectedSupplierId.toString() : ''),
    [selectedSupplierId]
  );

  const handleSelectChange = useCallback(
    (selectedValue: string) => {
      handleSelectSupplier(selectedValue);
    },
    [handleSelectSupplier]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
    },
    []
  );

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select value={selectValue} onValueChange={handleSelectChange}>
            <SelectTrigger className="h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
              <SelectValue placeholder="Seleccionar proveedor..." />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              {/* Campo de búsqueda integrado */}
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <Input
                    placeholder="Buscar proveedor..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-8 h-8 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  {isSearching && (
                    <div className="flex items-center justify-center py-1">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 dark:border-purple-400 border-t-transparent"></div>
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Buscando...</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="max-h-[200px] overflow-y-auto">
                {suppliers.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {isSearching ? 'Cargando proveedores...' : 'No se encontraron proveedores'}
                  </div>
                ) : (
                  suppliers.map((supplier) => (
                    <SelectItem
                      key={supplier.id}
                      value={supplier.id.toString()}
                      className="text-sm dark:text-gray-100 dark:focus:bg-gray-700"
                    >
                      <div className="w-full py-0.5">
                        <div className="font-medium text-sm break-words whitespace-normal min-w-0 text-gray-900 dark:text-gray-100">
                          {supplier.name}
                        </div>
                        <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {supplier.nit && (
                            <span className="shrink-0">NIT: {supplier.nit}</span>
                          )}
                          {supplier.contact && (
                            <span className="break-words whitespace-normal min-w-0">
                              • {supplier.contact}
                            </span>
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
          className="h-9 w-9 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300"
          title="Crear nuevo proveedor"
          aria-label="Crear nuevo proveedor"
        >
          <Plus className="h-4 w-4" />
        </Button>

        {/* Diálogo compartido: reutiliza el formulario COMPLETO de proveedor (con campos fiscales DIAN) */}
        <ProveedorFormDialog
          open={showNewSupplierDialog}
          onOpenChange={setShowNewSupplierDialog}
          onCreated={handleProveedorCreado}
        />
      </div>

      {/* Mostrar información del proveedor seleccionado */}
      {selectedSupplier && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="space-y-2">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    {selectedSupplier.name}
                  </h4>
                  {selectedSupplier.nit && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      NIT: {selectedSupplier.nit}
                      {selectedSupplier.dv ? ` - DV: ${selectedSupplier.dv}` : ''}
                    </p>
                  )}
                  {selectedSupplier.trade_name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Nombre comercial: {selectedSupplier.trade_name}
                    </p>
                  )}
                </div>

                {/* Información de contacto en grid responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {selectedSupplier.contact && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
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
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-300 break-all">
                        <span className="font-medium">Email:</span> {selectedSupplier.email}
                      </span>
                    </div>
                  )}

                  {selectedSupplier.address && (
                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Dirección:</span> {selectedSupplier.address}
                      </span>
                    </div>
                  )}

                  {selectedSupplier.municipality_code && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Municipio DIAN:</span> {selectedSupplier.municipality_code}
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

export default ProviderSelector;
