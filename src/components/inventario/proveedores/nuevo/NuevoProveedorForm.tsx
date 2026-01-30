'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService, type SupplierInput } from '@/lib/services/supplierService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2, Building2, User, Phone, Mail, FileText } from 'lucide-react';
import Link from 'next/link';

export function NuevoProveedorForm() {
  const router = useRouter();
  const { theme } = useTheme();
  const { toast } = useToast();

  // Estados del formulario
  const [formData, setFormData] = useState<SupplierInput>({
    name: '',
    nit: '',
    contact: '',
    phone: '',
    email: '',
    notes: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validar formulario
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Manejar cambios en el formulario
  const handleChange = (field: keyof SupplierInput, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Guardar proveedor
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setIsSaving(true);
      const organizationId = getOrganizationId();

      const { data, error } = await supplierService.createSupplier(organizationId, formData);

      if (error) throw error;

      toast({
        title: 'Proveedor creado',
        description: 'El proveedor ha sido creado correctamente'
      });

      // Redirigir al detalle del nuevo proveedor usando UUID
      if (data?.uuid) {
        router.push(`/app/inventario/proveedores/${data.uuid}`);
      } else {
        router.push('/app/inventario/proveedores');
      }
    } catch (error: any) {
      console.error('Error creando proveedor:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo crear el proveedor'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/inventario/proveedores">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Nuevo Proveedor
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Registra un nuevo proveedor en el sistema
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulario principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información básica */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  Información del Proveedor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="dark:text-gray-300">Nombre / Razón Social *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="Nombre del proveedor"
                      className={`dark:bg-gray-900 dark:border-gray-700 ${errors.name ? 'border-red-500' : ''}`}
                    />
                    {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">NIT / Identificación</Label>
                    <Input
                      value={formData.nit}
                      onChange={(e) => handleChange('nit', e.target.value)}
                      placeholder="123456789-0"
                      className="dark:bg-gray-900 dark:border-gray-700"
                    />
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">Persona de Contacto</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={formData.contact}
                        onChange={(e) => handleChange('contact', e.target.value)}
                        placeholder="Nombre del contacto"
                        className="pl-10 dark:bg-gray-900 dark:border-gray-700"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Información de contacto */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <Phone className="h-5 w-5 text-blue-600" />
                  Información de Contacto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="dark:text-gray-300">Teléfono</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="+57 300 123 4567"
                        className="pl-10 dark:bg-gray-900 dark:border-gray-700"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="dark:text-gray-300">Correo Electrónico</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="proveedor@ejemplo.com"
                        className={`pl-10 dark:bg-gray-900 dark:border-gray-700 ${errors.email ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notas */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Notas Adicionales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Información adicional sobre el proveedor..."
                  className="dark:bg-gray-900 dark:border-gray-700"
                  rows={4}
                />
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
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Proveedor
                </Button>

                <Link href="/app/inventario/proveedores" className="block">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full dark:border-gray-700"
                  >
                    Cancelar
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

export default NuevoProveedorForm;
