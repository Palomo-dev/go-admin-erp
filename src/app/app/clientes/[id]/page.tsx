'use client';

/**
 * Ficha del cliente (Figma 06 Clientes, DET-*): cabecera del kit
 * (PageHeader `detail` con migas reales, badge de estado, «Editar»,
 * «Registrar pago» y el menú «⋯» con las mismas acciones que el listado) y
 * las pestañas de siempre en el `TabBar` del kit, con la elegida en
 * `?pestana=` (sin ella, «Resumen»). Estados de carga y error con el kit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HandCoins, Pencil, User, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/config';
import { EmptyState, PageHeader, RowActionsMenu, StatusBadge, TabBar, idPanel, idPestana, useOpcionUrl, type PestanaTab } from '@/components/kit';
import { documentoCliente } from '@/lib/services/clientesListadoService';
import { construirAccionesCliente } from '@/components/clientes/listado/accionesCliente';
import { useOperacionesClientes } from '@/components/clientes/listado/useOperacionesClientes';
import { EliminarClientesDialog } from '@/components/clientes/listado/EliminarClientesDialog';

import ClienteHeader from '@/components/clientes/id/ClienteHeader';
import ResumenTab from '@/components/clientes/id/ResumenTab';
import TimelineTab from '@/components/clientes/id/TimelineTab';
import CuentasTab from '@/components/clientes/id/CuentasTab';
import NotasArchivosTab from '@/components/clientes/id/NotasArchivosTab';
import TareasSidebar from '@/components/clientes/id/TareasSidebar';
import InfoTab from '@/components/clientes/id/InfoTab';
import OportunidadesTab from '@/components/clientes/id/OportunidadesTab';
import { CompanyContactsManager } from '@/components/clientes/CompanyContactsManager';
import { mensajeError, useFechasFicha } from '@/components/clientes/id/useFechasFicha';
import { useFichaClienteCrm } from '@/components/crm/ficha/useFichaClienteCrm';
import { ClientHealthCard } from '@/components/crm/health/ClientHealthCard';
import { CustomerFoliosSection } from '@/components/crm/clientes/CustomerFoliosSection';
import { DocumentUploader } from '@/components/crm/documents/DocumentUploader';

interface Cliente {
  id: string;
  organization_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  address: string;
  city: string;
  notes: string;
  tags: string[];
  preferences: unknown;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  customer_type?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  dv?: number | null;
  lifecycle_stage?: string | null;
  status?: string | null;
  do_not_call?: boolean | null;
}

/** Por qué no cargó la ficha: un código que se traduce o el mensaje de Supabase. */
type ErrorFicha = { codigo: 'sinId' | 'noExiste' | 'carga' } | { mensaje: string };

const PESTANAS = ['resumen', 'info', 'oportunidades', 'timeline', 'cuentas', 'notas', 'contactos'] as const;
type Pestana = (typeof PESTANAS)[number];
/** Clave de cada pestaña en `clientes.ficha.pestanas` (la de la URL `timeline` se llama «actividad»). */
const ETIQUETA: Record<Pestana, string> = { resumen: 'resumen', info: 'info', oportunidades: 'oportunidades', timeline: 'actividad', cuentas: 'cuentas', notas: 'notas', contactos: 'contactos' };
const ID_PESTANAS = 'ficha-cliente';

