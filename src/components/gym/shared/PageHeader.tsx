'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Plus, LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  icon: LucideIcon;
  backHref?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  icon: Icon,
  backHref = '/app/gym',
  onRefresh,
  isLoading,
  primaryAction,
  secondaryAction,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Icon className="h-6 w-6 text-blue-600" />
            </div>
            {title}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {breadcrumb || `Gimnasio / ${title}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {secondaryAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.icon && <secondaryAction.icon className="h-4 w-4 mr-2" />}
            {secondaryAction.label}
          </Button>
        )}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        )}
        {primaryAction && (
          <Button
            size="sm"
            onClick={primaryAction.onClick}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {primaryAction.icon ? (
              <primaryAction.icon className="h-4 w-4 mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
