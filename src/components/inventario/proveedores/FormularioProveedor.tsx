"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Proveedor } from './types';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/config';

interface FormularioProveedorProps {
  proveedor?: Proveedor;
  onSubmit: (proveedor: Proveedor | Partial<Proveedor>) => void;
  onCancel: () => void;
}

/**
 * Formulario para crear o editar un proveedor
 */
const FormularioProveedor: React.FC<FormularioProveedorProps> = ({
  proveedor,
  onSubmit,
  onCancel
}) => {
  const { theme } = useTheme();
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Proveedor>>(
    proveedor || {
      name: '',
      nit: '',
      contact: '',
      phone: '',
      email: '',
      notes: '',
      condiciones_pago: {
        dias_credito: 30,
        limite_credito: undefined,
        metodo_pago_preferido: 'Transferencia',
        descuento_pronto_pago: 0
      }
    }
  );
  
  // Obtener el ID de la organización al cargar el componente
  useEffect(() => {
    const fetchOrganizationId = async () => {
      try {
        // Intentar obtener el ID de organización desde el almacenamiento local
        let organizationId = null;
        
        if (typeof window !== 'undefined') {
          // Obtener desde localStorage
          const storedOrg = localStorage.getItem('selectedOrganization');
          if (storedOrg) {
            try {
              const parsedOrg = JSON.parse(storedOrg);
              organizationId = parsedOrg.id || parsedOrg.organization_id;
            } catch (e) {
              console.error('Error al parsear organización del storage:', e);
            }
          }
          
          // Si no encontramos en localStorage, intentar en sessionStorage
          if (!organizationId) {
            const sessionOrg = sessionStorage.getItem('selectedOrganization');
            if (sessionOrg) {
              try {
                const parsedOrg = JSON.parse(sessionOrg);
                organizationId = parsedOrg.id || parsedOrg.organization_id;
              } catch (e) {
                console.error('Error al parsear organización del sessionStorage:', e);
              }
            }
          }
        }
        
        // Si aún no tenemos ID, intentamos obtenerlo de Supabase como fallback
        if (!organizationId) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Consultar la primera organización del usuario desde la tabla organization_members
            const { data: orgMember } = await supabase
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', session.user.id)
              .eq('is_active', true)
              .limit(1)
              .single();
              
            if (orgMember) {
              organizationId = orgMember.organization_id;
            } else {
              // Si no hay relación en organization_members, intentar con la primera organización
              const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .limit(1)
                .single();
                
              if (org) {
                organizationId = org.id;
              }
            }
          }
        }
        
        if (organizationId) {
          // Usar el valor 1 como fallback si no es numérico (para desarrollo)
          const numericOrgId = Number(organizationId) || 1;
          setOrganizationId(numericOrgId);
          
          // Si estamos creando un nuevo proveedor, asignar el ID de la organización
          if (!proveedor) {
            setFormData(prev => ({
              ...prev,
              organization_id: numericOrgId
            }));
          }
        } else {
          // Si todo falla, usar el ID 1 como último recurso
          console.warn('No se encontró ID de organización. Usando valor por defecto (1)');
          setOrganizationId(1);
          
          if (!proveedor) {
            setFormData(prev => ({
              ...prev,
              organization_id: 1
            }));
          }
        }
      } catch (error) {
        console.error('Error al obtener ID de organización:', error);
        // Si hay error, usar el ID 1 como último recurso
        setOrganizationId(1);
        
        if (!proveedor) {
          setFormData(prev => ({
            ...prev,
            organization_id: 1
          }));
        }
      }
    };
    
    fetchOrganizationId();
  }, [proveedor]);

  // Manejar cambios en los campos del formulario
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Manejar cambios en las condiciones de pago
  const handleCondicionesPagoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updatedValue = name === 'dias_credito' || name === 'descuento_pronto_pago' || name === 'limite_credito'
      ? Number(value)
      : value;
    
    setFormData(prev => ({
      ...prev,
      condiciones_pago: {
        ...prev.condiciones_pago!,
        [name]: updatedValue
      }
    }));
  };
  
  // Enviar el formulario
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className={`w-full max-w-2xl rounded-lg shadow-lg ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-white'
      }`}>
        <div className={`flex items-center justify-between p-4 border-b ${
          theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <h2 className={`text-xl font-semibold ${
            theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
          }`}>
            {proveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Nombre *
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                required
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nit" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                NIT / Documento
              </Label>
              <Input
                id="nit"
                name="nit"
                value={formData.nit || ''}
                onChange={handleChange}
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contact" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Persona de Contacto
              </Label>
              <Input
                id="contact"
                name="contact"
                value={formData.contact || ''}
                onChange={handleChange}
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Teléfono
              </Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone || ''}
                onChange={handleChange}
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email || ''}
                onChange={handleChange}
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dias_credito" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Días de Crédito
              </Label>
              <Input
                id="dias_credito"
                name="dias_credito"
                type="number"
                value={formData.condiciones_pago?.dias_credito || 0}
                onChange={handleCondicionesPagoChange}
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
                min="0"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes" className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Notas
              </Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                rows={4}
                className={`${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800 text-gray-100 focus:border-blue-600' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className={`${
                theme === 'dark' 
                  ? 'border-gray-700 text-gray-300 hover:bg-gray-800' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className={`${
                theme === 'dark' 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              disabled={!formData.name || !organizationId}
            >
              {proveedor ? 'Actualizar' : 'Guardar'} Proveedor
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FormularioProveedor;
