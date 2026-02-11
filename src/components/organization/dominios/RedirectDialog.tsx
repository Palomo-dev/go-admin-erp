'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { OrganizationDomain } from '@/lib/services/domainService';

interface RedirectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: OrganizationDomain | null;
  availableDomains: OrganizationDomain[];
  onSubmit: (redirectToDomainId: string | null, statusCode: number | null) => Promise<void>;
  isLoading?: boolean;
}

export function RedirectDialog({
  open,
  onOpenChange,
  domain,
  availableDomains,
  onSubmit,
  isLoading = false,
}: RedirectDialogProps) {
  const [redirectToDomainId, setRedirectToDomainId] = useState<string>('none');
  const [statusCode, setStatusCode] = useState<string>('301');

  useEffect(() => {
    if (domain) {
      setRedirectToDomainId(domain.redirect_to_domain_id || 'none');
      setStatusCode(domain.redirect_status_code?.toString() || '301');
    }
  }, [domain, open]);

  if (!domain) return null;

  const handleSubmit = async () => {
    const targetDomainId = redirectToDomainId === 'none' ? null : redirectToDomainId;
    const code = targetDomainId ? parseInt(statusCode) : null;
    await onSubmit(targetDomainId, code);
    onOpenChange(false);
  };

  // Filtrar dominios disponibles (excluir el dominio actual y dominios que ya redirigen)
  const filteredDomains = availableDomains.filter(
    d => d.id !== domain.id && d.status === 'verified' && !d.redirect_to_domain_id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="dark:text-white">
                Configurar Redirección
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                Redirigir <span className="font-semibold">{domain.host}</span> a otro dominio
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Dominio destino */}
          <div className="space-y-2">
            <Label htmlFor="redirectTo" className="dark:text-gray-200">
              Redirigir a
            </Label>
            <Select value={redirectToDomainId} onValueChange={setRedirectToDomainId}>
              <SelectTrigger id="redirectTo" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Selecciona un dominio" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="none" className="dark:text-white dark:focus:bg-gray-700">
                  Sin redirección
                </SelectItem>
                {filteredDomains.map((d) => (
                  <SelectItem 
                    key={d.id} 
                    value={d.id}
                    className="dark:text-white dark:focus:bg-gray-700"
                  >
                    {d.host} {d.is_primary && '(Principal)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredDomains.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No hay dominios verificados disponibles para redirección
              </p>
            )}
          </div>

          {/* Código de estado */}
          {redirectToDomainId !== 'none' && (
            <div className="space-y-2">
              <Label htmlFor="statusCode" className="dark:text-gray-200">
                Código de Estado HTTP
              </Label>
              <Select value={statusCode} onValueChange={setStatusCode}>
                <SelectTrigger id="statusCode" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="301" className="dark:text-white dark:focus:bg-gray-700">
                    301 - Redirección Permanente
                  </SelectItem>
                  <SelectItem value="302" className="dark:text-white dark:focus:bg-gray-700">
                    302 - Redirección Temporal
                  </SelectItem>
                  <SelectItem value="307" className="dark:text-white dark:focus:bg-gray-700">
                    307 - Redirección Temporal (preserva método)
                  </SelectItem>
                  <SelectItem value="308" className="dark:text-white dark:focus:bg-gray-700">
                    308 - Redirección Permanente (preserva método)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info */}
          {redirectToDomainId !== 'none' && (
            <Alert className="dark:bg-blue-900/20 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-sm dark:text-gray-300">
                <strong>301 (Permanente):</strong> Los motores de búsqueda actualizarán sus índices al nuevo dominio.
                <br />
                <strong>302 (Temporal):</strong> Los motores de búsqueda mantendrán el dominio original en sus índices.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
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
            {isLoading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RedirectDialog;
