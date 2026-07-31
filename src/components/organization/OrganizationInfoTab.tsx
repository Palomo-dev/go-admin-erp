'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { OrganizationInfoSkeleton } from './OrganizationSkeletons';
import { useTranslations } from 'next-intl';

interface OrganizationProps {
  id: number;
  name: string;
  type: string;
  logo_url?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  tax_id?: string;
  nit?: string;
  dv?: string;
  municipality_id?: string;
  created_at: string;
  description?: string;
  email?: string;
  status?: string;
  owner_user_id?: string;
  subscription_status?: string;
  subscription_plan?: string;
  subscription_ends_at?: string;
  primary_color?: string;
  secondary_color?: string;
  subdomain?: string;
  custom_domain?: string;
}

interface MunicipalityOption {
  id: string;
  name: string;
  code: string;
  state_name: string;
}

function calcularDV(nit: string): string {
  const nitLimpio = nit.replace(/[^0-9]/g, '');
  if (!nitLimpio) return '';
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const nitReverse = nitLimpio.split('').reverse().join('');
  let suma = 0;
  for (let i = 0; i < nitReverse.length; i++) {
    suma += parseInt(nitReverse[i], 10) * (pesos[i] || pesos[pesos.length - 1]);
  }
  const residuo = suma % 11;
  return (residuo === 0 || residuo === 1) ? residuo.toString() : (11 - residuo).toString();
}

