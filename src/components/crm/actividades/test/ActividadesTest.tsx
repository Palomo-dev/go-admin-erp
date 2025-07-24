'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, User } from 'lucide-react';
import { ActivityType, ACTIVITY_TYPE_CONFIG } from '@/types/activity';
import { ActividadIcon } from '../ui/ActividadIcon';

/**
 * Componente de prueba para verificar que los tipos y componentes básicos funcionan
 */
export function ActividadesTest() {
  const testActivity = {
    id: 'test-1',
    organization_id: 2,
    activity_type: ActivityType.CALL,
    user_id: 'test-user',
    notes: 'Esta es una actividad de prueba para verificar que todo funciona correctamente.',
    related_type: 'customer',
    related_id: 'test-customer',
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      duration: 15,
      phone_number: '+57 300 123 4567'
    },
    user_name: 'Usuario de Prueba',
    related_entity_name: 'Cliente de Prueba'
  };

  const config = ACTIVITY_TYPE_CONFIG[testActivity.activity_type];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Prueba de Componentes de Actividades
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Verificación de tipos, iconos y estructura básica
        </p>
      </div>

      {/* Prueba de iconos */}
      <Card className="p-6">
        <h3 className="font-medium mb-4">Iconos de Actividades</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(ACTIVITY_TYPE_CONFIG).map(([type, config]) => (
            <div key={type} className="flex items-center gap-2">
              <ActividadIcon type={type as ActivityType} />
              <span className="text-sm">{config.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Prueba de actividad individual */}
      <Card className="p-6">
        <h3 className="font-medium mb-4">Actividad de Ejemplo</h3>
        <div className="flex items-start gap-4">
          <ActividadIcon type={testActivity.activity_type} />
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className={config.color}>
                {config.label}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                hace 5 min
              </div>
            </div>
            
            <p className="text-sm text-gray-900 dark:text-white mb-2">
              {testActivity.notes}
            </p>
            
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {testActivity.user_name}
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                {testActivity.related_entity_name}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Prueba de conexión con Supabase */}
      <Card className="p-6">
        <h3 className="font-medium mb-4">Estado de Conexión</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">Tipos de actividad: ✅ Configurados</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">Componentes UI: ✅ Creados</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">Servicios: ✅ Implementados</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span className="text-sm">Conexión Supabase: ⏳ Pendiente de prueba</span>
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button onClick={() => window.location.href = '/app/crm/actividades'}>
          Ir a Actividades Completas
        </Button>
        <Button variant="outline" onClick={() => console.log('Test activity:', testActivity)}>
          Log Test Data
        </Button>
      </div>
    </div>
  );
}