export default function PerfilCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const t = useTranslations('clientes.ficha');
  const tListado = useTranslations('clientes.listado');
  const tCrm = useTranslations('crm.fichaCliente');
  const { instante } = useFechasFicha();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorFicha | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [pestanaUrl, setPestana] = useOpcionUrl<Pestana>('pestana', PESTANAS, 'resumen');

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const idsCliente = useMemo(() => (id ? [id] : []), [id]);
  const { cambiarEstado, copiarId } = useOperacionesClientes(cliente?.organization_id ?? null, recargar);
  // D1 (CRM ola 3A): esta es la ficha única; el bloque CRM vive aquí y /app/crm/clientes/[id] redirige.
  const crm = useFichaClienteCrm(
    cliente
      ? {
          id: cliente.id,
          nombre: cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim(),
          email: cliente.email,
          phone: cliente.phone,
          do_not_call: cliente.do_not_call ?? null,
        }
      : null,
  );

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!id) {
        setError({ codigo: 'sinId' });
        setLoading(false);
        return;
      }
      setError(null);
      const { data, error: err } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
      if (cancelado) return;
      if (err) {
        const mensaje = mensajeError(err);
        setError(mensaje ? { mensaje } : { codigo: 'carga' });
      } else if (!data) setError({ codigo: 'noExiste' });
      else setCliente(data as Cliente);
      setLoading(false);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [id, recarga]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6" aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader
          titulo={t('pagina.noEncontrado')}
          variante="detail"
          icono={User}
          migas={[
            { etiqueta: t('pagina.migas.inicio'), href: '/app/inicio' },
            { etiqueta: t('pagina.migas.clientes'), href: '/app/clientes' },
          ]}
          movil={{ titulo: t('pagina.movilTitulo') }}
          volverA="/app/clientes"
        />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="error"
            titulo={t('pagina.noEncontrado')}
            descripcion={
              !error
                ? t('pagina.noEncontradoDescripcion')
                : 'mensaje' in error
                  ? error.mensaje
                  : t(`pagina.errores.${error.codigo}`)
            }
            accion={{ etiqueta: t('pagina.volverClientes'), href: '/app/clientes' }}
          />
        </div>
      </div>
    );
  }

  const nombre = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim() || t('comun.sinNombre');
  const esEmpresa = cliente.customer_type === 'company';
  const documento = documentoCliente({
    identification_type: cliente.identification_type ?? null,
    identification_number: cliente.identification_number ?? null,
    dv: cliente.dv ?? null,
  });
  const desde = instante(cliente.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const subtitulo = [desde && t('pagina.clienteDesde', { fecha: desde }), documento].filter(Boolean).join(' · ');

  // «Contactos» solo existe en empresas: en una persona, `?pestana=contactos` abre «Resumen».
  const pestana: Pestana = pestanaUrl === 'contactos' && !esEmpresa ? 'resumen' : pestanaUrl;
  const pestanas: PestanaTab<Pestana>[] = PESTANAS.filter((p) => p !== 'contactos' || esEmpresa).map((p) => ({ valor: p, etiqueta: t(`pestanas.${ETIQUETA[p]}`) }));

  const acciones = construirAccionesCliente(
    { id: cliente.id, nombre, phone: cliente.phone, status: cliente.status ?? 'active' },
    {
      navegar: (ruta) => router.push(ruta),
      onCambiarEstado: (c, estado) => void cambiarEstado([c.id], estado, c.nombre),
      onEliminar: () => setEliminarAbierto(true),
      onCopiarId: (c) => void copiarId(c.id),
      omitirVer: true,
      t: tListado,
    },
  );

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      <PageHeader
        titulo={nombre}
        subtitulo={subtitulo}
        variante="detail"
        icono={esEmpresa ? Building2 : User}
        badge={cliente.status === 'inactive' ? <StatusBadge estado="Inactivo" tamano="md" /> : undefined}
        migas={[
          { etiqueta: t('pagina.migas.inicio'), href: '/app/inicio' },
          { etiqueta: t('pagina.migas.clientes'), href: '/app/clientes' },
          { etiqueta: nombre },
        ]}
        volverA="/app/clientes"
        acciones={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`/app/clientes/${cliente.id}/editar`}>
                <Pencil aria-hidden="true" className="mr-2 size-4" />
                {t('pagina.editar')}
              </Link>
            </Button>
            <Button className="h-10" disabled title={tListado('motivos.registrarPago')} aria-describedby="motivo-registrar-pago">
              <HandCoins aria-hidden="true" className="mr-2 size-4" />
              {t('pagina.registrarPago')}
            </Button>
            <span id="motivo-registrar-pago" className="sr-only">
              {tListado('motivos.registrarPago')}
            </span>
            <RowActionsMenu acciones={acciones} orientacion="horizontal" tamano="md" titulo={nombre} />
          </>
        }
        movil={{
          titulo: nombre,
          subtitulo: documento ?? undefined,
          accion: <RowActionsMenu acciones={acciones} orientacion="horizontal" titulo={nombre} />,
        }}
      />

      <ClienteHeader cliente={cliente} pie={crm.barra} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-1 min-w-0 lg:col-span-2">
          <TabBar id={ID_PESTANAS} etiqueta={t('pestanasAria')} valor={pestana} onValorChange={setPestana} pestanas={pestanas} className="mb-6" />
          <div role="tabpanel" id={idPanel(ID_PESTANAS, pestana)} aria-labelledby={idPestana(ID_PESTANAS, pestana)} tabIndex={0} className="focus-visible:outline-none">
            {/* Solo se monta la pestaña activa (como hacía Radix): cada una pide sus datos al abrirse. */}
            {pestana === 'resumen' && <ResumenTab clienteId={cliente.id} organizationId={cliente.organization_id} vacio={crm.vacioResumen} />}
            {pestana === 'info' && <InfoTab clienteId={cliente.id} organizationId={cliente.organization_id} />}
            {pestana === 'oportunidades' && (
              <OportunidadesTab clienteId={cliente.id} organizationId={cliente.organization_id} onNuevaOportunidad={crm.onNuevaOportunidad} recarga={crm.recarga} />
            )}
            {pestana === 'timeline' && <TimelineTab key={crm.recarga} clienteId={cliente.id} organizationId={cliente.organization_id} />}
            {pestana === 'cuentas' && (
              <>
                <CuentasTab clienteId={cliente.id} organizationId={cliente.organization_id} />
                {/* Antes en /app/crm/clientes/[id] (D1): folios del PMS. */}
                <div className="mt-6">
                  <CustomerFoliosSection customerId={cliente.id} />
                </div>
              </>
            )}
            {pestana === 'notas' && (
              <>
                <NotasArchivosTab clienteId={cliente.id} organizationId={cliente.organization_id} />
                {/* Antes en /app/crm/clientes/[id] (D1): documentos del CRM. */}
                <div className="mt-6">
                  <DocumentUploader organizationId={cliente.organization_id} relatedType="customer" relatedId={cliente.id} title={tCrm('documentos')} />
                </div>
              </>
            )}
            {pestana === 'contactos' && <CompanyContactsManager companyId={cliente.id} organizationId={cliente.organization_id} />}
          </div>
        </div>

        <div className="col-span-1">
          <div className="flex flex-col gap-4">
            <TareasSidebar clienteId={cliente.id} organizationId={cliente.organization_id} onNuevaTarea={crm.onNuevaTarea} recarga={crm.recarga} />
            {/* Antes en /app/crm/clientes/[id] (D1); Figma 772:19838: «Salud del cliente» en el panel. */}
            <ClientHealthCard customerId={cliente.id} customerName={nombre} lifecycleStage={cliente.lifecycle_stage ?? null} />
          </div>
        </div>
      </div>

      {crm.dialogos}

      <EliminarClientesDialog
        abierto={eliminarAbierto}
        onAbiertoChange={setEliminarAbierto}
        organizationId={cliente.organization_id}
        ids={idsCliente}
        nombre={nombre}
        onHecho={({ eliminados }) => {
          if (eliminados > 0) router.push('/app/clientes');
          else recargar();
        }}
      />
    </div>
  );
}

