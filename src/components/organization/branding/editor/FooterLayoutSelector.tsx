'use client';

import { cn } from '@/utils/Utils';
import type { ReactNode } from 'react';
import {
  Layout,
  AlignCenter,
  SplitSquareHorizontal,
  Minimize2,
  PanelLeft,
  Check,
} from 'lucide-react';

export type FooterLayout = 'default' | 'three_columns' | 'centered' | 'minimal' | 'split';

interface FooterLayoutSelectorProps {
  currentLayout: string;
  onSelect: (layout: string) => void;
}

interface LayoutOption {
  id: FooterLayout;
  name: string;
  description: string;
  icon: typeof Layout;
  renderMockup: () => ReactNode;
}

const layouts: LayoutOption[] = [
  {
    id: 'default',
    name: 'Clásico',
    description: '4 columnas con logo, links, contacto y redes',
    icon: Layout,
    renderMockup: () => (
      <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid grid-cols-4 gap-1.5">
          <div className="space-y-1">
            <div className="h-2 w-8 rounded-sm bg-blue-500" />
            <div className="h-1 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="space-y-1">
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="space-y-1">
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="space-y-1">
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    ),
  },
  {
    id: 'three_columns',
    name: '3 Columnas',
    description: '3 columnas equilibradas con logo y enlaces',
    icon: PanelLeft,
    renderMockup: () => (
      <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid grid-cols-3 gap-1.5">
          <div className="space-y-1">
            <div className="h-2 w-8 rounded-sm bg-blue-500" />
            <div className="h-1 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="space-y-1">
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="space-y-1">
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    ),
  },
  {
    id: 'centered',
    name: 'Centrado',
    description: 'Logo y links centrados, estilo minimalista',
    icon: AlignCenter,
    renderMockup: () => (
      <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-2.5 w-10 rounded-sm bg-blue-500" />
          <div className="flex gap-2">
            <div className="h-1 w-5 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-5 rounded-full bg-gray-400 dark:bg-gray-500" />
          </div>
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    ),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Una sola fila con links esenciales',
    icon: Minimize2,
    renderMockup: () => (
      <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="h-2 w-6 rounded-sm bg-blue-500" />
          <div className="flex gap-1.5">
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
          </div>
          <div className="flex gap-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    ),
  },
  {
    id: 'split',
    name: 'Split',
    description: '2 columnas grandes: branding y navegación',
    icon: SplitSquareHorizontal,
    renderMockup: () => (
      <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="h-2.5 w-10 rounded-sm bg-blue-500" />
            <div className="h-1 w-8 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="flex gap-0.5 mt-1">
              <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="h-1 w-5 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="h-1 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-4 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    ),
  },
];

export default function FooterLayoutSelector({
  currentLayout,
  onSelect,
}: FooterLayoutSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {layouts.map((layout) => {
        const isSelected = currentLayout === layout.id;
        const Icon = layout.icon;
        return (
          <button
            key={layout.id}
            type="button"
            onClick={() => onSelect(layout.id)}
            className={cn(
              'group relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
              isSelected
                ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40'
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
            )}
          >
            {isSelected && (
              <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
            <div className="flex items-center gap-2">
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isSelected
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              />
              <span
                className={cn(
                  'text-sm font-medium',
                  isSelected
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-gray-900 dark:text-gray-100'
                )}
              >
                {layout.name}
              </span>
            </div>
            {layout.renderMockup()}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {layout.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
