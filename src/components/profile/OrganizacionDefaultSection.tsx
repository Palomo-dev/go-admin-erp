'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { Building, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Organization {
  id: string;
  name: string;
  logo_url?: string;
  slug: string;
}

interface OrganizacionDefaultSectionProps {
  user: User | null;
  profile: any;
  organizations: Organization[];
  onProfileUpdated: (profile: any) => void;
}

export default function OrganizacionDefaultSection({ 
  user, 
  profile, 
  organizations, 
  onProfileUpdated 
}: OrganizacionDefaultSectionProps) {
  const [loading, setLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(profile?.last_org_id || '');

  const handleUpdateDefaultOrg = async (orgId: string) => {
    if (!user) {
      toast.error('No hay un usuario autenticado');
      return;
    }
    
    if (orgId === profile?.last_org_id) {
      return; // No hay cambios que hacer
    }
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          last_org_id: orgId,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('*')
        .single();
        
      if (error) throw error;
      
      setSelectedOrgId(orgId);
      onProfileUpdated(data);
      toast.success('Organización predeterminada actualizada correctamente');
    } catch (error) {
      console.error('Error al actualizar la organización predeterminada:', error);
      toast.error('Error al actualizar la organización predeterminada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Organización predeterminada
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Seleccione la organización con la que desea iniciar su sesión por defecto
        </p>
      </div>

      {organizations.length > 0 ? (
        <div className="space-y-4">
          {organizations.map((org) => {
            const isSelected = selectedOrgId === org.id;
            
            return (
              <div 
                key={org.id} 
                onClick={() => !loading && handleUpdateDefaultOrg(org.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  isSelected 
                    ? 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/10' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/80'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    {org.logo_url ? (
                      <img 
                        src={org.logo_url} 
                        alt={org.name} 
                        className="w-10 h-10 rounded-md mr-4 object-cover border border-gray-200 dark:border-gray-700" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md mr-4 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <Building className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium text-gray-800 dark:text-gray-200">
                        {org.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {org.slug}
                      </p>
                    </div>
                  </div>
                  
                  {isSelected && (
                    <CheckCircle2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/30 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No pertenece a ninguna organización actualmente. Contacte con un administrador para unirse a una organización.
          </p>
        </div>
      )}
    </div>
  );
}
