'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Package, 
  Crown, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Settings,
  Users,
  Building2,
  CreditCard,
  Activity,
  BarChart3
} from 'lucide-react';
import { moduleManagementService, type OrganizationModuleStatus, type Module } from '@/lib/services/moduleManagementService';
import { useToast } from '@/components/ui/use-toast';

interface ModuleManagementProps {
  organizationId: number;
  isAdmin?: boolean;
}

const ModuleIcons: Record<string, React.ComponentType<any>> = {
  'organizations': Building2,
  'branding': Settings,
  'branches': Building2,
  'subscriptions': CreditCard,
  'roles': Shield,
  'pos_retail': Package,
  'pos_restaurant': Package,
  'pos_gym': Package,
  'inventory': Package,
  'pms_hotel': Building2,
  'parking': Package,
  'crm': Users,
  'hrm': Users,
  'finance': CreditCard,
  'reports': BarChart3,
  'notifications': Activity,
  'integrations': Settings,
  'transport': Package,
  'calendar': Activity,
  'operations': Activity
};

export default function ModuleManagement({ organizationId, isAdmin = false }: ModuleManagementProps) {
  const [orgStatus, setOrgStatus] = useState<OrganizationModuleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadOrganizationStatus();
  }, [organizationId]);

  const loadOrganizationStatus = async () => {
    try {
      setLoading(true);
      const status = await moduleManagementService.getOrganizationModuleStatus(organizationId);
      setOrgStatus(status);
    } catch (error) {
      console.error('Error loading organization status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el estado de los módulos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleModuleToggle = async (moduleCode: string, isActive: boolean) => {
    if (!orgStatus) return;
    
    setActionLoading(moduleCode);
    
    try {
      let result;
      if (isActive) {
        result = await moduleManagementService.deactivateModule(organizationId, moduleCode);
      } else {
        result = await moduleManagementService.activateModule(organizationId, moduleCode);
      }

      if (result.success) {
        toast({
          title: 'Éxito',
          description: result.message,
        });
        await loadOrganizationStatus(); // Recargar estado
      } else {
        toast({
          title: 'Error',
          description: result.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error toggling module:', error);
      toast({
        title: 'Error',
        description: 'Error al cambiar el estado del módulo',
        variant: 'destructive'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getModuleIcon = (moduleCode: string) => {
    const IconComponent = ModuleIcons[moduleCode] || Package;
    return <IconComponent className="h-5 w-5" />;
  };

  const getModuleStatus = (module: Module) => {
    if (!orgStatus) return 'unknown';
    
    const isActive = orgStatus.active_modules.includes(module.code);
    const isCore = module.is_core;
    
    if (isCore) return 'core';
    if (isActive) return 'active';
    if (!orgStatus.can_activate_more) return 'limit_reached';
    return 'available';
  };

  const getStatusBadge = (status: string, module: Module) => {
    switch (status) {
      case 'core':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Crown className="h-3 w-3 mr-1" />Core</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Activo</Badge>;
      case 'available':
        return <Badge variant="outline">Disponible</Badge>;
      case 'limit_reached':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Límite alcanzado</Badge>;
      default:
        return <Badge variant="outline">Desconocido</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!orgStatus) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No se pudo cargar la información de los módulos.
        </AlertDescription>
      </Alert>
    );
  }

  const coreModules = orgStatus.available_modules.filter(m => m.is_core)
    .concat(orgStatus.active_modules.map(code => orgStatus.available_modules.find(m => m.code === code)).filter(Boolean) as Module[])
    .filter((module, index, self) => self.findIndex(m => m.code === module.code) === index);

  const paidModules = orgStatus.available_modules.filter(m => !m.is_core)
    .concat(orgStatus.active_modules.map(code => orgStatus.available_modules.find(m => m.code === code)).filter(Boolean) as Module[])
    .filter((module, index, self) => self.findIndex(m => m.code === module.code) === index);

  const usagePercentage = orgStatus.max_modules_allowed > 0 
    ? (orgStatus.paid_modules_count / orgStatus.max_modules_allowed) * 100 
    : 0;

  return (
    <div className="space-y-6">
      {/* Información del Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Plan Actual: {orgStatus.plan?.name || 'Sin Plan'}
          </CardTitle>
          <CardDescription>
            Gestión de módulos para {orgStatus.organization_name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {orgStatus.paid_modules_count}
              </div>
              <div className="text-sm text-blue-600">Módulos Activos</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {orgStatus.max_modules_allowed}
              </div>
              <div className="text-sm text-green-600">Módulos Permitidos</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {orgStatus.max_modules_allowed - orgStatus.paid_modules_count}
              </div>
              <div className="text-sm text-purple-600">Módulos Disponibles</div>
            </div>
          </div>

          {orgStatus.max_modules_allowed > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uso de módulos</span>
                <span>{orgStatus.paid_modules_count} / {orgStatus.max_modules_allowed}</span>
              </div>
              <Progress value={usagePercentage} className="h-2" />
            </div>
          )}

          {!orgStatus.can_activate_more && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Has alcanzado el límite de módulos de tu plan. 
                <Button variant="link" className="p-0 h-auto ml-1">
                  Actualiza tu plan
                </Button> para activar más módulos.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Gestión de Módulos */}
      <Tabs defaultValue="paid" className="space-y-4">
        <TabsList>
          <TabsTrigger value="paid">Módulos de Pago</TabsTrigger>
          <TabsTrigger value="core">Módulos Core</TabsTrigger>
        </TabsList>

        <TabsContent value="paid" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paidModules.map((module) => {
              const status = getModuleStatus(module);
              const isActive = orgStatus.active_modules.includes(module.code);
              const canToggle = isAdmin && (isActive || orgStatus.can_activate_more);

              return (
                <Card key={module.code} className={`relative ${!canToggle && !isActive ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getModuleIcon(module.code)}
                        <CardTitle className="text-lg">{module.name}</CardTitle>
                      </div>
                      {getStatusBadge(status, module)}
                    </div>
                    <CardDescription className="text-sm">
                      {module.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {isAdmin && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {isActive ? 'Desactivar' : 'Activar'}
                        </span>
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => handleModuleToggle(module.code, isActive)}
                          disabled={!canToggle || actionLoading === module.code}
                        />
                      </div>
                    )}
                    {!isAdmin && (
                      <div className="text-sm text-gray-500">
                        {isActive ? 'Módulo activo' : 'Módulo no disponible'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="core" className="space-y-4">
          <Alert>
            <Crown className="h-4 w-4" />
            <AlertDescription>
              Los módulos core son esenciales y están siempre activos. No cuentan para el límite de tu plan.
            </AlertDescription>
          </Alert>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreModules.map((module) => {
              const isActive = orgStatus.active_modules.includes(module.code);

              return (
                <Card key={module.code} className="border-blue-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getModuleIcon(module.code)}
                        <CardTitle className="text-lg">{module.name}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        <Crown className="h-3 w-3 mr-1" />Core
                      </Badge>
                    </div>
                    <CardDescription className="text-sm">
                      {module.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Siempre activo
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
