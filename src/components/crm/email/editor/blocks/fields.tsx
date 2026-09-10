'use client';

import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; type?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm dark:bg-gray-800 dark:text-gray-100" />
      {hint ? <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-sm dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2563eb'} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-transparent dark:border-gray-600" aria-label={label} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-xs dark:bg-gray-800 dark:text-gray-100" />
      </div>
    </div>
  );
}

export function TextAreaField({ label, value, onChange, rows = 4, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="text-sm dark:bg-gray-800 dark:text-gray-100" />
      {hint ? <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between py-1">
      <Label htmlFor={id} className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-8 text-sm dark:bg-gray-800 dark:text-gray-100" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export const ALIGN_OPTIONS = [
  { value: 'left' as const, label: 'Izquierda' },
  { value: 'center' as const, label: 'Centro' },
  { value: 'right' as const, label: 'Derecha' },
];
