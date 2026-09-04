import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Branch, BranchFormData, BRANCH_TYPES, OpeningHours, BranchFeatures } from '@/types/branch';
import {
  RESERVED_SLUGS,
  validateSlug,
  validateSubdomain,
  validateDomain,
} from '@/lib/utils/webIdentityValidation';
import { MapPinIcon, PhoneIcon, EnvelopeIcon, BuildingOfficeIcon, IdentificationIcon, UserIcon } from '@heroicons/react/24/outline';
import { ManagerSelector } from './ManagerSelector';
import LocationSelector from '../common/LocationSelector';
import { PhoneInput } from '@/components/ui/phone-input';
import { supabase } from '@/lib/supabase/config';
import { BuyDomainDialog, AddCustomDomainDialog } from '@/components/organization/dominios';
import { useSession } from '@/lib/hooks/useSession';
import { ShoppingCart, LinkIcon } from 'lucide-react';

type BranchFormProps = {
  initialData?: Partial<Branch>;
  onSubmit: (data: BranchFormData) => Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
  hideSubmitButton?: boolean;
  noFormWrapper?: boolean;
  hideStatusSection?: boolean; // Hide Estado section (for signup flow)
};

export interface BranchFormRef {
  submitForm: () => Promise<void>;
}

const defaultOpeningHours = JSON.stringify({
  monday: { open: '09:00', close: '18:00', closed: false },
  tuesday: { open: '09:00', close: '18:00', closed: false },
  wednesday: { open: '09:00', close: '18:00', closed: false },
  thursday: { open: '09:00', close: '18:00', closed: false },
  friday: { open: '09:00', close: '18:00', closed: false },
  saturday: { open: '10:00', close: '15:00', closed: false },
  sunday: { closed: true }
}, null, 2);

const defaultFeatures = JSON.stringify({
  has_wifi: false,
  has_parking: false,
  has_delivery: false,
  has_outdoor_seating: false,
  is_wheelchair_accessible: false,
  has_air_conditioning: false,
}, null, 2);

