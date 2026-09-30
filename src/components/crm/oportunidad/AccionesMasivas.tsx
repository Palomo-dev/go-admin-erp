'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Download, Trash2, UserPlus, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { BulkActionBar } from '@/components/kit/BulkActionBar';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { LoseDialog } from '@/components/crm/kit/LoseDialog';
import type { MotivoPerdida } from '@/components/crm/kit/loseDialogLogica';
import { CLASE_CAMPO, type OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { emitirCambioCrm } from '@/components/crm/acciones/apiCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { editarOportunidad, eliminarOportunidad, leerMotivosPerdida, moverEtapa, perderOportunidad } from './apiOportunidades';
import { etapasDeOportunidad, permisosFila, type EtapaApi, type OportunidadApi, type PermisosPantalla } from './oportunidadLogica';

/**
 * Barra de selección masiva (Figma 768:459368 y 773:24723): mover de etapa
 * (solo si todas son del mismo embudo), asignar responsable, marcar perdida
 * (`LoseDialog` una vez, SIEMPRE a la etapa de pérdida), exportar y eliminar.
 * Una llamada por oportunidad: cada ruta vuelve a comprobar permiso y
 * propiedad, y el resumen dice cuántas se aplicaron.
 */
type Dialogo = 'mover' | 'asignar' | 'perder' | 'eliminar' | null;

export interface AccionesMasivasProps {
  seleccionadas: readonly OportunidadApi[];
  total: number;
  etapas: readonly EtapaApi[];
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  onSeleccionarTodos?: () => void;
  onLimpiar: () => void;
  onExportar: () => void;
}

export function AccionesMasivas(p: AccionesMasivasProps) {
  const t = useTranslations('crm.oportunidad.masivo');
  const moneda = useMonedaOrganizacion();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [ocupado, setOcupado] = useState(false);
  const [destino, setDestino] = useState('');
  const [responsable, setResponsable] = useState('');
  const [motivos, setMotivos] = useState<MotivoPerdida[] | null>(null);
  const pipelines = new Set(p.seleccionadas.map((o) => o.pipeline_id));
  const etapas = pipelines.size === 1 ? etapasDeOportunidad(p.etapas, [...pipelines][0]).filter((e) => !e.is_won && !e.is_lost) : [];
  const editables = p.seleccionadas.filter((o) => permisosFila(p.permisos, p.usuarioId, o).editar);

  const aplicar = async (fn: (o: OportunidadApi) => Promise<unknown>, lista: readonly OportunidadApi[]) => {
    setOcupado(true);
    let ok = 0;
    for (const o of lista) {
      try {
        await fn(o);
        ok += 1;
      } catch {
        /* se cuenta abajo: la ruta rechazó (gate, permiso, conflicto) */
      }
    }
    setOcupado(false);
    setDialogo(null);
    emitirCambioCrm({ entidad: 'opportunity', accion: 'masivo' });
    toast({ title: t('resultado', { ok, total: lista.length }), variant: ok < lista.length ? 'destructive' : undefined });
    if (ok > 0) p.onLimpiar();
  };

  const abrirPerder = () => {
    setDialogo('perder');
    if (motivos === null) void leerMotivosPerdida().then(setMotivos, () => setMotivos([]));
  };

  const motivoMover = pipelines.size > 1 ? t('motivoVariosEmbudos') : editables.length === 0 ? t('motivoSinPermiso') : undefined;
  const motivoCerrar = !p.permisos.cerrar ? t('motivoSinPermiso') : undefined;

  return (
    <>
      <BulkActionBar
        seleccionados={p.seleccionadas.length}
        total={p.total}
        onSeleccionarTodos={p.onSeleccionarTodos}
        sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
        acciones={[
          { id: 'mover', etiqueta: t('mover'), icono: ArrowLeftRight, onClick: () => setDialogo('mover'), deshabilitada: !!motivoMover, motivo: motivoMover },
          { id: 'asignar', etiqueta: t('asignar'), icono: UserPlus, onClick: () => setDialogo('asignar'), deshabilitada: editables.length === 0, motivo: editables.length === 0 ? t('motivoSinPermiso') : undefined },
          { id: 'perder', etiqueta: t('perder'), icono: XCircle, onClick: abrirPerder, deshabilitada: !!motivoCerrar, motivo: motivoCerrar },
          { id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, onClick: () => setDialogo('eliminar'), destructiva: true, deshabilitada: !p.permisos.eliminar, motivo: p.permisos.eliminar ? undefined : t('motivoSinPermiso') },
        ]}
        accionesSecundarias={[{ id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: p.onExportar }]}
        onLimpiar={p.onLimpiar}
      />
      <Dialogo
        abierto={dialogo === 'mover'}
        onAbiertoChange={(a) => !a && !ocupado && setDialogo(null)}
        titulo={t('moverTitulo', { n: editables.length })}
        descripcion={t('moverDescripcion')}
        icono={ArrowLeftRight}
        ancho={440}
        primario={{ etiqueta: t('mover'), onClick: () => void aplicar((o) => moverEtapa(o.id, { stage_id: destino }), editables.filter((o) => o.stage_id !== destino)), cargando: ocupado, deshabilitada: !destino }}
        textoCancelar={t('cancelar')}
      >
        <FormField etiqueta={t('etapa')}>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className={CLASE_CAMPO}>
            <option value="">{t('elegirEtapa')}</option>
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </FormField>
      </Dialogo>
      <Dialogo
        abierto={dialogo === 'asignar'}
        onAbiertoChange={(a) => !a && !ocupado && setDialogo(null)}
        titulo={t('asignarTitulo', { n: editables.length })}
        icono={UserPlus}
        ancho={440}
        primario={{ etiqueta: t('asignar'), onClick: () => void aplicar((o) => editarOportunidad(o.id, { salesperson_id: responsable || null }), editables), cargando: ocupado }}
        textoCancelar={t('cancelar')}
      >
        <FormField etiqueta={t('responsable')}>
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CLASE_CAMPO}>
            <option value="">{t('sinAsignar')}</option>
            {p.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </FormField>
      </Dialogo>
      <LoseDialog
        abierto={dialogo === 'perder'}
        onAbiertoChange={(a) => !a && !ocupado && setDialogo(null)}
        oportunidad={{ name: t('varias', { n: p.seleccionadas.length }), amount: null }}
        moneda={moneda}
        motivos={motivos ?? []}
        cargandoMotivos={motivos === null}
        onPerder={(cuerpo) => aplicar((o) => perderOportunidad(o.id, { loss_data: cuerpo.loss_data }), p.seleccionadas.filter((o) => o.status === 'open'))}
        ocupado={ocupado}
      />
      <Dialogo
        abierto={dialogo === 'eliminar'}
        onAbiertoChange={(a) => !a && !ocupado && setDialogo(null)}
        titulo={t('eliminarTitulo', { n: p.seleccionadas.length })}
        descripcion={t('eliminarDescripcion')}
        icono={Trash2}
        ancho={440}
        primario={{ etiqueta: t('eliminar'), onClick: () => void aplicar((o) => eliminarOportunidad(o.id), p.seleccionadas), destructiva: true, cargando: ocupado }}
        textoCancelar={t('cancelar')}
      />
    </>
  );
}
