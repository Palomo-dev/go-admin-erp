'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Settings, 
  Zap, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface SchedulerStatus {
  running: boolean;
  enabled: boolean;
  intervalMinutes: number;
  isExecuting: boolean;
}

interface AutomationResult {
  rules_evaluated: number;
  alerts_generated: number;
  errors: string[];
  execution_time: number;
}

export default function AlertAutomationControl() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [lastResult, setLastResult] = useState<AutomationResult | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [enabled, setEnabled] = useState(true);
  const { toast } = useToast();

  // Cargar estado inicial
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/alerts/automation');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
        setIntervalMinutes(data.data.intervalMinutes);
        setEnabled(data.data.enabled);
      }
    } catch (error) {
      console.error('Error cargando estado:', error);
    }
  };

  const executeAction = async (action: string, showToast = true) => {
    setLoading(true);
    try {
      const response = await fetch('/api/alerts/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (showToast) {
          toast({
            title: "✅ Éxito",
            description: data.message,
            variant: "default"
          });
        }
        
        if (data.data && action === 'test') {
          setLastResult(data.data);
        }
        
        await loadStatus();
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error) {
      toast({
        title: "❌ Error",
        description: error instanceof Error ? error.message : 'Error ejecutando acción',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async () => {
    setConfigLoading(true);
    try {
      const response = await fetch('/api/alerts/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervalMinutes,
          enabled,
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "✅ Configuración actualizada",
          description: "Los cambios se aplicaron correctamente",
          variant: "default"
        });
        
        setStatus(data.data);
      } else {
        throw new Error(data.error || 'Error actualizando configuración');
      }
    } catch (error) {
      toast({
        title: "❌ Error",
        description: error instanceof Error ? error.message : 'Error actualizando configuración',
        variant: "destructive"
      });
    } finally {
      setConfigLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) return <Badge variant="secondary">Cargando...</Badge>;
    
    if (status.isExecuting) {
      return <Badge variant="default" className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Ejecutando</Badge>;
    }
    
    if (status.running && status.enabled) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Activo</Badge>;
    }
    
    if (status.enabled && !status.running) {
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Habilitado</Badge>;
    }
    
    return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Inactivo</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Estado del Scheduler */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Control de Automatización de Alertas
          </CardTitle>
          <CardDescription>
            Gestiona la evaluación automática de reglas de alerta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Estado del Scheduler</p>
              <p className="text-xs text-muted-foreground">
                {status ? `Intervalo: cada ${status.intervalMinutes} minutos` : 'Cargando...'}
              </p>
            </div>
            {getStatusBadge()}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => executeAction('start')}
              disabled={loading || status?.running}
              size="sm"
              variant="default"
            >
              <Play className="w-4 h-4 mr-1" />
              Iniciar
            </Button>
            
            <Button
              onClick={() => executeAction('stop')}
              disabled={loading || !status?.running}
              size="sm"
              variant="outline"
            >
              <Square className="w-4 h-4 mr-1" />
              Detener
            </Button>
            
            <Button
              onClick={() => executeAction('test')}
              disabled={loading}
              size="sm"
              variant="secondary"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              Ejecutar Ahora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configuración */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuración
          </CardTitle>
          <CardDescription>
            Ajusta los parámetros del scheduler automático
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="interval">Intervalo (minutos)</Label>
              <Input
                id="interval"
                type="number"
                min="1"
                max="1440"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 15)}
                placeholder="15"
              />
              <p className="text-xs text-muted-foreground">
                Frecuencia de evaluación automática (1-1440 minutos)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="enabled">Habilitado</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
                <span className="text-sm text-muted-foreground">
                  {enabled ? 'Activado' : 'Desactivado'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Habilitar o deshabilitar la automatización
              </p>
            </div>
          </div>
          
          <Button
            onClick={updateConfig}
            disabled={configLoading}
            size="sm"
          >
            {configLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Settings className="w-4 h-4 mr-1" />}
            Guardar Configuración
          </Button>
        </CardContent>
      </Card>

      {/* Último Resultado */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Último Resultado de Ejecución</CardTitle>
            <CardDescription>
              Resultados de la última evaluación automática
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{lastResult.rules_evaluated}</div>
                <div className="text-xs text-muted-foreground">Reglas Evaluadas</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{lastResult.alerts_generated}</div>
                <div className="text-xs text-muted-foreground">Alertas Generadas</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{lastResult.errors.length}</div>
                <div className="text-xs text-muted-foreground">Errores</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{lastResult.execution_time}ms</div>
                <div className="text-xs text-muted-foreground">Tiempo Ejecución</div>
              </div>
            </div>
            
            {lastResult.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <h4 className="text-sm font-medium text-red-800 mb-2">Errores encontrados:</h4>
                <ul className="text-xs text-red-700 space-y-1">
                  {lastResult.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
