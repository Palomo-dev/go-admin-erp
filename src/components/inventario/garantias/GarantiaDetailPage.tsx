'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ShieldCheck, Truck, Wrench } from 'lucide-react';
import { EmptyState, FilaDato, ListaDatos, PageHeader, RowActionsMenu, Tarjeta } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ErrorPeticionSeriales, clienteGarantias } from '@/lib/services/seriales/cliente';
import { PERMISOS_SERIALES_VACIOS, type GarantiaDetalle } from '@/lib/services/seriales/contrato';
import { HistorialSerial } from '@/components/inventario/seriales/piezas';
import { RUTA_GARANTIAS, mesesYDias, numeroDocumento, rutaCliente, rutaDocumento, rutaProveedor, rutaSerial } from '@/components/inventario/seriales/logica';
import { accionesReclamo } from './logica';
import { useAccionesReclamo, type ReclamoAccionable } from './DialogosReclamo';
import { BadgeEstadoReclamo } from './piezas';

/**
 * Detalle de un reclamo de garantía (Figma 593:121183 escritorio, 593:122402
 * móvil): la unidad reclamada con su venta, cliente y garantía; el reclamo, el
 * envío al proveedor y la resolución; y el historial del serial. Antes no
 * cargaba (relaciones pedidas con nombres que no existen); ahora sale de
 * `fn_garantia_detalle` por `GET /api/inventario/garantias/[id]`.
 */
