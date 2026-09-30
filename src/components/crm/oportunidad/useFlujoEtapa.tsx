'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { MoveStageDialog } from '@/components/crm/kit/MoveStageDialog';
import { WinDialog } from '@/components/crm/kit/WinDialog';
import { LoseDialog } from '@/components/crm/kit/LoseDialog';
import { dialogoParaEtapa, type RequisitoPendiente } from '@/components/crm/kit/moveStageDialogLogica';
import type { MotivoPerdida } from '@/components/crm/kit/loseDialogLogica';
import type { AccionGanar, DocumentoCreado } from '@/components/crm/kit/winDialogLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { OpportunityData } from '@/lib/services/crm/wonCloseSteps';
import { editarOportunidad, ganarOportunidad, leerMotivosPerdida, leerOportunidad, moverEtapa, perderOportunidad } from './apiOportunidades';
import { etapasDeOportunidad, interpretarRechazo, puedeEditarOportunidad, type EtapaApi, type OportunidadApi, type PermisosPantalla } from './oportunidadLogica';
import { crearDepsGanar, documentosDe, ejecutarPasosGanar, pasosElegidos } from './pasosGanar';

/**
 * Flujo ÚNICO de cambio de etapa (plan §4.8: «un solo useStageFlow para
 * tablero, drawer, detalle y lista»). Decide el diálogo por el destino:
 * ganada → `WinDialog`, perdida → `LoseDialog` (SIEMPRE a `is_lost`), abierta
 * → `MoveStageDialog` (confirmar · gate · sin permiso). Todas las escrituras
 * van por `PATCH …/stage`, `POST …/win` y `POST …/lose`; el servidor vuelve a
 * exigir `edit`/`close`/`override_gate` y el gate de la etapa.
 *
 * Arrastre en el kanban: `solicitar(…, 'arrastre')` devuelve `true` si la
 * pantalla debe mover la tarjeta YA (optimista); si el servidor rechaza, se
 * llama a `onRevertir` y se abre el diálogo que corresponde (gate, sin
 * permiso o datos de cierre).
 */
export type OportunidadFlujo = Pick<OportunidadApi, 'id' | 'name' | 'amount' | 'currency' | 'status' | 'stage_id' | 'salesperson_id' | 'created_by' | 'next_contact_at' | 'cliente_nombre'> & {
  pipeline_id?: string | null;
  win_data?: Record<string, unknown> | null;
};

type Modo =
  | { tipo: 'mover'; op: OportunidadFlujo; destino: string; pendientes: RequisitoPendiente[]; sinPermiso: boolean; permiso: 'mover' | 'cerrar' }
  | { tipo: 'ganar'; op: OportunidadFlujo; stageId?: string }
  | { tipo: 'perder'; op: OportunidadFlujo; stageId?: string };

export interface OpcionesFlujoEtapa {
  etapas: readonly EtapaApi[];
  permisos: PermisosPantalla;
  usuarioId: string | null;
  onHecho?: (id: string) => void;
  onRevertir?: (id: string) => void;
}

