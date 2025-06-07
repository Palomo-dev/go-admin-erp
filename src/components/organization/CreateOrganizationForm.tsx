'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

interface CreateOrganizationFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CreateOrganizationForm({ onSuccess, onCancel }: CreateOrganizationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    typeId: '',
    description: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    taxId: '',
    website: '',
  });
  const [organizationTypes, setOrganizationTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOrganizationTypes();
  }, []);

  const fetchOrganizationTypes = async () => {
    const { data, error } = await supabase
      .from('organization_types')
      .select('id, name')
      .order('name');

    if (error) {
      setError('Error al cargar los tipos de organización');
      return;
    }

    setOrganizationTypes(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al crear la organización');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white px-4 py-5 shadow sm:rounded-lg sm:p-6">
        <div className="md:grid md:grid-cols-3 md:gap-6">
          <div className="md:col-span-1">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Información de la Organización</h3>
            <p className="mt-1 text-sm text-gray-500">
              Ingresa los detalles de tu nueva organización.
            </p>
          </div>
          <div className="mt-5 md:col-span-2 md:mt-0">
            <div className="grid grid-cols-6 gap-6">
              <div className="col-span-6 sm:col-span-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nombre *
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-3">
                <label htmlFor="typeId" className="block text-sm font-medium text-gray-700">
                  Tipo de Organización *
                </label>
                <select
                  id="typeId"
                  name="typeId"
                  required
                  value={formData.typeId}
                  onChange={(e) => setFormData({ ...formData, typeId: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {organizationTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-6">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Descripción
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-4">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Teléfono
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6">
                <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                  Dirección
                </label>
                <input
                  type="text"
                  name="address"
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-6 lg:col-span-2">
                <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                  Ciudad
                </label>
                <input
                  type="text"
                  name="city"
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                  País
                </label>
                <input
                  type="text"
                  name="country"
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700">
                  Código Postal
                </label>
                <input
                  type="text"
                  name="postalCode"
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-4">
                <label htmlFor="taxId" className="block text-sm font-medium text-gray-700">
                  NIT/RUT *
                </label>
                <input
                  type="text"
                  name="taxId"
                  id="taxId"
                  required
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="col-span-6 sm:col-span-4">
                <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                  Sitio Web
                </label>
                <input
                  type="url"
                  name="website"
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Crear Organización'}
        </button>
      </div>
    </form>
  );
}
