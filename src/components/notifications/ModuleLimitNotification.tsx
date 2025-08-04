'use client';

import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Crown, 
  X, 
  ExternalLink,
  Info
} from 'lucide-react';
import { useActiveModules } from '@/hooks/useActiveModules';

interface ModuleLimitNotificationProps {
  organizationId?: number;
  onDismiss?: () => void;
  showUpgrade?: boolean;
}

export default function ModuleLimitNotification({ 
  organizationId, 
  onDismiss,
  showUpgrade = true 
}: ModuleLimitNotificationProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const { organizationStatus, loading } = useActiveModules(organizationId);

  useEffect(() => {
    // Verificar si ya fue dismisseada en esta sesión
    const dismissedKey = `module-limit-dismissed-${organizationId}`;
    const wasDismissed = sessionStorage.getItem(dismissedKey);
    if (wasDismissed) {
      setDismissed(true);
    }
  }, [organizationId]);

  const handleDismiss = () => {
    setDismissed(true);
    if (organizationId) {
      const dismissedKey = `module-limit-dismissed-${organizationId}`;
      sessionStorage.setItem(dismissedKey, 'true');
    }
    onDismiss?.();
  };

  if (loading || dismissed || !organizationStatus || !organizationStatus.plan) {
    return null;
  }

  // Solo contar módulos pagados para el límite (excluir core)
  const paidModulesCount = organizationStatus.paid_modules_count;
  const maxModules = organizationStatus.plan.max_modules;
  const usagePercentage = (paidModulesCount / maxModules) * 100;
  
  // Solo mostrar si está cerca del límite (80%) o lo ha alcanzado
  const shouldShow = usagePercentage >= 80;
  
  if (!shouldShow) {
    return null;
  }

  const isAtLimit = paidModulesCount >= maxModules;
  const isNearLimit = usagePercentage >= 80 && !isAtLimit;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <Alert className={`border-l-4 ${
        isAtLimit 
          ? 'border-l-red-500 bg-red-50 border-red-200' 
          : 'border-l-yellow-500 bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {isAtLimit ? (
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            ) : (
              <Info className="h-5 w-5 text-yellow-600 mt-0.5" />
            )}
            
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${
                  isAtLimit ? 'text-red-800' : 'text-yellow-800'
                }`}>
                  {isAtLimit ? 'Límite de módulos alcanzado' : 'Cerca del límite de módulos'}
                </span>
                <Badge variant="outline" className="text-xs">
                  {paidModulesCount}/{maxModules}
                </Badge>
              </div>
              
              <AlertDescription className={`text-sm ${
                isAtLimit ? 'text-red-700' : 'text-yellow-700'
              }`}>
                {isAtLimit ? (
                  <>
                    Has alcanzado el límite de módulos de tu plan <strong>{organizationStatus.plan.name}</strong>. 
                    Para activar más módulos, considera actualizar tu plan.
                  </>
                ) : (
                  <>
                    Estás usando {paidModulesCount} de {maxModules} módulos disponibles en tu plan{' '}
                    <strong>{organizationStatus.plan.name}</strong>.
                  </>
                )}
              </AlertDescription>

              {showDetails && (
                <div className="mt-3 p-3 bg-white/50 rounded border text-xs space-y-1">
                  <div className="font-medium">Módulos pagados activos:</div>
                  <div className="flex flex-wrap gap-1">
                    {organizationStatus.active_modules
                      .filter(moduleCode => {
                        // Filtrar solo módulos pagados (excluir core)
                        const coreModules = ['organizations', 'subscriptions', 'branches', 'branding', 'roles'];
                        return !coreModules.includes(moduleCode);
                      })
                      .map(moduleCode => (
                        <Badge key={moduleCode} variant="secondary" className="text-xs">
                          {moduleCode}
                        </Badge>
                      ))}
                  </div>
                  {organizationStatus.active_modules.length > paidModulesCount && (
                    <div className="text-xs text-gray-500 mt-1">
                      + {organizationStatus.active_modules.length - paidModulesCount} módulos core (no cuentan para el límite)
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="h-7 px-2 text-xs"
                >
                  {showDetails ? 'Ocultar detalles' : 'Ver detalles'}
                </Button>
                
                {showUpgrade && (
                  <Button
                    size="sm"
                    className={`h-7 px-3 text-xs ${
                      isAtLimit 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-yellow-600 hover:bg-yellow-700'
                    }`}
                  >
                    <Crown className="h-3 w-3 mr-1" />
                    Actualizar Plan
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 hover:bg-transparent"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
}

// Hook para usar la notificación en cualquier componente
export function useModuleLimitNotification(organizationId?: number) {
  const [showNotification, setShowNotification] = useState(false);
  const { organizationStatus, loading } = useActiveModules(organizationId);

  useEffect(() => {
    if (loading || !organizationStatus) return;

    const activeCount = organizationStatus.active_modules.length;
    const maxModules = organizationStatus.plan.max_modules;
    const usagePercentage = (activeCount / maxModules) * 100;

    // Mostrar notificación si está cerca del límite
    setShowNotification(usagePercentage >= 80);
  }, [organizationStatus, loading]);

  return {
    showNotification,
    setShowNotification,
    organizationStatus
  };
}
