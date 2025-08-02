'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ModuleAccessDenied from '@/components/modules/ModuleAccessDenied';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, Settings, Users, Package } from 'lucide-react';
import Link from 'next/link';

function InicioContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const module = searchParams.get('module');

  // Si hay un error de módulo, mostrar la página de acceso denegado
  if (error === 'module_not_activated' && module) {
    return <ModuleAccessDenied moduleCode={module} />;
  }

  // Página de inicio normal
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <Home className="h-16 w-16 text-primary" />
        </div>
        <h1 className="text-4xl font-bold">Bienvenido a GO Admin ERP</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Sistema integral de gestión empresarial con módulos especializados para diferentes tipos de negocio.
        </p>
      </div>

      {/* Mostrar alerta si hubo algún error */}
      {error && (
        <Alert className="max-w-2xl mx-auto">
          <AlertDescription>
            {error === 'module_not_activated' && 'El módulo solicitado no está activado para tu organización.'}
            {error === 'insufficient_permissions' && 'No tienes permisos suficientes para acceder al módulo solicitado.'}
            {error === 'plan_limit_reached' && 'Tu plan actual no permite activar más módulos.'}
            {!['module_not_activated', 'insufficient_permissions', 'plan_limit_reached'].includes(error) && 'Ha ocurrido un error inesperado.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Settings className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle>Configuración</CardTitle>
            <CardDescription>
              Gestiona tu organización, sucursales y configuraciones generales
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/app/organizacion">
              <Button variant="outline" className="w-full">
                Ir a Configuración
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Package className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Módulos</CardTitle>
            <CardDescription>
              Explora y activa los módulos disponibles para tu plan
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/app/organizacion/modulos">
              <Button variant="outline" className="w-full">
                Ver Módulos
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Users className="h-8 w-8 text-purple-600" />
            </div>
            <CardTitle>Equipo</CardTitle>
            <CardDescription>
              Gestiona usuarios, roles y permisos de tu organización
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/app/organizacion/miembros">
              <Button variant="outline" className="w-full">
                Gestionar Equipo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Información adicional */}
      <div className="max-w-2xl mx-auto text-center text-sm text-gray-500">
        <p>
          ¿Necesitas ayuda? Consulta nuestra{' '}
          <Link href="/docs" className="text-primary hover:underline">
            documentación
          </Link>{' '}
          o contacta al{' '}
          <Link href="/support" className="text-primary hover:underline">
            soporte técnico
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default function InicioPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    }>
      <InicioContent />
    </Suspense>
  );
}
