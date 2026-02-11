'use client';

import { useState, useEffect, useCallback } from 'react';
import { Globe, Check, X, Loader2, AlertTriangle, Pencil, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';

interface SubdomainManagerProps {
  organizationId: number;
  currentSubdomain: string | null;
  onSubdomainChange: (newSubdomain: string) => void;
}

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function SubdomainManager({
  organizationId,
  currentSubdomain,
  onSubdomainChange,
}: SubdomainManagerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [subdomain, setSubdomain] = useState(currentSubdomain || '');
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincronizar con prop cuando cambia
  useEffect(() => {
    if (!isEditing) {
      setSubdomain(currentSubdomain || '');
    }
  }, [currentSubdomain, isEditing]);

  // Normalizar subdominio (misma lógica que CreateOrganizationForm)
  const normalizeSubdomain = (value: string): string => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') // Solo letras, números y guiones
      .replace(/^-+|-+$/g, '') // Remover guiones al inicio/final
      .substring(0, 30); // Máximo 30 caracteres
  };

  // Verificar disponibilidad del subdominio
  const checkAvailability = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setStatus('invalid');
      return;
    }

    // Si es el mismo que el actual, está disponible
    if (value === currentSubdomain) {
      setStatus('available');
      return;
    }

    setStatus('checking');

    try {
      // Verificar en tabla organizations
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('subdomain', value)
        .neq('id', organizationId)
        .maybeSingle();

      if (orgError) {
        console.error('Error verificando subdominio en organizations:', orgError);
        setStatus('idle');
        return;
      }

      if (orgData) {
        setStatus('taken');
        return;
      }

      // Verificar también en organization_domains
      const { data: domainData, error: domainError } = await supabase
        .from('organization_domains')
        .select('id')
        .eq('host', `${value}.goadmin.io`)
        .neq('organization_id', organizationId)
        .maybeSingle();

      if (domainError) {
        console.error('Error verificando subdominio en organization_domains:', domainError);
      }

      setStatus(domainData ? 'taken' : 'available');
    } catch (err) {
      console.error('Error verificando subdominio:', err);
      setStatus('idle');
    }
  }, [organizationId, currentSubdomain]);

  // Verificar con debounce
  useEffect(() => {
    if (!isEditing) return;

    const timer = setTimeout(() => {
      checkAvailability(subdomain);
    }, 500);

    return () => clearTimeout(timer);
  }, [subdomain, isEditing, checkAvailability]);

  // Manejar cambio de input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeSubdomain(e.target.value);
    setSubdomain(normalized);
    setError(null);
  };

  // Guardar cambios
  const handleSave = async () => {
    if (status !== 'available') {
      setError('El subdominio no está disponible');
      return;
    }

    if (subdomain.length < 3) {
      setError('El subdominio debe tener al menos 3 caracteres');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ 
          subdomain: subdomain,
          updated_at: new Date().toISOString()
        })
        .eq('id', organizationId);

      if (updateError) throw updateError;

      // Actualizar o crear en organization_domains
      const host = `${subdomain}.goadmin.io`;
      
      // Verificar si ya existe un registro
      const { data: existingDomain } = await supabase
        .from('organization_domains')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('domain_type', 'system_subdomain')
        .maybeSingle();

      if (existingDomain) {
        // Actualizar existente
        await supabase
          .from('organization_domains')
          .update({ 
            host,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDomain.id);
      } else {
        // Crear nuevo
        await supabase
          .from('organization_domains')
          .insert({
            organization_id: organizationId,
            host,
            domain_type: 'system_subdomain',
            status: 'verified',
            is_primary: true,
            is_active: true,
            verified_at: new Date().toISOString(),
          });
      }

      onSubdomainChange(subdomain);
      setIsEditing(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al guardar el subdominio';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Cancelar edición
  const handleCancel = () => {
    setSubdomain(currentSubdomain || '');
    setIsEditing(false);
    setError(null);
    setStatus('idle');
  };

  // Renderizar estado de disponibilidad
  const renderStatus = () => {
    if (!isEditing) return null;

    switch (status) {
      case 'checking':
        return (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Verificando...</span>
          </div>
        );
      case 'available':
        return (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span className="text-sm">¡Disponible!</span>
          </div>
        );
      case 'taken':
        return (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <X className="h-4 w-4" />
            <span className="text-sm">Ya está en uso</span>
          </div>
        );
      case 'invalid':
        return (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Mínimo 3 caracteres</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Subdominio del Sistema
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tu URL gratuita en goadmin.io
            </p>
          </div>
        </div>
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Gratuito
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="subdomain" className="text-gray-700 dark:text-gray-300">
            Subdominio
          </Label>
          <div className="mt-1 flex items-center gap-2">
            {isEditing ? (
              <div className="flex-1 flex items-center">
                <Input
                  id="subdomain"
                  value={subdomain}
                  onChange={handleChange}
                  placeholder="miempresa"
                  className={cn(
                    "rounded-r-none dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                    status === 'taken' && "border-red-500 focus:border-red-500",
                    status === 'available' && "border-green-500 focus:border-green-500"
                  )}
                  disabled={isSaving}
                />
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md text-gray-500 dark:text-gray-400 text-sm">
                  .goadmin.io
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center">
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-l-md text-gray-900 dark:text-white font-medium">
                  {currentSubdomain || 'No configurado'}
                </div>
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md text-gray-500 dark:text-gray-400 text-sm">
                  .goadmin.io
                </div>
              </div>
            )}

            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </Button>
            )}
          </div>

          {isEditing && (
            <div className="mt-2 flex items-center justify-between">
              {renderStatus()}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="dark:border-gray-600 dark:text-gray-300"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={status !== 'available' || isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      Guardar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {currentSubdomain && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Tu sitio web está disponible en:
            </p>
            <a
              href={`https://${currentSubdomain}.goadmin.io`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              https://{currentSubdomain}.goadmin.io
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default SubdomainManager;
