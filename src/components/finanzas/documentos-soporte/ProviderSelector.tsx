'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Search, UserPlus, Building2 } from 'lucide-react';

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

interface ProviderSelectorProps {
  value: ProviderData;
  onChange: (data: ProviderData) => void;
}

const IDENTIFICATION_TYPES = [
  { code: '31', label: 'NIT' },
  { code: '13', label: 'Cédula de ciudadanía' },
  { code: '22', label: 'Cédula de extranjería' },
  { code: '12', label: 'Tarjeta de identidad' },
  { code: '41', label: 'Pasaporte' },
  { code: '91', label: 'NUIP' },
];

export function ProviderSelector({ value, onChange }: ProviderSelectorProps) {
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [mode, setMode] = useState<'supplier' | 'manual'>('supplier');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);

  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
  }, []);

  const loadSuppliers = useCallback(async () => {
    if (!organizationId) return;
    setIsLoadingSuppliers(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, nit, phone, email, address, city, country, supplier_type, doc_type')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .ilike('name', `%${searchTerm}%`)
        .order('name')
        .limit(50);

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error('Error cargando proveedores:', err);
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, [organizationId, searchTerm]);

  useEffect(() => {
    if (mode === 'supplier' && organizationId) {
      const timeout = setTimeout(loadSuppliers, 300);
      return () => clearTimeout(timeout);
    }
  }, [mode, organizationId, searchTerm, loadSuppliers]);

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === Number(supplierId));
    if (!supplier) return;

    // Mapear doc_type a código DIAN
    const docTypeMap: Record<string, string> = {
      NIT: '31',
      CC: '13',
      CE: '22',
      TI: '12',
      PP: '41',
      NUIP: '91',
    };
    const idCode = docTypeMap[supplier.doc_type || ''] || '31';

    onChange({
      identification_document_code: idCode,
      identification: supplier.nit || '',
      names: supplier.name || '',
      address: supplier.address || '',
      country_code: 'CO',
      email: supplier.email || undefined,
      phone: supplier.phone || undefined,
      legal_organization_code: supplier.supplier_type === 'company' ? '1' : '2',
      supplier_id: supplier.id,
    });
  };

  const handleManualChange = (field: keyof ProviderData, val: string) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className="space-y-4">
      {/* Toggle mode */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'supplier' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('supplier')}
          className={mode === 'supplier' ? 'bg-purple-600 hover:bg-purple-700' : ''}
        >
          <Building2 className="h-4 w-4 mr-2" />
          Proveedor existente
        </Button>
        <Button
          type="button"
          variant={mode === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('manual')}
          className={mode === 'manual' ? 'bg-purple-600 hover:bg-purple-700' : ''}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Ingreso manual
        </Button>
      </div>

      {mode === 'supplier' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar proveedor por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoadingSuppliers ? (
            <p className="text-sm text-gray-500">Cargando proveedores...</p>
          ) : suppliers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No se encontraron proveedores. Intenta otra búsqueda o usa ingreso manual.
            </p>
          ) : (
            <Select onValueChange={handleSelectSupplier}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un proveedor..." />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} {s.nit ? `— ${s.nit}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Datos resueltos del proveedor seleccionado */}
          {value.identification && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <p className="text-sm font-medium text-purple-900 dark:text-purple-300">
                {value.names}
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-400">
                Doc: {value.identification} {value.dv ? `- DV: ${value.dv}` : ''}
              </p>
              {value.address && (
                <p className="text-xs text-purple-700 dark:text-purple-400">
                  {value.address}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de identificación *</Label>
            <Select
              value={value.identification_document_code}
              onValueChange={(v) => handleManualChange('identification_document_code', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo..." />
              </SelectTrigger>
              <SelectContent>
                {IDENTIFICATION_TYPES.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Número de identificación *</Label>
            <Input
              value={value.identification}
              onChange={(e) => handleManualChange('identification', e.target.value)}
              placeholder="Ej: 900123456"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Dígito de verificación</Label>
            <Input
              value={value.dv || ''}
              onChange={(e) => handleManualChange('dv', e.target.value)}
              placeholder="Auto-calculado si se omite"
              maxLength={1}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nombre / Razón social *</Label>
            <Input
              value={value.names}
              onChange={(e) => handleManualChange('names', e.target.value)}
              placeholder="Nombre del proveedor"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nombre comercial</Label>
            <Input
              value={value.trade_name || ''}
              onChange={(e) => handleManualChange('trade_name', e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Dirección *</Label>
            <Input
              value={value.address}
              onChange={(e) => handleManualChange('address', e.target.value)}
              placeholder="Dirección del proveedor"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Teléfono</Label>
            <Input
              value={value.phone || ''}
              onChange={(e) => handleManualChange('phone', e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={value.email || ''}
              onChange={(e) => handleManualChange('email', e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Código país</Label>
            <Input
              value={value.country_code}
              onChange={(e) => handleManualChange('country_code', e.target.value)}
              placeholder="CO"
              maxLength={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Código municipio</Label>
            <Input
              value={value.municipality_code || ''}
              onChange={(e) => handleManualChange('municipality_code', e.target.value)}
              placeholder="Ej: 05001"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderSelector;
