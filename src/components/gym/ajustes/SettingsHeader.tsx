'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw, Save, RotateCcw, ArrowLeft, Settings } from 'lucide-react';

interface SettingsHeaderProps {
  onSave: () => void;
  onReset: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  isSaving: boolean;
  hasChanges: boolean;
}

export function SettingsHeader({
  onSave,
  onReset,
  onRefresh,
  isLoading,
  isSaving,
  hasChanges,
}: SettingsHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/gym">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Settings className="h-6 w-6 text-blue-600" />
            </div>
            Ajustes
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gimnasio / Ajustes
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading || isSaving}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={isLoading || isSaving}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Restablecer
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Save className={`h-4 w-4 mr-2 ${isSaving ? 'animate-pulse' : ''}`} />
          {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  );
}
