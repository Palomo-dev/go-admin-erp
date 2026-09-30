'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Target } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { OpportunityForm } from '@/components/crm/kit/OpportunityForm';
import { CustomerLinkPicker } from '@/components/crm/kit/CustomerLinkPicker';
import { aFechaHoraLocal } from '@/components/crm/kit/fechasCrm';
import type { ValoresOportunidad } from '@/components/crm/kit/opportunityFormLogica';
import { buscarClientesCrm } from '@/components/crm/acciones/buscarClientes';
import { claveError } from '@/components/crm/acciones/apiCrm';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearOportunidad, editarOportunidad, type OportunidadDetalleApi } from './apiOportunidades';
import { cantidadLineas, cuerpoLineas, cuerpoOrigenComision, LINEAS_VACIAS, lineasDesdeApi, lineasValidas, origenComisionDesdeApi, totalLineas, type Lineas, type OrigenComision } from './lineasLogica';
import { permisosFila, permisosPantalla } from './oportunidadLogica';
import { LineasOportunidad } from './LineasOportunidad';
import { OrigenComisionSeccion } from './OrigenComisionSeccion';
import { useOportunidad } from './useOportunidad';
import { useAccionesOportunidad } from './useAccionesOportunidad';

/**
 * Formulario ÚNICO de oportunidad en página (CRM ola 3B, plan §4.7; Figma
 * 778:32176 Nueva y 778:33132 Editar): `OpportunityForm layout=page` del kit
 * + las secciones que la ola 2 dejó como hueco (`seccionesPagina`): líneas
 * (productos, espacios y conceptos, con el total único de `lineasLogica`) y
 * «Origen y comisión». Cliente con `CustomerLinkPicker`. Alta por `POST` y
 * edición por `PATCH /api/crm/opportunities/**` (RPC con líneas en la misma
 * transacción y bloqueo optimista).
 */
export interface FormularioOportunidadPaginaProps {
  modo: 'create' | 'edit';
  id?: string;
  /** Puntos de entrada: `?pipeline=…&etapa=…&cliente=…&nombreCliente=…`. */
  inicial?: { pipelineId?: string | null; etapaId?: string | null; clienteId?: string | null; clienteNombre?: string | null };
}

function prefillDe(op: OportunidadDetalleApi, zona: string): Partial<ValoresOportunidad> {
  const temp = op.temperature === 'cold' || op.temperature === 'warm' || op.temperature === 'hot' ? op.temperature : '';
  return {
    customer_id: op.customer_id ?? '',
    name: op.name,
    pipeline_id: op.pipeline_id,
    stage_id: op.stage_id,
    amount: op.amount === null || op.amount === undefined ? '' : String(op.amount),
    currency: op.currency ?? undefined,
    expected_close_date: op.expected_close_date ?? '',
    salesperson_id: op.salesperson_id ?? '',
    next_contact_at: aFechaHoraLocal(op.next_contact_at, zona),
    next_action: op.next_action ?? '',
    temperature: temp,
    source: op.source ?? '',
  };
}

