'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Delete } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const keys = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
interface Props {
  value: string; disabled: boolean; dtmf?: boolean;
  diseno?: 'heredado' | 'kit'; sinNumero?: boolean;
  entreNumeroYTeclas?: ReactNode;
  onChange: (value: string) => void; onDigit: (value: string) => void; onSubmit: () => void;
}
/** Teclas de presentación compartidas; marcar y DTMF los ejecuta el controlador. */
export function PhoneDialPad({ value, disabled, dtmf = false, diseno = 'heredado', sinNumero = false, entreNumeroYTeclas, onChange, onDigit, onSubmit }: Props) {
  const t = useTranslations('phoneMirror');
  const press = (digit: string) => {
    if (disabled) return;
    if (dtmf) onDigit(digit);
    else onChange((value + digit).slice(0, 40));
  };
  return <div className="space-y-4" role="group" aria-label={t(dtmf ? 'dtmf' : 'dialpad')}>
    {!sinNumero && <div className={diseno === 'kit' ? 'flex h-[55px] items-center gap-2 rounded-[10px] border border-brand-action px-3.5' : 'flex items-center gap-2'}>
      <Input type="tel" inputMode="tel" maxLength={40} value={value} readOnly={dtmf} disabled={disabled}
        aria-label={t(dtmf ? 'sentDigits' : 'number')} placeholder={t('number')}
        className={diseno === 'kit' ? 'h-12 border-0 bg-transparent px-0 text-left font-sans text-xl font-medium shadow-none focus-visible:ring-0' : 'h-12 border-0 bg-transparent text-center font-mono text-[22px] shadow-none'}
        onChange={event => onChange(event.target.value.replace(/[^0-9+ ()-]/g, ''))}
        onKeyDown={event => {
          if (dtmf && /^[0-9*#]$/.test(event.key)) { event.preventDefault(); press(event.key); }
          else if (event.key === 'Enter' && !dtmf) { event.preventDefault(); onSubmit(); }
        }} />
      {!dtmf && <Button variant="ghost" size="icon" disabled={disabled || !value} aria-label={t('erase')}
        onClick={() => onChange(value.slice(0, -1))}><Delete size={18} strokeWidth={1.5} /></Button>}
    </div>}
    {entreNumeroYTeclas}
    <div className={diseno === 'kit' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-3 gap-3'}>
      {keys.map(([digit, letters]) => <Button key={digit} variant="outline" disabled={disabled}
        className={diseno === 'kit' ? 'h-[52px] flex-col gap-0 rounded-xl border-0 bg-subtle font-sans text-[22px] font-semibold leading-7 text-fg shadow-none active:bg-brand-tint hover:bg-brand-tint' : 'h-16 flex-col gap-0 rounded-xl border-border bg-muted/30 font-mono text-2xl font-medium'}
        aria-label={t(dtmf ? 'sendDigit' : 'key', { digit })} onClick={() => press(digit)}
        onContextMenu={event => { if (!dtmf && digit === '0') { event.preventDefault(); press('+'); } }}>
        <span>{digit}</span><span className={diseno === 'kit' ? 'h-4 font-sans text-xs font-medium leading-4 text-fg-secondary' : 'h-3 font-sans text-[10px] leading-3 text-muted-foreground'}>{letters}</span>
      </Button>)}
    </div>
    {!dtmf && diseno !== 'kit' && <Button variant="ghost" className="h-7 w-full" disabled={disabled} aria-label={t('plus')} onClick={() => press('+')}>+</Button>}
  </div>;
}
