'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { Loader2 as LoadingSpinner, X, Camera } from 'lucide-react';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';

// Para utilidades como cn
const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

// Tipos e interfaces
interface EditClientFormProps {
  clientId: string;
  organizationId: number;
  branchId?: number;
}

interface FormData {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  dv: string;
  companyName: string;
  tradeName: string;
  email: string;
  phone: string;
  address: string;
  municipalityId: string;
  tags: string;
  notes: string;
}

interface ClientData {
  id: string;
  organization_id: number;
  branch_id?: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  phone?: string;
  identification_type?: string;
  identification_number?: string;
  address?: string;
  roles?: string[];
  tags?: string[];
  notes?: string;
  created_at: string;
  updated_at?: string;
  [key: string]: any; // Para otros campos no especificados
}

// Opciones para tipos de documento
const documentTypes = [
  { value: 'dni', label: 'DNI' },
  { value: 'ruc', label: 'RUC' },
  { value: 'passport', label: 'Pasaporte' },
  { value: 'foreign_id', label: 'ID Extranjero' },
  { value: 'other', label: 'Otro' }
];

// Componente principal
export default function EditClientForm({ clientId, organizationId, branchId }: EditClientFormProps) {
  const router = useRouter();
  
  // Estados para el formulario
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    documentType: '',
    documentNumber: '',
    dv: '',
    companyName: '',
    tradeName: '',
    email: '',
    phone: '',
    address: '',
    municipalityId: '',
    tags: '',
    notes: ''
  });
  
  // Estados originales para comparación y auditoría
  const [originalData, setOriginalData] = useState<ClientData | null>(null);
  
  // Estados para municipios
  const [municipalities, setMunicipalities] = useState<{id: string; code: string; name: string; state_name: string}[]>([]);
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [showMunicipalityDropdown, setShowMunicipalityDropdown] = useState(false);
  
  // Estados adicionales
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [customerRoles, setCustomerRoles] = useState<{code: string; label: string; description: string; is_default: boolean}[]>([]);
  const [selectedFiscal, setSelectedFiscal] = useState<string[]>([]);
  const [fiscalOptions, setFiscalOptions] = useState<{code: string; description: string}[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSubmit, setLoadingSubmit] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  
  // Cargar catálogos de roles y responsabilidades fiscales
  useEffect(() => {
    async function loadCatalogs() {
      const [rolesRes, fiscalRes] = await Promise.all([
        supabase.from('customer_roles').select('code, label, description, is_default').order('sort_order'),
        supabase.from('dian_fiscal_responsibilities').select('code, description').order('sort_order'),
      ]);
      if (rolesRes.data) setCustomerRoles(rolesRes.data);
      if (fiscalRes.data) setFiscalOptions(fiscalRes.data);
    }
    loadCatalogs();
  }, []);

  // Cargar datos del cliente
  useEffect(() => {
    const fetchClientData = async () => {
      try {
        setLoading(true);
        setError('');
        
        const { data: clientData, error: clientError } = await supabase
          .from('customers')
          .select('*')
          .eq('id', clientId)
          .single();
        
        if (clientError) throw clientError;
        if (!clientData) throw new Error('No se encontró el cliente');
        
        // Guardar datos originales para comparación
        setOriginalData(clientData);
        
        // Cargar datos en el formulario
        setFormData({
          firstName: clientData.first_name || '',
          lastName: clientData.last_name || '',
          documentType: clientData.identification_type || '',
          documentNumber: clientData.identification_number || '',
          dv: clientData.dv != null ? String(clientData.dv) : '',
          companyName: clientData.company_name || '',
          tradeName: clientData.trade_name || '',
          email: clientData.email || '',
          phone: clientData.phone || '',
          address: clientData.address || '',
          municipalityId: clientData.fiscal_municipality_id || '',
          tags: clientData.tags ? clientData.tags.join(', ') : '',
          notes: clientData.notes || ''
        });
        
        // Si tiene municipio, cargar su nombre para el search
        if (clientData.fiscal_municipality_id) {
          const { data: muni } = await supabase
            .from('municipalities')
            .select('name, state_name')
            .eq('id', clientData.fiscal_municipality_id)
            .single();
          if (muni) setMunicipalitySearch(`${muni.name} - ${muni.state_name}`);
        }
        
        // Cargar avatar y roles
        setAvatarUrl(clientData.avatar_url || null);
        setSelectedRoles(clientData.roles || []);
        setSelectedFiscal(clientData.fiscal_responsibilities || []);
        
      } catch (err: any) {
        console.error('Error al cargar datos del cliente:', err);
        setError('No se pudo cargar la información del cliente. ' + (err.message || ''));
        toast({
          title: "Error al cargar datos",
          description: err.message || 'Ha ocurrido un error inesperado',
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);
  
  // Buscar municipios cuando el usuario escribe
  useEffect(() => {
    if (municipalitySearch.length < 2) {
      setMunicipalities([]);
      return;
    }
    
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('municipalities')
        .select('id, code, name, state_name')
        .ilike('name', `%${municipalitySearch}%`)
        .order('name')
        .limit(15);
      
      if (data) setMunicipalities(data);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [municipalitySearch]);

  // Manejar cambios en los inputs de texto
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Manejar cambios en selects
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Manejar cambios en los roles (checkbox)
  const handleRoleToggle = (role: string, checked: boolean) => {
    setSelectedRoles(prev => {
      if (checked) {
        return [...prev, role];
      } else {
        return prev.filter(r => r !== role);
      }
    });
  };
  
  // Detectar campos que han cambiado
  const getChangedFields = (): string[] => {
    if (!originalData) return [];
    
    const changedFields: string[] = [];
    
    // Comparar campos básicos
    if (formData.firstName !== originalData.first_name) changedFields.push('first_name');
    if (formData.lastName !== originalData.last_name) changedFields.push('last_name');
    if (formData.documentType !== originalData.identification_type) changedFields.push('identification_type');
    if (formData.documentNumber !== originalData.identification_number) changedFields.push('identification_number');
    if (formData.email !== originalData.email) changedFields.push('email');
    if (formData.phone !== originalData.phone) changedFields.push('phone');
    if (formData.address !== originalData.address) changedFields.push('address');
    if (formData.notes !== originalData.notes) changedFields.push('notes');
    if (formData.dv !== (originalData.dv != null ? String(originalData.dv) : '')) changedFields.push('dv');
    if (formData.companyName !== (originalData.company_name || '')) changedFields.push('company_name');
    if (formData.tradeName !== (originalData.trade_name || '')) changedFields.push('trade_name');
    if (formData.municipalityId !== (originalData.fiscal_municipality_id || '')) changedFields.push('fiscal_municipality_id');
    
    // Comparar tags (convertidos a array vs array original)
    const newTags = formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    const oldTags = originalData.tags || [];
    if (JSON.stringify(newTags) !== JSON.stringify(oldTags)) changedFields.push('tags');
    
    // Comparar roles
    if (JSON.stringify(selectedRoles.sort()) !== JSON.stringify((originalData.roles || []).sort())) {
      changedFields.push('roles');
    }
    
    // Comparar fiscal responsibilities
    if (JSON.stringify(selectedFiscal.sort()) !== JSON.stringify((originalData.fiscal_responsibilities || []).sort())) {
      changedFields.push('fiscal_responsibilities');
    }
    
    return changedFields;
  };
  
  // Registrar entrada de auditoría
  const logAuditEntry = async (previousData: any, newData: any, changedFields: string[]) => {
    try {
      // Preparar datos de auditoría
      const auditData = {
        organization_id: organizationId,
        branch_id: branchId || null,
        user_id: null, // En una aplicación real, aquí iría el ID del usuario logueado
        entity_type: 'customer',
        entity_id: clientId,
        action: 'update',
        previous_data: previousData,
        new_data: newData,
        changed_fields: changedFields,
        created_at: new Date().toISOString()
      };
      
      // Insertar en la tabla de auditoría
      const { error } = await supabase
        .from('ops_audit_log')
        .insert([auditData]);
      
      if (error) throw error;
      
    } catch (err) {
      console.error('Error al registrar auditoría:', err);
      // No detenemos el flujo por un error de auditoría
    }
  };
  
  // Envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSubmit(true);
    setError('');
    
    try {
      if (!originalData) throw new Error('No se encontraron datos originales del cliente');
      
      // Verificar si hay cambios
      const changedFields = getChangedFields();
      if (changedFields.length === 0) {
        toast({
          title: "Sin cambios",
          description: "No se detectaron cambios en la información del cliente",
          variant: "default",
        });
        router.back();
        return;
      }
      
      // Preparar datos actualizados
      const updatedData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || null,
        phone: formData.phone || null,
        identification_type: formData.documentType || null,
        identification_number: formData.documentNumber || null,
        dv: formData.dv ? parseInt(formData.dv, 10) : null,
        company_name: formData.companyName || null,
        trade_name: formData.tradeName || null,
        address: formData.address || null,
        fiscal_municipality_id: formData.municipalityId || null,
        notes: formData.notes || null,
        roles: selectedRoles,
        fiscal_responsibilities: selectedFiscal,
        tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        updated_at: new Date().toISOString()
      };
      
      // Actualizar el cliente
      const { error: updateError } = await supabase
        .from('customers')
        .update(updatedData)
        .eq('id', clientId);
      
      if (updateError) throw updateError;
      
      // Registrar en auditoría
      await logAuditEntry(originalData, updatedData, changedFields);
      
      toast({
        title: "Cliente actualizado",
        description: `Se ha actualizado la información de ${formData.firstName} ${formData.lastName}`,
        variant: "default",
      });
      
      // Redireccionar a la vista de detalle
      router.push(`/app/clientes/${clientId}`);
      
    } catch (err: any) {
      console.error('Error al actualizar cliente:', err);
      setError(err.message || 'Error al actualizar el cliente');
      toast({
        title: "Error al actualizar",
        description: err.message || 'Ocurrió un error al procesar la solicitud',
        variant: "destructive",
      });
    } finally {
      setLoadingSubmit(false);
    }
  };
  
  // Si está cargando, mostrar spinner
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px]">
        <LoadingSpinner className="h-10 w-10 text-blue-600 animate-spin" />
        <p className="mt-4 text-gray-600 dark:text-gray-300">Cargando datos del cliente...</p>
      </div>
    );
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-8 w-full max-w-5xl mx-auto">
      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}
      
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid grid-cols-3 mb-8">
          <TabsTrigger value="personal">Datos Personales</TabsTrigger>
          <TabsTrigger value="contact">Contacto y Dirección</TabsTrigger>
          <TabsTrigger value="additional">Información Adicional</TabsTrigger>
        </TabsList>
        
        <TabsContent value="personal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Información Personal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar upload */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                  <UserAvatar
                    name={`${formData.firstName} ${formData.lastName}`.trim()}
                    avatarUrl={avatarUrl}
                    size="lg"
                    className="w-20 h-20"
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? (
                      <LoadingSpinner className="h-5 w-5 text-white animate-spin" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith('image/')) {
                        toast({ title: 'Error', description: 'Solo se permiten imágenes', variant: 'destructive' });
                        return;
                      }
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: 'Error', description: 'La imagen no debe superar 5MB', variant: 'destructive' });
                        return;
                      }
                      setUploadingAvatar(true);
                      try {
                        const ext = file.name.split('.').pop();
                        const filePath = `customers/${clientId}/avatar.${ext}`;
                        const { error: upErr } = await supabase.storage.from('profiles').upload(filePath, file, { upsert: true });
                        if (upErr) throw upErr;
                        const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(filePath);
                        const newUrl = `${publicUrl}?t=${Date.now()}`;
                        await supabase.from('customers').update({ avatar_url: newUrl }).eq('id', clientId);
                        setAvatarUrl(newUrl);
                        toast({ title: 'Avatar actualizado' });
                      } catch (err: any) {
                        toast({ title: 'Error', description: err.message, variant: 'destructive' });
                      } finally {
                        setUploadingAvatar(false);
                        if (avatarInputRef.current) avatarInputRef.current.value = '';
                      }
                    }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">Foto del cliente</p>
                  <p className="text-xs text-gray-500">Haz clic en la imagen para cambiarla (máx. 5MB)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nombre *</Label>
                  <Input 
                    id="firstName" 
                    name="firstName" 
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    placeholder="Nombre del cliente"
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Apellido *</Label>
                  <Input 
                    id="lastName" 
                    name="lastName" 
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    placeholder="Apellido del cliente"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="documentType">Tipo de Documento</Label>
                  <Select
                    value={formData.documentType}
                    onValueChange={(value) => handleSelectChange('documentType', value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="documentNumber">Número de Documento</Label>
                  <Input 
                    id="documentNumber" 
                    name="documentNumber" 
                    value={formData.documentNumber}
                    onChange={handleChange}
                    placeholder="Número de identificación"
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dv">DV</Label>
                  <Input 
                    id="dv" 
                    name="dv" 
                    value={formData.dv}
                    onChange={handleChange}
                    placeholder="Ej: 3"
                    maxLength={1}
                    className="w-20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Razón Social</Label>
                  <Input 
                    id="companyName" 
                    name="companyName" 
                    value={formData.companyName}
                    onChange={handleChange}
                    placeholder="Ej: Empresa S.A.S."
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tradeName">Nombre Comercial</Label>
                  <Input 
                    id="tradeName" 
                    name="tradeName" 
                    value={formData.tradeName}
                    onChange={handleChange}
                    placeholder="Ej: Mi Negocio"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <Label>Roles del Cliente</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {customerRoles.map((role) => (
                    <div key={role.code} className="flex items-center space-x-2">
                      <Checkbox 
                        checked={selectedRoles.includes(role.code)}
                        onCheckedChange={(checked) => handleRoleToggle(role.code, !!checked)}
                      />
                      <span className="cursor-pointer text-sm">
                        {role.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label>Responsabilidad Fiscal (DIAN)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {fiscalOptions.map((fiscal) => (
                    <div key={fiscal.code} className="flex items-center space-x-2">
                      <Checkbox 
                        checked={selectedFiscal.includes(fiscal.code)}
                        onCheckedChange={(checked) => {
                          setSelectedFiscal(prev => 
                            checked
                              ? [...prev, fiscal.code]
                              : prev.filter(f => f !== fiscal.code)
                          );
                        }}
                      />
                      <span className="cursor-pointer text-sm">
                        <span className="font-medium">{fiscal.code}</span>
                        <span className="text-gray-500 ml-1">- {fiscal.description}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="contact" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Datos de Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="correo@ejemplo.com"
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Número de teléfono"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input 
                    id="address" 
                    name="address" 
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Dirección completa"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="space-y-2 relative">
                  <Label htmlFor="municipalitySearch">Municipio</Label>
                  <Input 
                    id="municipalitySearch"
                    value={municipalitySearch}
                    onChange={(e) => {
                      setMunicipalitySearch(e.target.value);
                      setShowMunicipalityDropdown(true);
                      if (!e.target.value) {
                        setFormData(prev => ({ ...prev, municipalityId: '' }));
                      }
                    }}
                    onFocus={() => municipalitySearch.length >= 2 && setShowMunicipalityDropdown(true)}
                    onBlur={() => setTimeout(() => setShowMunicipalityDropdown(false), 200)}
                    placeholder="Buscar municipio..."
                    className="w-full"
                    autoComplete="off"
                  />
                  {formData.municipalityId && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, municipalityId: '' }));
                        setMunicipalitySearch('');
                      }}
                      className="absolute right-2 top-[38px] text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {showMunicipalityDropdown && municipalities.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {municipalities.map((muni) => (
                        <button
                          key={muni.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, municipalityId: muni.id }));
                            setMunicipalitySearch(`${muni.name} - ${muni.state_name}`);
                            setShowMunicipalityDropdown(false);
                          }}
                        >
                          <span className="font-medium">{muni.name}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1 text-xs">({muni.code}) - {muni.state_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="additional" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Información Adicional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                <Input 
                  id="tags" 
                  name="tags" 
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="premium, frecuente, corporativo"
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea 
                  id="notes" 
                  name="notes" 
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Información adicional sobre el cliente"
                  className="w-full min-h-[120px]"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loadingSubmit}
        >
          Cancelar
        </Button>
        
        <Button 
          type="submit" 
          disabled={loadingSubmit || !formData.firstName || !formData.lastName}
          className={cn(
            "min-w-[120px]",
            loadingSubmit ? "opacity-80" : ""
          )}
        >
          {loadingSubmit ? (
            <div className="flex items-center space-x-2">
              <LoadingSpinner className="h-4 w-4" />
              <span>Guardando...</span>
            </div>
          ) : "Guardar Cambios"}
        </Button>
      </div>
    </form>
  );
}
