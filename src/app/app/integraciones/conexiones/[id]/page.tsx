'use client';

/**
 * Detalle de una conexión (diseño 85-13, Frente INT 2026-11-07).
 *
 * Todo sale de `GET /api/integrations/conexiones/[id]` (organización y permisos en el servidor):
 * credenciales SOLO con su máscara (prefijo/últimos 4) y dónde están guardadas, «Usada por»,
 * últimos eventos y la URL de webhook REAL. «Probar» llama al proveedor en el servidor y nunca
 * cambia el estado de la conexión; «Pausar» y «Desconectar» piden confirmación porque una pasarela
 * pausada deja de cobrar en el POS y en la tienda.
 *
 * Antes esta página leía las credenciales desde el navegador (en claro) y ofrecía «Reintentar
 * trabajo», que no procesa nadie.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pause, Play, RefreshCw, Trash2, Unplug } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  Skeleton,
  StatusBadge,
  TabBar,
  Tarjeta,
  clasesBoton,
  idPanel,
  idPestana,
} from '@/components/kit';
import { LogoServicio } from '@/components/integraciones/conexiones-v2/logos';
import { CredencialRevelable } from '@/components/integraciones/conexiones-v2/CredencialRevelable';
import { AsistenteConexion } from '@/components/integraciones/conexiones-v2/asistentes';
import { CampoCopiar } from '@/components/integraciones/conexiones-v2/asistentes/MarcoAsistente';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { apiConexiones, ErrorApiConexiones, type DetalleConexion, type ItemCatalogo, type Prueba } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { ConectadoComo } from '@/components/integraciones/conexiones-v2/ConectadoComo';

type Pestana = 'resumen' | 'credenciales' | 'actividad';
const ID_TABS = 'detalle-conexion';

const TONO_ESTADO: Record<string, 'exito' | 'advertencia' | 'peligro' | 'neutro'> = {
  connected: 'exito',
  paused: 'advertencia',
  error: 'peligro',
  draft: 'neutro',
  revoked: 'neutro',
};

const TONO_PRUEBA: Record<Prueba['resultado'], 'exito' | 'peligro' | 'advertencia' | 'informacion'> = {
  correcta: 'exito',
  rechazada: 'peligro',
  sin_respuesta: 'advertencia',
  sin_prueba: 'informacion',
};

export default function DetalleConexionPage() {
  const t = useTranslations('integracionesConexiones');
  const params = useParams();
  const router = useRouter();
  const { formatDate, formatDateTime } = useFormatDate();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [detalle, setDetalle] = useState<DetalleConexion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ status: number; mensaje: string } | null>(null);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [confirmar, setConfirmar] = useState<'pausar' | 'desconectar' | 'borrar' | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [reemplazando, setReemplazando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setDetalle(await apiConexiones.detalle(id));
    } catch (err) {
      setError({ status: err instanceof ErrorApiConexiones ? err.status : 500, mensaje: err instanceof Error ? err.message : '' });
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const c = detalle?.conexion;
  const nombreProveedor = c?.proveedorNombre || c?.proveedor || '';
  useCabeceraMovil({ modo: 'page', titulo: c?.nombre, subtitulo: nombreProveedor || undefined, volverA: '/app/integraciones/conexiones' });

  /** Ítem del catálogo para abrir «Reemplazar llave» con el mismo asistente de la conexión nueva. */
  const itemReemplazo = useMemo<ItemCatalogo | null>(() => {
    if (!detalle?.asistenteLlaves || !c) return null;
    return {
      id: detalle.asistenteLlaves,
      grupo: 'cobros',
      proveedor: c.proveedor,
      nombre: c.proveedorNombre || null,
      asistente: 'llaves',
      llaves: detalle.asistenteLlaves,
      estado: 'conectado',
      conexiones: [c.id],
      conexionPrincipal: c.id,
    };
  }, [detalle, c]);

  const probar = async () => {
    setProbando(true);
    setErrorAccion(null);
    try {
      setPrueba(await apiConexiones.probar(id));
      await cargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : t('detalle.errorAccion'));
    } finally {
      setProbando(false);
    }
  };

  const cambiarEstado = async (accion: 'pausar' | 'reanudar' | 'desconectar') => {
    setCambiando(true);
    setErrorAccion(null);
    try {
      await apiConexiones.cambiarEstado(id, accion);
      setConfirmar(null);
      if (accion === 'desconectar') {
        router.push('/app/integraciones/conexiones?tab=mis-conexiones');
        return;
      }
      await cargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : t('detalle.errorAccion'));
    } finally {
      setCambiando(false);
    }
  };

  /** Borrar: el servidor se niega si un método de pago la usa (desenlazar primero) o si ya hay historia. */
  const borrar = async () => {
    setCambiando(true);
    setErrorAccion(null);
    try {
      await apiConexiones.eliminar(id);
      setConfirmar(null);
      router.push('/app/integraciones/conexiones?tab=mis-conexiones');
    } catch (err) {
      setConfirmar(null);
      const codigo = err instanceof ErrorApiConexiones ? err.codigo : '';
      setErrorAccion(
        codigo === 'EN_USO'
          ? t('detalle.borrar.enUso')
          : codigo === 'CON_HISTORIA'
            ? t('detalle.borrar.conHistoria')
            : err instanceof Error ? err.message : t('detalle.errorAccion'),
      );
    } finally {
      setCambiando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !detalle || !c) {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState
          titulo={error?.status === 404 ? t('detalle.noEncontrada') : t('comun.errorCarga')}
          descripcion={error?.status === 404 ? t('detalle.noEncontradaDescripcion') : error?.mensaje}
          accion={{ etiqueta: t('detalle.volver'), href: '/app/integraciones/conexiones' }}
        />
      </div>
    );
  }

  const activa = c.estado === 'connected' || c.estado === 'error';
  const ambiente = c.ambiente === 'production' ? t('comun.produccion') : t('comun.pruebas');
  const subtitulo = [ambiente, c.conectadaEn ? t('detalle.desde', { fecha: formatDate(c.conectadaEn) }) : null].filter(Boolean).join(' · ');
  const ultimaPrueba = c.ultimaPrueba ? t('detalle.ultimaPrueba', { fecha: formatDateTime(c.ultimaPrueba) }) : t('detalle.sinPruebas');
  const errores = t('detalle.errores24h', { n: c.errores24h });
  const tablaEventos = (
    detalle.eventos.length === 0 ? (
      <p className="text-sm text-fg-secondary">{t('detalle.sinEventos')}</p>
    ) : (
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">{t('detalle.eventos.hora')}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{t('detalle.eventos.evento')}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{t('detalle.eventos.sentido')}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{t('detalle.eventos.resultado')}</th>
            </tr>
          </thead>
          <tbody>
            {detalle.eventos.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">{formatDateTime(e.creado)}</td>
                <td className="px-4 py-3">
                  <p className="text-fg">{t.has(`detalle.tiposEvento.${e.tipo}`) ? t(`detalle.tiposEvento.${e.tipo}`) : e.tipo}</p>
                  {e.referencia && <p className="text-[13px] text-fg-secondary">{e.referencia}</p>}
                  {e.error && <p className="text-[13px] text-danger-text">{e.error}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                  {e.sentido === 'inbound' ? t('detalle.eventos.entrada', { nombre: nombreProveedor }) : t('detalle.eventos.salida', { nombre: nombreProveedor })}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    estado={e.estado}
                    tono={e.estado === 'error' ? 'peligro' : e.estado === 'processed' ? 'exito' : 'neutro'}
                    etiqueta={t.has(`detalle.estadosEvento.${e.estado}`) ? t(`detalle.estadosEvento.${e.estado}`) : e.estado}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  const tarjetaCredenciales = (
    <Tarjeta
      titulo={t('detalle.credenciales.titulo')}
      accion={
        itemReemplazo ? (
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setReemplazando(true)}>
            {t('detalle.credenciales.reemplazar')}
          </button>
        ) : undefined
      }
    >
      {detalle.credenciales.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('detalle.credenciales.ninguna')}</p>
      ) : (
        <ListaDatos etiqueta={t('detalle.credenciales.titulo')}>
          {detalle.credenciales.map((k) => (
            <FilaDato
              key={k.proposito}
              etiqueta={t.has(`asistente.llaves.campos.${k.proposito}`) ? t(`asistente.llaves.campos.${k.proposito}`) : k.proposito}
              valor={
                <CredencialRevelable
                  conexionId={c.id}
                  proposito={k.proposito}
                  mascara={k.mascara}
                  etiqueta={t.has(`asistente.llaves.campos.${k.proposito}`) ? t(`asistente.llaves.campos.${k.proposito}`) : k.proposito}
                />
              }
              descripcion={[
                k.enBoveda ? t('detalle.credenciales.enBoveda') : t('detalle.credenciales.enConexion'),
                k.actualizada ? t('detalle.credenciales.actualizada', { fecha: formatDate(k.actualizada) }) : null,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </ListaDatos>
      )}
      <p className="mt-3 text-[13px] leading-[18px] text-fg-secondary">{t('detalle.credenciales.nota')}</p>
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        variante="detail"
        titulo={c.nombre || nombreProveedor}
        miniatura={<LogoServicio id={c.proveedor} tamano="lg" titulo={nombreProveedor} />}
        badge={<StatusBadge estado={c.estado} tono={TONO_ESTADO[c.estado] ?? 'neutro'} etiqueta={t.has(`detalle.estados.${c.estado}`) ? t(`detalle.estados.${c.estado}`) : c.estado} />}
        subtitulo={subtitulo}
        migas={[
          { etiqueta: t('detalle.migas.integraciones'), href: '/app/integraciones' },
          { etiqueta: t('detalle.migas.conexiones'), href: '/app/integraciones/conexiones' },
          { etiqueta: c.nombre || nombreProveedor },
        ]}
        volverA="/app/integraciones/conexiones"
        acciones={
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void probar()} disabled={probando || c.estado === 'revoked'} aria-busy={probando || undefined}>
            <RefreshCw aria-hidden="true" className="size-4" />
            {probando ? t('detalle.probando') : t('detalle.probar')}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-secondary">
        <span>{ultimaPrueba} · {errores}</span>
        {activa && (
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setConfirmar('pausar')}>
            <Pause aria-hidden="true" className="size-4" />
            {t('detalle.pausar')}
          </button>
        )}
        {c.estado === 'paused' && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void cambiarEstado('reanudar')} disabled={cambiando}>
            <Play aria-hidden="true" className="size-4" />
            {t('detalle.reanudar')}
          </button>
        )}
      </div>

      {prueba && (
        <AvisoTonal
          tono={TONO_PRUEBA[prueba.resultado]}
          rol={prueba.resultado === 'correcta' ? 'status' : 'alert'}
          titulo={t(`detalle.prueba.${prueba.resultado}.titulo`, { nombre: nombreProveedor, http: prueba.http ?? '' })}
          descripcion={t(`detalle.prueba.${prueba.resultado}.descripcion`, { nombre: nombreProveedor })}
        />
      )}
      {prueba?.resultado === 'correcta' && prueba.cuenta && <ConectadoComo cuenta={prueba.cuenta} />}
      {errorAccion && <AvisoTonal tono="peligro" rol="alert" titulo={t('detalle.errorAccion')} descripcion={errorAccion} />}

      <TabBar<Pestana>
        id={ID_TABS}
        etiqueta={t('detalle.pestanas.etiqueta')}
        pestanas={[
          { valor: 'resumen', etiqueta: t('detalle.pestanas.resumen') },
          { valor: 'credenciales', etiqueta: t('detalle.pestanas.credenciales'), contador: detalle.credenciales.length },
          { valor: 'actividad', etiqueta: t('detalle.pestanas.actividad') },
        ]}
        valor={pestana}
        onValorChange={setPestana}
      />

      <div role="tabpanel" id={idPanel(ID_TABS, pestana)} aria-labelledby={idPestana(ID_TABS, pestana)} className="flex flex-col gap-4">
        {pestana === 'resumen' && (
          <>
            {c.ultimoError && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('detalle.ultimoError.titulo')}
                descripcion={[c.ultimoError, c.ultimoErrorEn ? formatDateTime(c.ultimoErrorEn) : null].filter(Boolean).join(' · ')}
                accion={{ etiqueta: t('detalle.ultimoError.verActividad'), href: `/app/integraciones/conexiones?tab=actividad&conexion=${encodeURIComponent(c.id)}` }}
              />
            )}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-w-0 flex-col gap-4">
                {detalle.webhookUrl && (
                  <Tarjeta titulo={t('detalle.webhook.titulo')} descripcion={t('detalle.webhook.descripcion', { nombre: nombreProveedor })}>
                    <div className="flex flex-col gap-3">
                      <CampoCopiar valor={detalle.webhookUrl} etiquetaCopiar={t('comun.copiar')} etiquetaCopiado={t('comun.copiado')} />
                      {detalle.webhookOrigen === 'tienda' && <p className="text-[13px] leading-[18px] text-fg-secondary">{t('webhookWompi.dominioTienda')}</p>}
                      {detalle.webhookSinDominio && (
                        <AvisoTonal tono="advertencia" titulo={t('webhookWompi.sinDominioTitulo')} descripcion={t('webhookWompi.sinDominioDescripcion')} />
                      )}
                    </div>
                  </Tarjeta>
                )}
                <Tarjeta
                  titulo={t('detalle.eventos.titulo')}
                  accion={
                    <Link href={`/app/integraciones/conexiones?tab=actividad&conexion=${encodeURIComponent(c.id)}`} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                      {t('detalle.eventos.verTodo')}
                    </Link>
                  }
                >
                  {tablaEventos}
                </Tarjeta>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                {c.cuentaVerificada && (
                  <ConectadoComo
                    cuenta={c.cuentaVerificada}
                    nota={c.cuentaVerificada.verificadaEn ? t('conectadoComo.verificadaEn', { fecha: formatDate(c.cuentaVerificada.verificadaEn) }) : null}
                  />
                )}
                {tarjetaCredenciales}
                <Tarjeta titulo={t('detalle.usadaPor.titulo')}>
                  {detalle.usadaPor.length === 0 ? (
                    <p className="text-sm text-fg-secondary">{t('detalle.usadaPor.ninguno')}</p>
                  ) : (
                    <ListaDatos etiqueta={t('detalle.usadaPor.titulo')}>
                      {detalle.usadaPor.map((u) => (
                        <FilaDato
                          key={u.codigo}
                          etiqueta={t('detalle.usadaPor.metodo', { metodo: u.codigo })}
                          valor={u.tienda ? t('detalle.usadaPor.tiendaWeb') : t('detalle.usadaPor.soloInterno')}
                          href="/app/finanzas/metodos-pago"
                        />
                      ))}
                    </ListaDatos>
                  )}
                </Tarjeta>
                <Tarjeta titulo={t('detalle.peligro.titulo')} tono="peligro">
                  <p className="text-sm text-fg-secondary">{t('detalle.peligro.descripcion')}</p>
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-3' })}
                    onClick={() => setConfirmar('desconectar')}
                    disabled={c.estado === 'revoked'}
                  >
                    <Unplug aria-hidden="true" className="size-4" />
                    {t('detalle.peligro.boton', { nombre: nombreProveedor })}
                  </button>
                  <p className="mt-4 text-sm text-fg-secondary">
                    {detalle.usadaPor.length > 0 ? t('detalle.borrar.bloqueado') : t('detalle.borrar.descripcion')}
                  </p>
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'destructivo', tamano: 'sm', className: 'mt-3' })}
                    onClick={() => setConfirmar('borrar')}
                    disabled={detalle.usadaPor.length > 0}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    {t('detalle.borrar.boton')}
                  </button>
                </Tarjeta>
              </div>
            </div>
          </>
        )}
        {pestana === 'credenciales' && <div className="max-w-2xl">{tarjetaCredenciales}</div>}
        {pestana === 'actividad' && (
          <Tarjeta
            titulo={t('detalle.eventos.titulo')}
            accion={
              <Link href={`/app/integraciones/conexiones?tab=actividad&conexion=${encodeURIComponent(c.id)}`} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                {t('detalle.eventos.verTodo')}
              </Link>
            }
          >
            {tablaEventos}
          </Tarjeta>
        )}
      </div>

      <ConfirmDialog
        abierto={confirmar === 'pausar'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        titulo={t('detalle.confirmarPausa.titulo', { nombre: nombreProveedor })}
        descripcion={t('detalle.confirmarPausa.descripcion', { nombre: nombreProveedor })}
        textoConfirmar={t('detalle.pausar')}
        tono="advertencia"
        cargando={cambiando}
        onConfirmar={() => cambiarEstado('pausar')}
      />
      <ConfirmDialog
        abierto={confirmar === 'desconectar'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        titulo={t('detalle.confirmarDesconexion.titulo', { nombre: nombreProveedor })}
        descripcion={t('detalle.confirmarDesconexion.descripcion', { nombre: nombreProveedor })}
        textoConfirmar={t('detalle.peligro.boton', { nombre: nombreProveedor })}
        tono="peligro"
        cargando={cambiando}
        onConfirmar={() => cambiarEstado('desconectar')}
      />
      <ConfirmDialog
        abierto={confirmar === 'borrar'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        titulo={t('detalle.borrar.confirmarTitulo', { nombre: c.nombre })}
        descripcion={t('detalle.borrar.confirmarDescripcion')}
        textoConfirmar={t('detalle.borrar.boton')}
        tono="peligro"
        cargando={cambiando}
        onConfirmar={() => void borrar()}
      />
      {itemReemplazo && (
        <AsistenteConexion
          item={itemReemplazo}
          abierto={reemplazando}
          conexionId={c.id}
          onCerrar={() => setReemplazando(false)}
          onConectado={() => {
            setReemplazando(false);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
