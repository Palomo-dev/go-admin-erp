'use client';

import { cn } from '@/utils/Utils';
import type { ReactNode } from 'react';
import {
  Layout,
  AlignCenter,
  SplitSquareHorizontal,
  Minimize2,
  LayoutGrid,
  Check,
} from 'lucide-react';

export type HeaderLayout = 'default' | 'centered' | 'split' | 'minimal' | 'mega';

interface HeaderLayoutSelectorProps {
  currentLayout: string;
  onSelect: (layout: string) => void;
}

interface LayoutOption {
  id: HeaderLayout;
  name: string;
  description: string;
  icon: typeof Layout;
  renderMockup: () => ReactNode;
}

const layouts: LayoutOption[] = [
  {
    id: 'default',
    name: 'Clásico',
    description: 'Logo izquierda, menú centro, acciones derecha',
    icon: Layout,
    renderMockup: () => (
      <div className="flex h-10 items-center justify-between gap-1 rounded border border-gray-200 bg-white px-1.5 dark:border-gray-700 dark:bg-gray-900">
        <div className="h-3 w-6 rounded-sm bg-blue-500" />
        <div className="flex flex-1 justify-center gap-1">
          <div className="h-1.5 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
        </div>
        <div className="flex gap-1">
          <div className="h-2 w-2 rounded-full bg-gray-500 dark:bg-gray-400" />
          <div className="h-2 w-2 rounded-full bg-gray-500 dark:bg-gray-400" />
        </div>
      </div>
    ),
  },
  {
    id: 'centered',
    name: 'Logo Centrado',
    description: 'Logo centro arriba, menú abajo en barra',
    icon: AlignCenter,
    renderMockup: () => (
      <div className="flex flex-col gap-1">
        <div className="flex h-5 items-center justify-center rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="h-2 w-8 rounded-sm bg-blue-500" />
        </div>
        <div className="flex h-4 items-center justify-center gap-1 rounded border border-gray-200 bg-white px-1.5 dark:border-gray-700 dark:bg-gray-900">
          <div className="h-1.5 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
        </div>
      </div>
    ),
  },
  {
    id: 'split',
    name: 'Split',
    description: 'Logo izq, menú dividido izq/der, CTA derecha',
    icon: SplitSquareHorizontal,
    renderMockup: () => (
      <div className="flex h-10 items-center gap-1 rounded border border-gray-200 bg-white px-1.5 dark:border-gray-700 dark:bg-gray-900">
        <div className="h-3 w-5 rounded-sm bg-blue-500" />
        <div className="flex gap-1">
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
        </div>
        <div className="flex flex-1 justify-end gap-1">
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
        </div>
        <div className="h-3 w-5 rounded bg-green-500" />
      </div>
    ),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Solo logo + hamburguesa, nav en drawer',
    icon: Minimize2,
    renderMockup: () => (
      <div className="flex h-10 items-center justify-between rounded border border-gray-200 bg-white px-1.5 dark:border-gray-700 dark:bg-gray-900">
        <div className="h-3 w-6 rounded-sm bg-blue-500" />
        <div className="flex flex-col gap-[2px]">
          <div className="h-[2px] w-3 rounded-full bg-gray-600 dark:bg-gray-300" />
          <div className="h-[2px] w-3 rounded-full bg-gray-600 dark:bg-gray-300" />
          <div className="h-[2px] w-3 rounded-full bg-gray-600 dark:bg-gray-300" />
        </div>
      </div>
    ),
  },
  {
    id: 'mega',
    name: 'Mega Menu',
    description: 'Logo izq, barra menú abajo con mega-dropdown',
    icon: LayoutGrid,
    renderMockup: () => (
      <div className="flex flex-col gap-1">
        <div className="flex h-5 items-center rounded border border-gray-200 bg-white px-1.5 dark:border-gray-700 dark:bg-gray-900">
          <div className="h-2.5 w-6 rounded-sm bg-blue-500" />
        </div>
        <div className="flex h-4 items-center gap-1 rounded border border-gray-200 bg-white px-1.5 dark:border-gray-700 dark:bg-gray-900">
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="h-1.5 w-3 rounded-full bg-gray-400 dark:bg-gray-500" />
        </div>
      </div>
    ),
  },
];

export default function HeaderLayoutSelector({
  currentLayout,
  onSelect,
}: HeaderLayoutSelectorProps) {
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
