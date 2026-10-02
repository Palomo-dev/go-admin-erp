'use client';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAutomationText } from './useAutomationText';
interface Props { open:boolean; onOpenChange(open:boolean):void; title:string; description:string; confirmLabel:string; variant?:string; loading:boolean; onConfirm():Promise<void>; onCloseAutoFocus(event:Event):void }
/** La confirmación se conserva abierta si el servidor rechaza el borrado. */
export function RuleDeleteDialog({open,onOpenChange,title,description,confirmLabel,loading,onConfirm,onCloseAutoFocus}:Props) {
  const tr=useAutomationText();
  const confirm=async()=>{ try { await onConfirm(); onOpenChange(false); } catch { /* El padre presenta el error real y conserva el contexto. */ } };
  return <AlertDialog open={open} onOpenChange={v=>{if(!loading)onOpenChange(v);}}><AlertDialogContent className="bg-surface" onCloseAutoFocus={onCloseAutoFocus}><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={loading} onClick={()=>onOpenChange(false)}>{tr('Cancelar')}</Button><Button variant="destructive" disabled={loading} onClick={()=>void confirm()}>{loading?tr('Guardando…'):confirmLabel}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
