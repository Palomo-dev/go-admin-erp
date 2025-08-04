'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Lock, 
  Crown, 
  CreditCard, 
  ArrowLeft, 
  Settings,
  Package,
  AlertTriangle
} from 'lucide-react';
import { useModuleAccessInfo } from '@/hooks/useActiveModules';
import Link from 'next/link';

interface ModuleAccessDeniedProps {
  moduleCode?: string;
  organizationId?: number;
}

export default function ModuleAccessDenied({ moduleCode, organizationId }: ModuleAccessDeniedProps) {
  const searchParams = useSearchParams();
  const errorType = searchParams.get('error');
  const moduleFromParams = searchParams.get('module');
  
  const finalModuleCode = moduleCode || moduleFromParams || '';
  
  const { 
    accessInfo, 
    loading, 
    canAccess, 
    reason, 
    planInfo, 
    moduleInfo 
  } = useModuleAccessInfo(finalModuleCode, organizationId);

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Si tiene acceso, no mostrar esta página
  if (canAccess) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Tienes acceso a este módulo. Puedes continuar navegando.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getErrorIcon = () => {
    switch (errorType) {
      case 'module_not_activated':
        return <Package className="h-12 w-12 text-orange-500" />;
      case 'insufficient_permissions':
        return <Lock className="h-12 w-12 text-red-500" />;
      case 'plan_limit_reached':
        return <CreditCard className="h-12 w-12 text-purple-500" />;
      default:
        return <Lock className="h-12 w-12 text-gray-500" />;
    }
  };

  const getErrorTitle = () => {
    switch (errorType) {
      case 'module_not_activated':
        return 'Módulo No Activado';
      case 'insufficient_permissions':
        return 'Permisos Insuficientes';
      case 'plan_limit_reached':
        return 'Límite de Plan Alcanzado';
      default:
        return 'Acceso Denegado';
    }
  };

  const getErrorDescription = () => {
    if (reason) return reason;
    
    switch (errorType) {
      case 'module_not_activated':
        return 'Este módulo no está activado para tu organización.';
      case 'insufficient_permissions':
        return 'No tienes los permisos necesarios para acceder a este módulo.';
      case 'plan_limit_reached':
        return 'Tu plan actual no permite activar más módulos.';
      default:
        return 'No puedes acceder a este módulo en este momento.';
    }
  };

  const getSuggestedActions = () => {
    const actions = [];

    switch (errorType) {
      case 'module_not_activated':
        if (planInfo && moduleInfo) {
          if (planInfo.max_modules > 0) {
            actions.push({
              label: 'Activar Módulo',
              description: 'Contacta a tu administrador para activar este módulo',
              icon: <Settings className="h-4 w-4" />,
              variant: 'default' as const,
              href: '/app/organizacion'
            });
          } else {
            actions.push({
              label: 'Actualizar Plan',
              description: 'Actualiza tu plan para acceder a más módulos',
              icon: <Crown className="h-4 w-4" />,
              variant: 'default' as const,
              href: '/app/organizacion/suscripciones'
            });
          }
        }
        break;
      
      case 'insufficient_permissions':
        actions.push({
          label: 'Solicitar Permisos',
          description: 'Contacta a tu administrador para obtener los permisos necesarios',
          icon: <Lock className="h-4 w-4" />,
          variant: 'outline' as const,
          href: '/app/organizacion/miembros'
        });
        break;
      
      case 'plan_limit_reached':
        actions.push({
          label: 'Ver Planes',
          description: 'Explora nuestros planes para obtener más módulos',
          icon: <CreditCard className="h-4 w-4" />,
          variant: 'default' as const,
          href: '/app/organizacion/suscripciones'
        });
        break;
    }

    return actions;
  };

  const suggestedActions = getSuggestedActions();

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="space-y-6">
        {/* Botón de regreso */}
        <div>
          <Link href="/app/inicio">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver al Inicio
            </Button>
          </Link>
        </div>

        {/* Mensaje principal */}
        <Card className="border-orange-200">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              {getErrorIcon()}
            </div>
            <CardTitle className="text-2xl">{getErrorTitle()}</CardTitle>
            <CardDescription className="text-base">
              {getErrorDescription()}
            </CardDescription>
          </CardHeader>
          
          {moduleInfo && (
            <CardContent className="border-t pt-4">
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <Package className="h-8 w-8 text-gray-400" />
                <div className="flex-1">
                  <h3 className="font-semibold">{moduleInfo.name}</h3>
                  <p className="text-sm text-gray-600">{moduleInfo.description}</p>
                </div>
                {moduleInfo.is_core && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    <Crown className="h-3 w-3 mr-1" />
                    Core
                  </Badge>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Información del plan */}
        {planInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Plan Actual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{planInfo.name}</span>
                <Badge variant="outline">{planInfo.max_modules} módulos</Badge>
              </div>
              
              {planInfo.features && (
                <div className="text-sm text-gray-600">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(planInfo.features).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="capitalize">{key.replace('_', ' ')}:</span>
                        <span>{typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Acciones sugeridas */}
        {suggestedActions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">¿Qué puedes hacer?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestedActions.map((action, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {action.icon}
                    <div>
                      <div className="font-medium">{action.label}</div>
                      <div className="text-sm text-gray-600">{action.description}</div>
                    </div>
                  </div>
                  <Link href={action.href}>
                    <Button variant={action.variant} size="sm">
                      Ir
                    </Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Contacto de soporte */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">¿Necesitas ayuda?</div>
              <div className="text-sm">
                Si crees que esto es un error o necesitas asistencia, contacta a tu administrador 
                o al equipo de soporte técnico.
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
