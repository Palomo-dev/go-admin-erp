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
  Truck,
  FolderKanban,
  LayoutGrid
} from 'lucide-react';
import Link from 'next/link';
import { useActiveModules } from '@/hooks/useActiveModules';
import { useModuleContext } from '@/lib/context/ModuleContext';
import { moduleManagementService, type Module } from '@/lib/services/moduleManagementService';
import { MODULE_PAGES, getModulePages, type ModulePage } from '@/lib/config/modulePages';
import { ModulesSkeleton } from '@/components/organization/OrganizationSkeletons';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  'gym': Dumbbell,
  'pm': FolderKanban
};

export default function ModulesMarketplacePage() {
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('org');
  
  // Estado local optimista para módulos activos
  const [optimisticActiveModules, setOptimisticActiveModules] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  // Controlar si la carga inicial ya terminó (para no mostrar loader en toggle)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Estado para páginas activas por módulo: { moduleCode: [pageHref, ...] }
  const [activeModulePages, setActiveModulePages] = useState<Record<string, string[]>>({});
  // Módulos expandidos para ver sus submódulos
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  // Loading state para toggle de página individual
  const [pageActionLoading, setPageActionLoading] = useState<string | null>(null);

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
        setError(t('common.errorLoadingOrgInfo'));
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
        setError(t('modules.errorLoadingModules'));
      } finally {
        setLoading(false);
      }
    };

    loadAllModules();
  }, []);

  // Cargar páginas activas cuando cambia organizationId
  useEffect(() => {
    if (!organizationId) return;
    const loadActivePages = async () => {
      try {
        const pages = await moduleManagementService.getActiveModulePages(organizationId);
        setActiveModulePages(pages);
      } catch (err) {
        console.error('Error loading module pages:', err);
      }
    };
    loadActivePages();
  }, [organizationId]);

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
      const modulePages = !isActive ? getModulePages(moduleCode) : undefined;
      const response = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          moduleCode,
          action: isActive ? 'deactivate' : 'activate',
          modulePages,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        // 3. REVERTIR SI FALLA
        setOptimisticActiveModules(previousState);
        setError(result.message || t('modules.errorToggling'));
        return;
      }

      // Si se activó, marcar todas las páginas como activas en estado local
      let newActiveModulePages: Record<string, string[]>;
      if (!isActive && modulePages.length > 0) {
        newActiveModulePages = { ...activeModulePages, [moduleCode]: modulePages.map(p => p.href) };
        setActiveModulePages(newActiveModulePages);
      } else if (isActive) {
        // Si se desactivó, limpiar páginas del módulo
        newActiveModulePages = { ...activeModulePages };
        delete newActiveModulePages[moduleCode];
        setActiveModulePages(newActiveModulePages);
      } else {
        newActiveModulePages = activeModulePages;
      }

      // 4. Actualizar sidebar sin recargar página completa
      startTransition(() => {
        moduleContext.refreshModules();
      });

      // 5. Notificar a AppLayout con datos optimistas para update inmediato
      const newActiveCodes = isActive
        ? Array.from(optimisticActiveModules).filter(c => c !== moduleCode)
        : [...Array.from(optimisticActiveModules), moduleCode];
      window.dispatchEvent(new CustomEvent('modules-updated', {
        detail: { activeModulePages: newActiveModulePages, activeModuleCodes: newActiveCodes }
      }));

      // 6. Confirmar recargando desde DB (sin detail para que AppLayout recargue)
      setTimeout(() => {
        window.dispatchEvent(new Event('modules-updated'));
      }, 500);

    } catch (err) {
      // REVERTIR EN CASO DE ERROR
      setOptimisticActiveModules(previousState);
      console.error('Error toggling module:', err);
      setError(t('modules.errorConnection'));
    } finally {
      setActionLoading(null);
    }
  }, [organizationId, optimisticActiveModules, moduleContext, activeModulePages]);

  // Toggle de página individual (submódulo)
  const handleTogglePage = useCallback(async (moduleCode: string, page: ModulePage, isActive: boolean) => {
    if (!organizationId) return;
    const pageKey = `${moduleCode}:${page.href}`;
    setPageActionLoading(pageKey);

    // Calcular páginas actuales y nuevas páginas
    let currentPagesList = activeModulePages[moduleCode];
    if (currentPagesList === undefined) {
      currentPagesList = (MODULE_PAGES[moduleCode] || []).map(p => p.href);
    }

    const newPages = isActive
      ? currentPagesList.filter(href => href !== page.href)
      : [...currentPagesList, page.href];

    const willHaveZeroPages = newPages.length === 0;

    // Construir nuevo estado completo
    const newActiveModulePages = { ...activeModulePages, [moduleCode]: newPages };

    // Actualización optimista local
    const previousPages = { ...activeModulePages };
    setActiveModulePages(newActiveModulePages);

    // Si al desactivar esta página quedan 0 páginas activas, desactivar el módulo
    if (willHaveZeroPages) {
      setPageActionLoading(null);
      handleToggleModule(moduleCode, true);
      return;
    }

    // Notificar al AppLayout inmediatamente con los datos optimistas
    window.dispatchEvent(new CustomEvent('modules-updated', {
      detail: { activeModulePages: newActiveModulePages }
    }));

    try {
      const response = await fetch('/api/modules/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          moduleCode,
          pageHref: page.href,
          pageName: page.name,
          isActive: !isActive,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setActiveModulePages(previousPages);
        setError(result.message || 'Error al cambiar página');
        // Revertir en sidebar también
        window.dispatchEvent(new CustomEvent('modules-updated', {
          detail: { activeModulePages: previousPages }
        }));
        return;
      }

      // Confirmar con recarga desde DB
      window.dispatchEvent(new Event('modules-updated'));
    } catch (err) {
      setActiveModulePages(previousPages);
      console.error('Error toggling page:', err);
      setError('Error de conexión al cambiar página');
      // Revertir en sidebar
      window.dispatchEvent(new CustomEvent('modules-updated', {
        detail: { activeModulePages: previousPages }
      }));
    } finally {
      setPageActionLoading(null);
    }
  }, [organizationId, activeModulePages, handleToggleModule]);

  // Expandir/contraer módulo para ver submódulos
  const toggleExpand = useCallback((moduleCode: string) => {
    setExpandedModules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(moduleCode)) {
        newSet.delete(moduleCode);
      } else {
        newSet.add(moduleCode);
      }
      return newSet;
    });
  }, []);

  // Verificar si una página está activa
  const isPageActive = useCallback((moduleCode: string, pageHref: string) => {
    const pages = activeModulePages[moduleCode];
    if (pages === undefined) return true; // Si no hay datos, asumir activo
    return pages.includes(pageHref);
  }, [activeModulePages]);

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
      <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold dark:text-white">{t('modules.title')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('modules.description')}</p>
        </div>
        <ModulesSkeleton />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('common.errorLoadingOrgInfo')}
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
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <LayoutGrid className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('modules.title')}</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {t('modules.description')}
          </p>
        </div>
      </div>

      {/* Plan Status */}
      {organizationStatus?.plan && (
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <Crown className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
              {organizationStatus.plan.name}
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              {t('modules.usage', { total: totalActiveCount, max: organizationStatus.plan.max_modules, core: coreCount, additional: additionalActiveCount })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress 
                value={(totalActiveCount / organizationStatus.plan.max_modules) * 100} 
                className="h-2"
              />
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                <span>{t('modules.activeModules', { count: totalActiveCount, core: coreCount })}</span>
                <span>{t('modules.availableAdditional', { count: organizationStatus.plan.max_modules - totalActiveCount })}</span>
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
          <Crown className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
          <h2 className="text-2xl font-semibold dark:text-white">{t('modules.coreModules')}</h2>
          <Badge variant="secondary" className="dark:bg-gray-800 dark:text-gray-300">{t('modules.includedInAllPlans')}</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {coreModules.map((module) => {
            const Icon = moduleIcons[module.code] || Package;
            const isActive = getModuleStatus(module.code);
            
            return (
              <Card key={module.code} className="relative dark:bg-gray-900 dark:border-gray-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg dark:text-white">{module.name}</CardTitle>
                        <Badge variant="outline" className="text-xs dark:border-gray-700 dark:text-gray-300">
                          {t('modules.core')}
                        </Badge>
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4 dark:text-gray-400">
                    {module.description}
                  </CardDescription>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                      {t('modules.alwaysActive')}
                    </span>
                    <Lock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Separator className="dark:bg-gray-800" />

      {/* Paid Modules */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-purple-500 dark:text-purple-400" />
          <h2 className="text-2xl font-semibold dark:text-white">{t('modules.specializedModules')}</h2>
          <Badge variant="secondary" className="dark:bg-gray-800 dark:text-gray-300">{t('modules.accordingToPlan')}</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {paidModules.map((module) => {
            const Icon = moduleIcons[module.code] || Package;
            const isActive = getModuleStatus(module.code);
            const canToggle = canToggleModule(module);
            
            return (
              <Card key={module.code} className={`relative dark:bg-gray-900 dark:border-gray-800 transition-all duration-200 hover:shadow-md ${isActive ? 'ring-2 ring-green-200 dark:ring-green-800' : ''}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <Icon className={`h-6 w-6 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg dark:text-white">{module.name}</CardTitle>
                        <Badge variant={isActive ? "default" : "outline"} className="text-xs dark:border-gray-700 dark:text-gray-300">
                          {isActive ? t('modules.active') : t('modules.inactive')}
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
                  <CardDescription className="mb-4 dark:text-gray-400">
                    {module.description}
                  </CardDescription>
                  
                  {actionLoading === module.code && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('modules.processing')}
                    </div>
                  )}
                  
                  {!canToggle && !isActive && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                      <Lock className="h-4 w-4" />
                      {t('modules.planLimitReached')}
                    </div>
                  )}

                  {/* Sección de submódulos/páginas - solo mostrar si el módulo está activo */}
                  {isActive && MODULE_PAGES[module.code] && MODULE_PAGES[module.code].length > 0 && (
                    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <button
                        onClick={() => toggleExpand(module.code)}
                        className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-full group"
                      >
                        <div className="flex items-center gap-1.5">
                          {expandedModules.has(module.code) ? (
                            <ChevronDown className="h-4 w-4 transition-transform" />
                          ) : (
                            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          )}
                          <span>Páginas del módulo</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const activeCount = (activeModulePages[module.code] || []).length;
                            const totalCount = MODULE_PAGES[module.code].length;
                            return (
                              <Badge variant="outline" className="text-xs dark:border-gray-700 dark:text-gray-400">
                                {activeCount}/{totalCount}
                              </Badge>
                            );
                          })()}
                        </div>
                      </button>
                      
                      <div
                        className="transition-all duration-300 ease-in-out overflow-y-auto"
                        style={{
                          maxHeight: expandedModules.has(module.code) ? '600px' : '0px',
                          opacity: expandedModules.has(module.code) ? 1 : 0,
                        }}
                      >
                        <div className="mt-3 space-y-1.5">
                          {MODULE_PAGES[module.code].map((page) => {
                            const pageActive = isPageActive(module.code, page.href);
                            const pageKey = `${module.code}:${page.href}`;
                            const isPageLoading = pageActionLoading === pageKey;
                            
                            return (
                              <div
                                key={page.href}
                                className={`flex items-center justify-between py-2 px-3 rounded-md transition-all duration-150 ${
                                  pageActive
                                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30'
                                    : 'bg-gray-50 dark:bg-gray-800/50 border border-transparent'
                                } hover:shadow-sm`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pageActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                  <span className={`text-sm truncate ${pageActive ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                                    {page.name}
                                  </span>
                                  {isPageLoading && (
                                    <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />
                                  )}
                                </div>
                                <Switch
                                  checked={pageActive}
                                  disabled={isPageLoading}
                                  onCheckedChange={() => handleTogglePage(module.code, page, pageActive)}
                                  className="scale-90"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Upgrade Plan CTA - Solo mostrar si hay módulos que podrían activarse */}
      {organizationStatus?.plan && totalActiveCount >= organizationStatus.plan.max_modules && paidModules.some(m => !optimisticActiveModules.has(m.code)) && (
        <Card className="border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-300">
              <Crown className="h-5 w-5 dark:text-purple-400" />
              {t('modules.needMoreModules')}
            </CardTitle>
            <CardDescription className="text-purple-600 dark:text-purple-400">
              {t('modules.needMoreModulesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app/plan">
              <Button className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600">
                {t('modules.upgradePlan')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
