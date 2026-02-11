'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
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
  Users, 
  UserCheck, 
  Building2, 
  BarChart3, 
  Bell, 
  Zap, 
  Bus, 
  Calendar, 
  Activity,
  Crown,
  Lock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Shield,
  CreditCard,
  MessageSquare,
  Banknote,
  Dumbbell,
  BedDouble,
  ParkingCircle,
  Briefcase,
  Truck
} from 'lucide-react';
import { useActiveModules } from '@/hooks/useActiveModules';
import { useModuleContext } from '@/lib/context/ModuleContext';
import { moduleManagementService, type Module } from '@/lib/services/moduleManagementService';
import { ModulesSkeleton } from '@/components/organization/OrganizationSkeletons';

const moduleIcons: Record<string, React.ComponentType<any>> = {
  'organizations': Building2,
  'branding': Palette,
  'branches': MapPin,
  'clientes': Users,
  'subscriptions': CreditCard,
  'roles': Shield,
  'pos': ShoppingCart,
  'pos_retail': ShoppingCart,
  'pos_restaurant': ShoppingCart,
  'pos_gym': ShoppingCart,
  'inventory': Package,
  'pms_hotel': BedDouble,
  'parking': ParkingCircle,
  'crm': UserCheck,
  'hrm': Briefcase,
  'finance': Banknote,
  'reports': BarChart3,
  'notifications': Bell,
  'integrations': Zap,
  'transport': Truck,
  'calendar': Calendar,
  'operations': Activity,
  'chat': MessageSquare,
  'gym': Dumbbell
};

export default function ModulesMarketplacePage() {
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Estado local optimista para módulos activos
  const [optimisticActiveModules, setOptimisticActiveModules] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  // Controlar si la carga inicial ya terminó (para no mostrar loader en toggle)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const {
    activeModules,
    organizationStatus,
    refreshModules,
    loading: modulesLoading
  } = useActiveModules(organizationId || undefined);

  // Sincronizar estado optimista con datos reales (solo en carga inicial)
  useEffect(() => {
    if (activeModules.length > 0 && !initialLoadComplete) {
      setOptimisticActiveModules(new Set(activeModules.map(m => m.code)));
      setInitialLoadComplete(true);
    }
  }, [activeModules, initialLoadComplete]);

  const moduleContext = useModuleContext();

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

  const handleToggleModule = useCallback(async (moduleCode: string, isActive: boolean) => {
    if (!organizationId) return;

    // 1. ACTUALIZACIÓN OPTIMISTA INMEDIATA
    const previousState = new Set(optimisticActiveModules);
    
    setOptimisticActiveModules(prev => {
      const newSet = new Set(prev);
      if (isActive) {
        newSet.delete(moduleCode);
      } else {
        newSet.add(moduleCode);
      }
      return newSet;
    });

    setActionLoading(moduleCode);
    setError(null);

    try {
      // 2. LLAMADA API EN BACKGROUND
      const response = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          moduleCode,
          action: isActive ? 'deactivate' : 'activate'
        }),
      });

      const result = await response.json();

      if (!result.success) {
        // 3. REVERTIR SI FALLA
        setOptimisticActiveModules(previousState);
        setError(result.message || 'Error al modificar el módulo');
        return;
      }

      // 4. Actualizar sidebar sin recargar página completa
      startTransition(() => {
        moduleContext.refreshModules();
      });

      // 5. Notificar a AppLayout para actualizar el sidebar
      window.dispatchEvent(new Event('modules-updated'));

    } catch (err) {
      // REVERTIR EN CASO DE ERROR
      setOptimisticActiveModules(previousState);
      console.error('Error toggling module:', err);
      setError('Error de conexión al modificar el módulo');
    } finally {
      setActionLoading(null);
    }
  }, [organizationId, optimisticActiveModules, moduleContext]);

  // Usar estado optimista para verificar si módulo está activo
  const getModuleStatus = useCallback((moduleCode: string) => {
    return optimisticActiveModules.has(moduleCode);
  }, [optimisticActiveModules]);

  const canToggleModule = useCallback((module: Module) => {
    if (module.is_core) return false;
    
    const isActive = optimisticActiveModules.has(module.code);
    
    if (isActive) return true;
    
    const plan = organizationStatus?.plan;
    if (!plan) return false;
    
    // Contar módulos activos usando estado optimista
    const activeCount = Array.from(optimisticActiveModules).filter(code => {
      const mod = allModules.find(m => m.code === code);
      return mod && !mod.is_core;
    }).length;
    
    return activeCount < plan.max_modules;
  }, [optimisticActiveModules, organizationStatus, allModules]);

  // Solo mostrar skeleton en carga inicial, NO en toggle de módulos
  const showInitialLoader = (loading || modulesLoading) && !initialLoadComplete;
  
  if (showInitialLoader) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Marketplace de Módulos</h1>
          <p className="text-gray-600">Activa y desactiva módulos según las necesidades de tu negocio</p>
        </div>
        <ModulesSkeleton />
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
  const coreCount = coreModules.length;
  
  // Usar estado optimista para conteo en tiempo real
  const additionalActiveCount = Array.from(optimisticActiveModules).filter(code => {
    const mod = allModules.find(m => m.code === code);
    return mod && !mod.is_core;
  }).length;
  const totalActiveCount = coreCount + additionalActiveCount;

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
      {organizationStatus?.plan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              {organizationStatus.plan.name}
            </CardTitle>
            <CardDescription>
              Uso de módulos: {totalActiveCount} de {organizationStatus.plan.max_modules} ({coreCount} core + {additionalActiveCount} adicionales)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress 
                value={(totalActiveCount / organizationStatus.plan.max_modules) * 100} 
                className="h-2"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{totalActiveCount} módulos activos ({coreCount} core)</span>
                <span>{organizationStatus.plan.max_modules - totalActiveCount} adicionales disponibles</span>
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
      {organizationStatus?.plan && totalActiveCount >= organizationStatus.plan.max_modules && (
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
