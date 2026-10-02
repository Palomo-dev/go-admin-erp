'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { Dialogo } from '@/components/kit/Dialogo';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { claveError } from '@/components/crm/acciones/apiCrm';
import type { AccionMenuOportunidad } from '@/components/crm/kit/opportunityRowMenuLogica';
import type { AccionRapidaCrm } from '@/components/crm/kit/quickActionLogica';
import { crearOportunidad, cuerpoDuplicado, eliminarOportunidad, leerOportunidad } from './apiOportunidades';
import type { EtapaApi, OportunidadApi, PermisosPantalla } from './oportunidadLogica';
import { useFlujoEtapa, type OportunidadFlujo } from './useFlujoEtapa';

/**
 * Acciones de una oportunidad, iguales en el kanban, la tabla, la lista, el
 * drawer y el detalle: el menú «⋯» (`OpportunityRowMenu`), las acciones
 * rápidas de la tarjeta (`AccionesRapidasCrm` de la 3A) y el flujo de etapa
 * único. Todo por `/api/crm/**`.
 */
export type OportunidadAcciones = OportunidadFlujo & Pick<OportunidadApi, 'customer_id' | 'cliente'>;

export interface OpcionesAcciones {
  etapas: readonly EtapaApi[];
  permisos: PermisosPantalla;
  usuarioId: string | null;
  /** «Ver detalle»: el tablero abre el drawer; la lista y el drawer, la página. */
  onVer: (id: string) => void;
  /** Tras cualquier cambio confirmado por el servidor. `destinoId` llega al mover de etapa. */
  onCambio: (id?: string, destinoId?: string) => void;
  onRevertir?: (id: string) => void;
  /** Tras eliminar (el detalle vuelve a la lista). */
  onEliminada?: (id: string) => void;
}

export function useAccionesOportunidad(o: OpcionesAcciones) {
  const t = useTranslations('crm.oportunidad.acciones');
  const te = useTranslations('crm.accionesRapidas.errores');
  const router = useRouter();
  const flujo = useFlujoEtapa({ etapas: o.etapas, permisos: o.permisos, usuarioId: o.usuarioId, onHecho: (id, destino) => o.onCambio(id, destino), onRevertir: o.onRevertir });
  const [rapida, setRapida] = useState<{ op: OportunidadAcciones; accion: AccionRapidaCrm; clave: number } | null>(null);
  const [aEliminar, setAEliminar] = useState<OportunidadAcciones | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const duplicar = async (op: OportunidadAcciones) => {
    try {
      const detalle = await leerOportunidad(op.id);
      const nueva = await crearOportunidad(cuerpoDuplicado(detalle, t('sufijoCopia')));
      toast({ title: t('duplicada') });
      o.onCambio(nueva?.id);
    } catch (e) {
      toast({ title: t('errorDuplicar'), description: te(claveError(e)), variant: 'destructive' });
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setOcupado(true);
    try {
      await eliminarOportunidad(aEliminar.id);
      toast({ title: t('eliminada') });
      const id = aEliminar.id;
      setAEliminar(null);
      o.onCambio(id);
      o.onEliminada?.(id);
    } catch (e) {
      // 409: ganada o con factura, cotización, venta o comisión (guarda de la RPC).
      toast({ title: t('errorEliminar'), description: claveError(e) === 'conflicto' ? t('noEliminable') : te(claveError(e)), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const alMenu = (op: OportunidadAcciones, accion: AccionMenuOportunidad) => {
    switch (accion) {
      case 'ver':
        return o.onVer(op.id);
      case 'editar':
        return router.push(`/app/crm/oportunidades/${op.id}/editar`);
      case 'mover':
        return flujo.mover(op);
      case 'ganar':
        return flujo.ganar(op);
      case 'perder':
        return flujo.perder(op);
      case 'reabrir':
        return flujo.reabrir(op);
      case 'duplicar':
        return void duplicar(op);
      case 'nuevaTarea':
        return setRapida({ op, accion: 'tarea', clave: Date.now() });
      case 'eliminar':
        return setAEliminar(op);
    }
  };

  const alAccionRapida = (op: OportunidadAcciones, accion: AccionRapidaCrm) => setRapida({ op, accion, clave: Date.now() });

  const dialogos: ReactNode = (
    <>
      {flujo.dialogos}
      {rapida && (
        <AccionesRapidasCrm
          variante="tarjeta"
          sinBarra
          oportunidadId={rapida.op.id}
          oportunidadNombre={rapida.op.name}
          clienteId={rapida.op.customer_id}
          cliente={rapida.op.cliente ? { id: rapida.op.customer_id, ...rapida.op.cliente } : { id: rapida.op.customer_id, full_name: rapida.op.cliente_nombre ?? null }}
          abrirAccion={{ accion: rapida.accion, clave: rapida.clave }}
          onAccionCompletada={() => o.onCambio(rapida.op.id)}
          onCerrado={() => setRapida(null)}
        />
      )}
      <Dialogo
        abierto={!!aEliminar}
        onAbiertoChange={(a) => !a && !ocupado && setAEliminar(null)}
        titulo={t('eliminarTitulo', { nombre: aEliminar?.name ?? '' })}
        descripcion={t('eliminarDescripcion')}
        primario={{ etiqueta: t('eliminar'), onClick: () => void eliminar(), destructiva: true, cargando: ocupado }}
        textoCancelar={t('cancelar')}
        ancho={440}
      />
    </>
  );

  return { flujo, alMenu, alAccionRapida, dialogos };
}