export function GarantiaDetailPage({ claimId }: { claimId: string }) {
  const t = useTranslations('inventarioGarantias.detalle');
  const tc = useTranslations('inventarioGarantias.comun');
  const tres = useTranslations('inventarioGarantias.listado.resoluciones');
  const { formatDate, formatDateTime, formatPlain } = useFormatDate();
  const { formatear } = useMonedaOrganizacion();

  const [reclamo, setReclamo] = useState<GarantiaDetalle | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso' | 'noEncontrado'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    clienteGarantias
      .detalle(claimId)
      .then((d) => {
        if (!vigente) return;
        setReclamo(d);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        if (e instanceof ErrorPeticionSeriales && e.sinPermiso) setEstado('sinPermiso');
        else if (e instanceof ErrorPeticionSeriales && e.noEncontrado) setEstado('noEncontrado');
        else {
          console.error('Error cargando el reclamo:', e);
          setEstado('error');
        }
      });
    return () => {
      vigente = false;
    };
  }, [claimId, recarga]);

  const permisos = reclamo?.permisos ?? PERMISOS_SERIALES_VACIOS;
  const acciones = useAccionesReclamo({ permisos, onCambio: recargar });

  const migas = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('titulo'), href: RUTA_GARANTIAS },
    { etiqueta: reclamo?.codigo ?? '…' },
  ];

  if (estado !== 'listo' || !reclamo) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader titulo={tc('titulo')} icono={ShieldCheck} variante="detail" migas={migas} volverA={RUTA_GARANTIAS} cargando={estado === 'cargando'} />
        {estado === 'cargando' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label={t('cargando')}>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('volver'), href: RUTA_GARANTIAS }} />
        ) : estado === 'noEncontrado' ? (
          <EmptyState titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} icono={ShieldCheck} accion={{ etiqueta: t('volver'), href: RUTA_GARANTIAS }} />
        ) : (
          <EmptyState variante="error" titulo={t('error')} onReintentar={recargar} />
        )}
      </div>
    );
  }

  const u = reclamo.unidad;
  const accionable: ReclamoAccionable = {
    id: reclamo.id,
    codigo: reclamo.codigo,
    estado: reclamo.estado,
    serial: { id: u.id ?? 0, serial: u.serial ?? '' },
    producto: u.producto ? { nombre: u.producto.nombre } : null,
    cliente: reclamo.cliente,
    proveedor: reclamo.proveedor,
  };
  const puede = accionesReclamo(reclamo.estado);
  const gestionar = permisos.gestionar;
  const menu = acciones.accionesDe(accionable, { enDetalle: true });

  const docVenta = u.venta?.documento ?? null;
  const g = u.garantia;
  const restante = g?.estado === 'vigente' && g.fin && reclamo.hoy ? mesesYDias(reclamo.hoy, g.fin.slice(0, 10)) : null;
  const textoGarantia =
    g?.estado === 'vigente'
      ? restante
        ? t('garantiaVigenteQuedan', { meses: restante.meses, dias: restante.dias })
        : t('garantiaVigente')
      : g?.estado === 'vencida'
        ? t('garantiaVencida', { fecha: formatPlain(g.fin) })
        : t('sinGarantia');
  const pendiente =
    reclamo.estado === 'pending' || reclamo.estado === 'approved'
      ? { titulo: t('pendienteProveedor'), detalle: [reclamo.proveedor?.nombre, t('rmaPorAsignar')].filter(Boolean).join(' · ') }
      : reclamo.estado === 'in_process'
        ? { titulo: t('pendienteResolver'), detalle: reclamo.rma?.numero ? t('rmaNumero', { rma: reclamo.rma.numero }) : undefined }
        : null;

  const botones = (
    <>
      {gestionar && puede.rma && (
        <Button variant="outline" className="h-10 gap-2" onClick={() => acciones.abrirRma(accionable)}>
          <Truck aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('enviarProveedor')}
        </Button>
      )}
      {gestionar && puede.resolver && (
        <Button variant="outline" className="h-10 gap-2" onClick={() => acciones.abrirResolver(accionable)}>
          <Wrench aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('resolver')}
        </Button>
      )}
      {gestionar && puede.aprobar && (
        <Button className="h-10 gap-2" onClick={() => void acciones.aprobar(accionable)} disabled={acciones.trabajando}>
          <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('aprobar')}
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={t('titulo', { codigo: reclamo.codigo ?? '' })}
        subtitulo={t('subtitulo', { motivo: reclamo.motivo, fecha: formatDateTime(reclamo.fecha), usuario: reclamo.creado_por ?? t('alguien') })}
        icono={ShieldCheck}
        variante="detail"
        volverA={RUTA_GARANTIAS}
        badge={<BadgeEstadoReclamo estado={reclamo.estado} tamano="md" />}
        migas={migas}
        acciones={
          <>
            {botones}
            {menu.length > 0 && <RowActionsMenu orientacion="horizontal" tamano="md" titulo={reclamo.codigo ?? ''} acciones={menu} />}
          </>
        }
        movil={{
          titulo: reclamo.codigo ?? tc('titulo'),
          subtitulo: reclamo.motivo,
          accion: menu.length > 0 ? <RowActionsMenu orientacion="horizontal" titulo={reclamo.codigo ?? ''} acciones={menu} /> : undefined,
        }}
      />

      <p className="flex flex-wrap items-center gap-2 lg:hidden">
        <BadgeEstadoReclamo estado={reclamo.estado} />
        <span className={g?.estado === 'vigente' ? 'text-[13px] text-success-text' : 'text-[13px] text-fg-secondary'}>{g?.estado === 'vigente' ? t('garantiaVigente') : textoGarantia}</span>
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={t('unidad.titulo')}>
            <ListaDatos etiqueta={t('unidad.titulo')}>
              <FilaDato
                etiqueta={t('unidad.serial')}
                valor={[u.serial, u.producto?.nombre].filter(Boolean).join(' · ')}
                href={u.id ? rutaSerial(u.id) : undefined}
              />
              <FilaDato
                etiqueta={t('unidad.venta')}
                valor={
                  docVenta ? (
                    <Link href={rutaDocumento(docVenta) ?? '#'} className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {[numeroDocumento(docVenta), u.fecha_venta ? formatDate(u.fecha_venta) : null, u.venta?.sucursal?.nombre].filter(Boolean).join(' · ')}
                    </Link>
                  ) : (
                    <span className="text-fg-muted">{t('unidad.sinVenta')}</span>
                  )
                }
              />
              <FilaDato
                etiqueta={t('unidad.cliente')}
                valor={reclamo.cliente?.nombre ?? <span className="text-fg-muted">{t('unidad.sinCliente')}</span>}
                href={reclamo.cliente ? rutaCliente(reclamo.cliente.id) ?? undefined : undefined}
              />
              <FilaDato
                etiqueta={t('unidad.garantia')}
                tono={g?.estado === 'vigente' ? 'exito' : g?.estado === 'vencida' ? 'peligro' : 'neutro'}
                valor={textoGarantia}
              />
            </ListaDatos>
          </Tarjeta>

          <Tarjeta titulo={t('reclamo.titulo')} className="hidden lg:flex">
            <ListaDatos etiqueta={t('reclamo.titulo')}>
              <FilaDato etiqueta={t('reclamo.motivo')} valor={reclamo.motivo} />
              <FilaDato etiqueta={t('reclamo.descripcion')} valor={reclamo.descripcion ?? <span className="text-fg-muted">{t('sinDato')}</span>} />
              <FilaDato
                etiqueta={t('reclamo.adjuntos')}
                valor={reclamo.adjuntos.length > 0 ? t('reclamo.nAdjuntos', { count: reclamo.adjuntos.length }) : <span className="text-fg-muted">{t('reclamo.sinAdjuntos')}</span>}
              />
              {reclamo.aprobado && (
                <FilaDato etiqueta={t('reclamo.aprobado')} valor={[formatDateTime(reclamo.aprobado.fecha), reclamo.aprobado.por].filter(Boolean).join(' · ')} />
              )}
            </ListaDatos>
          </Tarjeta>

          {reclamo.rma && (
            <Tarjeta titulo={t('rma.titulo')} className="hidden lg:flex">
              <ListaDatos etiqueta={t('rma.titulo')}>
                <FilaDato
                  etiqueta={t('rma.proveedor')}
                  valor={reclamo.proveedor?.nombre ?? <span className="text-fg-muted">{t('sinDato')}</span>}
                  href={reclamo.proveedor ? rutaProveedor(reclamo.proveedor.uuid ?? null) ?? undefined : undefined}
                />
                <FilaDato etiqueta={t('rma.numero')} valor={reclamo.rma.numero ?? '—'} />
                <FilaDato etiqueta={t('rma.transportadora')} valor={reclamo.rma.transportadora ?? '—'} />
                <FilaDato etiqueta={t('rma.guia')} valor={reclamo.rma.guia ?? '—'} />
                <FilaDato etiqueta={t('rma.enviado')} valor={[formatDateTime(reclamo.rma.fecha), reclamo.rma.por].filter(Boolean).join(' · ') || '—'} />
                {reclamo.rma.notas && <FilaDato etiqueta={t('rma.notas')} valor={reclamo.rma.notas} />}
              </ListaDatos>
            </Tarjeta>
          )}

          {reclamo.resolucion && (
            <Tarjeta titulo={t('resolucion.titulo')} tono={reclamo.estado === 'rejected' ? 'peligro' : 'exito'}>
              <ListaDatos etiqueta={t('resolucion.titulo')}>
                <FilaDato etiqueta={t('resolucion.tipo')} valor={reclamo.resolucion.tipo ? tres(reclamo.resolucion.tipo) : '—'} />
                {reclamo.resolucion.reemplazo && (
                  <FilaDato etiqueta={t('resolucion.reemplazo')} valor={reclamo.resolucion.reemplazo.serial} href={rutaSerial(reclamo.resolucion.reemplazo.id)} />
                )}
                {reclamo.resolucion.monto !== null && <FilaDato etiqueta={t('resolucion.monto')} valor={formatear(reclamo.resolucion.monto)} />}
                {reclamo.resolucion.notas && <FilaDato etiqueta={t('resolucion.notas')} valor={reclamo.resolucion.notas} />}
                <FilaDato etiqueta={t('resolucion.fecha')} valor={[formatDateTime(reclamo.resolucion.fecha), reclamo.resolucion.por].filter(Boolean).join(' · ') || '—'} />
              </ListaDatos>
            </Tarjeta>
          )}
        </div>

        <Tarjeta titulo={t('historial')} className="hidden lg:flex">
          <HistorialSerial eventos={reclamo.eventos} proveedor={reclamo.proveedor?.nombre ?? null} pendiente={pendiente} etiqueta={t('historial')} />
        </Tarjeta>
      </div>

      {gestionar && (puede.resolver || puede.aprobar) && (
        <div className="grid grid-cols-2 gap-3 lg:hidden">
          {puede.resolver && (
            <Button variant="outline" className="h-11 gap-2" onClick={() => acciones.abrirResolver(accionable)}>
              <Wrench aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('resolver')}
            </Button>
          )}
          {puede.aprobar && (
            <Button className="h-11 gap-2" onClick={() => void acciones.aprobar(accionable)} disabled={acciones.trabajando}>
              <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('aprobar')}
            </Button>
          )}
        </div>
      )}

      {acciones.dialogos}
    </div>
  );
}

export default GarantiaDetailPage;
