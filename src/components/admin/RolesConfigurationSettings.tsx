'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Download, 
  Upload, 
  Shield,
  Info,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface RolesConfiguration {
  allowEditSystemPermissions: boolean;
  allowDuplicateSystemRoles: boolean;
  strictMode: boolean;
  inheritFromRole: boolean;
  precedenceRule: string;
}

interface RolesConfigurationSettingsProps {
  organizationId: number;
}

const DEFAULT_CONFIG: RolesConfiguration = {
  allowEditSystemPermissions: false,
  allowDuplicateSystemRoles: false,
  strictMode: true,
  inheritFromRole: true,
  precedenceRule: 'Admin > Cargo > Rol'
};

export default function RolesConfigurationSettings({ organizationId }: RolesConfigurationSettingsProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState<RolesConfiguration>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<RolesConfiguration>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, [organizationId]);

  useEffect(() => {
    const changed = JSON.stringify(config) !== JSON.stringify(originalConfig);
    setHasChanges(changed);
  }, [config, originalConfig]);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', 'roles_configuration')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data?.settings) {
        const loadedConfig = { ...DEFAULT_CONFIG, ...data.settings };
        setConfig(loadedConfig);
        setOriginalConfig(loadedConfig);
      } else {
        setConfig(DEFAULT_CONFIG);
        setOriginalConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);

      // Verificar si ya existe un registro
      const { data: existing } = await supabase
        .from('organization_settings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('key', 'roles_configuration')
        .single();

      if (existing) {
        // Actualizar
        const { error } = await supabase
          .from('organization_settings')
          .update({ 
            settings: config,
            updated_at: new Date().toISOString()
          })
          .eq('organization_id', organizationId)
          .eq('key', 'roles_configuration');

        if (error) throw error;
      } else {
        // Insertar
        const { error } = await supabase
          .from('organization_settings')
          .insert({
            organization_id: organizationId,
            key: 'roles_configuration',
            settings: config
          });

        if (error) throw error;
      }

      // Registrar en audit log
      await supabase
        .from('roles_audit_log')
        .insert({
          organization_id: organizationId,
          entity: 'configuration',
          entity_id: crypto.randomUUID(),
          action: 'update',
          user_id: (await supabase.auth.getUser()).data.user?.id,
          diff: {
            old: originalConfig,
            new: config
          }
        });

      setOriginalConfig(config);
      toast({
        title: 'Éxito',
        description: 'Configuración guardada correctamente'
      });
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const resetConfiguration = () => {
    setConfig(originalConfig);
  };

  const exportConfiguration = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roles-config-${organizationId}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exportado',
      description: 'Configuración exportada correctamente'
    });
  };

  const importConfiguration = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        
        // Validar que tenga las propiedades esperadas
        const validConfig = { ...DEFAULT_CONFIG, ...imported };
        setConfig(validConfig);
        
        toast({
          title: 'Importado',
          description: 'Configuración importada. Recuerda guardar los cambios.'
        });
      } catch (error) {
        console.error('Error importing configuration:', error);
        toast({
          title: 'Error',
          description: 'No se pudo importar la configuración',
          variant: 'destructive'
        });
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con acciones */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Configuración del Sistema de Permisos
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gestiona las políticas y comportamiento del sistema de roles y permisos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={importConfiguration}
            className="border-gray-300 dark:border-gray-600"
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportConfiguration}
            className="border-gray-300 dark:border-gray-600"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Alerta de cambios pendientes */}
      {hasChanges && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Tienes cambios sin guardar
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Recuerda guardar los cambios para que se apliquen en el sistema
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetConfiguration}
                  className="border-amber-300 dark:border-amber-700"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Descartar
                </Button>
                <Button
                  size="sm"
                  onClick={saveConfiguration}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regla de Precedencia */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-gray-900 dark:text-white">
              Regla de Precedencia
            </CardTitle>
          </div>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Orden de prioridad en la evaluación de permisos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                {config.precedenceRule}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Los permisos de Admin tienen prioridad sobre Cargo, y Cargo sobre Rol
              </p>
            </div>
            <Badge variant="secondary" className="bg-blue-600 text-white">
              Fijo
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Políticas de Permisos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-gray-900 dark:text-white">
              Políticas de Permisos
            </CardTitle>
          </div>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Configura el comportamiento del sistema de permisos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Permitir edición de permisos del sistema */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex-1 space-y-1">
              <Label htmlFor="edit-system" className="text-base font-medium text-gray-900 dark:text-white">
                Permitir edición de permisos del sistema
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Permite modificar permisos marcados como del sistema
              </p>
            </div>
            <Switch
              id="edit-system"
              checked={config.allowEditSystemPermissions}
              onCheckedChange={(checked) => 
                setConfig({ ...config, allowEditSystemPermissions: checked })
              }
            />
          </div>

          {/* Permitir duplicar roles del sistema */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex-1 space-y-1">
              <Label htmlFor="duplicate-system" className="text-base font-medium text-gray-900 dark:text-white">
                Permitir duplicar roles del sistema
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Permite crear copias de roles marcados como del sistema
              </p>
            </div>
            <Switch
              id="duplicate-system"
              checked={config.allowDuplicateSystemRoles}
              onCheckedChange={(checked) => 
                setConfig({ ...config, allowDuplicateSystemRoles: checked })
              }
            />
          </div>

          {/* Modo estricto */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex-1 space-y-1">
              <Label htmlFor="strict-mode" className="text-base font-medium text-gray-900 dark:text-white">
                Modo estricto
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                En modo estricto, los permisos no definidos se deniegan automáticamente
              </p>
            </div>
            <Switch
              id="strict-mode"
              checked={config.strictMode}
              onCheckedChange={(checked) => 
                setConfig({ ...config, strictMode: checked })
              }
            />
          </div>

          {/* Herencia de rol */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex-1 space-y-1">
              <Label htmlFor="inherit-role" className="text-base font-medium text-gray-900 dark:text-white">
                Heredar permisos del rol
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Si un cargo no define un permiso, hereda el permiso del rol asignado
              </p>
            </div>
            <Switch
              id="inherit-role"
              checked={config.inheritFromRole}
              onCheckedChange={(checked) => 
                setConfig({ ...config, inheritFromRole: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Estado actual */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">
            Estado Actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${config.allowEditSystemPermissions ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <CheckCircle2 className={`h-5 w-5 ${config.allowEditSystemPermissions ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Edición de permisos del sistema
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {config.allowEditSystemPermissions ? 'Permitido' : 'Bloqueado'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${config.allowDuplicateSystemRoles ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <CheckCircle2 className={`h-5 w-5 ${config.allowDuplicateSystemRoles ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Duplicar roles del sistema
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {config.allowDuplicateSystemRoles ? 'Permitido' : 'Bloqueado'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${config.strictMode ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <Shield className={`h-5 w-5 ${config.strictMode ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Modo estricto
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {config.strictMode ? 'Activado' : 'Desactivado'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${config.inheritFromRole ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <CheckCircle2 className={`h-5 w-5 ${config.inheritFromRole ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Herencia de permisos
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {config.inheritFromRole ? 'Activada' : 'Desactivada'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botones de acción finales */}
      {!hasChanges && (
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={loadConfiguration}
            className="border-gray-300 dark:border-gray-600"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Recargar
          </Button>
        </div>
      )}
    </div>
  );
}
