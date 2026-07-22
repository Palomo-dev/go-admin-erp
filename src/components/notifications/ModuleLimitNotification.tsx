'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  Sparkles,
  X,
  ArrowUpRight,
  LayoutGrid,
} from 'lucide-react';
import { useActiveModules } from '@/hooks/useActiveModules';

interface ModuleLimitNotificationProps {
  organizationId?: number;
  onDismiss?: () => void;
  showUpgrade?: boolean;
}

export default function ModuleLimitNotification({
  organizationId,
  onDismiss,
  showUpgrade = true,
}: ModuleLimitNotificationProps) {
  const [dismissed, setDismissed] = useState(false);
  const [autoHidden, setAutoHidden] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { organizationStatus, activeModules, loading } = useActiveModules(organizationId);

  useEffect(() => {
    // Verificar si ya fue cerrada hoy (persiste hasta el día siguiente)
    const dismissedKey = `module-limit-dismissed-${organizationId}`;
    const dismissedDate = localStorage.getItem(dismissedKey);
    const today = new Date().toDateString();
    if (dismissedDate === today) {
      setDismissed(true);
    }
  }, [organizationId]);

  // Auto-ocultar a los 15s si no hay interacción (hover) con la notificación
  useEffect(() => {
    if (loading || dismissed || autoHidden || isHovered || !organizationStatus || !organizationStatus.plan) {
      return;
    }

    const hasAvailableModules = organizationStatus.available_modules && organizationStatus.available_modules.length > 0;
    if (!hasAvailableModules) return;

    const usagePercentage = organizationStatus.plan.max_modules > 0
      ? (organizationStatus.active_modules_count / organizationStatus.plan.max_modules) * 100
      : 0;
    if (usagePercentage < 80) return;

    const timer = setTimeout(() => setAutoHidden(true), 15000);
    return () => clearTimeout(timer);
  }, [loading, dismissed, autoHidden, isHovered, organizationStatus]);

  const handleDismiss = () => {
    setDismissed(true);
    if (organizationId) {
      const dismissedKey = `module-limit-dismissed-${organizationId}`;
      localStorage.setItem(dismissedKey, new Date().toDateString());
    }
    onDismiss?.();
  };

  if (loading || dismissed || autoHidden || !organizationStatus || !organizationStatus.plan) {
    return null;
  }

  // Usar conteo total (incluyendo core) vs max_modules (que también incluye core)
  const totalActiveCount = organizationStatus.active_modules_count;
  const maxModules = organizationStatus.plan.max_modules;
  const hasAvailableModules = organizationStatus.available_modules && organizationStatus.available_modules.length > 0;
  const usagePercentage = maxModules > 0 ? (totalActiveCount / maxModules) * 100 : 0;

  // No mostrar si todos los módulos disponibles ya están activos
  if (!hasAvailableModules) {
    return null;
  }

  // Solo mostrar si está cerca del límite (80%) o lo ha alcanzado
  const shouldShow = usagePercentage >= 80;

  if (!shouldShow) {
    return null;
  }

  const isAtLimit = totalActiveCount >= maxModules;

  // Módulos pagados activos, obtenidos dinámicamente desde la tabla `modules` (is_core)
  const activePaidModules = activeModules.filter((m) => !m.is_core);

  const accent = isAtLimit
    ? {
        ring: 'ring-red-100 dark:ring-red-900/30',
        border: 'border-red-200 dark:border-red-900/50',
        iconBg: 'bg-red-100 dark:bg-red-900/40',
        icon: 'text-red-600 dark:text-red-400',
        title: 'text-red-900 dark:text-red-200',
        text: 'text-red-700 dark:text-red-300/90',
        progress: 'bg-red-500',
        cta: 'bg-red-600 hover:bg-red-700',
      }
    : {
        ring: 'ring-amber-100 dark:ring-amber-900/30',
        border: 'border-amber-200 dark:border-amber-900/50',
        iconBg: 'bg-amber-100 dark:bg-amber-900/40',
        icon: 'text-amber-600 dark:text-amber-400',
        title: 'text-amber-900 dark:text-amber-200',
        text: 'text-amber-700 dark:text-amber-300/90',
        progress: 'bg-amber-500',
        cta: 'bg-amber-600 hover:bg-amber-700',
      };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[22rem] animate-in slide-in-from-bottom-2 fade-in duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`rounded-xl border ${accent.border} bg-white dark:bg-gray-900 shadow-xl ring-1 ${accent.ring} overflow-hidden`}
      >
        <div className="flex items-start gap-3 p-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accent.iconBg}`}>
            {isAtLimit ? (
              <AlertTriangle className={`h-4.5 w-4.5 ${accent.icon}`} />
            ) : (
              <LayoutGrid className={`h-4.5 w-4.5 ${accent.icon}`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`text-sm font-semibold leading-tight ${accent.title}`}>
                {isAtLimit ? 'Límite de módulos alcanzado' : 'Cerca del límite de módulos'}
              </h3>
              <button
                onClick={handleDismiss}
                className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className={`mt-1 text-xs leading-relaxed ${accent.text}`}>
              Plan <span className="font-medium">{organizationStatus.plan.name}</span> ·{' '}
              {totalActiveCount} de {maxModules} módulos en uso
              {activePaidModules.length > 0 && (
                <span className="text-gray-400 dark:text-gray-500"> ({activePaidModules.length} adicionales)</span>
              )}
            </p>

            <div className="mt-3 space-y-1.5">
              <Progress
                value={Math.min(usagePercentage, 100)}
                className="h-1.5 bg-gray-100 dark:bg-gray-800"
                indicatorClassName={accent.progress}
              />
              <div className="flex justify-between text-[11px] text-gray-400 dark:text-gray-500">
                <span>{totalActiveCount} activos</span>
                <span>{Math.max(maxModules - totalActiveCount, 0)} disponibles</span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Link href="/app/organizacion/modulos" className="flex-1">
                <Button variant="outline" size="sm" className="h-7 w-full text-xs">
                  Ver módulos
                </Button>
              </Link>
              {showUpgrade && (
                <Link href="/app/plan" className="flex-1">
                  <Button size="sm" className={`h-7 w-full text-xs text-white ${accent.cta}`}>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Mejorar plan
                    <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook para usar la notificación en cualquier componente
export function useModuleLimitNotification(organizationId?: number) {
  const [showNotification, setShowNotification] = useState(false);
  const { organizationStatus, loading } = useActiveModules(organizationId);

  useEffect(() => {
    if (loading || !organizationStatus || !organizationStatus.plan) return;

    // No mostrar si todos los módulos disponibles ya están activos
    const hasAvailableModules = organizationStatus.available_modules && organizationStatus.available_modules.length > 0;
    if (!hasAvailableModules) {
      setShowNotification(false);
      return;
    }

    const activeCount = organizationStatus.active_modules_count;
    const maxModules = organizationStatus.plan.max_modules;
    const usagePercentage = maxModules > 0 ? (activeCount / maxModules) * 100 : 0;

    // Mostrar notificación si está cerca del límite
    setShowNotification(usagePercentage >= 80);
  }, [organizationStatus, loading]);

  return {
    showNotification,
    setShowNotification,
    organizationStatus
  };
}
