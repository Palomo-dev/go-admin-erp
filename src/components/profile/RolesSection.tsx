'use client';

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { UserCheck, Building, ExternalLink } from 'lucide-react';
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

interface RolesSectionProps {
  user: User | null;
  roles: Role[];
}

export default function RolesSection({ user, roles = [] }: RolesSectionProps) {
  const [groupedRoles, setGroupedRoles] = useState<{[key: string]: Role[]}>({});
  const [orgLogos, setOrgLogos] = useState<Record<string, string>>({});
  
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
    </div>
  );
}
