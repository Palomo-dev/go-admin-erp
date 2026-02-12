'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { supplierService, type SupplierInput } from '@/lib/services/supplierService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, Building2, User, Phone, Mail, FileText, MapPin, CreditCard, Globe, Sparkles, Wand2, Landmark } from 'lucide-react';
import ImageUploader from '@/components/common/ImageUploader';
import Link from 'next/link';

export function NuevoProveedorForm() {
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
      const { data, error } = await supplierService.createSupplier(organizationId, formData);
      if (error) throw error;
      toast({ title: 'Proveedor creado', description: 'El proveedor ha sido creado correctamente' });
      if (data?.uuid) router.push(`/app/inventario/proveedores/${data.uuid}`);
      else router.push('/app/inventario/proveedores');
    } catch (error: any) {
      console.error('Error creando proveedor:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo crear el proveedor' });
    } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/app/inventario/proveedores">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nuevo Proveedor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Registra un nuevo proveedor en el sistema</p>
        </div>
      </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="dark:text-gray-300">Nombre / Razón Social *</Label>
                    <Input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="Nombre del proveedor" className={`dark:bg-gray-900 dark:border-gray-700 ${errors.name ? 'border-red-500' : ''}`} />
                    {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <Label className="dark:text-gray-300">NIT / Identificación</Label>
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
                    <Select value={formData.payment_terms || ''} onValueChange={(v) => handleChange('payment_terms', v)}>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <SelectItem value="ahorros">Ahorros</SelectItem>
                        <SelectItem value="corriente">Corriente</SelectItem>
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
                <Link href="/app/inventario/proveedores" className="block">
                  <Button type="button" variant="outline" className="w-full dark:border-gray-700">Cancelar</Button>
                </Link>
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
