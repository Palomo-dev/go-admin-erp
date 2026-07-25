'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Briefcase, 
  Search, 
  Users, 
  Shield, 
  Settings,
  Building2,
} from 'lucide-react';
import rolesManagementService, { JobPositionWithPermissions } from '@/lib/services/rolesManagementService';
import JobPositionPermissionsManager from '@/components/hrm/JobPositionPermissionsManager';
import { JobPositionsSkeleton } from './RolesSkeleton';

interface JobPositionsManagementProps {
  organizationId: number;
}

export default function JobPositionsManagement({ organizationId }: JobPositionsManagementProps) {
  const [positions, setPositions] = useState<JobPositionWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<JobPositionWithPermissions | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPositions();
  }, [organizationId]);

  const loadPositions = async () => {
    try {
      setLoading(true);
      const data = await rolesManagementService.getJobPositions(organizationId);
      setPositions(data);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los cargos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredPositions = positions.filter(position =>
    position.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    position.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (position.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <JobPositionsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Permisos por Cargo</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gestiona los permisos específicos de cada cargo. Los cargos se crean desde el módulo de HRM.
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar cargos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista de Cargos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Cargos ({filteredPositions.length})
          </CardTitle>
        </CardHeader>

        {filteredPositions.length === 0 ? (
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Briefcase className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">No se encontraron cargos</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {searchTerm 
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'Los cargos se crean desde el módulo de HRM'
                }
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredPositions.map((position) => (
              <div key={position.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">{position.name}</h4>
                        <Badge variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                          {position.code}
                        </Badge>
                      </div>
                      {position.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{position.description}</p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {position.department && (
                          <span className="flex items-center">
                            <Building2 className="h-4 w-4 mr-1" />
                            {position.department.name}
                          </span>
                        )}
                        <span className="flex items-center">
                          <Shield className="h-4 w-4 mr-1" />
                          {position.permission_count || 0} permisos
                        </span>
                        <span className="flex items-center">
                          <Users className="h-4 w-4 mr-1" />
                          {position.employee_count || 0} empleados
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botón de acción */}
                  <Button
                    onClick={() => setSelectedPosition(position)}
                    variant="outline"
                    className="ml-4 border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Gestionar Permisos
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Diálogo Gestión de Permisos */}
      {selectedPosition && (
        <JobPositionPermissionsManager
          jobPositionId={selectedPosition.id}
          jobPositionName={selectedPosition.name}
          organizationId={organizationId}
          onClose={() => setSelectedPosition(null)}
          onPermissionsUpdated={loadPositions}
        />
      )}
    </div>
  );
}
