'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Hotel, ShoppingCart, Dumbbell, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { INDUSTRY_PRESETS, SEVERITY_OPTIONS } from './types';
import type { RuleFormData } from './types';

interface ImportPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (presets: RuleFormData[]) => Promise<{ success: number; failed: number }>;
}

const industries = [
  { key: 'retail', label: 'Retail / Comercio', icon: ShoppingCart, description: 'Stock, caja, productos agotados' },
  { key: 'hotel', label: 'Hotel / PMS', icon: Hotel, description: 'Overbooking, no-shows, housekeeping' },
  { key: 'gym', label: 'Gimnasio', icon: Dumbbell, description: 'Membresías, pagos fallidos' },
] as const;

export function ImportPresetDialog({ open, onOpenChange, onImport }: ImportPresetDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const presets = selected ? INDUSTRY_PRESETS[selected] || [] : [];

  const handleImport = async () => {
    if (!selected || presets.length === 0) return;
    setIsImporting(true);
    const res = await onImport(presets);
    setResult(res);
    setIsImporting(false);
  };

  const handleClose = () => {
    setSelected(null);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Download className="h-5 w-5 text-blue-500" />
            Importar Reglas Predefinidas
          </DialogTitle>
          <DialogDescription>
            Selecciona una industria para importar reglas de alerta preconfiguradas.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {result.success} reglas importadas
            </p>
            {result.failed > 0 && (
              <p className="text-sm text-red-500 mt-1">{result.failed} fallaron</p>
            )}
            <Button onClick={handleClose} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
              Cerrar
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              {/* Selector de industria */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {industries.map((ind) => {
                  const Icon = ind.icon;
                  return (
                    <button
                      key={ind.key}
                      onClick={() => { setSelected(ind.key); setResult(null); }}
                      className={cn(
                        'p-3 rounded-lg border-2 text-left transition-all',
                        selected === ind.key
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                      )}
                    >
                      <Icon className={cn('h-5 w-5 mb-1', selected === ind.key ? 'text-blue-500' : 'text-gray-400')} />
                      <p className="text-xs font-medium text-gray-900 dark:text-white">{ind.label}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{ind.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Preview de reglas */}
              {presets.length > 0 && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {presets.length} reglas a importar
                  </p>
                  {presets.map((p, i) => {
                    const sev = SEVERITY_OPTIONS.find((s) => s.value === p.severity);
                    return (
                      <div key={i} className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                          <Badge className={cn('text-[10px] px-1.5 py-0', sev?.color)}>{sev?.label}</Badge>
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 font-mono line-clamp-1">
                          {p.sql_condition}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {p.channels.map((ch) => (
                            <Badge key={ch} variant="secondary" className="text-[9px] px-1 py-0">{ch}</Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isImporting}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={!selected || presets.length === 0 || isImporting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Importar {presets.length} Reglas
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
