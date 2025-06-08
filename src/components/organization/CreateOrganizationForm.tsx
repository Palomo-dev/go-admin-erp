'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';
import LogoUploader from './LogoUploader';

interface OrganizationData {
  name: string;
  type_id: number;
  logo_url?: string | null;
}

interface CreateOrganizationFormProps {
  onSuccess: (data: OrganizationData) => void;
  onCancel: () => void;
  defaultEmail?: string;
}

export default function CreateOrganizationForm({ onSuccess, onCancel, defaultEmail = '' }: CreateOrganizationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    typeId: '',
    description: '',
    email: defaultEmail,
    phone: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    taxId: '',
    website: '',
    primaryColor: '#3B82F6', // Default primary color
    secondaryColor: '#F59E0B', // Default secondary color (amber)
    logoUrl: null as string | null,
  });
  const [organizationTypes, setOrganizationTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (defaultEmail) {
      setFormData(prev => ({
        ...prev,
        email: defaultEmail
      }));
    }
  }, [defaultEmail]);

  useEffect(() => {
    fetchOrganizationTypes();
  }, []);

  const fetchOrganizationTypes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_types')
      .select('id, name')
      .order('name');

    if (error) {
      setError('Error al cargar los tipos de organización');
    } else {
      setOrganizationTypes(data || []);
    }
    setLoading(false);
  };

  const validateStep = (currentStep: number) => {
    const errors: Record<string, string> = {};
    
    if (currentStep === 1) {
      if (!formData.name.trim()) errors.name = 'El nombre es requerido';
      if (!formData.typeId) errors.typeId = 'Seleccione un tipo de organización';
      if (!formData.email.trim()) errors.email = 'El correo electrónico es requerido';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = 'Ingrese un correo electrónico válido';
      }
      if (!formData.taxId.trim()) errors.taxId = 'El NIT/RUT es requerido';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(step)) {
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');

      // Create organization
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([
          {
            name: formData.name,
            type_id: parseInt(formData.typeId),
            description: formData.description,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            country: formData.country,
            postal_code: formData.postalCode,
            tax_id: formData.taxId,
            website: formData.website,
            owner_user_id: session.user.id,
            status: 'active',
            primary_color: formData.primaryColor,
            secondary_color: formData.secondaryColor,
            logo_url: formData.logoUrl,
          }
        ])
        .select()
        .single();

      if (orgError) throw orgError;

      // Update user's profile with organization
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          organization_id: orgData.id,
          role_id: 2 // Admin role
        })
        .eq('id', session.user.id);

      if (profileError) throw profileError;

      onSuccess({
        name: orgData.name,
        type_id: orgData.type_id,
        logo_url: orgData.logo_url,
      });
    } catch (err: any) {
      setError(err.message || 'Error al crear la organización');
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-center">
        <div className="flex items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-gray-300'} text-white`}>
            1
          </div>
          <div className={`h-1 w-12 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
        </div>
        <div className="flex items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'} text-white`}>
            2
          </div>
        </div>
      </div>
      <div className="flex justify-center mt-2">
        <span className="text-sm font-medium mx-4 text-center">Información Básica</span>
        <span className="text-sm font-medium mx-4 text-center">Detalles Adicionales</span>
      </div>
    </div>
  );

  const renderFormField = (
    id: string,
    label: string,
    type: string,
    required: boolean = false,
    colSpan: string = "col-span-6 sm:col-span-4"
  ) => {
    const fieldName = id as keyof typeof formData;
    
    return (
      <div className={colSpan}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <input
            type={type}
            name={id}
            id={id}
            required={required}
            value={formData[fieldName] as string}
            onChange={(e) => {
              setFormData({ ...formData, [fieldName]: e.target.value });
              if (formErrors[id]) {
                setFormErrors({ ...formErrors, [id]: '' });
              }
            }}
            className={`block w-full rounded-lg border ${formErrors[id] ? 'border-red-300 pr-10 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'} shadow-sm px-4 py-3 sm:text-sm`}
          />
          {formErrors[id] && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
            </div>
          )}
        </div>
        {formErrors[id] && (
          <p className="mt-2 text-sm text-red-600" id={`${id}-error`}>
            {formErrors[id]}
          </p>
        )}
      </div>
    );
  };

  const getComplementaryColors = (baseColor: string) => {
    // Helper function to convert hex to HSL
    const hexToHSL = (hex: string) => {
      // Remove the # if present
      hex = hex.replace(/^#/, '');
      
      // Parse the hex values
      let r = parseInt(hex.substring(0, 2), 16) / 255;
      let g = parseInt(hex.substring(2, 4), 16) / 255;
      let b = parseInt(hex.substring(4, 6), 16) / 255;
      
      // Find the min and max values to calculate lightness
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      
      if (max === min) {
        // Achromatic
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
          default: h = 0;
        }
        
        h /= 6;
      }
      
      return { h: h * 360, s: s * 100, l: l * 100 };
    };
    
    // Helper function to convert HSL to hex
    const hslToHex = (h: number, s: number, l: number) => {
      h /= 360;
      s /= 100;
      l /= 100;
      
      let r, g, b;
      
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      
      const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };
    
    // Get the HSL values of the base color
    const { h, s, l } = hexToHSL(baseColor);
    
    // Generate complementary colors
    return [
      hslToHex((h + 180) % 360, s, l), // Complementary
      hslToHex((h + 30) % 360, s, l),  // Analogous 1
      hslToHex((h + 60) % 360, s, l),  // Analogous 2
      hslToHex((h + 90) % 360, s, l),  // Triadic 1
      hslToHex(h, s, Math.max(l - 20, 10)), // Darker
      hslToHex(h, s, Math.min(l + 20, 90)), // Lighter
    ];
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="bg-white px-6 py-8 shadow-md sm:rounded-lg">
        <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-6">Información Básica</h3>
        
        <div className="mb-8 flex justify-center">
          <LogoUploader
            onLogoChange={(url) => setFormData({ ...formData, logoUrl: url })}
            initialLogo={formData.logoUrl}
            className="mb-4"
          />
        </div>
        
        <div className="grid grid-cols-6 gap-6">
          {renderFormField('name', 'Nombre de la Organización', 'text', true, 'col-span-6')}
          
          <div className="col-span-6">
            <label htmlFor="typeId" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Organización <span className="text-red-500">*</span>
            </label>
            <select
              id="typeId"
              name="typeId"
              required
              value={formData.typeId}
              onChange={(e) => {
                setFormData({ ...formData, typeId: e.target.value });
                if (formErrors.typeId) {
                  setFormErrors({ ...formErrors, typeId: '' });
                }
              }}
              className={`block w-full rounded-lg border ${formErrors.typeId ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'} shadow-sm px-4 py-3 sm:text-sm`}
            >
              <option value="">Seleccionar...</option>
              {organizationTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {formErrors.typeId && (
              <p className="mt-2 text-sm text-red-600" id="typeId-error">
                {formErrors.typeId}
              </p>
            )}
          </div>
          
          {/* Always show email field, but if defaultEmail is provided, show it as disabled/readonly */}
          <div className="col-span-6 sm:col-span-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Correo Electrónico <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                id="email"
                required
                value={formData.email}
                readOnly={!!defaultEmail}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (formErrors.email) {
                    setFormErrors({ ...formErrors, email: '' });
                  }
                }}
                className={`block w-full rounded-lg border ${
                  formErrors.email 
                    ? 'border-red-300 pr-10 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                } shadow-sm px-4 py-3 sm:text-sm ${!!defaultEmail ? 'bg-gray-100' : ''}`}
              />
              {formErrors.email && (
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <ExclamationCircleIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
                </div>
              )}
            </div>
            {formErrors.email && (
              <p className="mt-2 text-sm text-red-600" id="email-error">
                {formErrors.email}
              </p>
            )}
            {!!defaultEmail && (
              <p className="mt-1 text-xs text-gray-500">
                Usando el correo electrónico de tu cuenta
              </p>
            )}
          </div>
          
          {renderFormField('taxId', 'NIT/RUT', 'text', true)}
          {renderFormField('phone', 'Teléfono', 'tel')}
          
          {/* Color selector */}
          <div className="col-span-6">
            <label htmlFor="primaryColor" className="block text-sm font-medium text-gray-700 mb-1">
              Color Primario
            </label>
            <div className="mt-2">
              <div className="flex flex-wrap gap-2 mb-3">
                {/* Preset colors */}
                {[
                  '#3B82F6', // Blue
                  '#10B981', // Green
                  '#F59E0B', // Yellow
                  '#EF4444', // Red
                  '#8B5CF6', // Purple
                  '#EC4899', // Pink
                  '#06B6D4', // Cyan
                  '#F97316', // Orange
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, primaryColor: color })}
                    className={`w-8 h-8 rounded-full border ${
                      formData.primaryColor === color ? 'ring-2 ring-offset-2 ring-gray-500' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${color}`}
                  />
                ))}
                
                {/* Custom color picker */}
                <div className="relative">
                  <input
                    type="color"
                    id="primaryColor"
                    name="primaryColor"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="sr-only"
                  />
                  <label
                    htmlFor="primaryColor"
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 cursor-pointer bg-white"
                  >
                    <span className="sr-only">Personalizado</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </label>
                </div>
              </div>
              
              {/* Preview */}
              <div className="flex items-center mt-2">
                <div 
                  className="w-6 h-6 rounded-full mr-2" 
                  style={{ backgroundColor: formData.primaryColor }}
                />
                <span className="text-sm text-gray-600">{formData.primaryColor}</span>
              </div>
              
              <p className="mt-1 text-xs text-gray-500">
                Este color se usará en la interfaz de tu organización
              </p>
            </div>
          </div>
          
          {/* Secondary color selector */}
          <div className="col-span-6">
            <label htmlFor="secondaryColor" className="block text-sm font-medium text-gray-700 mb-1">
              Color Secundario
            </label>
            <div className="mt-2">
              <div className="flex flex-wrap gap-2 mb-3">
                {/* Complementary colors */}
                {getComplementaryColors(formData.primaryColor).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, secondaryColor: color })}
                    className={`w-8 h-8 rounded-full border ${
                      formData.secondaryColor === color ? 'ring-2 ring-offset-2 ring-gray-500' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${color}`}
                  />
                ))}
                
                {/* Custom color picker */}
                <div className="relative">
                  <input
                    type="color"
                    id="secondaryColor"
                    name="secondaryColor"
                    value={formData.secondaryColor}
                    onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                    className="sr-only"
                  />
                  <label
                    htmlFor="secondaryColor"
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 cursor-pointer bg-white"
                  >
                    <span className="sr-only">Personalizado</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </label>
                </div>
              </div>
              
              {/* Preview */}
              <div className="flex items-center mt-2">
                <div 
                  className="w-6 h-6 rounded-full mr-2" 
                  style={{ backgroundColor: formData.secondaryColor }}
                />
                <span className="text-sm text-gray-600">{formData.secondaryColor}</span>
              </div>
              
              <p className="mt-1 text-xs text-gray-500">
                Este color se usará en la interfaz de tu organización
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="bg-white px-6 py-8 shadow-md sm:rounded-lg">
        <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-6">Detalles Adicionales</h3>
        <div className="grid grid-cols-6 gap-6">
          <div className="col-span-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 sm:text-sm"
            />
          </div>

          {renderFormField('address', 'Dirección', 'text', false, 'col-span-6')}
          
          <div className="col-span-6 grid grid-cols-3 gap-4">
            {renderFormField('city', 'Ciudad', 'text', false, 'col-span-1')}
            {renderFormField('country', 'País', 'text', false, 'col-span-1')}
            {renderFormField('postalCode', 'Código Postal', 'text', false, 'col-span-1')}
          </div>
          
          {renderFormField('website', 'Sitio Web', 'url')}
        </div>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
      {renderStepIndicator()}
      
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-5">
        <button
          type="button"
          onClick={step === 1 ? onCancel : prevStep}
          className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {step === 1 ? 'Cancelar' : 'Atrás'}
        </button>
        
        <button
          type={step === 2 ? 'submit' : 'button'}
          onClick={step === 1 ? nextStep : undefined}
          disabled={loading}
          className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-6 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {step === 2 ? 'Creando...' : 'Siguiente...'}
            </>
          ) : (
            step === 2 ? 'Crear Organización' : 'Siguiente'
          )}
        </button>
      </div>
    </form>
  );
}