export default function OrganizationInfoTab({ orgData }: { orgData: number }) {
  const [formData, setFormData] = useState<Partial<OrganizationProps>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const t = useTranslations('org.orgInfo');
  const [organizationTypes, setOrganizationTypes] = useState<{id: number, description: string}[]>([]);
  const [municipalities, setMunicipalities] = useState<MunicipalityOption[]>([]);
  
  useEffect(() => {
    if (orgData) {
      fetchOrganizationDetails(orgData);
    }
    fetchOrganizationTypes();
  }, [orgData]);

  const fetchOrganizationDetails = async (orgId: number) => {
    try {
      setLoading(true);
      
      console.log('Fetching organization details for ID:', orgId);
      
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();

      if (error) throw error;

      console.log('Organization data:', data);

      // Get organization type description
      let typeDescription = '';
      if (data.type_id) {
        const { data: typeData, error: typeError } = await supabase
          .from('organization_types')
          .select('description')
          .eq('id', parseInt(data.type_id))
          .single();
          
        if (!typeError && typeData) {
          typeDescription = typeData.description;
        }
      }
      
      setFormData({
        id: data.id,
        name: data.name,
        type: typeDescription,
        logo_url: data.logo_url || '',
        website: data.website || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        country: data.country || '',
        postal_code: data.postal_code || '',
        tax_id: data.tax_id || data.nit || '',
        nit: data.nit || data.tax_id || '',
        dv: data.dv?.toString() || '',
        municipality_id: data.municipality_id || '',
        created_at: data.created_at,
        description: data.description || '',
        email: data.email || '',
        status: data.status || '',
        owner_user_id: data.owner_user_id || '',
        subscription_status: data.subscription_status || '',
        subscription_plan: data.subscription_plan || '',
        subscription_ends_at: data.subscription_ends_at || '',
        primary_color: data.primary_color || '#3B82F6',
        secondary_color: data.secondary_color || '#1E40AF',
        subdomain: data.subdomain || '',
        custom_domain: data.custom_domain || ''
      });

      // Cargar municipios filtrando por el state/departamento de la org
      if (data.state) {
        const { data: munis } = await supabase
          .from('municipalities')
          .select('id, name, code, state_name')
          .ilike('state_name', data.state)
          .order('name');
        if (munis) setMunicipalities(munis);
      }
      // Si no hay state, cargar todos
      if (!data.state || municipalities.length === 0) {
        const { data: allMunis } = await supabase
          .from('municipalities')
          .select('id, name, code, state_name')
          .order('name')
          .limit(500);
        if (allMunis) setMunicipalities(allMunis);
      }
    } catch (err: any) {
      console.error('Error fetching organization details:', err);
      setError(err.message || t('errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('organization_types')
        .select('id, description')
        .order('description');
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        setOrganizationTypes(data);
      }
    } catch (err: any) {
      console.error('Error fetching organization types:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Auto-calcular DV cuando cambia el tax_id/NIT
      if (name === 'tax_id') {
        const dvCalculado = calcularDV(value);
        if (dvCalculado) next.dv = dvCalculado;
      }
      return next;
    });
  };

  const handleMunicipalityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const muniId = e.target.value;
    const selected = municipalities.find(m => m.id === muniId);
    setFormData((prev) => ({
      ...prev,
      municipality_id: muniId,
      city: selected?.name || prev.city,
      state: selected?.state_name || prev.state,
    }));
  };

  const handleStateChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const stateValue = e.target.value;
    setFormData((prev) => ({ ...prev, state: stateValue }));
    // Recargar municipios filtrados por el nuevo state
    const { data: munis } = await supabase
      .from('municipalities')
      .select('id, name, code, state_name')
      .ilike('state_name', stateValue)
      .order('name');
    if (munis) setMunicipalities(munis);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      // Get the type_id from the type name
      let type_id = null;
      if (formData.type) {
        const matchingType = organizationTypes.find(type => type.description === formData.type);
        if (matchingType) {
          type_id = matchingType.id;
        }
      }
      
      console.log('Updating organization with type_id:', type_id);
      
      // Update organization in the database
      const { error } = await supabase
        .from('organizations')
        .update({
          name: formData.name,
          type_id: type_id,
          logo_url: formData.logo_url,
          website: formData.website,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          country: formData.country,
          postal_code: formData.postal_code,
          tax_id: formData.tax_id,
          nit: formData.tax_id,
          dv: formData.dv ? parseInt(formData.dv, 10) : null,
          state: formData.state || null,
          municipality_id: formData.municipality_id || null,
          description: formData.description,
          email: formData.email,
          primary_color: formData.primary_color,
          secondary_color: formData.secondary_color,
          subdomain: formData.subdomain,
          custom_domain: formData.custom_domain,
          updated_at: new Date().toISOString()
        })
        .eq('id', formData.id);
      
      if (error) throw error;
      
      // No need to use localStorage for organization data
      // This data should be fetched from the database when needed
      
      setSuccess(t('successUpdate'));
    } catch (err: any) {
      console.error('Error updating organization:', err);
      setError(err.message || t('errorUpdating'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setError(null);
      
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(t('maxFileSize'));
        return;
      }
      
      // Check file type
      if (!file.type.match('image.*')) {
        setError(t('onlyImages'));
        return;
      }
      
      // Upload file to Supabase Storage
      const fileName = `org-${formData.id}-${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (error) throw error;
      
      // Get public URL
      const { data: publicUrl } = supabase.storage
        .from('logos')
        .getPublicUrl(data.path);
      
      // Update form data with new logo URL
      setFormData((prev) => ({ ...prev, logo_url: publicUrl.publicUrl }));
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      setError(err.message || t('errorUploadLogo'));
    }
  };

  if (loading) {
    return <OrganizationInfoSkeleton />;
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg dark:bg-gray-800">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-50">{t('title')}</h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
      </div>
      
      {error && (
        <div className="mx-6 my-2 bg-red-50 border-l-4 border-red-500 p-4 dark:bg-red-900/30 dark:border-red-400">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {success && (
        <div className="mx-6 my-2 bg-green-50 border-l-4 border-green-500 p-4 dark:bg-green-900/30 dark:border-green-400">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-500 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700 dark:text-green-200">{success}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="border-t border-gray-200 dark:border-gray-700">
        <form onSubmit={handleSubmit}>
          <dl>
            {/* Organization Logo */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('logo')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <div className="flex items-center space-x-4">
                  {formData.logo_url ? (
                    <img 
                      src={formData.logo_url} 
                      alt="Logo" 
                      className="w-16 h-16 object-contain border border-gray-200 rounded-md dark:border-gray-700"
                    />
                  ) : (
                    <div className="w-16 h-16 flex items-center justify-center border border-gray-200 rounded-md bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                      <svg className="h-8 w-8 text-gray-400 dark:text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 4h16v16H4V4z" />
                      </svg>
                    </div>
                  )}
                  <div>
                    <label htmlFor="logo" className="cursor-pointer px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900">
                      {t('changeLogo')}
                      <input
                        type="file"
                        id="logo"
                        className="sr-only"
                        accept="image/*"
                        onChange={handleLogoUpload}
                      />
                    </label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('logoHint')}</p>
                  </div>
                </div>
              </dd>
            </div>
            
            {/* Organization Name */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('name')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="name"
                  id="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('namePlaceholder')}
                  required
                />
              </dd>
            </div>
            
            {/* Organization Description */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('description')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <textarea
                  name="description"
                  id="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </dd>
            </div>
            
            {/* Organization Email */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('email')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="email@organizacion.com"
                />
              </dd>
            </div>
            
            {/* Organization Type */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('type')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <select
                  name="type"
                  id="type"
                  value={formData.type || ''}
                  onChange={handleChange}
                  className="block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-800 dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  required
                >
                  <option value="" disabled>{t('selectType')}</option>
                  {organizationTypes.map((type) => (
                    <option key={type.id} value={type.description}>
                      {type.description}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            
            {/* Contact Information Section */}
            <div className="bg-white px-4 py-5 sm:px-6 dark:bg-gray-800">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-50">{t('contactInfo')}</h4>
            </div>
            
            {/* Website */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('website')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="url"
                  name="website"
                  id="website"
                  value={formData.website || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="https://ejemplo.com"
                />
              </dd>
            </div>
            
            {/* Phone */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('phone')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="+1 (555) 123-4567"
                />
              </dd>
            </div>
            
            {/* Address Section */}
            <div className="bg-white px-4 py-5 sm:px-6 dark:bg-gray-800">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-50">{t('addressSection')}</h4>
            </div>
            
            {/* Address */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('street')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="address"
                  id="address"
                  value={formData.address || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('streetPlaceholder')}
                />
              </dd>
            </div>
            
            {/* Departamento / Estado */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Departamento / Estado</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="state"
                  id="state"
                  value={formData.state || ''}
                  onChange={handleStateChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="Ej: Antioquia, Cundinamarca..."
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Al cambiar el departamento, se cargan los municipios de DIAN correspondientes</p>
              </dd>
            </div>

            {/* Municipio / Ciudad (select de DIAN) */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Municipio / Ciudad</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <select
                  name="municipality_id"
                  id="municipality_id"
                  value={formData.municipality_id || ''}
                  onChange={handleMunicipalityChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                >
                  <option value="">-- Seleccione municipio --</option>
                  {municipalities.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Municipio registrado ante DIAN. Se actualiza automáticamente la ciudad y departamento.</p>
              </dd>
            </div>
            
            {/* Country */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('country')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="country"
                  id="country"
                  value={formData.country || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('countryPlaceholder')}
                />
              </dd>
            </div>
            
            {/* Postal Code */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('postalCode')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="postal_code"
                  id="postal_code"
                  value={formData.postal_code || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="12345"
                />
              </dd>
            </div>
            
            {/* Tax ID / NIT */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('taxId')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="tax_id"
                  id="tax_id"
                  value={formData.tax_id || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('taxIdPlaceholder')}
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">NIT sin guión. El DV se calcula automáticamente.</p>
              </dd>
            </div>

            {/* DV - Dígito de verificación (auto-calculado) */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">DV (Auto)</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="dv"
                  id="dv"
                  value={formData.dv || ''}
                  onChange={handleChange}
                  maxLength={1}
                  readOnly
                  className="block w-20 border border-gray-200 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-600 sm:text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  placeholder="Auto"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Calculado automáticamente desde el NIT</p>
              </dd>
            </div>
            
            {/* Primary Color */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('primaryColor')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 flex items-center dark:text-gray-50">
                <input
                  type="color"
                  name="primary_color"
                  id="primary_color"
                  value={formData.primary_color || '#3B82F6'}
                  onChange={handleChange}
                  className="h-8 w-8 rounded-md border border-gray-300 mr-2 dark:border-gray-600"
                />
                <input
                  type="text"
                  name="primary_color"
                  value={formData.primary_color || '#3B82F6'}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="#3B82F6"
                />
              </dd>
            </div>
            
            {/* Secondary Color */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('secondaryColor')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 flex items-center dark:text-gray-50">
                <input
                  type="color"
                  name="secondary_color"
                  id="secondary_color"
                  value={formData.secondary_color || '#1E40AF'}
                  onChange={handleChange}
                  className="h-8 w-8 rounded-md border border-gray-300 mr-2 dark:border-gray-600"
                />
                <input
                  type="text"
                  name="secondary_color"
                  value={formData.secondary_color || '#1E40AF'}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder="#1E40AF"
                />
              </dd>
            </div>
            
            {/* Subdomain */}
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-800">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('subdomain')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 flex items-center dark:text-gray-50">
                <input
                  type="text"
                  name="subdomain"
                  id="subdomain"
                  value={formData.subdomain || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('subdomainPlaceholder')}
                />
                <span className="ml-2 text-gray-500 dark:text-gray-400">.goadmin.io</span>
              </dd>
            </div>
            
            {/* Custom Domain */}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 dark:bg-gray-900">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('customDomain')}</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 dark:text-gray-50">
                <input
                  type="text"
                  name="custom_domain"
                  id="custom_domain"
                  value={formData.custom_domain || ''}
                  onChange={handleChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:border-gray-600 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                  placeholder={t('customDomainPlaceholder')}
                />
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{t('customDomainHint')}</p>
              </dd>
            </div>
            
            {/* Submit Button */}
            <div className="bg-gray-50 px-4 py-5 sm:px-6 dark:bg-gray-900">
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  {saving ? t('saving') : t('saveChanges')}
                </button>
              </div>
            </div>
          </dl>
        </form>
      </div>
    </div>
  );
}
