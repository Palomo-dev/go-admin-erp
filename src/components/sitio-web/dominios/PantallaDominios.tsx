'use client';

/**
 * /app/sitio-web/dominios (Figma B/07-01…07-05, 07-24, 07-25). Une el hook
 * único `useDominiosSitio` con la lista, el vacío, los avisos y los diálogos
 * únicos del flujo. Los diálogos de conectar y comprar se abren también con
 * `?accion=conectar|comprar[&sede=<id>]` (Sedes en la web, el asistente y las
 * alertas del Resumen llegan así, con todo preseleccionado).
 *
 * Estados: cargando (cabecera completa + tabla en esqueleto), listo, vacío
 * (solo el subdominio), error con «Reintentar» y sin permiso.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EmptyState, clasesBoton, useEsEscritorio, useParametrosUrl, type AccionFila } from '@/components/kit';
import { MarcoSitioWeb } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB, RUTA_DOMINIOS_SITIO_WEB, rutaDetalleDominio } from '../rutasSitioWeb';
import { AvisoDominio } from './AvisoDominio';
import { BarraAccionesMovil } from './BarraAccionesMovil';
import { DialogoCambiarSubdominio } from './DialogoCambiarSubdominio';
import { DialogoCodigoTransferencia } from './DialogoCodigoTransferencia';
import { DialogoComprarDominio } from './DialogoComprarDominio';
import { DialogoConectarDominio, type InicioConectar } from './DialogoConectarDominio';
import { DialogoQuitarDominio } from './DialogoQuitarDominio';
import { DominiosVacio } from './DominiosVacio';
import { ICONO_ACCION_DOMINIO as ICONO, ICONO_PAGINA_DOMINIOS, IconoDominio } from './iconosDominios';
import { ListaDominios } from './ListaDominios';
import { TarjetasAyudaDominios } from './TarjetasAyudaDominios';
import { mensajeDeError } from './apiDominios';
import { hayDominiosPropios, puedeSerPrincipal, transferenciaDisponible } from './estadoDominio';
import type { DominioSitio } from './tiposDominios';
import { useTextosDominios } from './textos';
import { useDominiosSitio } from './useDominiosSitio';

const ACCIONES = ['conectar', 'comprar'] as const;
type AccionUrl = (typeof ACCIONES)[number];

export function PantallaDominios() {
  const t = useTextosDominios();
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const { leer, fijar } = useParametrosUrl();
  const sedeParam = leer('sede');
  // La sede de `?sede=` la resuelve el servidor en la misma lectura (`datos.sede`).
  const dom = useDominiosSitio({ sedeId: sedeParam && /^\d+$/.test(sedeParam) ? Number(sedeParam) : null });
  const { datos, cargando, refrescando, fallo } = dom;
  const sede = datos?.sede ?? null;

  const accionUrl = leer('accion');
  const accion: AccionUrl | null = (ACCIONES as readonly string[]).includes(accionUrl ?? '') ? (accionUrl as AccionUrl) : null;

  const [inicioConectar, setInicioConectar] = useState<InicioConectar>({ modo: 'nuevo' });
  const [conectarAbierto, setConectarAbierto] = useState(false);
  const [subdominioAbierto, setSubdominioAbierto] = useState(false);
  const [aQuitar, setAQuitar] = useState<DominioSitio | null>(null);
  const [aTransferir, setATransferir] = useState<DominioSitio | null>(null);
  const [activando, setActivando] = useState<string | null>(null);

  // `?accion=` abre el diálogo correspondiente al cargar (y con atrás/adelante).
  useEffect(() => {
    if (accion === 'conectar') {
      setInicioConectar({ modo: 'nuevo' });
      setConectarAbierto(true);
    } else {
      setConectarAbierto((v) => (inicioConectar.modo === 'nuevo' ? false : v));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion]);

  const abrirConectar = useCallback(() => fijar({ accion: 'conectar' }), [fijar]);
  const abrirComprar = useCallback(() => fijar({ accion: 'comprar' }), [fijar]);
  const cerrarAccion = useCallback(() => fijar({ accion: null, sede: null }, 'replace'), [fijar]);

  const permisos = datos?.permisos ?? { gestionar: false, comprar: false };
  const dominios = datos?.dominios ?? [];
  const hayPrincipalPropio = dominios.some((d) => d.principal && d.tipo !== 'subdominio');
  const otrosHosts = useMemo(() => {
    const hs = new Set<string>();
    if (datos?.hostPublico) hs.add(datos.hostPublico);
    if (datos?.hostSubdominio) hs.add(datos.hostSubdominio);
    return [...hs];
  }, [datos?.hostPublico, datos?.hostSubdominio]);

  const copiar = async (host: string) => {
    try {
      await navigator.clipboard.writeText(`https://${host}`);
      toast.success(t('fila.copiada'));
    } catch {
      toast.error(t('errores.error_interno'));
    }
  };

  const hacerPrincipal = async (d: DominioSitio) => {
    try {
      await dom.hacerPrincipal(d.id);
      toast.success(t('fila.principalListo', { host: d.host }));
    } catch (e) {
      toast.error(mensajeDeError(t, e));
    }
  };

  const abrir = (d: DominioSitio) => {
    if (d.tipo === 'subdominio') setSubdominioAbierto(true);
    else router.push(rutaDetalleDominio(d.id));
  };

  const abrirConectarCon = (inicio: InicioConectar) => {
    setInicioConectar(inicio);
    setConectarAbierto(true);
  };

  const accionesFila = (d: DominioSitio): AccionFila[] => {
    if (!permisos.gestionar) return [{ id: 'copiar', etiqueta: t('fila.copiarDireccion'), icono: ICONO.copiar, onSelect: () => void copiar(d.host) }];
    const esSub = d.tipo === 'subdominio';
    return [
      { id: 'detalle', etiqueta: t('fila.verDetalle'), icono: ICONO.verDetalle, onSelect: () => abrir(d), oculta: esSub },
      { id: 'subdominio', etiqueta: t('pagina.cambiarSubdominio'), icono: ICONO.cambiarSubdominio, onSelect: () => setSubdominioAbierto(true), oculta: !esSub },
      { id: 'principal', etiqueta: t('fila.usarPrincipal'), icono: ICONO.principal, onSelect: () => void hacerPrincipal(d), oculta: !puedeSerPrincipal(d) },
      {
        id: 'verificar',
        etiqueta: t('fila.verificarAhora'),
        icono: ICONO.verificar,
        onSelect: () => abrirConectarCon({ modo: 'revisar', dominio: d }),
        oculta: esSub || d.tipo === 'alias_www' || d.estado === 'activo',
      },
      { id: 'copiar', etiqueta: t('fila.copiarDireccion'), icono: ICONO.copiar, onSelect: () => void copiar(d.host) },
      { id: 'transferir', etiqueta: t('fila.llevarOtro'), icono: ICONO.transferir, onSelect: () => setATransferir(d), oculta: d.tipo !== 'comprado' },
      { id: 'quitar', etiqueta: t('fila.quitar'), icono: ICONO.quitar, onSelect: () => setAQuitar(d), destructiva: true, separadorAntes: true, oculta: esSub },
    ];
  };

  const activarRenovacion = async (dominioId: string, host: string) => {
    setActivando(dominioId);
    try {
      await dom.autoRenovar(dominioId, true);
      toast.success(t('alerta.renovacionActivada', { host }));
    } catch (e) {
      toast.error(mensajeDeError(t, e));
    } finally {
      setActivando(null);
    }
  };

  // ── Cabecera ────────────────────────────────────────────────────────────────
  const sinPermiso = fallo === 'sin_permiso' || (!!datos && !permisos.gestionar);
  const botonActualizar = (
    <button
      type="button"
      onClick={() => void dom.recargar()}
      aria-label={t('pagina.actualizar')}
      title={t('pagina.actualizar')}
      className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}
    >
      <IconoDominio icono={ICONO.actualizar} girando={refrescando} />
    </button>
  );
  const accionesSecundarias = sinPermiso ? (
    botonActualizar
  ) : (
    <>
      {botonActualizar}
      <button type="button" onClick={abrirConectar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
        <IconoDominio icono={ICONO.conectar} />
        {t('pagina.conectar')}
      </button>
    </>
  );
  const accionPrimaria = sinPermiso ? (
    <></>
  ) : (
    <button
      type="button"
      onClick={abrirComprar}
      disabled={!!datos && !permisos.comprar}
      title={datos && !permisos.comprar ? t('pagina.sinPermisoComprar') : undefined}
      className={clasesBoton({ variante: 'primario', tamano: 'md' })}
    >
      <IconoDominio icono={ICONO.comprar} />
      {t('pagina.comprar')}
    </button>
  );
  const menu: AccionFila[] = sinPermiso
    ? escritorio
      ? []
      : [{ id: 'actualizar', etiqueta: t('pagina.actualizar'), icono: ICONO.actualizar, onSelect: () => void dom.recargar() }]
    : [
        ...(escritorio ? [] : [{ id: 'actualizar', etiqueta: t('pagina.actualizar'), icono: ICONO.actualizar, onSelect: () => void dom.recargar() }]),
        { id: 'subdominio', etiqueta: t('pagina.cambiarSubdominio'), icono: ICONO.cambiarSubdominio, onSelect: () => setSubdominioAbierto(true) },
      ];

  const propios = hayDominiosPropios(dominios);
  const subtitulo = cargando || !datos ? t('pagina.subtituloSinHost') : !propios && datos.hostSubdominio ? t('pagina.subtituloVacio', { host: datos.hostSubdominio }) : datos.hostPublico ? t('pagina.subtitulo', { host: datos.hostPublico }) : t('pagina.subtituloSinHost');

  // ── Contenido ───────────────────────────────────────────────────────────────
  let contenido: React.ReactNode;
  if (cargando && !datos) {
    contenido = <ListaDominios dominios={[]} estado="cargando" onAbrir={() => undefined} onContextual={() => undefined} acciones={() => []} />;
  } else if (sinPermiso) {
    contenido = (
      <EmptyState
        variante="forbidden"
        titulo={t('estados.sinPermisoTitulo')}
        descripcion={t('estados.sinPermisoDescripcion')}
        accion={{ etiqueta: t('estados.volverResumen'), href: RAIZ_SITIO_WEB }}
      />
    );
  } else if (fallo === 'error' || !datos) {
    contenido = (
      <EmptyState
        variante="error"
        titulo={t('estados.errorTitulo')}
        descripcion={t('estados.errorDescripcion')}
        accion={{ etiqueta: t('estados.reintentar'), icono: ICONO.actualizar, onClick: () => void dom.recargar() }}
      />
    );
  } else if (!propios) {
    contenido = (
      <DominiosVacio
        hostSubdominio={datos.hostSubdominio}
        onCambiarSubdominio={() => setSubdominioAbierto(true)}
        onConectar={abrirConectar}
        onComprar={abrirComprar}
        puedeComprar={permisos.comprar}
      />
    );
  } else {
    contenido = (
      <div className="flex flex-col gap-4 lg:gap-6">
        {datos.alertas.length > 0 && (
          <div className="flex flex-col gap-3">
            {datos.alertas.map((a) => (
              <AvisoDominio
                key={a.id}
                alerta={a}
                compacto={!escritorio}
                hrefDetalle={rutaDetalleDominio(a.dominioId)}
                activando={activando === a.dominioId}
                onActivarRenovacion={(al) => void activarRenovacion(al.dominioId, al.host)}
              />
            ))}
          </div>
        )}
        <ListaDominios
          dominios={dominios}
          onAbrir={abrir}
          acciones={accionesFila}
          onContextual={(d, a) => {
            if (a === 'renovar') router.push(rutaDetalleDominio(d.id));
            else abrirConectarCon({ modo: a === 'registros' ? 'registros' : 'revisar', dominio: d });
          }}
        />
        {escritorio && <TarjetasAyudaDominios />}
      </div>
    );
  }

  const listo = !!datos && !sinPermiso && fallo !== 'error';

  return (
    <MarcoSitioWeb
      href={RUTA_DOMINIOS_SITIO_WEB}
      icono={ICONO_PAGINA_DOMINIOS}
      subtitulo={subtitulo}
      host={datos?.hostPublico ?? null}
      sinVerSitio
      accionesSecundarias={accionesSecundarias}
      accionPrimaria={accionPrimaria}
      menu={menu}
    >
      {contenido}
      {/* B/07-25: la barra fija solo acompaña a la lista; el vacío ya trae sus dos tarjetas con sus botones. */}
      {listo && propios && !escritorio && <BarraAccionesMovil onConectar={abrirConectar} onComprar={abrirComprar} puedeComprar={permisos.comprar} />}

      {listo && (
        <>
          <DialogoConectarDominio
            abierto={conectarAbierto}
            onAbiertoChange={(v) => {
              setConectarAbierto(v);
              if (!v && accion === 'conectar') cerrarAccion();
            }}
            inicio={inicioConectar}
            sede={sede}
            conectar={dom.conectar}
            verificar={dom.verificar}
            hacerPrincipal={dom.hacerPrincipal}
            otrosHosts={otrosHosts}
            onIrAComprar={() => {
              setConectarAbierto(false);
              fijar({ accion: 'comprar' }, 'replace');
            }}
          />
          <DialogoComprarDominio
            abierto={accion === 'comprar' && permisos.comprar}
            onAbiertoChange={(v) => !v && cerrarAccion()}
            titular={datos.titular}
            hayPrincipalPropio={hayPrincipalPropio}
            verificar={dom.verificar}
            hacerPrincipal={dom.hacerPrincipal}
            onComprado={() => void dom.recargar()}
            onIrAConectar={() => fijar({ accion: 'conectar' }, 'replace')}
          />
          <DialogoCambiarSubdominio
            abierto={subdominioAbierto}
            onAbiertoChange={setSubdominioAbierto}
            actual={datos.subdominio}
            onGuardar={dom.cambiarSubdominio}
            onGuardado={(host) => toast.success(t('subdominio.guardado', { host }))}
          />
          <DialogoQuitarDominio
            dominio={aQuitar}
            alias={aQuitar ? dominios.filter((x) => x.tipo === 'alias_www' && x.redirigeA === aQuitar.host).map((x) => x.host) : []}
            hostSubdominio={datos.hostSubdominio}
            onAbiertoChange={(v) => !v && setAQuitar(null)}
            onQuitar={dom.quitar}
            onQuitado={(host) => toast.success(t('quitar.quitado', { host }))}
            onError={(m) => toast.error(m)}
          />
          <DialogoCodigoTransferencia
            dominio={aTransferir}
            transferencia={aTransferir ? transferenciaDisponible(aTransferir.compradoEn, new Date()) : null}
            correoCuenta={null}
            onAbiertoChange={(v) => !v && setATransferir(null)}
            onSolicitar={dom.solicitarCodigo}
            onEnviado={(correo) => toast.success(t('transferir.enviado', { correo }))}
          />
        </>
      )}
    </MarcoSitioWeb>
  );
}
