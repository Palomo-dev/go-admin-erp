'use client';

import { useState, useEffect } from 'react';
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
import { Loader2 as LoadingSpinner } from 'lucide-react';

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
  email: string;
  phone: string;
  address: string;
  city: string;
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
  city?: string;
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

// Opciones para roles de cliente
const customerRoles = [
  { value: 'cliente', label: 'Cliente', description: 'Cliente regular del negocio' },
  { value: 'huesped', label: 'Huésped', description: 'Para negocios de hospedaje' },
  { value: 'pasajero', label: 'Pasajero', description: 'Para servicios de transporte' },
  { value: 'proveedor', label: 'Proveedor', description: 'Proveedor de servicios/productos' },
  { value: 'empleado', label: 'Empleado', description: 'Personal interno' }
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
    email: '',
    phone: '',
    address: '',
    city: '',
    tags: '',
    notes: ''
  });
  
  // Estados originales para comparación y auditoría
  const [originalData, setOriginalData] = useState<ClientData | null>(null);
  
  // Estados adicionales
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSubmit, setLoadingSubmit] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
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
          email: clientData.email || '',
          phone: clientData.phone || '',
          address: clientData.address || '',
          city: clientData.city || '',
          tags: clientData.tags ? clientData.tags.join(', ') : '',
          notes: clientData.notes || ''
        });
        
        // Cargar roles
        setSelectedRoles(clientData.roles || []);
        
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
    if (formData.city !== originalData.city) changedFields.push('city');
    if (formData.notes !== originalData.notes) changedFields.push('notes');
    
    // Comparar tags (convertidos a array vs array original)
    const newTags = formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    const oldTags = originalData.tags || [];
    if (JSON.stringify(newTags) !== JSON.stringify(oldTags)) changedFields.push('tags');
    
    // Comparar roles
    if (JSON.stringify(selectedRoles.sort()) !== JSON.stringify((originalData.roles || []).sort())) {
      changedFields.push('roles');
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
        full_name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email || null,
        phone: formData.phone || null,
        identification_type: formData.documentType || null,
        identification_number: formData.documentNumber || null,
        address: formData.address || null,
        city: formData.city || null,
        notes: formData.notes || null,
        roles: selectedRoles,
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              </div>
              
              <div className="space-y-4">
                <Label>Roles del Cliente</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {customerRoles.map((role) => (
                    <div key={role.value} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`role-${role.value}`} 
                        checked={selectedRoles.includes(role.value)}
                        onCheckedChange={(checked: boolean) => handleRoleToggle(role.value, checked)}
                      />
                      <Label 
                        htmlFor={`role-${role.value}`} 
                        className="cursor-pointer"
                      >
                        {role.label}
                      </Label>
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="city">Ciudad</Label>
                  <Input 
                    id="city" 
                    name="city" 
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Ciudad"
                    className="w-full"
                  />
                </div>
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
