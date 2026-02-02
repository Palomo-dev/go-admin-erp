'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  title: string;
  description: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <nav aria-label="Progreso">
      <ol className="flex items-center w-full">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center',
                !isLast && 'flex-1'
              )}
            >
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors',
                    isCompleted && 'bg-blue-600 border-blue-600 text-white',
                    isCurrent && 'border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20',
                    !isCompleted && !isCurrent && 'border-gray-300 dark:border-gray-600 text-gray-400'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step.id}</span>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isCurrent && 'text-blue-600 dark:text-blue-400',
                      isCompleted && 'text-gray-900 dark:text-white',
                      !isCompleted && !isCurrent && 'text-gray-400'
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                    {step.description}
                  </p>
                </div>
              </div>

              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-4 mt-[-2rem]',
                    isCompleted ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