export const BranchForm = forwardRef<BranchFormRef, BranchFormProps>((
  {
    initialData = {},
    onSubmit,
    isLoading = false,
    submitLabel = 'Guardar Sucursal',
    hideSubmitButton = false,
    noFormWrapper = false,
    hideStatusSection = false,
  },
  ref
) => {
  // Parse JSON strings to objects for UI manipulation
  const parseOpeningHours = (json: string | undefined): OpeningHours => {
    try {
      return json ? JSON.parse(json) : JSON.parse(defaultOpeningHours);
    } catch (e) {
      return JSON.parse(defaultOpeningHours);
    }
  };

  const parseFeatures = (json: string | undefined): BranchFeatures => {
    try {
      return json ? JSON.parse(json) : JSON.parse(defaultFeatures);
    } catch (e) {
      return JSON.parse(defaultFeatures);
    }
  };

  // UI state for opening hours and features
  const [openingHoursObj, setOpeningHoursObj] = useState<OpeningHours>(
    parseOpeningHours(initialData.opening_hours ? JSON.stringify(initialData.opening_hours) : undefined)
  );
  
  const [featuresObj, setFeaturesObj] = useState<BranchFeatures>(
    parseFeatures(initialData.features ? JSON.stringify(initialData.features) : undefined)
  );

  const [form, setForm] = useState<BranchFormData>({
    name: initialData.name || '',
    address: initialData.address || '',
    city: initialData.city || '',
    state: initialData.state || '',
    country: initialData.country || 'Colombia',
    country_code: initialData.country_code || 'COL',
    state_code: initialData.state_code || '',
    municipality_id: initialData.municipality_id || '',
    postal_code: initialData.postal_code || '',
    latitude: initialData.latitude || undefined,
    longitude: initialData.longitude || undefined,
    phone: initialData.phone || '',
    email: initialData.email || '',
    manager_id: initialData.manager_id || '',
    status: initialData.status || 'active',
    is_main: hideStatusSection ? true : (initialData.is_main || false), // Force true during signup
    tax_identification: initialData.tax_identification || '',
    opening_hours: initialData.opening_hours ? JSON.stringify(initialData.opening_hours, null, 2) : defaultOpeningHours,
    features: initialData.features ? JSON.stringify(initialData.features, null, 2) : defaultFeatures,
    capacity: initialData.capacity || undefined,
    branch_type: initialData.branch_type || '',
    zone: initialData.zone || '',
    branch_code: initialData.branch_code || '',
    is_active: hideStatusSection ? true : (initialData.is_active ?? true), // Force true during signup
    is_web_stock_source: hideStatusSection ? true : (initialData.is_web_stock_source ?? false), // La sucursal del signup surte la web
    // --- Identidad Web (Fase 6) ---
    slug: initialData.slug || '',
    subdomain: initialData.subdomain || '',
    custom_domain: initialData.custom_domain || '',
    website_logo_url: initialData.website_logo_url || '',
    website_cover_url: initialData.website_cover_url || '',
    is_web_published: initialData.is_web_published ?? false,
    organization_id: initialData.organization_id!,
  });

  // Subdominio y dominio propio de la organización, para el preview de URL
  // pública por path (https://{org-subdomain}.goadmin.io/{slug}).
  const [orgSubdomain, setOrgSubdomain] = useState<string>('');
  const [orgCustomDomain, setOrgCustomDomain] = useState<string>('');

  // Diálogos de compra/conexión de dominio para el outlet
  const { session } = useSession();
  const [buyDomainOpen, setBuyDomainOpen] = useState(false);
  const [connectDomainOpen, setConnectDomainOpen] = useState(false);

  useEffect(() => {
    if (initialData.organization_id) {
      supabase
        .from('organizations')
        .select('subdomain, custom_domain')
        .eq('id', initialData.organization_id)
        .single()
        .then(({ data }) => {
          if (data?.subdomain) setOrgSubdomain(data.subdomain);
          if (data?.custom_domain) setOrgCustomDomain(data.custom_domain);
        });
    }
  }, [initialData.organization_id]);

  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const type = (e.target as HTMLInputElement).type;
    
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };
  
  // Handle opening hours changes
  const handleHoursChange = (day: string, field: string, value: string | boolean) => {
    setOpeningHoursObj(prev => ({
      ...prev,
      [day]: {
        ...prev[day as keyof OpeningHours],
        [field]: value
      }
    }));
  };
  
  // Handle features changes
  const handleFeatureChange = (feature: string, checked: boolean) => {
    setFeaturesObj(prev => ({
      ...prev,
      [feature]: checked
    }));
  };

  // Normaliza subdomain y custom_domain al ingresar: minúsculas, trim y sin
  // espacios internos (recomendación QA R3 — no opcional).
  const handleDomainChange = (field: 'subdomain' | 'custom_domain', value: string) => {
    const normalized = value.toLowerCase().trim().replace(/\s+/g, '');
    setForm(prev => ({ ...prev, [field]: normalized }));
  };

  // Valida que una URL sea http(s):// válida (no fiarse solo del type="url").
  const validateUrl = (url: string, field: string): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return `${field} debe ser una URL http(s):// válida`;
      }
      return null;
    } catch {
      return `${field} no es una URL válida`;
    }
  };

  // handleSubmit acepta evento opcional para que submitForm() pueda invocarlo
  // sin argumento sin que preventDefault() crashee (flujo signup).
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    // Construir formWithPublished PRIMERO: si el usuario ingresa subdomain o
    // custom_domain sin marcar el toggle, se auto-publica. Usar variable local
    // (no setForm + leer form) para evitar closure stale.
    const formWithPublished = {
      ...form,
      is_web_published: form.is_web_published || !!(form.subdomain || form.custom_domain),
    };

    // Validar branch_type obligatorio al publicar
    if (formWithPublished.is_web_published && !formWithPublished.branch_type) {
      setError('El tipo de negocio (branch_type) es obligatorio para publicar el outlet en la web');
      return;
    }

    // Validar slug obligatorio al publicar
    if (formWithPublished.is_web_published && !formWithPublished.slug) {
      setError('El slug es obligatorio para publicar el outlet en la web');
      return;
    }

    // --- Validaciones de formato de identidad web ---
    const slugError = validateSlug(formWithPublished.slug || '');
    if (slugError && formWithPublished.slug) { setError(slugError); return; }

    const subdomainError = validateSubdomain(formWithPublished.subdomain || '');
    if (subdomainError && formWithPublished.subdomain) { setError(subdomainError); return; }

    const customDomainError = validateDomain(formWithPublished.custom_domain || '', 'El dominio personalizado');
    if (customDomainError && formWithPublished.custom_domain) { setError(customDomainError); return; }

    // Validar URLs de logo y cover
    const logoUrlError = validateUrl(formWithPublished.website_logo_url || '', 'La URL del logo');
    if (logoUrlError) { setError(logoUrlError); return; }

    const coverUrlError = validateUrl(formWithPublished.website_cover_url || '', 'La URL de portada');
    if (coverUrlError) { setError(coverUrlError); return; }

    // Normalizar branch_type vacío a null antes de construir el payload
    const normalizedBranchType = formWithPublished.branch_type || null;

    try {
      const formWithJson = {
        ...formWithPublished,
        branch_type: normalizedBranchType, // '' → null
        opening_hours: JSON.stringify(openingHoursObj),
        features: JSON.stringify(featuresObj),
      };
      await onSubmit(formWithJson);
    } catch (err: any) {
      setError(err.message || 'Error al guardar la sucursal');
    }
  };
  
  // Expose methods to parent component.
  // submitForm llama handleSubmit internamente (no onSubmit directo) para que
  // el flujo signup (BranchStep invoca formRef.current.submitForm()) no se salte
  // las validaciones de identidad web.
  useImperativeHandle(ref, () => ({
    submitForm: () => handleSubmit()
  }));

  // Form content to be rendered inside or outside a form element
  const formContent = (
    <>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex justify-between items-center p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 border-b dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
            <BuildingOfficeIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {initialData.id ? 'Editar Sucursal' : 'Nueva Sucursal'}
          </h2>
        </div>
        {!hideSubmitButton && (
          <div className="flex space-x-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm md:btn-md flex items-center gap-2 shadow-sm hover:shadow transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{submitLabel}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {/* Contenido del formulario */}
      <div className="p-4 sm:p-6 space-y-8 bg-white dark:bg-gray-900">
        {/* Información básica */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <IdentificationIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Información básica</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Nombre de la sucursal"
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Código de sucursal</label>
              <input
                type="text"
                name="branch_code"
                value={form.branch_code}
                readOnly
                className="input input-bordered w-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed border-gray-200 dark:border-gray-600"
              />
              <p className="text-xs text-gray-400 mt-1">Asignado automáticamente</p>
            </div>
          </div>
        </div>

        {/* Ubicación */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPinIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Ubicación</h3>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Dirección</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Dirección completa"
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-300"
              />
            </div>
            <LocationSelector
              value={{
                country: form.country || '',
                countryCode: form.country_code || '',
                state: form.state || '',
                stateCode: form.state_code || '',
                city: form.city || '',
                municipalityId: form.municipality_id || '',
              }}
              onChange={(locData) => setForm({
                ...form,
                country: locData.country,
                country_code: locData.countryCode,
                state: locData.state,
                state_code: locData.stateCode,
                city: locData.city,
                municipality_id: locData.municipalityId,
              })}
              layout="stacked"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Código Postal</label>
                <input
                  type="text"
                  name="postal_code"
                  value={form.postal_code}
                  onChange={handleChange}
                  placeholder="Código postal"
                  className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <PhoneIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Información de contacto</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
              <PhoneInput
                name="phone"
                value={form.phone}
                onChange={(v) => setForm((prev) => ({ ...prev, phone: v }))}
                placeholder="300 123 4567"
                inputClassName="focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-300 h-10"
              />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400">
                  <EnvelopeIcon className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="sucursal@empresa.com"
                  className="input input-bordered w-full pl-10 focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Gerente - oculto durante signup (hideStatusSection) porque la org aún no existe */}
        {!hideStatusSection && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Gerente de sucursal</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Asignar Gerente
              </label>
              <ManagerSelector
                organizationId={form.organization_id}
                currentManagerId={form.manager_id || null}
                onManagerSelect={(managerId) => {
                  setForm(prev => ({ ...prev, manager_id: managerId || '' }));
                }}
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                El gerente tendrá permisos administrativos sobre esta sucursal.
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Horarios */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Horarios de apertura</h3>
          </div>
          <div className="overflow-x-auto">
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/20 rounded-t-lg">
                    <th className="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 rounded-tl-lg">Día</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Abierto</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Hora apertura</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 rounded-tr-lg">Hora cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => {
                    const dayLabel = {
                      monday: 'Lunes',
                      tuesday: 'Martes',
                      wednesday: 'Miércoles',
                      thursday: 'Jueves',
                      friday: 'Viernes',
                      saturday: 'Sábado',
                      sunday: 'Domingo'
                    }[day];
                    
                    const dayHours = openingHoursObj[day as keyof OpeningHours] || { open: '09:00', close: '18:00', closed: false };
                    const isLast = index === 6;
                    
                    return (
                      <tr key={day} className={`${isLast ? '' : 'border-b border-gray-200 dark:border-gray-700'} hover:bg-gray-50 dark:hover:bg-gray-700/50`}>
                        <td className={`p-3 text-sm font-medium text-gray-800 dark:text-gray-200 ${isLast ? 'rounded-bl-lg' : ''}`}>{dayLabel}</td>
                        <td className="p-3">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!dayHours.closed}
                              onChange={(e) => handleHoursChange(day, 'closed', !e.target.checked)}
                              className="checkbox checkbox-sm checkbox-primary"
                            />
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{!dayHours.closed ? 'Sí' : 'No'}</span>
                          </label>
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            value={dayHours.open || '09:00'}
                            onChange={(e) => handleHoursChange(day, 'open', e.target.value)}
                            disabled={dayHours.closed}
                            className="input input-bordered input-sm w-full max-w-[120px] bg-white dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </td>
                        <td className={`p-3 ${isLast ? 'rounded-br-lg' : ''}`}>
                          <input
                            type="time"
                            value={dayHours.close || '18:00'}
                            onChange={(e) => handleHoursChange(day, 'close', e.target.value)}
                            disabled={dayHours.closed}
                            className="input input-bordered input-sm w-full max-w-[120px] bg-white dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Características */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Características</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_wifi || false}
                  onChange={(e) => handleFeatureChange('has_wifi', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">WiFi</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_parking || false}
                  onChange={(e) => handleFeatureChange('has_parking', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Estacionamiento</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_delivery || false}
                  onChange={(e) => handleFeatureChange('has_delivery', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Delivery</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_outdoor_seating || false}
                  onChange={(e) => handleFeatureChange('has_outdoor_seating', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Área exterior</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.is_wheelchair_accessible || false}
                  onChange={(e) => handleFeatureChange('is_wheelchair_accessible', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Accesible para sillas de ruedas</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_air_conditioning || false}
                  onChange={(e) => handleFeatureChange('has_air_conditioning', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Aire acondicionado</span>
              </label>
            </div>
          </div>
        </div>

        {/* Identidad Web — oculta durante signup (hideStatusSection) */}
        {!hideStatusSection && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Identidad Web</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* branch_type — select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Tipo de negocio
              </label>
              <select
                name="branch_type"
                value={form.branch_type || ''}
                onChange={handleChange}
                className="select select-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Sin especificar</option>
                {BRANCH_TYPES.map(bt => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Determina las secciones disponibles en el editor de branding (Fase 4).
              </p>
            </div>

            {/* slug */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Slug (URL path)
              </label>
              <input
                type="text"
                name="slug"
                value={form.slug || ''}
                onChange={(e) => {
                  // Auto-normalizar: lowercase, sin espacios, comprimir guiones
                  // consecutivos y limpiar guiones al inicio/final (SLUG_REGEX).
                  const normalized = e.target.value
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
                  setForm(prev => ({ ...prev, slug: normalized }));
                }}
                placeholder="hotel, restaurante-1"
                className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
              />
              <p className="text-xs text-gray-400 mt-1">
                Solo minúsculas, números y guiones. Único por organización.
              </p>
              {/* Warning: slug reservado del router público */}
              {form.slug && RESERVED_SLUGS.includes(form.slug) && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200">
                  ⚠️ El slug &quot;{form.slug}&quot; está reservado para el router público
                  (menu, categorias, productos, checkout, etc.). Si lo usas, el
                  outlet no será accesible por path.
                </div>
              )}
              {/* Advertencia al editar slug de un outlet ya publicado */}
              {initialData.id && initialData.slug && initialData.slug !== form.slug && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200">
                  ⚠️ Cambiar el slug romperá las URLs existentes
                  ({initialData.slug} → {form.slug}). Los bookmarks y enlaces
                  indexados dejarán de funcionar.
                </div>
              )}
            </div>

            {/* subdomain */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Subdominio
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  name="subdomain"
                  value={form.subdomain || ''}
                  onChange={(e) => handleDomainChange('subdomain', e.target.value)}
                  placeholder="hotel"
                  className="input input-bordered flex-1 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                />
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">.goadmin.io</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Único global. Ej: <code>hotel</code> → https://hotel.goadmin.io
              </p>
            </div>

            {/* custom_domain */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Dominio personalizado
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="custom_domain"
                  value={form.custom_domain || ''}
                  onChange={(e) => handleDomainChange('custom_domain', e.target.value)}
                  placeholder="tugranhotel.com"
                  className="input input-bordered flex-1 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setConnectDomainOpen(true)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900 whitespace-nowrap"
                  title="Conectar un dominio que ya compraste"
                >
                  <LinkIcon className="h-4 w-4" />
                  Conectar
                </button>
                <button
                  type="button"
                  onClick={() => setBuyDomainOpen(true)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors whitespace-nowrap"
                  title="Comprar un dominio nuevo"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Comprar
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Único global. Requiere configurar DNS (registro A/CNAME).
              </p>
            </div>

            {/* website_logo_url */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                URL del logo web
              </label>
              <input
                type="url"
                name="website_logo_url"
                value={form.website_logo_url || ''}
                onChange={handleChange}
                placeholder="https://.../logo-hotel.png"
                className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
              />
              <p className="text-xs text-gray-400 mt-1">
                Override del logo de la organización para este outlet.
              </p>
            </div>

            {/* website_cover_url */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                URL de imagen de portada
              </label>
              <input
                type="url"
                name="website_cover_url"
                value={form.website_cover_url || ''}
                onChange={handleChange}
                placeholder="https://.../cover-hotel.jpg"
                className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            {/* is_web_published — toggle */}
            <div className="md:col-span-2">
              <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_web_published"
                    checked={!!form.is_web_published}
                    onChange={handleChange}
                    className="checkbox checkbox-sm checkbox-primary mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                      Sitio web publicado
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Si está activo, el outlet tiene sitio público accesible por
                      subdominio, dominio propio o path.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Preview de URL pública */}
          {form.is_web_published && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                URL pública del outlet:
              </p>
              <code className="text-sm text-blue-800 dark:text-blue-200 break-all">
                {form.custom_domain
                  ? `https://${form.custom_domain}`
                  : form.subdomain
                    ? `https://${form.subdomain}.goadmin.io`
                    : form.slug
                      ? (orgCustomDomain
                          ? `https://${orgCustomDomain}/${form.slug}`
                          : orgSubdomain
                            ? `https://${orgSubdomain}.goadmin.io/${form.slug}`
                            : 'Configura un dominio o subdominio de organización para tener URL pública')
                      : '— configura slug, subdominio o dominio para ver la URL'}
              </code>
            </div>
          )}
        </div>
        )}

        {/* Estado - Hidden during signup */}
        {!hideStatusSection && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm mb-8">
            <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Estado</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_main"
                  checked={!!form.is_main}
                  onChange={handleChange}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Sucursal principal</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={!!form.is_active}
                  onChange={handleChange}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Sucursal activa</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_web_stock_source"
                  checked={!!form.is_web_stock_source}
                  onChange={handleChange}
                  className="checkbox checkbox-sm checkbox-primary mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">Surte la tienda web</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">El sitio web usa el inventario de esta sucursal</span>
                </span>
              </label>
            </div>
          </div>
        </div>
        )}

      {/* Error */}
      <div className="mt-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-md shadow-sm mb-4">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
  
  return (
    <>
      {noFormWrapper ? (
        <div id="branch-form" className="branch-form">{formContent}</div>
      ) : (
        <form id="branch-form" onSubmit={handleSubmit} className="branch-form">{formContent}</form>
      )}

      {/* Diálogos de dominio para el outlet */}
      <BuyDomainDialog
        open={buyDomainOpen}
        onOpenChange={setBuyDomainOpen}
        organizationId={form.organization_id}
        userEmail={session?.user?.email || ''}
        userName={session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || ''}
        onPurchaseComplete={(domain) => {
          // Auto-llenar el campo custom_domain con el dominio comprado
          setForm(prev => ({ ...prev, custom_domain: domain.toLowerCase().trim() }));
        }}
      />
      <AddCustomDomainDialog
        open={connectDomainOpen}
        onOpenChange={setConnectDomainOpen}
        organizationId={form.organization_id}
        onDomainAdded={(domain) => {
          // Auto-llenar el campo custom_domain con el dominio conectado
          if (domain) {
            setForm(prev => ({ ...prev, custom_domain: domain.toLowerCase().trim() }));
          }
        }}
      />
    </>
  );
});

// Add display name for debugging
BranchForm.displayName = 'BranchForm';

export default BranchForm;
