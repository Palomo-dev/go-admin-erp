'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Settings, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  Building2,
  Users,
  Crown
} from 'lucide-react';
import ModuleManagement from '@/components/admin/ModuleManagement';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { useToast } from '@/hooks/use-toast';

interface OrganizationSummary {
  id: number;
  name: string;
  subdomain: string;
  plan_name: string;
  active_modules_count: number;
  max_modules_allowed: number;
  exceeds_limit: boolean;
  has_subscription: boolean;
}

export default function ModulesAdminPage() {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'exceeds' | 'no_subscription'>('all');
  const [loading, setLoading] = useState(true);
  const [auditResults, setAuditResults] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      // Simular carga de organizaciones - en producción esto vendría de una API
      const mockOrganizations: OrganizationSummary[] = [
        {
          id: 1,
          name: 'Restaurante App',
          subdomain: 'restaurante',
          plan_name: 'Free Plan',
          active_modules_count: 5,
          max_modules_allowed: 2,
          exceeds_limit: true,
          has_subscription: false
        },
        {
          id: 2,
          name: 'Hotel X',
          subdomain: 'hotelx',
          plan_name: 'Free Plan',
          active_modules_count: 15,
          max_modules_allowed: 2,
          exceeds_limit: true,
          has_subscription: true
        },
        {
          id: 46,
          name: 'Mi Empresa Test',
          subdomain: 'miempresa',
          plan_name: 'Free Plan',
          active_modules_count: 0,
          max_modules_allowed: 2,
          exceeds_limit: false,
          has_subscription: true
        }
      ];
      
      setOrganizations(mockOrganizations);
    } catch (error) {
      console.error('Error loading organizations:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las organizaciones',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const runAudit = async () => {
    try {
      setLoading(true);
      const results = await moduleManagementService.auditOrganizationModules();
      setAuditResults(results);
      
      toast({
        title: 'Auditoría completada',
        description: `Se encontraron ${results.organizationsExceedingLimits.length} organizaciones con problemas`,
      });
    } catch (error) {
      console.error('Error running audit:', error);
      toast({
        title: 'Error',
        description: 'Error al ejecutar la auditoría',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fixInconsistencies = async (organizationId: number) => {
    try {
      const result = await moduleManagementService.fixInconsistencies(organizationId);
      
      if (result.success) {
        toast({
          title: 'Éxito',
          description: result.message,
        });
        await loadOrganizations();
      } else {
        toast({
          title: 'Error',
          description: result.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error fixing inconsistencies:', error);
      toast({
        title: 'Error',
        description: 'Error al corregir inconsistencias',
        variant: 'destructive'
      });
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         org.subdomain.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'exceeds' && org.exceeds_limit) ||
                         (filterStatus === 'no_subscription' && !org.has_subscription);
    
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (org: OrganizationSummary) => {
    if (!org.has_subscription) {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Sin Suscripción</Badge>;
    }
    if (org.exceeds_limit) {
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Excede Límite</Badge>;
    }
    return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Módulos</h1>
          <p className="text-gray-600">Administra los módulos activos de todas las organizaciones</p>
        </div>
        <Button onClick={runAudit} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Ejecutar Auditoría
        </Button>
      </div>

      {auditResults && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div><strong>Resultados de Auditoría:</strong></div>
              <div>• {auditResults.organizationsWithoutSubscriptions.length} organizaciones sin suscripción</div>
              <div>• {auditResults.organizationsExceedingLimits.length} organizaciones excediendo límites</div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="organizations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organizations">Organizaciones</TabsTrigger>
          <TabsTrigger value="management" disabled={!selectedOrgId}>
            Gestión de Módulos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Buscar organización</label>
                  <Input
                    placeholder="Nombre o subdominio..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Estado</label>
                  <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="exceeds">Exceden límite</SelectItem>
                      <SelectItem value="no_subscription">Sin suscripción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Organizaciones */}
          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-24 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              filteredOrganizations.map((org) => (
                <Card key={org.id} className={`cursor-pointer transition-colors hover:bg-gray-50 ${selectedOrgId === org.id ? 'ring-2 ring-blue-500' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <Building2 className="h-8 w-8 text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">{org.name}</h3>
                          <p className="text-sm text-gray-600">
                            {org.subdomain} • {org.plan_name}
                          </p>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-sm">
                              Módulos: {org.active_modules_count} / {org.max_modules_allowed}
                            </span>
                            {getStatusBadge(org)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {(org.exceeds_limit || !org.has_subscription) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              fixInconsistencies(org.id);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Corregir
                          </Button>
                        )}
                        <Button
                          variant={selectedOrgId === org.id ? "default" : "outline"}
                          onClick={() => setSelectedOrgId(org.id)}
                        >
                          <Users className="h-4 w-4 mr-1" />
                          {selectedOrgId === org.id ? 'Seleccionada' : 'Seleccionar'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="management">
          {selectedOrgId ? (
            <ModuleManagement organizationId={selectedOrgId} isAdmin={true} />
          ) : (
            <Alert>
              <Crown className="h-4 w-4" />
              <AlertDescription>
                Selecciona una organización para gestionar sus módulos.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
