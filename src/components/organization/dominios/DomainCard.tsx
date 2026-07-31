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
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('org.domains.card');
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
            {t('verified')}
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0">
            <Clock className="w-3 h-3 mr-1" />
            {t('pending')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
            <X className="w-3 h-3 mr-1" />
            {t('failed')}
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
          {t('subdomain')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
        {t('customDomain')}
      </Badge>
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-xl border p-4 sm:p-5 transition-all duration-200 hover:shadow-md",
      domain.is_primary 
        ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800" 
        : "border-gray-200 dark:border-gray-700",
      !domain.is_active && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className={cn(
            "p-2 rounded-lg shrink-0",
            domain.is_primary 
              ? "bg-blue-100 dark:bg-blue-900/30" 
              : "bg-gray-100 dark:bg-gray-700"
          )}>
            <Globe className={cn(
              "h-4 w-4 sm:h-5 sm:w-5",
              domain.is_primary 
                ? "text-blue-600 dark:text-blue-400" 
                : "text-gray-500 dark:text-gray-400"
            )} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate max-w-[180px] sm:max-w-none">
                {domain.host}
              </h3>
              {domain.is_primary && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('primaryDomain')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 flex-wrap">
              {getStatusBadge()}
              {getDomainTypeBadge()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
                {t('edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(domain)} className="dark:hover:bg-gray-700">
                <Copy className="h-4 w-4 mr-2" />
                {t('duplicate')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              {domain.status === 'pending' && domain.domain_type === 'custom_domain' && (
                <>
                  <DropdownMenuItem onClick={() => onShowDNS(domain)} className="dark:hover:bg-gray-700">
                    <Settings className="h-4 w-4 mr-2" />
                    {t('dnsInstructions')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onVerify(domain)} 
                    disabled={isVerifying}
                    className="dark:hover:bg-gray-700"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isVerifying && "animate-spin")} />
                    {t('verifyDomain')}
                  </DropdownMenuItem>
                </>
              )}
              {!domain.is_primary && domain.status === 'verified' && (
                <DropdownMenuItem onClick={() => onSetPrimary(domain)} className="dark:hover:bg-gray-700">
                  <Star className="h-4 w-4 mr-2" />
                  {t('setPrimary')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onConfigureRedirect(domain)} className="dark:hover:bg-gray-700">
                <ArrowRight className="h-4 w-4 mr-2" />
                {t('configureRedirect')}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onSyncVercel(domain)} 
                disabled={isSyncing}
                className="dark:hover:bg-gray-700"
              >
                <Zap className={cn("h-4 w-4 mr-2", isSyncing && "animate-pulse")} />
                {t('syncVercel')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuItem 
                onClick={() => onDelete(domain)}
                className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('deleteDomain')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info adicional */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
        {domain.verified_at && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{t('verifiedAt')}</span>
            <span className="text-gray-700 dark:text-gray-200 text-xs font-medium">
              {new Date(domain.verified_at).toLocaleDateString()}
            </span>
          </div>
        )}
        {domain.verification_attempts > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{t('verificationAttempts')}</span>
            <span className="text-gray-700 dark:text-gray-200 text-xs font-medium">{domain.verification_attempts}</span>
          </div>
        )}
        {domain.redirect_to_domain_id && (
          <div className="flex items-center gap-1 col-span-1 sm:col-span-2">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{t('redirect')}</span>
            <Badge variant="outline" className="text-xs h-5">
              {domain.redirect_status_code || 301}
            </Badge>
          </div>
        )}
        {domain.last_vercel_sync_at && (
          <div className="flex items-center gap-1 col-span-1 sm:col-span-2">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{t('lastVercelSync')}</span>
            <span className="text-gray-700 dark:text-gray-200 text-xs font-medium">
              {new Date(domain.last_vercel_sync_at).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Botón de visitar */}
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
        <a
          href={`https://${domain.host}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-xs sm:text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          {t('visitSite')}
        </a>
      </div>
    </div>
  );
}

export default DomainCard;
