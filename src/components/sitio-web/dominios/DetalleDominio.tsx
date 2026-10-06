'use client';

/**
 * /app/sitio-web/dominios/[dominioId] (Figma B/07-21; móvil en una columna con
 * la cabecera publicada en el MobileHeader, patrón B/07-26).
 *
 * Columna principal: Conexión DNS, Certificado HTTPS y Redirecciones. Lateral:
 * Renovación, Llevarlo a otro proveedor y Quitar dominio. Estados: cargando,
 * listo (comprado aquí o externo), no encontrado / de otra organización, sin
 * permiso y error con «Reintentar».
 *
 * Datos: `GET /api/sitio-web/dominios/[id]`; acciones del hook único
 * `useDominiosSitio` y los mismos diálogos que la lista.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ICONO_ACCION_DOMINIO as ICONO, ICONO_PAGINA_DOMINIOS, ICONO_TARJETA_DOMINIO as TARJETA, IconoDominio } from './iconosDominios';
import { EmptyState, FilaDato, ListaDatos, PageHeader, RowActionsMenu, SettingRow, Skeleton, StatusBadge, Tarjeta, clasesBoton, useEsEscritorio, type AccionFila, type Miga } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { CODIGO_MODULO_SITIO_WEB } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB, RUTA_DOMINIOS_SITIO_WEB } from '../rutasSitioWeb';
import { DnsRecordRow } from '../ui/DnsRecordRow';
import { DomainStatusBadge } from '../ui/DomainStatusBadge';
import { PriceTag } from '../ui/PriceTag';
import { AvisoDominio } from './AvisoDominio';
import { DialogoCambiarSubdominio } from './DialogoCambiarSubdominio';
import { DialogoCodigoTransferencia } from './DialogoCodigoTransferencia';
import { DialogoConectarDominio } from './DialogoConectarDominio';
import { textoRegistros } from './nombreDns';
import { DialogoQuitarDominio } from './DialogoQuitarDominio';
import { InsigniaPrincipal } from './ListaDominios';
import { apiDominios, ErrorApiDominios, mensajeDeError } from './apiDominios';
import { puedeSerPrincipal } from './estadoDominio';
import type { RespuestaDetalleDominio } from './tiposDominios';
import { useTextosDominios } from './textos';
import { useDominiosSitio } from './useDominiosSitio';
import { useFormatoDominio } from './useFormatoDominio';

type EstadoDetalle = 'cargando' | 'listo' | 'no_existe' | 'sin_permiso' | 'error';

export function DetalleDominio({ dominioId }: { dominioId: string }) {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  const tNav = useTranslations('nav');
  const nombres = useNombresNav();
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const dom = useDominiosSitio();
  const [detalle, setDetalle] = useState<RespuestaDetalleDominio | null>(null);
  const [estado, setEstado] = useState<EstadoDetalle>('cargando');
  const [verificarAbierto, setVerificarAbierto] = useState(false);
  const [quitarAbierto, setQuitarAbierto] = useState(false);
  const [transferirAbierto, setTransferirAbierto] = useState(false);
  const [subdominioAbierto, setSubdominioAbierto] = useState(false);
  const [renovando, setRenovando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await apiDominios.detalle(dominioId);
      setDetalle(d);
      setEstado('listo');
    } catch (e) {
      setEstado(e instanceof ErrorApiDominios ? (e.estado === 404 ? 'no_existe' : e.esSinPermiso ? 'sin_permiso' : 'error') : 'error');
    }
  }, [dominioId]);

  useEffect(() => {
    setEstado('cargando');
    void cargar();
  }, [cargar]);

  const modulo = moduloPorCodigo(CODIGO_MODULO_SITIO_WEB);
  const paginaDominios = modulo?.paginas.find((p) => p.href === RUTA_DOMINIOS_SITIO_WEB);
  const nombreModulo = tNav(modulo?.etiqueta ?? 'sitioWeb');
  const nombreDominios = paginaDominios ? nombres.pagina(paginaDominios) : t('tabla.dominio');
  const d = detalle?.dominio ?? null;
  const migas: Miga[] = [
    { etiqueta: nombreModulo, href: RAIZ_SITIO_WEB },
    { etiqueta: nombreDominios, href: RUTA_DOMINIOS_SITIO_WEB },
    ...(d ? [{ etiqueta: d.host }] : []),
  ];

  const hacerPrincipal = async () => {
    if (!d) return;
    try {
      await dom.hacerPrincipal(d.id);
      toast.success(t('fila.principalListo', { host: d.host }));
      void cargar();
    } catch (e) {
      toast.error(mensajeDeError(t, e));
    }
  };

  const copiarRegistros = async () => {
    if (!detalle) return;
    try {
      await navigator.clipboard.writeText(textoRegistros(detalle.registros));
      toast.success(t('conectar.copiadoTodo'));
    } catch {
      toast.error(t('errores.error_interno'));
    }
  };

  const cambiarRenovacion = async (v: boolean) => {
    if (!d) return;
    setRenovando(true);
    try {
      await dom.autoRenovar(d.id, v);
      await cargar();
    } catch (e) {
      toast.error(mensajeDeError(t, e));
    } finally {
      setRenovando(false);
    }
  };

  const gestionar = detalle?.permisos.gestionar ?? false;
  const menu: AccionFila[] = d
    ? [
        { id: 'principal', etiqueta: t('fila.usarPrincipal'), icono: ICONO.principal, onSelect: () => void hacerPrincipal(), oculta: !gestionar || !puedeSerPrincipal(d) },
        { id: 'copiar', etiqueta: t('detalle.copiarRegistros'), icono: ICONO.copiar, onSelect: () => void copiarRegistros(), oculta: !detalle?.registros.length },
        { id: 'subdominio', etiqueta: t('pagina.cambiarSubdominio'), icono: ICONO.cambiarSubdominio, onSelect: () => setSubdominioAbierto(true), oculta: d.tipo !== 'subdominio' || !gestionar },
      ]
    : [];
  const hayMenu = menu.some((m) => !m.oculta);

  // Subtítulo: «Comprado con GO Admin el 14 mar 2024 · principal».
  const subtitulo = d
    ? [
        d.tipo === 'comprado' && d.compradoEn ? t('detalle.compradoEl', { fecha: f.fecha(d.compradoEn) }) : d.verificadoEn ? t('detalle.conectadoEl', { fecha: f.fecha(d.verificadoEn) }) : null,
        d.principal ? t('detalle.principal') : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined
    : estado === 'cargando'
      ? t('pagina.subtituloSinHost')
      : undefined;

  const debajo = d ? (
    <div className="flex flex-wrap items-center gap-2">
      <DomainStatusBadge estado={d.estado} diasParaVencer={d.diasParaVencer} />
      {d.principal && <InsigniaPrincipal />}
      <span className="text-[13px] text-fg-secondary">
        {d.revisadoEn
          ? d.estado === 'activo'
            ? t('detalle.ultimaVerificacion', { hace: f.hace(d.revisadoEn) })
            : t('detalle.ultimaVerificacionPendiente', { hace: f.hace(d.revisadoEn) })
          : d.tipo === 'subdominio'
            ? null
            : t('detalle.sinVerificar')}
      </span>
    </div>
  ) : undefined;

  const acciones =
    estado === 'listo' && d ? (
      <>
        <a href={`https://${d.host}`} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <IconoDominio icono={ICONO.verSitio} />
          {t('detalle.verSitio')}
        </a>
        {gestionar && d.tipo !== 'subdominio' && (
          <button type="button" onClick={() => setVerificarAbierto(true)} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            <IconoDominio icono={ICONO.verificar} />
            {t('detalle.verificarAhora')}
          </button>
        )}
        {hayMenu && <RowActionsMenu acciones={menu} titulo={d.host} orientacion="horizontal" tamano="md" />}
      </>
    ) : undefined;

  let cuerpo: React.ReactNode;
  if (estado === 'cargando') {
    cuerpo = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6" aria-busy="true">
        <div className="flex flex-col gap-4 lg:col-span-2 lg:gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4 lg:gap-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  } else if (estado === 'no_existe') {
    cuerpo = <EmptyState variante="error" titulo={t('detalle.noExisteTitulo')} descripcion={t('detalle.noExisteTexto')} accion={{ etiqueta: t('detalle.volver'), href: RUTA_DOMINIOS_SITIO_WEB }} />;
  } else if (estado === 'sin_permiso') {
    cuerpo = (
      <EmptyState
        variante="forbidden"
        titulo={t('estados.sinPermisoTitulo')}
        descripcion={t('estados.sinPermisoDescripcion')}
        accion={{ etiqueta: t('estados.volverResumen'), href: RAIZ_SITIO_WEB }}
      />
    );
  } else if (estado === 'error' || !detalle || !d) {
    cuerpo = (
      <EmptyState
        variante="error"
        titulo={t('estados.errorTitulo')}
        descripcion={t('estados.errorDescripcion')}
        accion={{ etiqueta: t('estados.reintentar'), icono: ICONO.actualizar, onClick: () => void cargar() }}
      />
    );
  } else {
    const comprado = d.tipo === 'comprado';
    const r = d.renovacion;
    const alertas = (dom.datos?.alertas ?? []).filter((a) => a.dominioId === d.id);
    cuerpo = (
      <div className="flex flex-col gap-4 lg:gap-6">
        {alertas.map((a) => (
          <AvisoDominio key={a.id} alerta={a} compacto={!escritorio} hrefDetalle={RUTA_DOMINIOS_SITIO_WEB} onActivarRenovacion={() => void cambiarRenovacion(true)} activando={renovando} />
        ))}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
            {d.tipo !== 'subdominio' && (
              <Tarjeta titulo={t('detalle.conexionTitulo')} icono={TARJETA.conexion} descripcion={comprado ? t('detalle.conexionComprado') : t('detalle.conexionPropio')}>
                {detalle.registros.length > 0 ? (
                  <div className={escritorio ? 'overflow-hidden rounded-xl border border-line' : 'flex flex-col gap-3'}>
                    {detalle.registros.map((x) => (
                      <DnsRecordRow key={`${x.tipo}-${x.nombre}-${x.valor}`} tipo={x.tipo} nombre={x.nombre} valor={x.valor} estado={x.estado} valorEncontrado={x.encontrado} variante={escritorio ? 'fila' : 'tarjeta'} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-fg-secondary">{t('detalle.sinRegistros')}</p>
                )}
                <p className="mt-3 text-xs text-fg-muted">{t('detalle.otrosRegistros')}</p>
              </Tarjeta>
            )}
            <Tarjeta titulo={t('detalle.sslTitulo')} icono={TARJETA.ssl}>
              <ListaDatos>
                <FilaDato
                  etiqueta={t('detalle.sslEstado')}
                  valor={
                    <span className={d.ssl === 'emitido' ? 'text-success-text' : d.ssl === 'pendiente' ? 'text-fg-secondary' : 'text-fg-muted'}>
                      {d.ssl === 'emitido' ? t('detalle.sslEmitido') : d.ssl === 'pendiente' ? t('detalle.sslPendiente') : t('detalle.sslNoAplica')}
                    </span>
                  }
                />
                {d.ssl === 'emitido' && <FilaDato etiqueta={t('detalle.sslEmisor')} valor={t('detalle.sslEmisorValor')} descripcion={t('detalle.sslRenueva')} />}
              </ListaDatos>
            </Tarjeta>
            <Tarjeta titulo={t('detalle.redireccionesTitulo')} icono={TARJETA.redirecciones} descripcion={t('detalle.redireccionesTexto')}>
              {detalle.redirecciones.length > 0 ? (
                <ul className="flex flex-col divide-y divide-line">
                  {detalle.redirecciones.map((x) => (
                    <li key={x.host} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-fg-secondary">
                        {x.host}
                        <IconoDominio icono={TARJETA.redirecciones} tamano="meta" />
                      </span>
                      <span className="truncate font-medium text-fg">{x.hacia}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-fg-secondary">{t('detalle.sinRedirecciones')}</p>
              )}
            </Tarjeta>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            {comprado && (r.tipo === 'automatica' || r.tipo === 'apagada') ? (
              <Tarjeta titulo={t('detalle.renovacionTitulo')} icono={TARJETA.renovacion}>
                <ListaDatos>
                  <FilaDato etiqueta={t('detalle.vence')} valor={r.venceEn ? f.fecha(r.venceEn) : t('detalle.venceDesconocido')} />
                </ListaDatos>
                <div className="-mx-4 sm:-mx-5">
                  <SettingRow titulo={t('detalle.renovarAuto')} descripcion={t('detalle.renovarAutoTexto')} htmlFor="renovar-auto-detalle">
                    <Switch
                      id="renovar-auto-detalle"
                      checked={r.tipo === 'automatica'}
                      disabled={!gestionar || renovando}
                      onCheckedChange={(v) => void cambiarRenovacion(v)}
                      className="data-[state=checked]:bg-brand-action data-[state=unchecked]:bg-line-strong focus-visible:ring-brand"
                    />
                  </SettingRow>
                </div>
                {r.precio !== null && r.moneda && (
                  <div className="flex flex-col">
                    <PriceTag valor={r.precio} moneda={r.moneda} tamano="sm" />
                    <span className="text-xs text-fg-muted">{t('detalle.precioVigente')}</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled
                  title={t('detalle.renovarAhoraNoDisponible')}
                  aria-describedby="renovar-ahora-motivo"
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-3 self-start' })}
                >
                  <IconoDominio icono={ICONO.renovar} />
                  {t('detalle.renovarAhora')}
                </button>
                <span id="renovar-ahora-motivo" className="mt-1 text-xs text-fg-muted">
                  {t('detalle.renovarAhoraNoDisponible')}
                </span>
              </Tarjeta>
            ) : (
              <Tarjeta titulo={t('detalle.proveedorTitulo')} icono={TARJETA.renovacion}>
                <p className="text-[13px] text-fg-secondary">
                  {d.tipo === 'subdominio' ? t('detalle.subdominioTexto') : d.tipo === 'alias_www' ? t('renovacion.incluida', { host: d.redirigeA ?? '' }) : t('detalle.proveedorTexto')}
                </p>
              </Tarjeta>
            )}
            {comprado && (
              <Tarjeta titulo={t('detalle.transferirTitulo')} icono={TARJETA.transferir}>
                <p className="text-[13px] text-fg-secondary">{t('detalle.transferirTexto')}</p>
                <button
                  type="button"
                  onClick={() => setTransferirAbierto(true)}
                  disabled={!gestionar}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-3 self-start' })}
                >
                  <IconoDominio icono={ICONO.transferir} />
                  {t('detalle.transferirBoton')}
                </button>
              </Tarjeta>
            )}
            {d.tipo !== 'subdominio' && gestionar && (
              <Tarjeta titulo={t('detalle.quitarTitulo')} icono={TARJETA.quitar} tono="peligro">
                <p className="text-[13px] text-fg-secondary">{t('detalle.quitarTexto', { host: d.host })}</p>
                <button type="button" onClick={() => setQuitarAbierto(true)} className={clasesBoton({ variante: 'destructivo', tamano: 'sm', className: 'mt-3 self-start' })}>
                  <IconoDominio icono={ICONO.quitar} />
                  {t('detalle.quitarBoton')}
                </button>
              </Tarjeta>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      <PageHeader
        titulo={d?.host ?? nombreDominios}
        subtitulo={subtitulo}
        icono={ICONO_PAGINA_DOMINIOS}
        migas={migas}
        variante="detail"
        cargando={estado === 'cargando'}
        badge={d && d.estado === 'activo' ? <StatusBadge estado="activo" etiqueta={t('detalle.activo')} /> : undefined}
        debajo={debajo}
        acciones={acciones}
        movil={{ titulo: d?.host ?? nombreDominios, subtitulo: nombreModulo, accion: hayMenu ? <RowActionsMenu acciones={menu} titulo={d?.host ?? ''} orientacion="horizontal" tamano="md" /> : undefined }}
      />
      {cuerpo}

      {d && detalle && (
        <>
          <DialogoConectarDominio
            abierto={verificarAbierto}
            onAbiertoChange={(v) => {
              setVerificarAbierto(v);
              if (!v) void cargar();
            }}
            inicio={{ modo: 'revisar', dominio: d }}
            conectar={dom.conectar}
            verificar={dom.verificar}
            hacerPrincipal={dom.hacerPrincipal}
            otrosHosts={[dom.datos?.hostPublico, detalle.hostSubdominio].filter((x): x is string => !!x)}
            onIrAComprar={() => router.push(`${RUTA_DOMINIOS_SITIO_WEB}?accion=comprar`)}
          />
          {quitarAbierto && (
            <DialogoQuitarDominio
              dominio={d}
              alias={detalle.redirecciones.filter((x) => x.host === `www.${d.host}`).map((x) => x.host)}
              hostSubdominio={detalle.hostSubdominio}
              onAbiertoChange={setQuitarAbierto}
              onQuitar={dom.quitar}
              onQuitado={(host) => {
                toast.success(t('quitar.quitado', { host }));
                router.push(RUTA_DOMINIOS_SITIO_WEB);
              }}
              onError={(m) => toast.error(m)}
            />
          )}
          {transferirAbierto && (
            <DialogoCodigoTransferencia
              dominio={d}
              transferencia={detalle.transferencia}
              correoCuenta={null}
              onAbiertoChange={setTransferirAbierto}
              onSolicitar={dom.solicitarCodigo}
              onEnviado={(correo) => toast.success(t('transferir.enviado', { correo }))}
            />
          )}
          <DialogoCambiarSubdominio
            abierto={subdominioAbierto}
            onAbiertoChange={setSubdominioAbierto}
            actual={dom.datos?.subdominio ?? null}
            onGuardar={dom.cambiarSubdominio}
            onGuardado={(host) => toast.success(t('subdominio.guardado', { host }))}
          />
        </>
      )}
    </div>
  );
}
