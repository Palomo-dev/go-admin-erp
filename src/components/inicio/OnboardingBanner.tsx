'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  Building2,
  Users,
  Package,
  Percent,
  UserPlus,
  CheckCircle2,
  Circle,
  X,
  Rocket,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { OnboardingStep } from './inicioService';

interface OnboardingBannerProps {
  steps: OnboardingStep[];
  organizacionCreatedAt: string | null;
}

const iconMap: Record<string, React.ElementType> = {
  Settings,
  Building2,
  Users,
  Package,
  Percent,
  UserPlus,
};

const DISMISS_KEY = 'onboarding_dismissed';

export function OnboardingBanner({ steps, organizacionCreatedAt }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden until check

  useEffect(() => {
    // Verificar si fue descartado manualmente
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      setDismissed(true);
      return;
    }

    // Verificar si la organización tiene más de 3 días
    if (organizacionCreatedAt) {
      const createdAt = new Date(organizacionCreatedAt);
      const now = new Date();
      const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) {
        setDismissed(true);
        return;
      }
    }

    // Verificar si todos los pasos están completados
    const allCompleted = steps.every((s) => s.completado);
    if (allCompleted) {
      setDismissed(true);
      return;
    }

    setDismissed(false);
  }, [steps, organizacionCreatedAt]);

  if (dismissed) return null;

  const completados = steps.filter((s) => s.completado).length;
  const progreso = Math.round((completados / steps.length) * 100);
  const siguientePaso = steps.find((s) => !s.completado);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setDismissed(true);
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/50 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
          <Rocket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Primeros pasos
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {completados}/{steps.length} completados
          </p>
        </div>
        <div className="flex-1 ml-4">
          <Progress value={progreso} className="h-2" />
        </div>
        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
          {progreso}%
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {steps.map((step) => {
          const Icon = iconMap[step.icono] || Circle;
          return (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-center gap-2 p-3 rounded-lg border transition-all text-left ${
                step.completado
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm'
              }`}
            >
              <div className="shrink-0">
                {step.completado ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-medium truncate ${
                    step.completado
                      ? 'text-green-700 dark:text-green-300 line-through'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {step.titulo}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {siguientePaso && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Siguiente: <span className="font-medium text-gray-700 dark:text-gray-300">{siguientePaso.titulo}</span> — {siguientePaso.descripcion}
          </p>
          <Link href={siguientePaso.href}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              Continuar
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
