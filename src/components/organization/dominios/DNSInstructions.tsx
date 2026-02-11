'use client';

import { Copy, Check, AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { OrganizationDomain } from '@/lib/services/domainService';

interface DNSInstructionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: OrganizationDomain | null;
  onVerify: () => void;
  isVerifying?: boolean;
}

export function DNSInstructions({
  open,
  onOpenChange,
  domain,
  onVerify,
  isVerifying = false,
}: DNSInstructionsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!domain) return null;

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, field)}
      className="h-8 px-2 dark:hover:bg-gray-700"
    >
      {copiedField === field ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-gray-500" />
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Instrucciones de Verificación DNS
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Configura los siguientes registros DNS en tu proveedor de dominio para verificar{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{domain.host}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Estado actual */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <span className="text-sm text-gray-600 dark:text-gray-400">Estado actual:</span>
            <Badge 
              className={
                domain.status === 'verified' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : domain.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }
            >
              {domain.status === 'verified' ? 'Verificado' : domain.status === 'pending' ? 'Pendiente' : 'Fallido'}
            </Badge>
          </div>

          {/* Tipo de verificación */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">
              Método de Verificación: {domain.verification_type || 'TXT'}
            </h4>
            
            <Alert className="dark:bg-blue-900/20 dark:border-blue-800">
              <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-sm dark:text-gray-300">
                Agrega un registro <strong>{domain.verification_type || 'TXT'}</strong> en la configuración DNS de tu dominio.
              </AlertDescription>
            </Alert>
          </div>

          {/* Registro DNS */}
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
              {/* Host/Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Host / Name
                  </span>
                  <CopyButton text={domain.verification_record || ''} field="record" />
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white break-all">
                  {domain.verification_record || '_go-admin-challenge.' + domain.host}
                </code>
              </div>

              {/* Type */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Tipo
                  </span>
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                  {domain.verification_type || 'TXT'}
                </code>
              </div>

              {/* Value */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Valor
                  </span>
                  <CopyButton text={domain.verification_value || domain.verification_token || ''} field="value" />
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white break-all">
                  {domain.verification_value || domain.verification_token || 'No disponible'}
                </code>
              </div>

              {/* TTL */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    TTL (Time To Live)
                  </span>
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                  3600 (o el mínimo permitido por tu proveedor)
                </code>
              </div>
            </div>
          </div>

          {/* Configuración CNAME para el dominio */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">
              Configuración del Dominio (CNAME)
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Además del registro de verificación, configura un registro CNAME para que tu dominio apunte a nuestros servidores:
            </p>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Host / Name
                  </span>
                  <CopyButton text={domain.host.split('.')[0] === 'www' ? 'www' : '@'} field="cname-host" />
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                  {domain.host.startsWith('www.') ? 'www' : '@'}
                </code>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Tipo
                  </span>
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                  CNAME
                </code>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Valor / Target
                  </span>
                  <CopyButton text="cname.vercel-dns.com" field="cname-value" />
                </div>
                <code className="block w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                  cname.vercel-dns.com
                </code>
              </div>
            </div>
          </div>

          {/* Intentos de verificación */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Intentos de verificación: <strong>{domain.verification_attempts}</strong>
            {domain.last_verification_at && (
              <span className="ml-2">
                (Último intento: {new Date(domain.last_verification_at).toLocaleString('es-ES')})
              </span>
            )}
          </div>

          {/* Notas */}
          <Alert className="dark:bg-gray-900 dark:border-gray-700">
            <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <AlertDescription className="text-sm dark:text-gray-300">
              <strong>Nota:</strong> Los cambios de DNS pueden tardar hasta 48 horas en propagarse, 
              aunque normalmente ocurre en minutos. Puedes verificar el estado de propagación usando 
              herramientas como{' '}
              <a 
                href="https://www.whatsmydns.net" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                whatsmydns.net
              </a>
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cerrar
          </Button>
          <Button
            onClick={onVerify}
            disabled={isVerifying || domain.status === 'verified'}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isVerifying ? 'Verificando...' : 'Verificar Ahora'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DNSInstructions;
