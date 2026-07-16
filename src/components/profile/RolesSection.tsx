'use client';

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { UserCheck, Building, ExternalLink, MapPin, PlusCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface Role {
  id: string;
  role_name: string;
  description: string;
  organization_id: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
  };
  branch_id?: string;
  branch?: {
    id: string;
    name: string;
  };
}

interface Branch {
  id: number;
  name: string;
  organization_id: number;
  is_active: boolean;
}

interface RolesSectionProps {
  user: User | null;
  roles: Role[];
  branches?: Branch[];
}

export default function RolesSection({ user, roles = [], branches = [] }: RolesSectionProps) {
  const [groupedRoles, setGroupedRoles] = useState<{[key: string]: Role[]}>({});
  const [orgLogos, setOrgLogos] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    // Verificar si el usuario es admin en alguna organización
    const hasAdminRole = roles.some(r => 
      r.role_name?.toLowerCase().includes('admin') || 
      r.role_name?.toLowerCase().includes('super')
    );
    setIsAdmin(hasAdminRole);
  }, [roles]);

  useEffect(() => {
    // Agrupar roles por organización para mostrarlos de forma organizada
    if (roles.length > 0) {
      const grouped = roles.reduce((acc: {[key: string]: Role[]}, role) => {
        const orgId = role.organization?.id || role.organization_id;
        if (!acc[orgId]) {
          acc[orgId] = [];
        }
        acc[orgId].push(role);
        return acc;
      }, {});
      
      setGroupedRoles(grouped);

      // Cargar logos de organizaciones
      const logos: Record<string, string> = {};
      const orgsProcessed = new Set<string>();
      for (const role of roles) {
        const org = role.organization;
        if (org && !orgsProcessed.has(org.id) && org.logo_url) {
          orgsProcessed.add(org.id);
          if (org.logo_url.startsWith('http')) {
            logos[org.id] = org.logo_url;
          } else {
            const { data } = supabase.storage.from('organizations').getPublicUrl(org.logo_url);
            if (data?.publicUrl) logos[org.id] = data.publicUrl;
          }
        }
      }
      setOrgLogos(logos);
    }
  }, [roles]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Roles asignados
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Estos son los roles que tiene asignados en diferentes organizaciones y sucursales
        </p>
      </div>

      {roles.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedRoles).map(([orgId, orgRoles]) => {
            // Tomamos la primera ocurrencia para obtener la información de la organización
            const organization = orgRoles[0]?.organization;
            
            return (
              <div 
                key={orgId} 
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50"
              >
                <div className="flex items-center mb-4">
                  {organization?.id && orgLogos[organization.id] ? (
                    <div className="w-8 h-8 rounded-md mr-3 relative overflow-hidden border border-gray-200 dark:border-gray-700">
                      <Image
                        src={orgLogos[organization.id]}
                        alt={organization.name || 'Logo'}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-md mr-3 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <Building className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </div>
                  )}
                  <div className="flex-grow">
                    <h3 className="font-medium text-gray-800 dark:text-gray-200">
                      {organization?.name || 'Organización'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {organization?.slug || orgId}
                    </p>
                  </div>
                  {organization?.slug && (
                    <Link 
                      href={`/org/${organization.slug}`}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  )}
                </div>
                
                <div className="space-y-3 ml-2">
                  {orgRoles.map((role) => (
                    <div 
                      key={role.id} 
                      className="flex items-start py-2 px-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/80"
                    >
                      <UserCheck className="w-5 h-5 mt-0.5 text-green-600 dark:text-green-400 mr-3" />
                      <div>
                        <div className="font-medium text-gray-700 dark:text-gray-300">
                          {role.role_name}
                          {role.branch && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              {role.branch.name}
                            </span>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {role.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/30 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No tiene roles asignados actualmente. Contacte con un administrador para solicitar roles en alguna organización.
          </p>
        </div>
      )}

      {/* Sección de sucursales asignadas */}
      <div className="mt-8">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-500" />
            Sucursales asignadas
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sucursales donde tienes acceso dentro de tus organizaciones
          </p>
        </div>

        {branches.length > 0 ? (
          <div className="space-y-2">
            {branches.map((branch) => (
              <div
                key={`${branch.organization_id}-${branch.id}`}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Building className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300">{branch.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Org. ID: {branch.organization_id}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${branch.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                  {branch.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/30 text-center">
            <MapPin className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No tienes sucursales asignadas. Contacta al administrador de tu organización para que te asigne una.
            </p>
            {isAdmin && (
              <Link
                href="/app/organizacion/sucursales"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Gestionar sucursales
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