export function useFlujoEtapa({ etapas, permisos, usuarioId, onHecho, onRevertir }: OpcionesFlujoEtapa) {
  const t = useTranslations('crm.oportunidad.flujo');
  const { timezone } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const sucursal = useBranchOpcional()?.branchFilter ?? null;
  const [modo, setModo] = useState<Modo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<MotivoPerdida[] | null>(null);

  const cerrar = () => {
    setModo(null);
    setError(null);
  };
  const etapa = useCallback((id: string) => etapas.find((e) => e.id === id), [etapas]);
  const abrirPerder = (op: OportunidadFlujo, stageId?: string) => {
    setModo({ tipo: 'perder', op, stageId });
    if (motivos === null) void leerMotivosPerdida().then(setMotivos, () => setMotivos([]));
  };

  /** ¿Puede? Mover exige editar; ganar, perder o reabrir, además cerrar. */
  const permisoPara = (op: OportunidadFlujo, destino: EtapaApi | undefined): 'mover' | 'cerrar' | null => {
    if (!puedeEditarOportunidad(permisos, usuarioId, op)) return 'mover';
    const cierra = !!destino?.is_won || !!destino?.is_lost || (op.status !== null && op.status !== 'open');
    return cierra && !permisos.cerrar ? 'cerrar' : null;
  };

  const tratarRechazo = (op: OportunidadFlujo, destino: string, e: unknown) => {
    const r = interpretarRechazo(e);
    if (r.tipo === 'gate') setModo({ tipo: 'mover', op, destino, pendientes: r.pendientes, sinPermiso: false, permiso: 'mover' });
    else if (r.tipo === 'sinPermiso') setModo({ tipo: 'mover', op, destino, pendientes: [], sinPermiso: true, permiso: 'mover' });
    else if (r.tipo === 'cierre' && r.motivo === 'needs_won') setModo({ tipo: 'ganar', op, stageId: destino });
    else if (r.tipo === 'cierre') abrirPerder(op, destino);
    else toast({ title: r.tipo === 'conflicto' ? t('conflicto') : t('errorMover'), description: r.tipo === 'otro' ? r.mensaje : undefined, variant: 'destructive' });
  };

  const solicitar = (op: OportunidadFlujo, destinoId: string, via: 'arrastre' | 'menu' = 'menu'): boolean => {
    const destino = etapa(destinoId);
    const falta = permisoPara(op, destino);
    if (falta) {
      setModo({ tipo: 'mover', op, destino: destinoId, pendientes: [], sinPermiso: true, permiso: falta });
      return false;
    }
    const dialogo = dialogoParaEtapa(destino);
    if (dialogo === 'ganar') {
      setModo({ tipo: 'ganar', op, stageId: destinoId });
      return false;
    }
    if (dialogo === 'perder') {
      abrirPerder(op, destinoId);
      return false;
    }
    if (via === 'menu') {
      setModo({ tipo: 'mover', op, destino: destinoId, pendientes: [], sinPermiso: false, permiso: 'mover' });
      return false;
    }
    void moverEtapa(op.id, { stage_id: destinoId }).then(
      () => onHecho?.(op.id),
      (e: unknown) => {
        onRevertir?.(op.id);
        tratarRechazo(op, destinoId, e);
      },
    );
    return true;
  };

  const alMover = async (datos: { stageId: string; nextContactAt: string | null; override?: boolean }) => {
    if (modo?.tipo !== 'mover') return;
    const op = modo.op;
    const destino = etapa(datos.stageId);
    if (destino?.is_won || destino?.is_lost) {
      if (destino.is_won) setModo({ tipo: 'ganar', op, stageId: destino.id });
      else abrirPerder(op, destino.id);
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await moverEtapa(op.id, { stage_id: datos.stageId, ...(datos.override ? { override: true, override_reason: t('motivoOverride') } : {}) });
      if (datos.nextContactAt && datos.nextContactAt !== op.next_contact_at) await editarOportunidad(op.id, { next_contact_at: datos.nextContactAt });
      toast({ title: t('movida', { etapa: destino?.name ?? '' }) });
      cerrar();
      onHecho?.(op.id);
    } catch (e) {
      const r = interpretarRechazo(e);
      if (r.tipo === 'gate') setModo({ ...modo, destino: datos.stageId, pendientes: r.pendientes });
      else if (r.tipo === 'sinPermiso') setModo({ ...modo, sinPermiso: true });
      else setError(r.tipo === 'conflicto' ? t('conflicto') : t('errorMover'));
    } finally {
      setOcupado(false);
    }
  };

  const alGanar = async (op: OportunidadFlujo, cuerpo: { won_data: Record<string, unknown>; stage_id?: string }): Promise<DocumentoCreado[]> => {
    try {
      await ganarOportunidad(op.id, cuerpo);
    } catch (e) {
      const r = interpretarRechazo(e);
      if (r.tipo === 'gate') throw new Error(t('gateGanar', { lista: r.pendientes.map((p) => p.etiqueta).join(' · ') }));
      throw new Error(r.tipo === 'sinPermiso' ? t('sinPermisoCerrar') : r.tipo === 'conflicto' ? t('conflicto') : t('errorGanar'));
    }
    onHecho?.(op.id);
    const acciones = (Array.isArray(cuerpo.won_data.actions) ? cuerpo.won_data.actions : []) as AccionGanar[];
    const detalle = await leerOportunidad(op.id).catch(() => null);
    if (!detalle) return [];
    const deps = crearDepsGanar({ orgId: getOrganizationId(), contextBranchId: sucursal, timezone });
    return documentosDe(await ejecutarPasosGanar(detalle as unknown as OpportunityData, pasosElegidos(acciones), deps));
  };

  const alPerder = async (op: OportunidadFlujo, cuerpo: { loss_data: Record<string, unknown>; stage_id?: string }) => {
    setOcupado(true);
    setError(null);
    try {
      await perderOportunidad(op.id, cuerpo);
      toast({ title: t('perdida') });
      cerrar();
      onHecho?.(op.id);
    } catch (e) {
      const r = interpretarRechazo(e);
      setError(r.tipo === 'sinPermiso' ? t('sinPermisoCerrar') : r.tipo === 'gate' ? t('gateGanar', { lista: r.pendientes.map((p) => p.etiqueta).join(' · ') }) : t('errorPerder'));
    } finally {
      setOcupado(false);
    }
  };

  const de = (op: OportunidadFlujo) => etapasDeOportunidad(etapas, op.pipeline_id);
  const destinosMover = (modo?.tipo === 'mover' ? de(modo.op) : []).map((e) => ({ id: e.id, name: e.name, probability: e.probability, position: e.position, is_won: e.is_won, is_lost: e.is_lost }));

  let dialogos: ReactNode = null;
  if (modo?.tipo === 'mover') {
    dialogos = (
      <MoveStageDialog
        abierto
        onAbiertoChange={(a) => !a && cerrar()}
        oportunidad={{ name: modo.op.name, clienteNombre: modo.op.cliente_nombre, next_contact_at: modo.op.next_contact_at }}
        etapas={destinosMover}
        etapaActualId={modo.op.stage_id}
        etapaDestinoId={modo.destino}
        onEtapaDestinoChange={(id) => setModo({ ...modo, destino: id })}
        requisitosPendientes={modo.pendientes}
        puedeMover={!modo.sinPermiso}
        puedeOmitirRequisitos={permisos.saltarGate}
        permisoFaltante={modo.permiso === 'cerrar' ? t('permisoCerrar') : undefined}
        onMover={(d) => void alMover(d)}
        ocupado={ocupado}
        error={error}
      />
    );
  } else if (modo?.tipo === 'ganar') {
    const op = modo.op;
    dialogos = (
      <WinDialog
        abierto
        onAbiertoChange={(a) => !a && cerrar()}
        oportunidad={{ name: op.name, amount: op.amount, currency: op.currency, win_data: op.win_data ?? null, clienteNombre: op.cliente_nombre }}
        monedaBase={moneda}
        monedas={op.currency ? [op.currency] : []}
        stageId={modo.stageId}
        onGanar={(c) => alGanar(op, c)}
        onVerFactura={(d) => d.href && window.open(d.href, '_self')}
      />
    );
  } else if (modo?.tipo === 'perder') {
    const op = modo.op;
    dialogos = (
      <LoseDialog
        abierto
        onAbiertoChange={(a) => !a && cerrar()}
        oportunidad={{ name: op.name, amount: op.amount }}
        moneda={moneda.paraDocumento(op.currency)}
        motivos={motivos ?? []}
        cargandoMotivos={motivos === null}
        stageId={modo.stageId}
        onPerder={(c) => alPerder(op, c)}
        ocupado={ocupado}
        error={error}
      />
    );
  }

  return {
    solicitar,
    ganar: (op: OportunidadFlujo) => {
      const ganada = de(op).find((e) => e.is_won);
      if (!ganada) {
        toast({ title: t('sinEtapaGanada'), variant: 'destructive' });
        return false;
      }
      return solicitar(op, ganada.id, 'menu');
    },
    perder: (op: OportunidadFlujo) => {
      const perdida = de(op).find((e) => e.is_lost);
      if (!perdida) {
        toast({ title: t('sinEtapaPerdida'), variant: 'destructive' });
        return false;
      }
      return solicitar(op, perdida.id, 'menu');
    },
    reabrir: (op: OportunidadFlujo) => {
      const primeraAbierta = de(op).filter((e) => !e.is_won && !e.is_lost).sort((a, b) => a.position - b.position)[0];
      return primeraAbierta ? solicitar(op, primeraAbierta.id, 'menu') : false;
    },
    mover: (op: OportunidadFlujo) => {
      const abiertas = de(op).filter((e) => e.id !== op.stage_id && !e.is_won && !e.is_lost).sort((a, b) => a.position - b.position);
      const actual = etapa(op.stage_id)?.position ?? -1;
      const siguiente = abiertas.find((e) => e.position > actual) ?? abiertas[0];
      return siguiente ? solicitar(op, siguiente.id, 'menu') : false;
    },
    dialogos,
  };
}
