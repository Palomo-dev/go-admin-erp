'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { cn } from '@/utils/Utils';
interface Props {
  id?: string; value: string; onChange(value: string): void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean; className?: string; 'aria-label'?: string; 'aria-describedby'?: string;
}
/** Adaptador visual del select compartido; los catálogos y la validación siguen en sus motores. */
export function CrmSelectControl({ id, value, onChange, options, disabled, className, ...aria }: Props) {
  const empty = '__crm_control_empty__';
  return <Select value={value || empty} onValueChange={next => onChange(next === empty ? '' : next)} disabled={disabled}>
    <SelectTrigger id={id} {...aria} className={cn(CLASE_CAMPO, 'focus:ring-brand', className)}><SelectValue /></SelectTrigger>
    <SelectContent className="border-line bg-surface text-fg">{options.map(option => <SelectItem key={option.value || empty} disabled={option.disabled} value={option.value || empty} className="text-sm focus:bg-hover focus:text-fg">{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}