export function FormularioOportunidadPagina({ modo, id, inicial }: FormularioOportunidadPaginaProps) {
  const t = useTranslations('crm.oportunidad.formularioPagina');
  const te = useTranslations('crm.accionesRapidas.errores');
  const router = useRouter();
  const { timezone } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const cat = useCatalogosCrm();
  const permisos = permisosPantalla(cat.permisos);
  const { data: op, estado } = useOportunidad(modo === 'edit' ? (id ?? null) : null);
  const [cliente, setCliente] = useState<{ id: string; nombre: string | null } | null>(inicial?.clienteId ? { id: inicial.clienteId, nombre: inicial.clienteNombre ?? null } : null);
  const [lineas, setLineas] = useState<Lineas | null>(modo === 'create' ? LINEAS_VACIAS : null);
  const [oc, setOc] = useState<OrigenComision | null>(modo === 'create' ? origenComisionDesdeApi(null) : null);
  const [picker, setPicker] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const etapas = useMemo(() => cat.etapas.map((e) => ({ ...e, color: null })), [cat.etapas]);
  const acciones = useAccionesOportunidad({ etapas, permisos, usuarioId: cat.usuarioId, onVer: (x) => router.push(`/app/crm/oportunidades/${x}`), onCambio: () => undefined, onEliminada: () => router.push('/app/crm/oportunidades') });

  // Edición: al llegar la oportunidad se copian sus líneas, su origen y su cliente una sola vez.
  if (modo === 'edit' && op && lineas === null) {
    setLineas(lineasDesdeApi(op));
    setOc(origenComisionDesdeApi(op));
    setCliente(op.customer_id ? { id: op.customer_id, nombre: op.cliente?.full_name ?? op.cliente_nombre ?? null } : null);
  }

  const puedeEditar = modo === 'create' ? permisos.crear : !!op && !!permisosFila(permisos, cat.usuarioId, op).editar;
  const titulo = modo === 'edit' ? t('tituloEditar') : t('tituloNueva');
  const migas = [{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.oportunidades'), href: '/app/crm/oportunidades' }, ...(op ? [{ etiqueta: op.name, href: `/app/crm/oportunidades/${op.id}` }] : []), { etiqueta: modo === 'edit' ? t('migas.editar') : t('migas.nueva') }];

  const enviar = async (cuerpo: Record<string, unknown>) => {
    if (!lineas || !oc) return;
    if (!lineasValidas(lineas)) {
      setError(t('lineasInvalidas'));
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const completo = { ...cuerpo, ...cuerpoLineas(lineas), ...cuerpoOrigenComision(oc) };
      if (modo === 'edit' && op) {
        await editarOportunidad(op.id, completo);
        router.push(`/app/crm/oportunidades/${op.id}`);
      } else {
        const nueva = await crearOportunidad(completo);
        router.push(nueva?.id ? `/app/crm/oportunidades/${nueva.id}` : '/app/crm/oportunidades');
      }
    } catch (e) {
      setError(claveError(e) === 'conflicto' && modo === 'edit' ? t('conflicto') : te(claveError(e)));
    } finally {
      setOcupado(false);
    }
  };

  const cargando = cat.cargando || (modo === 'edit' && (estado === 'cargando' || lineas === null) && estado !== 'noEncontrada' && estado !== 'sinPermiso' && estado !== 'error');
  const sinPermiso = !cat.cargando && (estado === 'sinPermiso' || (!cargando && !puedeEditar));

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader titulo={titulo} subtitulo={op?.name} icono={Target} migas={migas} variante="form" volverA={op ? `/app/crm/oportunidades/${op.id}` : '/app/crm/oportunidades'} cargando={cargando} />
      {estado === 'noEncontrada' && modo === 'edit' ? (
        <div className="rounded-xl border border-line bg-surface"><EmptyState variante="error" titulo={t('noEncontrada')} accion={{ etiqueta: t('volver'), href: '/app/crm/oportunidades' }} /></div>
      ) : sinPermiso ? (
        <div className="rounded-xl border border-line bg-surface"><EmptyState variante="forbidden" titulo={t('sinPermiso')} descripcion={t('sinPermisoDetalle')} accion={{ etiqueta: t('volver'), href: '/app/crm/oportunidades' }} /></div>
      ) : cargando || !lineas || !oc ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]" aria-busy="true">
          <div className="h-[520px] animate-pulse rounded-xl bg-subtle" />
          <div className="h-60 animate-pulse rounded-xl bg-subtle" />
        </div>
      ) : (
        <OpportunityForm
          layout="page"
          modo={modo}
          origen="general"
          prefill={op ? prefillDe(op, timezone) : { pipeline_id: inicial?.pipelineId ?? undefined, stage_id: inicial?.etapaId ?? undefined, customer_id: inicial?.clienteId ?? undefined }}
          pipelines={cat.pipelines}
          etapas={cat.etapas}
          usuarios={cat.usuarios}
          usuarioActualId={cat.usuarioId}
          monedaBase={moneda}
          clienteNombre={cliente?.nombre ?? null}
          clienteId={cliente?.id ?? null}
          onElegirCliente={() => setPicker(true)}
          montoCalculado={cantidadLineas(lineas) > 0 ? totalLineas(lineas) : null}
          updatedAt={op?.updated_at ?? null}
          seccionesPagina={
            <>
              <LineasOportunidad lineas={lineas} onCambiar={setLineas} moneda={moneda.paraDocumento(op?.currency)} deshabilitado={ocupado} />
              <OrigenComisionSeccion valor={oc} onCambiar={setOc} deshabilitado={ocupado} />
            </>
          }
          onEnviar={(c) => void enviar(c as Record<string, unknown>)}
          onCancelar={() => router.push(op ? `/app/crm/oportunidades/${op.id}` : '/app/crm/oportunidades')}
          onEliminar={modo === 'edit' && op && permisos.eliminar ? () => acciones.alMenu(op, 'eliminar') : undefined}
          ocupado={ocupado}
          error={error}
        />
      )}
      <CustomerLinkPicker abierto={picker} onAbiertoChange={setPicker} buscar={buscarClientesCrm} onSeleccionar={(c) => { setCliente({ id: c.id, nombre: c.full_name }); setPicker(false); }} />
      {acciones.dialogos}
    </div>
  );
}
