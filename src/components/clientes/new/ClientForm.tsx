'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MergeModal } from './MergeModal';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { cn } from '@/utils/Utils';

interface ClientFormProps {
  organizationId: number;
  branchId?: number;
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

const customerRoles: CustomerRole[] = [
  { value: 'cliente', label: 'Cliente', description: 'Cliente regular del negocio' },
  { value: 'huesped', label: 'Huésped', description: 'Para negocios de hospedaje' },
  { value: 'pasajero', label: 'Pasajero', description: 'Para servicios de transporte' },
  { value: 'proveedor', label: 'Proveedor', description: 'Proveedor de servicios/productos' },
  { value: 'empleado', label: 'Empleado', description: 'Personal interno' }
];

export function ClientForm({ organizationId, branchId }: ClientFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  
  // Estados del formulario
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    documentType: 'dni' as DocumentType,
    documentNumber: '',
    address: '',
    city: '',
    notes: '',
    tags: '',
  });
  
  // Estados para roles seleccionados
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['cliente']);
  
  // Estados de carga y error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateFound, setDuplicateFound] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<any>(null);
  
  // Funciones de manejo de cambios en los campos
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleRoleToggle = (role: string, checked: boolean) => {
    if (checked) {
      setSelectedRoles(prev => [...prev, role]);
    } else {
      setSelectedRoles(prev => prev.filter(r => r !== role));
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
        full_name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email || null,
        phone: formData.phone || null,
        identification_type: formData.documentType,
        identification_number: formData.documentNumber || null,
        address: formData.address || null,
        city: formData.city || null,
        notes: formData.notes || null,
        roles: selectedRoles,
        tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
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
    } catch (err: any) {
      console.error('Error al crear cliente:', err);
      setError(err.message || 'Error al crear el cliente');
      toast({
        title: "Error al crear cliente",
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
          full_name: `${formData.firstName || duplicateClient.first_name} ${formData.lastName || duplicateClient.last_name}`.trim(),
          phone: formData.phone || duplicateClient.phone,
          address: formData.address || duplicateClient.address,
          city: formData.city || duplicateClient.city,
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
        full_name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email || null,
        phone: formData.phone || null,
        identification_type: formData.documentType,
        identification_number: formData.documentNumber || null,
        address: formData.address || null,
        city: formData.city || null,
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
  
  return (
    <>
      {/* Modal para clientes duplicados */}
      {duplicateFound && duplicateClient && (
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
            disabled={loading}
          >
            Cancelar
          </Button>
          
          <Button 
            type="submit" 
            disabled={loading || !formData.firstName || !formData.lastName}
            className={cn(
              "min-w-[120px]",
              loading ? "opacity-80" : ""
            )}
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <LoadingSpinner className="h-4 w-4" />
                <span>Guardando...</span>
              </div>
            ) : "Guardar Cliente"}
          </Button>
        </div>
      </form>
    </>
  );
}
