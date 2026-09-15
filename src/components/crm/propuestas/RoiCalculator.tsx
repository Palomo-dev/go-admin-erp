'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { ROI_TEMPLATES, defaultInputs, formatRoiSummary } from '@/lib/services/crm/roiTemplates';
import type { RoiInputDef, RoiOutputDef } from '@/lib/services/crm/roiService';
import { roiApi } from './proposalApi';

/**
 * F10 — calculadora de ROI. Plantillas por vertical (integradas) o
 * calculadoras de la organización (`roi_calculators`); el cálculo lo hace el
 * servidor con el evaluador seguro (`POST /api/crm/roi`). El resultado se
 * inserta en la sección ROI de la propuesta.
 */
export interface RoiCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verticalSlug: string | null;
  currency: string;
  onApply: (result: { summary: string; outputs: Record<string, number> }) => void;
}

interface Option { key: string; label: string; inputs: RoiInputDef[]; outputs: RoiOutputDef[]; calculatorId?: string; template?: string }

export function RoiCalculator({ open, onOpenChange, verticalSlug, currency, onApply }: RoiCalculatorProps) {
  const onCloseAutoFocus = useReturnFocus(open);
  const [orgOptions, setOrgOptions] = useState<Option[]>([]);
  const builtin = useMemo<Option[]>(() => ROI_TEMPLATES.map((t) => ({ key: `tpl:${t.slug}`, label: t.name, inputs: t.inputs, outputs: t.outputs, template: t.slug })), []);
  const options = useMemo(() => [...orgOptions, ...builtin], [orgOptions, builtin]);
  const defaultKey = `tpl:${ROI_TEMPLATES.some((t) => t.slug === verticalSlug) ? verticalSlug : 'otros'}`;
  const [selected, setSelected] = useState(defaultKey);
  const option = options.find((o) => o.key === selected) ?? builtin[builtin.length - 1];
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ outputs: Record<string, number>; errors: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(defaultKey);
    setResult(null);
    setError(null);
    let cancelled = false;
    roiApi.templates().then((rows) => {
      if (cancelled) return;
      setOrgOptions(rows.map((r) => ({ key: `org:${r.id}`, label: r.name, inputs: r.inputs as RoiInputDef[], outputs: r.outputs as RoiOutputDef[], calculatorId: r.id })));
    }).catch(() => { /* sin calculadoras propias: quedan las integradas */ });
    return () => { cancelled = true; };
  }, [open, defaultKey]);

  useEffect(() => {
    const d = defaultInputs(option.inputs);
    setValues(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)])));
    setResult(null);
  }, [option]);

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const inputs: Record<string, number> = {};
      for (const def of option.inputs) {
        const n = Number(values[def.key]);
        if (!Number.isFinite(n)) { setError(`«${def.label}» debe ser un número.`); setBusy(false); document.getElementById(`roi-${def.key}`)?.focus(); return; }
        inputs[def.key] = n;
      }
      const r = await roiApi.calculate(option.calculatorId ? { calculator_id: option.calculatorId, inputs } : { template: option.template, inputs });
      setResult({ outputs: r.outputs, errors: r.errors ?? {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo calcular');
    } finally {
      setBusy(false);
    }
  };

  const summary = result ? formatRoiSummary(result.outputs, option.outputs, currency) : '';
  const errorList = result ? Object.entries(result.errors) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100"><Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />Calculadora de ROI</DialogTitle>
          <DialogDescription>Estima ahorro, retorno y periodo de recuperación con datos del cliente. El resultado se inserta en la propuesta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roi-template">Plantilla</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="roi-template" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.key} value={o.key}>{o.calculatorId ? `${o.label} (de la organización)` : o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {option.inputs.map((def) => (
              <div key={def.key} className="space-y-1">
                <Label htmlFor={`roi-${def.key}`} className="text-xs">{def.label}{def.required ? ' *' : ''}</Label>
                <Input id={`roi-${def.key}`} inputMode="decimal" value={values[def.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))} className="h-9" />
              </div>
            ))}
          </div>
          {error && <Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
          {result && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3" aria-live="polite">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">Resultado</p>
              <p className="whitespace-pre-line text-sm text-gray-800 dark:text-gray-100">{summary || 'Sin salidas calculables.'}</p>
              {errorList.length > 0 && (
                <ul className="mt-2 text-xs text-amber-800 dark:text-amber-200 list-disc pl-4">
                  {errorList.map(([k, v]) => <li key={k}>{k}: {v}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button type="button" variant="outline" onClick={calculate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Calculator className="h-4 w-4 mr-1.5" aria-hidden="true" />}Calcular
          </Button>
          <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!result || !summary} onClick={() => { if (result) { onApply({ summary, outputs: result.outputs }); onOpenChange(false); } }}>
            Usar en la propuesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
