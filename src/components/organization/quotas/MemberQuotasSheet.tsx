'use client';

/**
 * Sección «Cuotas» del detalle del miembro (F13), en hoja lateral desde
 * `/app/organizacion/miembros`: editor arriba, historial de cumplimiento
 * abajo. El foco vuelve al botón «Cuotas» de la fila al cerrar. Título y
 * descripción con color explícito (heredaban `text-foreground`: 1,18:1 en oscuro).
 */

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { describeError } from '@/lib/utils/errorMessage';
import { QuotaEditor } from './QuotaEditor';
import { QuotaHistory } from './QuotaHistory';
import { useMemberQuotas } from './useMemberQuotas';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { userId: string; name: string } | null;
}

export function MemberQuotasSheet({ open, onOpenChange, member }: Props) {
  const t = useTranslations('org.acceso.miembros');
  const currency = useOrgCurrency();
  const q = useMemberQuotas(open && member ? member.userId : null);
  const onCloseAutoFocus = useReturnFocus(open);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 overflow-y-auto bg-gray-50 p-0 dark:bg-gray-950 sm:max-w-xl">
        <SheetHeader className="border-b border-gray-200 bg-white px-6 py-4 text-left dark:border-gray-800 dark:bg-gray-900">
          <SheetTitle className="text-gray-900 dark:text-gray-100">{t('memberQuotasSheet.cuotas')} {member?.name ?? 'miembro'}</SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">{t('memberQuotasSheet.metasPeriodoCumplimientoReal')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-6">
          {q.error && (
            <Alert variant="destructive">
              <AlertTitle>{t('memberQuotasSheet.noPudieronCargarCuotas')}</AlertTitle>
              <AlertDescription>
                {q.error}{' '}
                <button type="button" onClick={() => q.reload()} className="underline">{t('memberQuotasSheet.reintentar')}</button>
              </AlertDescription>
            </Alert>
          )}
          {q.canManage && (
            <QuotaEditor
              today={q.today}
              currency={currency}
              busy={q.busy}
              onCreate={q.create}
              onCreated={() => toast({ title: t('memberQuotasSheet.cuotaGuardada') })}
            />
          )}
          <QuotaHistory
            rows={q.rows}
            loading={q.loading}
            canManage={q.canManage}
            busy={q.busy}
            onDelete={async (id) => {
              try {
                await q.remove(id);
                toast({ title: t('memberQuotasSheet.cuotaEliminada') });
              } catch (err) {
                toast({ title: t('memberQuotasSheet.noPudoEliminar'), description: describeError(err), variant: 'destructive' });
              }
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
