'use client';

import { useState, useEffect } from 'react';
import { Globe, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OrganizationDomain, DomainType, CreateDomainInput, UpdateDomainInput } from '@/lib/services/domainService';

interface DomainFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain?: OrganizationDomain | null;
  organizationId: number;
  onSubmit: (data: CreateDomainInput | UpdateDomainInput) => Promise<void>;
  isLoading?: boolean;
}

export function DomainForm({
  open,
  onOpenChange,
  domain,
  organizationId,
  onSubmit,
  isLoading = false,
}: DomainFormProps) {
  const [host, setHost] = useState('');
  const [domainType, setDomainType] = useState<DomainType>('custom_domain');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!domain;

  useEffect(() => {
    if (domain) {
      setHost(domain.host);
      setDomainType(domain.domain_type);
      setIsPrimary(domain.is_primary);
      setIsActive(domain.is_active);
    } else {
      setHost('');
      setDomainType('custom_domain');
      setIsPrimary(false);
      setIsActive(true);
    }
    setError(null);
  }, [domain, open]);

  const validateHost = (value: string): boolean => {
    // Validar formato de dominio básico
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!host.trim()) {
      setError('El dominio es requerido');
      return;
    }

    if (!validateHost(host.trim())) {
      setError('Formato de dominio inválido. Ejemplo: midominio.com o app.midominio.com');
      return;
    }

    try {
      if (isEditing) {
        await onSubmit({
          host: host.trim(),
          domain_type: domainType,
          is_primary: isPrimary,
          is_active: isActive,
        } as UpdateDomainInput);
      } else {
        await onSubmit({
          organization_id: organizationId,
          host: host.trim(),
          domain_type: domainType,
          is_primary: isPrimary,
          is_active: isActive,
        } as CreateDomainInput);
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Error al guardar el dominio');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="dark:text-white">
                {isEditing ? 'Editar Dominio' : 'Nuevo Dominio'}
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {isEditing 
                  ? 'Modifica la configuración del dominio' 
                  : 'Registra un nuevo dominio para tu organización'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Tipo de dominio */}
          <div className="space-y-2">
            <Label htmlFor="domainType" className="dark:text-gray-200">
              Tipo de Dominio
            </Label>
            <Select
              value={domainType}
              onValueChange={(value: DomainType) => setDomainType(value)}
              disabled={isEditing}
            >
              <SelectTrigger id="domainType" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Selecciona el tipo" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="subdomain" className="dark:text-white dark:focus:bg-gray-700">
                  Subdominio (*.goadmin.io)
                </SelectItem>
                <SelectItem value="custom_domain" className="dark:text-white dark:focus:bg-gray-700">
                  Dominio Personalizado
                </SelectItem>
              </SelectContent>
            </Select>
            {domainType === 'subdomain' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los subdominios se verifican automáticamente
              </p>
            )}
          </div>

          {/* Host */}
          <div className="space-y-2">
            <Label htmlFor="host" className="dark:text-gray-200">
              Dominio
            </Label>
            <div className="relative">
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value.toLowerCase())}
                placeholder={domainType === 'subdomain' ? 'miempresa.goadmin.io' : 'www.miempresa.com'}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
              />
            </div>
            {domainType === 'custom_domain' && (
              <Alert className="mt-2 dark:bg-blue-900/20 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-sm dark:text-gray-300">
                  Después de crear el dominio, deberás configurar los registros DNS para verificarlo.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Opciones */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isPrimary" className="dark:text-gray-200">
                  Dominio Principal
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Solo puede haber un dominio principal
                </p>
              </div>
              <Switch
                id="isPrimary"
                checked={isPrimary}
                onCheckedChange={setIsPrimary}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isActive" className="dark:text-gray-200">
                  Activo
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Los dominios inactivos no resolverán
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Dominio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DomainForm;
