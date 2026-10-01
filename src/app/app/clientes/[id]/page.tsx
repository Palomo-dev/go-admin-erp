'use client';

/**
 * Ficha del cliente (Figma 06 Clientes, DET-*): cabecera del kit
 * (PageHeader `detail` con migas reales, badge de estado, «Editar»,
 * «Registrar pago» y el menú «⋯» con las mismas acciones que el listado) y
 * las pestañas de siempre. Estados de carga y error con el kit.
 */
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HandCoins, Pencil, User, Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, RowActionsMenu, StatusBadge } from '@/components/kit';
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
import { useFechasFicha } from '@/components/clientes/id/useFechasFicha';
import { useClienteFicha } from '@/components/clientes/id/useClienteFicha';
import { useFichaClienteCrm } from '@/components/crm/ficha/useFichaClienteCrm';
import { ClientHealthCard } from '@/components/crm/health/ClientHealthCard';
import { CustomerFoliosSection } from '@/components/crm/clientes/CustomerFoliosSection';
import { DocumentUploader } from '@/components/crm/documents/DocumentUploader';

const PESTANA =
  'min-w-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-fg-secondary data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm';

export default function PerfilCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const t = useTranslations('clientes.ficha');
  const tListado = useTranslations('clientes.listado');
  const tCrm = useTranslations('crm.fichaCliente');
  const te = useTranslations('crm.accionesRapidas.errores');
  const { instante } = useFechasFicha();
  const [recarga, setRecarga] = useState(0);
  const { cliente, loading, error } = useClienteFicha(id, recarga);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);

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
    const reintentable = !!error && !['sinPermiso', 'noEncontrado'].includes(error);
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
            variante={error === 'sinPermiso' ? 'forbidden' : 'error'}
            titulo={error === 'noEncontrado' || !error ? t('pagina.noEncontrado') : undefined}
            descripcion={error ? te(error) : t('pagina.noEncontradoDescripcion')}
            onReintentar={reintentable ? recargar : undefined}
            accion={reintentable ? undefined : { etiqueta: t('pagina.volverClientes'), href: '/app/clientes' }}
            accionSecundaria={reintentable ? { etiqueta: t('pagina.volverClientes'), href: '/app/clientes' } : undefined}
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
          <Tabs defaultValue="resumen" className="w-full">
            <TabsList className="mb-6 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-line bg-subtle p-1">
              <TabsTrigger value="resumen" className={PESTANA}>{t('pestanas.resumen')}</TabsTrigger>
              <TabsTrigger value="info" className={PESTANA}>{t('pestanas.info')}</TabsTrigger>
              <TabsTrigger value="oportunidades" className={PESTANA}>{t('pestanas.oportunidades')}</TabsTrigger>
              <TabsTrigger value="timeline" className={PESTANA}>{t('pestanas.actividad')}</TabsTrigger>
              <TabsTrigger value="cuentas" className={PESTANA}>{t('pestanas.cuentas')}</TabsTrigger>
              <TabsTrigger value="notas" className={PESTANA}>{t('pestanas.notas')}</TabsTrigger>
              {esEmpresa && (
                <TabsTrigger value="contactos" className={PESTANA}>{t('pestanas.contactos')}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="resumen">
              <ResumenTab clienteId={cliente.id} organizationId={cliente.organization_id} vacio={crm.vacioResumen} />
            </TabsContent>
            <TabsContent value="info">
              <InfoTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            <TabsContent value="oportunidades">
              <OportunidadesTab clienteId={cliente.id} organizationId={cliente.organization_id} onNuevaOportunidad={crm.onNuevaOportunidad} recarga={crm.recarga} />
            </TabsContent>
            <TabsContent value="timeline">
              <TimelineTab key={crm.recarga} clienteId={cliente.id} organizationId={cliente.organization_id} cliente={cliente} />
            </TabsContent>
            <TabsContent value="cuentas">
              <CuentasTab clienteId={cliente.id} organizationId={cliente.organization_id} />
              {/* Antes en /app/crm/clientes/[id] (D1): folios del PMS. */}
              <div className="mt-6">
                <CustomerFoliosSection customerId={cliente.id} />
              </div>
            </TabsContent>
            <TabsContent value="notas">
              <NotasArchivosTab clienteId={cliente.id} organizationId={cliente.organization_id} />
              {/* Antes en /app/crm/clientes/[id] (D1): documentos del CRM. */}
              <div className="mt-6">
                <DocumentUploader organizationId={cliente.organization_id} relatedType="customer" relatedId={cliente.id} title={tCrm('documentos')} />
              </div>
            </TabsContent>
            {esEmpresa && (
              <TabsContent value="contactos">
                <CompanyContactsManager companyId={cliente.id} organizationId={cliente.organization_id} />
              </TabsContent>
            )}
          </Tabs>
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
