'use client';

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { mapearTipoDocADian } from '@/lib/utils/nitDv';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';

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

const COLUMNAS =
  'id, organization_id, name, nit, contact, phone, email, address, city, country, supplier_type, doc_type, dv, municipality_code, identification_document_code, country_code, legal_organization_code, trade_name';

interface FilaProveedor {
  id: number;
  name: string;
  nit?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  supplier_type?: 'person' | 'company' | null;
  doc_type?: string | null;
  dv?: string | null;
  municipality_code?: string | null;
  identification_document_code?: string | null;
  country_code?: string | null;
  legal_organization_code?: string | null;
  trade_name?: string | null;
}

/** Fila de `suppliers` → datos fiscales del documento soporte. */
export function mapSupplierToProvider(supplier: FilaProveedor): ProviderData {
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
}

/**
 * Proveedor del documento soporte. El buscador es `ElegirProveedor` (kit).
 * Al elegir se lee la fila completa para conservar los campos fiscales DIAN.
 */
export function ProviderSelector({ value, onChange }: { value: ProviderData; onChange: (data: ProviderData) => void }) {
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(
    value.supplier_id ? { id: String(value.supplier_id), nombre: value.names || value.trade_name || '' } : null,
  );

  const elegir = useCallback(
    async (elegido: ProveedorDocumento) => {
      setProveedor(elegido);
      const org = getOrganizationId();
      if (!org) return;
      const { data, error } = await supabase
        .from('suppliers')
        .select(COLUMNAS)
        .eq('organization_id', org)
        .eq('id', Number(elegido.id))
        .maybeSingle();
      if (error || !data) return;
      onChange(mapSupplierToProvider(data as FilaProveedor));
    },
    [onChange],
  );

  return (
    <ElegirProveedor
      layout="campo"
      proveedor={proveedor?.nombre ? proveedor : value.supplier_id ? { id: String(value.supplier_id), nombre: value.names || '' } : proveedor}
      onCambiar={(elegido) => void elegir(elegido)}
      onQuitar={() => {
        setProveedor(null);
        onChange({
          ...value,
          supplier_id: null,
          names: '',
          identification: '',
          dv: undefined,
          trade_name: undefined,
          email: undefined,
          phone: undefined,
        });
      }}
    />
  );
}

export default ProviderSelector;
