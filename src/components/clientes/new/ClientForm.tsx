'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MergeModal } from './MergeModal';
import { cn } from '@/utils/Utils';
import { User, Mail, Phone, MapPin, FileText, Tag, Building2, CreditCard, Users, Loader2, Save, X, Check, Camera } from 'lucide-react';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';

interface ClientFormProps {
  organizationId: number;
  branchId?: number;
  clientId?: string; // Si se proporciona, es modo edición
  mode?: 'create' | 'edit';
}

type DocumentType = 'dni' | 'rut' | 'passport' | 'foreign_id' | 'other';

interface DocumentTypeOption {
  value: DocumentType;
  label: string;
}

interface CustomerRole {
  value: string;
  label: string;
  description?: string;
}

const documentTypes: DocumentTypeOption[] = [
  { value: 'dni', label: 'DNI' },
  { value: 'rut', label: 'RUT' },
  { value: 'passport', label: 'Pasaporte' },
  { value: 'foreign_id', label: 'ID Extranjero' },
  { value: 'other', label: 'Otro' }
];

export function ClientForm({ organizationId, branchId, clientId, mode = 'create' }: ClientFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isEditMode = mode === 'edit' && !!clientId;
  
  // Estados del formulario
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    documentType: 'dni' as DocumentType,
    documentNumber: '',
    dv: '',
    companyName: '',
    tradeName: '',
    address: '',
    municipalityId: '' as string,
    notes: '',
    tags: '',
  });
  
  // Estados para roles seleccionados (desde catálogo)
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['cliente', 'huesped']);
  const [customerRoles, setCustomerRoles] = useState<{code: string; label: string; description: string; is_default: boolean}[]>([]);
  
  // Estados para responsabilidades fiscales
  const [selectedFiscal, setSelectedFiscal] = useState<string[]>(['R-99-PN']);
  const [fiscalOptions, setFiscalOptions] = useState<{code: string; description: string}[]>([]);
  
  // Estados para municipios
  const [municipalities, setMunicipalities] = useState<{id: string; code: string; name: string; state_name: string}[]>([]);
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [showMunicipalityDropdown, setShowMunicipalityDropdown] = useState(false);
  
  // Estados de carga y error
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode); // Solo carga inicial en modo edición
  const [error, setError] = useState('');
  const [duplicateFound, setDuplicateFound] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null); // Para auditoría en edición
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
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

  // Cargar datos del cliente en modo edición
  useEffect(() => {
    if (!isEditMode || !clientId) return;
    
    async function loadClientData() {
      try {
        setLoadingData(true);
        setError('');
        
        const { data: clientData, error: clientError } = await supabase
          .from('customers')
          .select('*')
          .eq('id', clientId)
          .single();
        
        if (clientError) throw clientError;
        if (!clientData) throw new Error('No se encontró el cliente');
        
        // Guardar datos originales para auditoría
        setOriginalData(clientData);
        
        // Cargar datos en el formulario
        setFormData({
          firstName: clientData.first_name || '',
          lastName: clientData.last_name || '',
          email: clientData.email || '',
          phone: clientData.phone || '',
          documentType: (clientData.identification_type as DocumentType) || 'dni',
          documentNumber: clientData.identification_number || '',
          dv: clientData.dv != null ? String(clientData.dv) : '',
          companyName: clientData.company_name || '',
          tradeName: clientData.trade_name || '',
          address: clientData.address || '',
          municipalityId: clientData.fiscal_municipality_id || '',
          notes: clientData.notes || '',
          tags: clientData.tags ? clientData.tags.join(', ') : '',
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
        
        // Cargar avatar, roles y fiscal
        setAvatarUrl(clientData.avatar_url || null);
        setSelectedRoles(clientData.roles || ['cliente', 'huesped']);
        setSelectedFiscal(clientData.fiscal_responsibilities || ['R-99-PN']);
        
      } catch (err: any) {
        console.error('Error al cargar datos del cliente:', err);
        setError('No se pudo cargar la información del cliente. ' + (err.message || ''));
        toast({
          title: "Error al cargar datos",
          description: err.message || 'Ha ocurrido un error inesperado',
          variant: "destructive",
        });
      } finally {
        setLoadingData(false);
      }
    }
    
    loadClientData();
  }, [clientId, isEditMode]);
  
  // Buscar municipios cuando el usuario escribe
  useEffect(() => {
    if (municipalitySearch.length < 2) {
      setMunicipalities(prev => prev.length === 0 ? prev : []);
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

  // Funciones de manejo de cambios en los campos
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  
  const handleRoleToggle = (role: string, checked: boolean) => {
    if (checked) {
      setSelectedRoles(prev => [...prev, role]);
    } else {
      setSelectedRoles(prev => prev.filter(r => r !== role));
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    if (!isEditMode || !clientId) {
      // En modo creación, guardar el file para subir después del insert
      const previewUrl = URL.createObjectURL(file);
      setAvatarUrl(previewUrl);
      avatarInputRef.current?.setAttribute('data-pending-file', 'true');
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
  };
  
  // Verificar duplicados
  const checkDuplicates = async () => {
    if (!formData.documentNumber && !formData.email) return false;
    
    try {
      // Buscar por documento
      if (formData.documentNumber) {
        const { data: docResults, error: docError } = await supabase
          .from('customers')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('doc_number', formData.documentNumber)
          .limit(1);
          
        if (docError) throw docError;
        if (docResults && docResults.length > 0) {
          setDuplicateClient(docResults[0]);
          setDuplicateFound(true);
          return true;
        }
      }
      
      // Buscar por email
      if (formData.email) {
        const { data: emailResults, error: emailError } = await supabase
          .from('customers')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('email', formData.email)
          .limit(1);
          
        if (emailError) throw emailError;
        if (emailResults && emailResults.length > 0) {
          setDuplicateClient(emailResults[0]);
          setDuplicateFound(true);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error verificando duplicados:', error);
      return false;
    }
  };
  
  // Envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isEditMode && clientId) {
        // ===== MODO EDICIÓN =====
        const updatedData = {
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email || null,
          phone: formData.phone || null,
          identification_type: formData.documentType,
          identification_number: formData.documentNumber || null,
          dv: formData.dv ? parseInt(formData.dv, 10) : null,
          company_name: formData.companyName || null,
          trade_name: formData.tradeName || null,
          address: formData.address || null,
          fiscal_municipality_id: formData.municipalityId || null,
          notes: formData.notes || null,
          roles: selectedRoles,
          fiscal_responsibilities: selectedFiscal,
          tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(t => t) : [],
          updated_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabase
          .from('customers')
          .update(updatedData)
          .eq('id', clientId);
        
        if (updateError) throw updateError;
        
        toast({
          title: "Cliente actualizado",
          description: `Se ha actualizado la información de ${formData.firstName} ${formData.lastName}`,
          variant: "default",
        });
        
        router.push(`/app/clientes/${clientId}`);
        
      } else {
        // ===== MODO CREACIÓN =====
        // Verificar duplicados antes de crear
        const hasDuplicates = await checkDuplicates();
        if (hasDuplicates) {
          setLoading(false);
          return; // Detener el envío - se mostrará el modal de duplicado
        }
        
        // Preparar los datos para inserción
        const customerData = {
          organization_id: organizationId,
          branch_id: branchId || null,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email || null,
          phone: formData.phone || null,
          identification_type: formData.documentType,
          identification_number: formData.documentNumber || null,
          dv: formData.dv ? parseInt(formData.dv, 10) : null,
          company_name: formData.companyName || null,
          trade_name: formData.tradeName || null,
          address: formData.address || null,
          fiscal_municipality_id: formData.municipalityId || null,
          notes: formData.notes || null,
          roles: selectedRoles,
          fiscal_responsibilities: selectedFiscal,
          tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(t => t) : [],
          created_at: new Date().toISOString()
        };
        
        // Insertar el cliente
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert([customerData])
          .select()
          .single();
          
        if (insertError) throw insertError;
        
        toast({
          title: "Cliente creado con éxito",
          description: `Se ha registrado a ${formData.firstName} ${formData.lastName} como cliente.`,
          variant: "default",
        });
        
        // Redireccionar a la vista de detalle
        if (newCustomer) {
          router.push(`/app/clientes/${newCustomer.id}`);
        } else {
          router.push('/app/clientes');
        }
      }
    } catch (err: any) {
      console.error(`Error al ${isEditMode ? 'actualizar' : 'crear'} cliente:`, err);
      setError(err.message || `Error al ${isEditMode ? 'actualizar' : 'crear'} el cliente`);
      toast({
        title: `Error al ${isEditMode ? 'actualizar' : 'crear'} cliente`,
        description: err.message || 'Ocurrió un error al procesar la solicitud',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Manejar fusión de clientes
  const handleMerge = async (mergeType: 'keep-existing' | 'update-existing' | 'create-new') => {
    setLoading(true);
    
    try {
      if (mergeType === 'keep-existing') {
        // Solo navegar a la página del cliente existente
        router.push(`/app/clientes/${duplicateClient.id}`);
        return;
      }
      
      if (mergeType === 'update-existing') {
        // Actualizar el cliente existente con los nuevos datos
        const updatedData = {
          first_name: formData.firstName || duplicateClient.first_name,
          last_name: formData.lastName || duplicateClient.last_name,
          phone: formData.phone || duplicateClient.phone,
          address: formData.address || duplicateClient.address,
          notes: formData.notes || duplicateClient.notes,
          roles: Array.from(new Set([...selectedRoles, ...(duplicateClient.roles || [])])),
          updated_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabase
          .from('customers')
          .update(updatedData)
          .eq('id', duplicateClient.id);
          
        if (updateError) throw updateError;
        
        toast({
          title: "Cliente actualizado",
          description: "Se ha actualizado la información del cliente existente.",
          variant: "default",
        });
        
        router.push(`/app/clientes/${duplicateClient.id}`);
        return;
      }
      
      // Forzar creación como nuevo cliente (create-new)
      const customerData = {
        organization_id: organizationId,
        branch_id: branchId || null,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || null,
        phone: formData.phone || null,
        identification_type: formData.documentType,
        identification_number: formData.documentNumber || null,
        address: formData.address || null,
        notes: formData.notes || null,
        roles: selectedRoles,
        tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
        created_at: new Date().toISOString()
      };
      
      // Crear cliente a pesar del duplicado
      const { data: newCustomer, error: insertError } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();
        
      if (insertError) throw insertError;
      
      toast({
        title: "Cliente duplicado creado",
        description: "Se ha creado el cliente como un registro separado.",
        variant: "default",
      });
      
      if (newCustomer) {
        router.push(`/app/clientes/${newCustomer.id}`);
      } else {
        router.push('/app/clientes');
      }
    } catch (err: any) {
      console.error('Error en operación de fusión:', err);
      setError(err.message || 'Error al procesar la operación');
    } finally {
      setLoading(false);
      setDuplicateFound(false);
    }
  };
  
  // Cancelar la fusión
  const handleCancelMerge = () => {
    setDuplicateFound(false);
    setDuplicateClient(null);
  };
  
  // Mostrar spinner mientras se cargan los datos en modo edición
  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Cargando datos del cliente...</p>
      </div>
    );
  }
  
  return (
    <>
      {/* Modal para clientes duplicados - solo en modo creación */}
      {!isEditMode && duplicateFound && duplicateClient && (
        <MergeModal
          existingClient={duplicateClient}
          newClientData={{
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            documentNumber: formData.documentNumber
          }}
          onMerge={handleMerge}
          onCancel={handleCancelMerge}
        />
      )}
    
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            {error}
          </Alert>
        )}
        
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid grid-cols-3 mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-1 rounded-lg h-12">
            <TabsTrigger value="personal" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Datos Personales</span>
              <span className="sm:hidden">Personal</span>
            </TabsTrigger>
            <TabsTrigger value="contact" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">Contacto y Dirección</span>
              <span className="sm:hidden">Contacto</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md flex items-center gap-2">
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">Información Adicional</span>
              <span className="sm:hidden">Adicional</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="personal" className="space-y-6 mt-0">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Información Personal</CardTitle>
                    <CardDescription>Datos básicos de identificación del cliente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar upload */}
                <div className="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                    <UserAvatar
                      name={`${formData.firstName} ${formData.lastName}`.trim() || 'Nuevo Cliente'}
                      avatarUrl={avatarUrl}
                      size="lg"
                      className="w-20 h-20"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingAvatar ? (
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      ) : (
                        <Camera className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Foto del cliente</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {isEditMode ? 'Haz clic para cambiar la foto (máx. 5MB)' : 'Puedes agregar una foto después de crear el cliente'}
                    </p>
                  </div>
                </div>

                {/* Nombre y Apellido */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium flex items-center gap-1">
                      Nombre <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      id="firstName" 
                      name="firstName" 
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                      placeholder="Ej: Juan Carlos"
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium flex items-center gap-1">
                      Apellido <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      id="lastName" 
                      name="lastName" 
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                      placeholder="Ej: García López"
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                {/* Documento */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="documentType" className="text-sm font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      Tipo de Documento
                    </Label>
                    <select
                      id="documentType"
                      name="documentType"
                      value={formData.documentType}
                      onChange={(e) => setFormData(prev => ({ ...prev, documentType: e.target.value as DocumentType }))}
                      className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ring-offset-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-950"
                    >
                      {documentTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="documentNumber" className="text-sm font-medium">Número de Documento</Label>
                    <Input 
                      id="documentNumber" 
                      name="documentNumber" 
                      value={formData.documentNumber}
                      onChange={handleChange}
                      placeholder="Ej: 12345678"
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dv" className="text-sm font-medium">DV</Label>
                    <Input 
                      id="dv" 
                      name="dv" 
                      value={formData.dv}
                      onChange={handleChange}
                      placeholder="Ej: 3"
                      maxLength={1}
                      className="h-10 w-20 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Datos Empresariales */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      Razón Social
                    </Label>
                    <Input 
                      id="companyName" 
                      name="companyName" 
                      value={formData.companyName}
                      onChange={handleChange}
                      placeholder="Ej: Empresa S.A.S."
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tradeName" className="text-sm font-medium">Nombre Comercial</Label>
                    <Input 
                      id="tradeName" 
                      name="tradeName" 
                      value={formData.tradeName}
                      onChange={handleChange}
                      placeholder="Ej: Mi Negocio"
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                {/* Roles */}
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    Roles del Cliente
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {customerRoles.map((role) => (
                      <div 
                        key={role.code} 
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                          selectedRoles.includes(role.code)
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                        onClick={() => handleRoleToggle(role.code, !selectedRoles.includes(role.code))}
                      >
                        <div className={cn(
                          "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center",
                          selectedRoles.includes(role.code)
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 dark:border-gray-600"
                        )}>
                          {selectedRoles.includes(role.code) && <Check className="h-3 w-3" />}
                        </div>
                        <span className="cursor-pointer text-sm">
                          {role.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Responsabilidades Fiscales DIAN */}
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-gray-400" />
                    Responsabilidad Fiscal (DIAN)
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {fiscalOptions.map((fiscal) => (
                      <div 
                        key={fiscal.code} 
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                          selectedFiscal.includes(fiscal.code)
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                        onClick={() => {
                          setSelectedFiscal(prev => 
                            prev.includes(fiscal.code)
                              ? prev.filter(f => f !== fiscal.code)
                              : [...prev, fiscal.code]
                          );
                        }}
                      >
                        <div className={cn(
                          "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center",
                          selectedFiscal.includes(fiscal.code)
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 dark:border-gray-600"
                        )}>
                          {selectedFiscal.includes(fiscal.code) && <Check className="h-3 w-3" />}
                        </div>
                        <span className="cursor-pointer text-sm">
                          <span className="font-medium">{fiscal.code}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1 text-xs">- {fiscal.description}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="contact" className="space-y-6 mt-0">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                    <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Datos de Contacto</CardTitle>
                    <CardDescription>Información para comunicarnos con el cliente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Email y Teléfono */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      Correo Electrónico
                    </Label>
                    <Input 
                      id="email" 
                      name="email" 
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="cliente@ejemplo.com"
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      Teléfono
                    </Label>
                    <Input 
                      id="phone" 
                      name="phone" 
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+57 300 123 4567"
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                {/* Dirección */}
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    Dirección
                  </Label>
                  <Input 
                    id="address" 
                    name="address" 
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Calle 123 #45-67, Apartamento 101"
                    className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                
                {/* Municipio */}
                <div className="space-y-2 relative">
                    <Label htmlFor="municipalitySearch" className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      Municipio
                    </Label>
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
                      className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
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
          
          <TabsContent value="additional" className="space-y-6 mt-0">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                    <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Información Adicional</CardTitle>
                    <CardDescription>Etiquetas y notas para categorizar al cliente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Etiquetas */}
                <div className="space-y-2">
                  <Label htmlFor="tags" className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4 text-gray-400" />
                    Etiquetas
                  </Label>
                  <Input 
                    id="tags" 
                    name="tags" 
                    value={formData.tags}
                    onChange={handleChange}
                    placeholder="premium, frecuente, corporativo (separadas por comas)"
                    className="h-10 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Separa las etiquetas con comas para organizar mejor tus clientes
                  </p>
                </div>
                
                {/* Notas */}
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Notas Internas
                  </Label>
                  <Textarea 
                    id="notes" 
                    name="notes" 
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Información relevante sobre el cliente, preferencias, historial, etc."
                    className="min-h-[150px] bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Estas notas son solo para uso interno y no son visibles para el cliente
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Botones de acción mejorados */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Los campos marcados con <span className="text-red-500">*</span> son obligatorios
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={loading}
                  className="min-w-[100px]"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                
                <Button 
                  type="submit" 
                  disabled={loading || !formData.firstName || !formData.lastName}
                  className={cn(
                    "min-w-[160px] bg-blue-600 hover:bg-blue-700",
                    loading ? "opacity-80" : ""
                  )}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{isEditMode ? 'Actualizando...' : 'Guardando...'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Save className="h-4 w-4" />
                      <span>{isEditMode ? 'Guardar Cambios' : 'Guardar Cliente'}</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
