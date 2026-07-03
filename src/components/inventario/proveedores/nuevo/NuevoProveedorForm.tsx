'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { supplierService, type SupplierInput } from '@/lib/services/supplierService';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, Building2, User, Phone, Mail, FileText, MapPin, CreditCard, Globe, Sparkles, Wand2, Landmark } from 'lucide-react';
import ImageUploader from '@/components/common/ImageUploader';
import Link from 'next/link';

interface NuevoProveedorFormProps {
  /** Cuando se provee, tras crear el proveedor se llama en lugar de navegar (uso en diálogos) */
  onSuccess?: (supplier: any) => void;
  /** Callback para el botón cancelar cuando se usa embebido */
  onCancel?: () => void;
  /** Modo embebido: oculta header/sidebar y usa callbacks (para diálogos) */
  embedded?: boolean;
}

export function NuevoProveedorForm({ onSuccess, onCancel, embedded = false }: NuevoProveedorFormProps = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [formData, setFormData] = useState<SupplierInput>({
    name: '', nit: '', contact: '', phone: '', email: '', notes: '',
    description: '', logo_url: '', address: '', city: '', state: '',
    country: 'Colombia', postal_code: '', tax_id: '', tax_regime: '',
    payment_terms: '', credit_days: undefined, website: '',
    bank_name: '', bank_account: '', account_type: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingImg, setGeneratingImg] = useState(false);

  // Tipo de proveedor: persona natural o empresa
  const [supplierType, setSupplierType] = useState<'person' | 'company'>('company');
  // Proveedor padre (para personas vinculadas a una empresa proveedora)
  const [parentSupplierId, setParentSupplierId] = useState<string>('');
  const [companySuppliers, setCompanySuppliers] = useState<{ id: number; name: string }[]>([]);
  // Tipos de documento según el país de la organización
  const fallbackDocTypes = [
    { value: 'tax_id', label: 'ID Tributario / Fiscal', forCompany: true, forPerson: true },
    { value: 'national_id', label: 'Documento nacional', forCompany: false, forPerson: true },
    { value: 'passport', label: 'Pasaporte', forCompany: false, forPerson: true },
    { value: 'other', label: 'Otro', forCompany: true, forPerson: true },
  ];
  const [documentTypes, setDocumentTypes] = useState<{ value: string; label: string; forCompany: boolean; forPerson: boolean }[]>(fallbackDocTypes);

  // Cargar tipos de documento por país de la organización
  useEffect(() => {
    async function loadDocTypes() {
      if (!organization?.id) return;
      try {
        const { data: org } = await supabase
          .from('organizations')
          .select('country_code')
          .eq('id', organization.id)
          .single();
        const countryCode = org?.country_code || 'GEN';
        let { data: types } = await supabase
          .from('country_identification_types')
          .select('code, name, for_company, for_person')
          .eq('country_code', countryCode)
          .eq('is_active', true)
          .order('sort_order');
        if (!types || types.length === 0) {
          const { data: genTypes } = await supabase
            .from('country_identification_types')
            .select('code, name, for_company, for_person')
            .eq('country_code', 'GEN')
            .eq('is_active', true)
            .order('sort_order');
          types = genTypes;
        }
        if (types && types.length > 0) {
          setDocumentTypes(types.map(t => ({ value: t.code, label: t.name, forCompany: t.for_company, forPerson: t.for_person })));
        }
      } catch (err) {
        console.error('Error cargando tipos de documento:', err);
      }
    }
    loadDocTypes();
  }, [organization?.id]);

  // Cargar empresas proveedoras (posibles proveedores padre)
  useEffect(() => {
    async function loadCompanies() {
      const orgId = getOrganizationId();
      if (!orgId) return;
      const { data } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('supplier_type', 'company')
        .order('name');
      if (data) setCompanySuppliers(data);
    }
    loadCompanies();
  }, [organization?.id]);

  // Tipos de documento visibles según el tipo de proveedor
  const visibleDocTypes = documentTypes.filter(t => (supplierType === 'company' ? t.forCompany : t.forPerson));

  // Ajustar el tipo de documento por defecto al cambiar el tipo de proveedor
  useEffect(() => {
    if (visibleDocTypes.length === 0) return;
    const stillValid = visibleDocTypes.some(t => t.value === formData.doc_type);
    if (!stillValid) {
      setFormData(prev => ({ ...prev, doc_type: visibleDocTypes[0].value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierType, documentTypes]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleAIDescription = async () => {
    if (!formData.name.trim()) { toast({ title: 'Escribe el nombre primero', variant: 'destructive' }); return; }
    setGeneratingDesc(true);
    try {
      const res = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: formData.name, currentDescription: formData.description || '', type: 'supplier_description' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.improvedText) handleChange('description', data.improvedText);
        toast({ title: 'Descripción generada con IA' });
      }
    } catch { toast({ title: 'Error', description: 'No se pudo generar la descripción.', variant: 'destructive' }); }
    finally { setGeneratingDesc(false); }
  };

  const handleAILogo = async () => {
    if (!formData.name.trim()) { toast({ title: 'Escribe el nombre primero', variant: 'destructive' }); return; }
    setGeneratingImg(true);
    try {
      const res = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: formData.name, description: `Logo profesional para proveedor: ${formData.name}`, organizationId: organization?.id || 0 }),
      });
      if (!res.ok) throw new Error('Error generando logo');
      const data = await res.json();
      if (data.imageUrl) {
        handleChange('logo_url', data.imageUrl);
        toast({ title: 'Logo generado con IA' });
      }
    } catch { toast({ title: 'Error', description: 'No se pudo generar el logo.', variant: 'destructive' }); }
    finally { setGeneratingImg(false); }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setIsSaving(true);
      const organizationId = getOrganizationId();
      const payload: SupplierInput = {
        ...formData,
        supplier_type: supplierType,
        parent_supplier_id: supplierType === 'person' && parentSupplierId ? parseInt(parentSupplierId, 10) : null,
      };
      const { data, error } = await supplierService.createSupplier(organizationId, payload);
      if (error) throw error;
      toast({ title: 'Proveedor creado', description: 'El proveedor ha sido creado correctamente' });
      if (onSuccess) {
        onSuccess(data);
      } else if (data?.uuid) {
        router.push(`/app/inventario/proveedores/${data.uuid}`);
      } else {
        router.push('/app/inventario/proveedores');
      }
    } catch (error: any) {
      console.error('Error creando proveedor:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo crear el proveedor' });
    } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/proveedores">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nuevo Proveedor</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Registra un nuevo proveedor en el sistema</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Información básica */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />Información del Proveedor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tipo de proveedor: persona natural o empresa */}
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Tipo de Proveedor</Label>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <div
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${supplierType === 'company' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                      onClick={() => setSupplierType('company')}
                    >
                      <Building2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Empresa</span>
                    </div>
                    <div
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${supplierType === 'person' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                      onClick={() => setSupplierType('person')}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">Persona Natural</span>
                    </div>
                  </div>
                </div>

                {/* Empresa proveedora padre (solo para personas) */}
                {supplierType === 'person' && companySuppliers.length > 0 && (
                  <div>
                    <Label className="dark:text-gray-300">Empresa proveedora asociada (opcional)</Label>
                    <Select value={parentSupplierId || 'none'} onValueChange={(v) => setParentSupplierId(v === 'none' ? '' : v)}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700"><SelectValue placeholder="Sin empresa asociada" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin empresa asociada</SelectItem>
                        {companySuppliers.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vincula esta persona como contacto/proveedor hijo de una empresa</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="dark:text-gray-300">{supplierType === 'company' ? 'Razón Social' : 'Nombre completo'} *</Label>
                    <Input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder={supplierType === 'company' ? 'Empresa S.A.S.' : 'Juan Pérez'} className={`dark:bg-gray-900 dark:border-gray-700 ${errors.name ? 'border-red-500' : ''}`} />
                    {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Tipo de Documento</Label>
                    <Select value={formData.doc_type || ''} onValueChange={(v) => handleChange('doc_type', v)}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {visibleDocTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Número de Documento</Label>
                    <Input value={formData.nit} onChange={(e) => handleChange('nit', e.target.value)} placeholder="123456789-0" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Persona de Contacto</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input value={formData.contact} onChange={(e) => handleChange('contact', e.target.value)} placeholder="Nombre del contacto" className="pl-10 dark:bg-gray-900 dark:border-gray-700" />
                    </div>
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Sitio Web</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input value={formData.website} onChange={(e) => handleChange('website', e.target.value)} placeholder="https://www.ejemplo.com" className="pl-10 dark:bg-gray-900 dark:border-gray-700" />
                    </div>
                  </div>
                </div>

                {/* Descripción con IA */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="dark:text-gray-300">Descripción</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={handleAIDescription} disabled={generatingDesc || !formData.name.trim()} className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 gap-1">
                      {generatingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {generatingDesc ? 'Generando...' : 'Generar con IA'}
                    </Button>
                  </div>
                  <Textarea value={formData.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Descripción del proveedor, productos que ofrece..." className="dark:bg-gray-900 dark:border-gray-700" rows={3} />
                </div>
              </CardContent>
            </Card>

            {/* Contacto */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <Phone className="h-5 w-5 text-blue-600" />Información de Contacto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="dark:text-gray-300">Teléfono</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="+57 300 123 4567" className="pl-10 dark:bg-gray-900 dark:border-gray-700" />
                    </div>
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Correo Electrónico</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="proveedor@ejemplo.com" className={`pl-10 dark:bg-gray-900 dark:border-gray-700 ${errors.email ? 'border-red-500' : ''}`} />
                    </div>
                    {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dirección */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />Dirección
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="dark:text-gray-300">Dirección</Label>
                    <Input value={formData.address} onChange={(e) => handleChange('address', e.target.value)} placeholder="Calle, número, oficina..." className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Ciudad</Label>
                    <Input value={formData.city} onChange={(e) => handleChange('city', e.target.value)} placeholder="Ciudad" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Departamento / Estado</Label>
                    <Input value={formData.state} onChange={(e) => handleChange('state', e.target.value)} placeholder="Departamento" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">País</Label>
                    <Input value={formData.country} onChange={(e) => handleChange('country', e.target.value)} placeholder="Colombia" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Código Postal</Label>
                    <Input value={formData.postal_code} onChange={(e) => handleChange('postal_code', e.target.value)} placeholder="110111" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Fiscal */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />Información Fiscal y Comercial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="dark:text-gray-300">Régimen Tributario</Label>
                    <Select value={formData.tax_regime || ''} onValueChange={(v) => handleChange('tax_regime', v)}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700"><SelectValue placeholder="Seleccionar régimen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Régimen Simple</SelectItem>
                        <SelectItem value="comun">Régimen Común</SelectItem>
                        <SelectItem value="gran_contribuyente">Gran Contribuyente</SelectItem>
                        <SelectItem value="no_responsable">No Responsable de IVA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Condiciones de Pago</Label>
                    <Select value={formData.payment_terms || ''} onValueChange={(v) => {
                      handleChange('payment_terms', v);
                      const daysMap: Record<string, number> = { contado: 0, credito_15: 15, credito_30: 30, credito_60: 60, credito_90: 90 };
                      if (daysMap[v] !== undefined) handleChange('credit_days', daysMap[v]);
                    }}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado</SelectItem>
                        <SelectItem value="credito_15">Crédito 15 días</SelectItem>
                        <SelectItem value="credito_30">Crédito 30 días</SelectItem>
                        <SelectItem value="credito_60">Crédito 60 días</SelectItem>
                        <SelectItem value="credito_90">Crédito 90 días</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Días de Crédito</Label>
                    <Input type="number" min="0" value={formData.credit_days ?? ''} onChange={(e) => handleChange('credit_days', e.target.value ? parseInt(e.target.value) : undefined)} placeholder="30" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bancaria */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-600" />Información Bancaria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="dark:text-gray-300">Banco</Label>
                    <Input value={formData.bank_name} onChange={(e) => handleChange('bank_name', e.target.value)} placeholder="Nombre del banco" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Número de Cuenta</Label>
                    <Input value={formData.bank_account} onChange={(e) => handleChange('bank_account', e.target.value)} placeholder="Número de cuenta" className="dark:bg-gray-900 dark:border-gray-700" />
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">Tipo de Cuenta</Label>
                    <Select value={formData.account_type || ''} onValueChange={(v) => handleChange('account_type', v)}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="savings">Ahorros</SelectItem>
                        <SelectItem value="checking">Corriente</SelectItem>
                        <SelectItem value="other">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notas (sin IA) */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />Notas Adicionales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Información adicional sobre el proveedor..." className="dark:bg-gray-900 dark:border-gray-700" rows={3} />
              </CardContent>
            </Card>
          </div>

          {/* Panel lateral */}
          <div className="space-y-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white">Acciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar Proveedor
                </Button>
                {embedded && onCancel ? (
                  <Button type="button" variant="outline" className="w-full dark:border-gray-700" onClick={onCancel}>Cancelar</Button>
                ) : (
                  <Link href="/app/inventario/proveedores" className="block">
                    <Button type="button" variant="outline" className="w-full dark:border-gray-700">Cancelar</Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Logo */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center justify-between">
                  <span>Logo</span>
                  <Button type="button" variant="ghost" size="sm" onClick={handleAILogo} disabled={generatingImg || !formData.name.trim()} className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 gap-1">
                    {generatingImg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {generatingImg ? 'Generando...' : 'Generar con IA'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ImageUploader
                  currentImageUrl={formData.logo_url || null}
                  onImageUploaded={(url) => handleChange('logo_url', url)}
                  onImageRemoved={() => handleChange('logo_url', '')}
                  bucket="supplier-logos"
                  folder="logos"
                  label=""
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

export default NuevoProveedorForm;
