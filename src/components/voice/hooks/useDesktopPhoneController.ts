'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { aE164 } from '@/lib/utils/telefono';
import { OPEN_SOFTPHONE_EVENT } from '../softphoneUi';
import { getDesktopBridge } from '@/lib/utils/desktop';
import { parsePhoneCommand, parsePhoneControl, type PhoneSnapshot, type PhoneControlSnapshot, type PhoneTransferValue } from '../../../../electron/src/shared/phoneProtocol';
import type { SoftphoneValue } from '../softphoneTypes';
import type { PhoneControlState, PhoneControlResult, PhoneTransferTarget, PhoneTransferMode } from '@/lib/services/crm/phoneConferenceTypes';

interface PhoneControls {
  phoneControl: PhoneControlState;
  setHold(held: boolean): Promise<PhoneControlResult>;
  transferCall(target: PhoneTransferTarget, mode: PhoneTransferMode): Promise<PhoneControlResult>;
  confirmTransfer(): Promise<PhoneControlResult>;
  cancelTransfer(): Promise<PhoneControlResult>;
}

/** El Device pertenece al provider principal; la ventana nativa solo despacha. */
export function useDesktopPhoneController(value: SoftphoneValue, organizationId: number | null) {
  const locale = useLocale();
  const router = useRouter();
  const current = useRef(value as SoftphoneValue & Partial<PhoneControls>); current.current = value;
  const scope = useRef('');
  const revision = useRef(0);
  const currentSnapshot = useRef<PhoneSnapshot | null>(null);
  useEffect(() => {
    const bridge = getDesktopBridge()?.phone;
    if (!bridge || !organizationId) return;
    currentSnapshot.current = null; scope.current = crypto.randomUUID(); revision.current = 0;
    const unsubscribe = bridge.onCommand(async raw => {
      let id = ''; let commandScope = ''; let replyControl: PhoneControlSnapshot | undefined;
      try {
        const command = parsePhoneCommand(raw); id = command.id; commandScope = command.scope;
        const state = currentSnapshot.current; const sp = current.current;
        if (!state || !sp.available || state.scope !== command.scope || state.revision !== command.revision) throw new Error('estado_desactualizado');
        switch (command.action) {
          case 'dial': {
            if (!['idle', 'ended'].includes(sp.callStatus)) throw new Error('accion_en_curso');
            const result = await sp.makeCall(String(command.value));
            if (!result.ok) throw new Error(result.message);
            break;
          }
          case 'mute': if (sp.callStatus !== 'connected' || (sp.phoneControl?.held && sp.phoneControl.phase !== 'consulting') || sp.phoneControl?.busy) throw new Error('estado_desactualizado'); sp.mute(Boolean(command.value)); break;
          case 'digits': if (sp.callStatus !== 'connected' || sp.phoneControl?.held || sp.phoneControl?.busy) throw new Error('estado_desactualizado'); sp.sendDigits(String(command.value)); break;
          case 'accept': if (!sp.hasIncoming) throw new Error('estado_desactualizado'); sp.acceptIncoming(); break;
          case 'reject': if (!sp.hasIncoming) throw new Error('estado_desactualizado'); sp.rejectIncoming(); break;
          case 'hangup': if (!sp.activeCall) throw new Error('estado_desactualizado'); sp.hangup(); break;
          case 'retry': if (['connecting', 'ringing', 'connected'].includes(sp.callStatus)) throw new Error('accion_en_curso'); sp.retry(); break;
          case 'hold': case 'transfer': case 'confirm_transfer': case 'cancel_transfer': {
            if (sp.callStatus !== 'connected' || !sp.phoneControl?.supported || sp.phoneControl.busy) throw new Error('estado_desactualizado');
            const target = command.value as PhoneTransferValue;
            const operation = command.action === 'hold' ? sp.setHold?.(Boolean(command.value))
              : command.action === 'transfer' ? sp.transferCall?.(target.target, target.mode)
                : command.action === 'confirm_transfer' ? sp.confirmTransfer?.() : sp.cancelTransfer?.();
            if (!operation) throw new Error('accion_fallida');
            const result = await operation;
            if (!result.ok) throw new Error(result.message);
            replyControl = parsePhoneControl({ ...result.state, error: result.state.error?.slice(0, 400) ?? null });
            break;
          }
        }
        bridge.reply({ id, scope: commandScope, ok: true, ...(replyControl ? { control: replyControl } : {}) });
      } catch (error) { bridge.reply({ id, scope: commandScope, ok: false, error: (error instanceof Error ? error.message : 'accion_fallida').slice(0, 400) }); }
    });
    const missed = (event: Event) => {
      const detail = (event as CustomEvent<{ number?: string; displayName?: string | null }>).detail;
      const number = typeof detail?.number === 'string' ? aE164(detail.number) : null;
      if (number && currentSnapshot.current) bridge.missed?.({ id: crypto.randomUUID(), scope: scope.current, number, displayName: typeof detail?.displayName === 'string' ? detail.displayName.slice(0, 200) : null });
    };
    window.addEventListener('go-admin:phone-missed', missed);
    const removeAction = bridge.onMissedAction?.(raw => {
      if (!raw || typeof raw !== 'object') return;
      const action = raw as { scope?: unknown; number?: unknown; action?: unknown };
      if (action.scope !== scope.current || typeof action.number !== 'string' || !/^\+[1-9][0-9]{6,14}$/.test(action.number) || aE164(action.number) !== action.number) return;
      if (action.action === 'callback') window.dispatchEvent(new CustomEvent(OPEN_SOFTPHONE_EVENT, { detail: { number: action.number } }));
      else if (action.action === 'create_lead') router.push(`/app/crm/leads?create=1&phone=${encodeURIComponent(action.number)}`);
    });
    return () => { window.removeEventListener('go-admin:phone-missed', missed); removeAction?.(); currentSnapshot.current = null; bridge.publish(null); unsubscribe(); };
  }, [organizationId, router]);
  useEffect(() => {
    const bridge = getDesktopBridge()?.phone;
    if (!bridge) return;
    if (!organizationId || !value.available || !scope.current) { currentSnapshot.current = null; bridge.publish(null); return; }
    const snapshot: PhoneSnapshot = {
      scope: scope.current, revision: ++revision.current, organizationId,
      deviceState: value.deviceState, reason: value.deviceReason?.slice(0, 400) ?? null,
      callStatus: value.callStatus, incoming: value.hasIncoming, muted: value.muted,
      recording: Boolean(value.activeCallRow?.recording_enabled),
      locale: ['es', 'en', 'fr', 'pt'].includes(locale) ? locale as 'es' | 'en' | 'fr' | 'pt' : 'es',
      call: value.activeCall ? { number: value.activeCall.number.slice(0, 80), displayName: value.activeCall.displayName?.slice(0, 200) ?? null, connectedAt: value.activeCall.connectedAt } : null,
    };
    const controls = value as SoftphoneValue & Partial<PhoneControls>;
    if (controls.phoneControl) snapshot.control = parsePhoneControl({ ...controls.phoneControl, error: controls.phoneControl.error?.slice(0, 400) ?? null });
    currentSnapshot.current = snapshot; bridge.publish(snapshot);
  }, [value, organizationId, locale]);
}
