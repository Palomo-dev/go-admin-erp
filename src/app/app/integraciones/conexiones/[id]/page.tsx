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
 * En celular (85-54) es una sola columna larga, sin pestañas (decisión del dueño, 2026-11-09).
 *
 * Antes esta página leía las credenciales desde el navegador (en claro) y ofrecía «Reintentar
 * trabajo», que no procesa nadie.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowUpRight, Pause, Play, RefreshCw, Trash2, Unplug } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilaDato,
  ListCard,
  ListaDatos,
  PageHeader,
  Skeleton,
  StatusBadge,
  TabBar,
  Tarjeta,
  clasesBoton,
  idPanel,
  idPestana,
  useEsEscritorio,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { LogoServicio } from '@/components/integraciones/conexiones-v2/logos';
import { CredencialRevelable } from '@/components/integraciones/conexiones-v2/CredencialRevelable';
import { AsistenteConexion } from '@/components/integraciones/conexiones-v2/asistentes';
import { CampoCopiar } from '@/components/integraciones/conexiones-v2/asistentes/MarcoAsistente';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { apiConexiones, ErrorApiConexiones, type DetalleConexion, type EventoResumen, type ItemCatalogo, type Prueba } from '@/lib/services/integrations/conexiones/clienteConexiones';
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
  const esEscritorio = useEsEscritorio();
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
  // Celular (85-54): «Probar» y «Pausar» van en la fila de estado (visible bajo lg); el «⋯» del
  // MobileHeader lleva lo de la zona de peligro, que en escritorio queda al final de la página.
  const menuMovil: AccionFila[] = [
    { id: 'desconectar', etiqueta: t('detalle.peligro.boton', { nombre: nombreProveedor }), icono: Unplug, onSelect: () => setConfirmar('desconectar'), deshabilitada: c.estado === 'revoked', destructiva: true },
    { id: 'borrar', etiqueta: t('detalle.borrar.boton'), icono: Trash2, onSelect: () => setConfirmar('borrar'), deshabilitada: detalle.usadaPor.length > 0, motivo: detalle.usadaPor.length > 0 ? t('detalle.borrar.bloqueado') : undefined, destructiva: true },
  ];
  const ambiente = c.ambiente === 'production' ? t('comun.produccion') : t('comun.pruebas');
  const subtitulo = [ambiente, c.conectadaEn ? t('detalle.desde', { fecha: formatDate(c.conectadaEn) }) : null].filter(Boolean).join(' · ');
  const ultimaPrueba = c.ultimaPrueba ? t('detalle.ultimaPrueba', { fecha: formatDateTime(c.ultimaPrueba) }) : t('detalle.sinPruebas');
  const errores = t('detalle.errores24h', { n: c.errores24h });
  const tipoEvento = (e: EventoResumen) => (t.has(`detalle.tiposEvento.${e.tipo}`) ? t(`detalle.tiposEvento.${e.tipo}`) : e.tipo);
  const sentidoEvento = (e: EventoResumen) => (e.sentido === 'inbound' ? t('detalle.eventos.entrada', { nombre: nombreProveedor }) : t('detalle.eventos.salida', { nombre: nombreProveedor }));
  const badgeEvento = (e: EventoResumen) => (
    <StatusBadge
      estado={e.estado}
      tono={e.estado === 'error' ? 'peligro' : e.estado === 'processed' ? 'exito' : 'neutro'}
      etiqueta={t.has(`detalle.estadosEvento.${e.estado}`) ? t(`detalle.estadosEvento.${e.estado}`) : e.estado}
    />
  );
  const columnasEventos: ColumnaTabla<EventoResumen>[] = [
    { id: 'hora', encabezado: t('detalle.eventos.hora'), celda: (e) => <span className="whitespace-nowrap text-fg-secondary">{formatDateTime(e.creado)}</span> },
    {
      id: 'evento',
      encabezado: t('detalle.eventos.evento'),
      celda: (e) => (
        <div className="min-w-0">
          <p className="text-fg">{tipoEvento(e)}</p>
          {e.referencia && <p className="text-[13px] text-fg-secondary">{e.referencia}</p>}
          {e.error && <p className="text-[13px] text-danger-text">{e.error}</p>}
        </div>
      ),
    },
    { id: 'sentido', encabezado: t('detalle.eventos.sentido'), celda: (e) => <span className="whitespace-nowrap text-fg-secondary">{sentidoEvento(e)}</span>, ocultarDebajo: 'md' },
    { id: 'resultado', encabezado: t('detalle.eventos.resultado'), celda: badgeEvento },
  ];
  const abrirEvento = (e: EventoResumen) => router.push(`/app/integraciones/conexiones?tab=actividad&conexion=${encodeURIComponent(c.id)}&evento=${encodeURIComponent(e.id)}`);
  // En celular (< lg) la tabla pasa a tarjetas del kit: nada se sale de los 375 px.
  const tablaEventos = (
    <DataTable
      etiqueta={t('detalle.eventos.titulo')}
      columnas={columnasEventos}
      filas={detalle.eventos}
      obtenerId={(e) => e.id}
      estado={detalle.eventos.length === 0 ? 'vacio' : 'listo'}
      densidad="compacta"
      onFilaClick={abrirEvento}
      etiquetaFila={(e) => tipoEvento(e)}
      tonoFila={(e) => (e.estado === 'error' ? 'peligro' : undefined)}
      tarjetaMovil={(e) => (
        <ListCard
          icono={e.sentido === 'inbound' ? ArrowDownLeft : ArrowUpRight}
          titulo={tipoEvento(e)}
          subtitulo={[sentidoEvento(e), e.referencia, e.error].filter(Boolean).join(' · ')}
          meta={formatDateTime(e.creado)}
          estado={badgeEvento(e)}
          onClick={() => abrirEvento(e)}
        />
      )}
      vacio={{ titulo: t('detalle.sinEventos'), compacto: true }}
    />
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

  const avisoUltimoError = c.ultimoError ? (
    <AvisoTonal
      tono="advertencia"
      titulo={t('detalle.ultimoError.titulo')}
      descripcion={[c.ultimoError, c.ultimoErrorEn ? formatDateTime(c.ultimoErrorEn) : null].filter(Boolean).join(' · ')}
      accion={{ etiqueta: t('detalle.ultimoError.verActividad'), href: `/app/integraciones/conexiones?tab=actividad&conexion=${encodeURIComponent(c.id)}` }}
    />
  ) : null;

  const tarjetaWebhook = detalle.webhookUrl ? (
    <Tarjeta titulo={t('detalle.webhook.titulo')} descripcion={t('detalle.webhook.descripcion', { nombre: nombreProveedor })}>
      <div className="flex flex-col gap-3">
        <CampoCopiar valor={detalle.webhookUrl} etiquetaCopiar={t('comun.copiar')} etiquetaCopiado={t('comun.copiado')} />
        {detalle.webhookOrigen === 'tienda' && <p className="text-[13px] leading-[18px] text-fg-secondary">{t('webhookWompi.dominioTienda')}</p>}
        {detalle.webhookSinDominio && (
          <AvisoTonal tono="advertencia" titulo={t('webhookWompi.sinDominioTitulo')} descripcion={t('webhookWompi.sinDominioDescripcion')} />
        )}
      </div>
    </Tarjeta>
  ) : null;

  const tarjetaEventos = (
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
  );

  const tarjetaConectadoComo = c.cuentaVerificada ? (
    <ConectadoComo
      cuenta={c.cuentaVerificada}
      nota={c.cuentaVerificada.verificadaEn ? t('conectadoComo.verificadaEn', { fecha: formatDate(c.cuentaVerificada.verificadaEn) }) : null}
    />
  ) : null;

  const tarjetaUsadaPor = (
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
  );

  const tarjetaPeligro = (
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
        // En celular (< lg) el PageHeader no se dibuja: «Probar» se repite en la fila de estado (abajo)
        // y el «⋯» del MobileHeader lleva Desconectar y Borrar (guardarraíl `accionesMovil.test.ts`).
        movil={{ subtitulo: nombreProveedor || undefined, menu: menuMovil }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-secondary">
        <span>{ultimaPrueba} · {errores}</span>
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'lg:hidden' })}
          onClick={() => void probar()}
          disabled={probando || c.estado === 'revoked'}
          aria-busy={probando || undefined}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {probando ? t('detalle.probando') : t('detalle.probar')}
        </button>
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

      {esEscritorio ? (
        <>
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
                {avisoUltimoError}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="flex min-w-0 flex-col gap-4">
                    {tarjetaWebhook}
                    {tarjetaEventos}
                  </div>
                  <div className="flex min-w-0 flex-col gap-4">
                    {tarjetaConectadoComo}
                    {tarjetaCredenciales}
                    {tarjetaUsadaPor}
                    {tarjetaPeligro}
                  </div>
                </div>
              </>
            )}
            {pestana === 'credenciales' && <div className="max-w-2xl">{tarjetaCredenciales}</div>}
            {pestana === 'actividad' && tarjetaEventos}
          </div>
        </>
      ) : (
        // Celular (85-54, decisión del dueño): una sola columna larga, sin pestañas, en el orden del
        // diseño: aviso · conectado como · credenciales · webhook · dónde se usa · actividad · peligro.
        <div className="flex min-w-0 flex-col gap-4">
          {avisoUltimoError}
          {tarjetaConectadoComo}
          {tarjetaCredenciales}
          {tarjetaWebhook}
          {tarjetaUsadaPor}
          {tarjetaEventos}
          {tarjetaPeligro}
        </div>
      )}

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
