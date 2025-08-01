'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  ShoppingCart, 
  Package, 
  Palette, 
  MapPin, 
  Car, 
  Users, 
  UserCheck, 
  Landmark, 
  BarChart3, 
  Bell, 
  Link as LinkIcon, 
  Bus, 
  Calendar, 
  Activity,
  Crown,
  Lock,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { useActiveModules } from '@/hooks/useActiveModules';
import { moduleManagementService, type Module } from '@/lib/services/moduleManagementService';

const moduleIcons: Record<string, React.ComponentType<any>> = {
  'organizations': Users,
  'branding': Palette,
  'branches': MapPin,
  'pos_retail': ShoppingCart,
  'pos_restaurant': ShoppingCart,
  'pos_gym': ShoppingCart,
  'inventory': Package,
  'pms_hotel': Landmark,
  'parking': Car,
  'crm': UserCheck,
  'hrm': Users,
  'finance': BarChart3,
  'reports': BarChart3,
  'notifications': Bell,
  'integrations': LinkIcon,
  'transport': Bus,
  'calendar': Calendar,
  'operations': Activity
};

export default function ModulesMarketplacePage() {
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    activeModules,
    organizationStatus,
    refreshModules,
    loading: modulesLoading
  } = useActiveModules(organizationId || undefined);

  // Obtener organizationId del localStorage
  useEffect(() => {
    const orgData = localStorage.getItem('organizacionActiva');
    if (orgData) {
      try {
        const org = JSON.parse(orgData);
        setOrganizationId(org.id);
      } catch (error) {
        console.error('Error parsing organization data:', error);
        setError('Error al cargar información de la organización');
      }
    }
  }, []);

  // Cargar todos los módulos disponibles
  useEffect(() => {
    const loadAllModules = async () => {
      try {
        setLoading(true);
        const modules = await moduleManagementService.getAllModules();
        setAllModules(modules);
      } catch (err) {
        console.error('Error loading modules:', err);
        setError('Error al cargar módulos disponibles');
      } finally {
        setLoading(false);
      }
    };

    loadAllModules();
  }, []);

  const handleToggleModule = async (moduleCode: string, isActive: boolean) => {
    if (!organizationId) return;

    try {
      setActionLoading(moduleCode);
      setError(null);

      const response = await fetch('/api/modules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId,
          moduleCode,
          action: isActive ? 'deactivate' : 'activate'
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.message || 'Error al modificar el módulo');
        return;
      }

      // Refrescar datos
      await refreshModules();

    } catch (err) {
      console.error('Error toggling module:', err);
      setError('Error de conexión al modificar el módulo');
    } finally {
      setActionLoading(null);
    }
  };

  const getModuleStatus = (moduleCode: string) => {
    return activeModules.some(m => m.code === moduleCode);
  };

  const canToggleModule = (module: Module) => {
    if (module.is_core) return false; // Módulos core no se pueden desactivar
    
    const isActive = getModuleStatus(module.code);
    
    if (isActive) return true; // Siempre se puede desactivar
    
    // Para activar, verificar límites del plan
    if (!organizationStatus) return false;
    
    const activeCount = organizationStatus.active_modules.filter(code => {
      const mod = allModules.find(m => m.code === code);
      return mod && !mod.is_core;
    }).length;
    
    return activeCount < organizationStatus.plan.max_modules;
  };

  if (loading || modulesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Cargando módulos...</span>
        </div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No se pudo cargar la información de la organización. Por favor, recarga la página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const coreModules = allModules.filter(m => m.is_core);
  const paidModules = allModules.filter(m => !m.is_core);
  const activeCount = organizationStatus?.active_modules.filter(code => {
    const mod = allModules.find(m => m.code === code);
    return mod && !mod.is_core;
  }).length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Marketplace de Módulos</h1>
        <p className="text-gray-600">
          Activa y desactiva módulos según las necesidades de tu negocio
        </p>
      </div>

      {/* Plan Status */}
      {organizationStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Plan {organizationStatus.plan.name}
            </CardTitle>
            <CardDescription>
              Uso de módulos: {activeCount} de {organizationStatus.plan.max_modules}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress 
                value={(activeCount / organizationStatus.plan.max_modules) * 100} 
                className="h-2"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{activeCount} módulos activos</span>
                <span>{organizationStatus.plan.max_modules - activeCount} disponibles</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Core Modules */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-500" />
          <h2 className="text-2xl font-semibold">Módulos Core</h2>
          <Badge variant="secondary">Incluidos en todos los planes</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coreModules.map((module) => {
            const Icon = moduleIcons[module.code] || Package;
            const isActive = getModuleStatus(module.code);
            
            return (
              <Card key={module.code} className="relative">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Icon className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{module.name}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          Core
                        </Badge>
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {module.description}
                  </CardDescription>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 font-medium">
                      Siempre activo
                    </span>
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Paid Modules */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-purple-500" />
          <h2 className="text-2xl font-semibold">Módulos Especializados</h2>
          <Badge variant="secondary">Según tu plan</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paidModules.map((module) => {
            const Icon = moduleIcons[module.code] || Package;
            const isActive = getModuleStatus(module.code);
            const canToggle = canToggleModule(module);
            
            return (
              <Card key={module.code} className={`relative ${isActive ? 'ring-2 ring-green-200' : ''}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Icon className={`h-6 w-6 ${isActive ? 'text-green-600' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{module.name}</CardTitle>
                        <Badge variant={isActive ? "default" : "outline"} className="text-xs">
                          {isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                    </div>
                    <Switch
                      checked={isActive}
                      disabled={!canToggle || actionLoading === module.code}
                      onCheckedChange={() => handleToggleModule(module.code, isActive)}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {module.description}
                  </CardDescription>
                  
                  {actionLoading === module.code && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Procesando...
                    </div>
                  )}
                  
                  {!canToggle && !isActive && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <Lock className="h-4 w-4" />
                      Límite del plan alcanzado
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Upgrade Plan CTA */}
      {organizationStatus && activeCount >= organizationStatus.plan.max_modules && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <Crown className="h-5 w-5" />
              ¿Necesitas más módulos?
            </CardTitle>
            <CardDescription className="text-purple-600">
              Has alcanzado el límite de tu plan actual. Actualiza para acceder a más módulos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="bg-purple-600 hover:bg-purple-700">
              Actualizar Plan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
