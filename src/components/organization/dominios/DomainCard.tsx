'use client';

import { useState } from 'react';
import { 
  Globe, 
  Check, 
  X, 
  Clock, 
  Star, 
  MoreVertical,
  RefreshCw,
  Copy,
  Trash2,
  Edit,
  ExternalLink,
  ArrowRight,
  Settings,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OrganizationDomain } from '@/lib/services/domainService';
import { cn } from '@/utils/Utils';

interface DomainCardProps {
  domain: OrganizationDomain;
  onEdit: (domain: OrganizationDomain) => void;
  onDelete: (domain: OrganizationDomain) => void;
  onVerify: (domain: OrganizationDomain) => void;
  onSetPrimary: (domain: OrganizationDomain) => void;
  onToggleActive: (domain: OrganizationDomain, isActive: boolean) => void;
  onConfigureRedirect: (domain: OrganizationDomain) => void;
  onSyncVercel: (domain: OrganizationDomain) => void;
  onDuplicate: (domain: OrganizationDomain) => void;
  onShowDNS: (domain: OrganizationDomain) => void;
  isVerifying?: boolean;
  isSyncing?: boolean;
}

export function DomainCard({
  domain,
  onEdit,
  onDelete,
  onVerify,
  onSetPrimary,
  onToggleActive,
  onConfigureRedirect,
  onSyncVercel,
  onDuplicate,
  onShowDNS,
  isVerifying = false,
  isSyncing = false,
}: DomainCardProps) {
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  const handleToggleActive = async (checked: boolean) => {
    setIsTogglingActive(true);
    await onToggleActive(domain, checked);
    setIsTogglingActive(false);
  };

  const getStatusBadge = () => {
    switch (domain.status) {
      case 'verified':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
            <Check className="w-3 h-3 mr-1" />
            Verificado
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
            <X className="w-3 h-3 mr-1" />
            Fallido
          </Badge>
        );
      default:
        return null;
    }
  };

  const getDomainTypeBadge = () => {
    if (domain.domain_type === 'subdomain') {
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
          Subdominio
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
        Dominio Personalizado
      </Badge>
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-xl border p-4 transition-all duration-200 hover:shadow-md",
      domain.is_primary 
        ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800" 
        : "border-gray-200 dark:border-gray-700",
      !domain.is_active && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "p-2 rounded-lg",
            domain.is_primary 
              ? "bg-blue-100 dark:bg-blue-900/30" 
              : "bg-gray-100 dark:bg-gray-700"
          )}>
            <Globe className={cn(
              "h-5 w-5",
              domain.is_primary 
                ? "text-blue-600 dark:text-blue-400" 
                : "text-gray-500 dark:text-gray-400"
            )} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {domain.host}
              </h3>
              {domain.is_primary && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Dominio Principal</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {getStatusBadge()}
              {getDomainTypeBadge()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={domain.is_active}
            onCheckedChange={handleToggleActive}
            disabled={isTogglingActive}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 dark:bg-gray-800 dark:border-gray-700">
              <DropdownMenuItem onClick={() => onEdit(domain)} className="dark:hover:bg-gray-700">
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(domain)} className="dark:hover:bg-gray-700">
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              {domain.status === 'pending' && domain.domain_type === 'custom_domain' && (
                <>
                  <DropdownMenuItem onClick={() => onShowDNS(domain)} className="dark:hover:bg-gray-700">
                    <Settings className="h-4 w-4 mr-2" />
                    Ver Instrucciones DNS
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onVerify(domain)} 
                    disabled={isVerifying}
                    className="dark:hover:bg-gray-700"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isVerifying && "animate-spin")} />
                    Verificar Dominio
                  </DropdownMenuItem>
                </>
              )}
              {!domain.is_primary && domain.status === 'verified' && (
                <DropdownMenuItem onClick={() => onSetPrimary(domain)} className="dark:hover:bg-gray-700">
                  <Star className="h-4 w-4 mr-2" />
                  Marcar como Principal
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onConfigureRedirect(domain)} className="dark:hover:bg-gray-700">
                <ArrowRight className="h-4 w-4 mr-2" />
                Configurar Redirección
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onSyncVercel(domain)} 
                disabled={isSyncing}
                className="dark:hover:bg-gray-700"
              >
                <Zap className={cn("h-4 w-4 mr-2", isSyncing && "animate-pulse")} />
                Sincronizar con Vercel
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuItem 
                onClick={() => onDelete(domain)}
                className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info adicional */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Intentos verificación:</span>
          <span className="ml-2 text-gray-900 dark:text-white">{domain.verification_attempts}</span>
        </div>
        {domain.verified_at && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Verificado:</span>
            <span className="ml-2 text-gray-900 dark:text-white">
              {new Date(domain.verified_at).toLocaleDateString('es-ES')}
            </span>
          </div>
        )}
        {domain.redirect_to_domain_id && (
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Redirección:</span>
            <Badge variant="outline" className="ml-2">
              {domain.redirect_status_code || 301}
            </Badge>
          </div>
        )}
        {domain.last_vercel_sync_at && (
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Última sync Vercel:</span>
            <span className="ml-2 text-gray-900 dark:text-white">
              {new Date(domain.last_vercel_sync_at).toLocaleString('es-ES')}
            </span>
          </div>
        )}
      </div>

      {/* Botón de visitar */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <a
          href={`https://${domain.host}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          Visitar sitio
        </a>
      </div>
    </div>
  );
}

export default DomainCard;
