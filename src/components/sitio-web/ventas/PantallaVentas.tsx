'use client';

/**
 * «Ventas en línea» (Figma B/10-01 escritorio, 10-02 móvil 390, 10-03 estados):
 * un TABLERO, no un formulario (B/10-04 nota 1). Cada tarjeta muestra el
 * estado real de su tema y lleva al módulo dueño; solo el checkout se edita
 * aquí. Envíos abre el MISMO componente de Tarifas de envío de Transporte.
 *
 * Cinco estados: cargando (esqueleto de barra + tarjeta), primera vez (lleva
 * al asistente, del marco), vacío «Tu sitio todavía no vende», error total o
 * parcial por tarjeta («Reintentar») y sin permiso. Todo sale de UN hook
 * (`useVentasSitio`) y UNA ruta (`GET /api/sitio-web/ventas`).
 */
import { useState } from 'react';
import { ExternalLink, Globe, Package, RefreshCw, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BarraProgreso, EmptyState, ListCard, PanelAdaptable, Tarjeta, clasesBoton, type AccionFila } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { MarcoSitioWeb, type EstadoVistaSitio } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { cn } from '@/utils/Utils';
import { esTarjetaError, type TarjetaVenta, type TemaVenta } from './estadoVentas';
import { lineaFalta, resumenTarjeta, simboloMoneda } from './formatoVentas';
import { DialogoCheckout } from './DialogoCheckout';
import { SeccionEnvios } from './SeccionEnvios';
import { EstadoVentaBadge, TarjetaEstadoVenta, TarjetaVentaConError } from './TarjetaEstadoVenta';
import { ICONO_TEMA_VENTA } from './iconosVentas';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { useTextosVentas } from './textos';
import { useVentasSitio } from './useVentasSitio';

export const RUTA_VENTAS = `${RAIZ_SITIO_WEB}/ventas`;
const RUTA_CONEXIONES = '/app/integraciones/conexiones';

/** Esqueleto de B/10-03: barra de progreso y una tarjeta con dos líneas. */
export function EsqueletoVentas() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function PantallaVentas() {
  const t = useTextosVentas();
  const router = useRouter();
  const { toast } = useToast();
  const { datos, cargando, actualizando, fallo, recargar, guardarCheckout, alternarReservas } = useVentasSitio();
  const [checkoutAbierto, setCheckoutAbierto] = useState(false);
  const [enviosAbierto, setEnviosAbierto] = useState(false);
  const [detalle, setDetalle] = useState<TemaVenta | null>(null);
  const [reservasOcupado, setReservasOcupado] = useState(false);

  const estado: EstadoVistaSitio = cargando
    ? 'cargando'
    : fallo === 'sin_permiso'
      ? 'sin_permiso'
      : fallo || !datos
        ? 'error'
        : datos.estado === 'primera_vez'
          ? 'primera_vez'
          : 'listo';

  const progreso = datos?.progreso;
  const url = datos?.sitio.url ?? null;
  const tarjetas = datos?.tablero ?? [];
  const leidas = tarjetas.filter((x): x is TarjetaVenta => !esTarjetaError(x));
  const enlaceEnvios = datos?.tarifasEnvio;

  const onAlternarReservas = async (activo: boolean) => {
    setReservasOcupado(true);
    try {
      await alternarReservas(activo);
      toast({ title: t(activo ? 'ventas.reservas.activadas' : 'ventas.reservas.desactivadas') });
    } catch (error) {
      toast({ title: t('ventas.reservas.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    } finally {
      setReservasOcupado(false);
    }
  };

  const menu: AccionFila[] = [
    { id: 'recargar', etiqueta: t('ventas.recargar'), icono: RefreshCw, onSelect: () => void recargar(true) },
    ...(url ? [{ id: 'probar', etiqueta: t('ventas.probarCompra'), icono: ExternalLink, onSelect: () => window.open(url, '_blank', 'noopener,noreferrer') }] : []),
    ...(url ? [{ id: 'ver', etiqueta: t('ventas.verSitio'), icono: Globe, onSelect: () => window.open(url, '_blank', 'noopener,noreferrer') }] : []),
    { id: 'configuracion', etiqueta: t('ventas.irConfiguracion'), icono: Settings, onSelect: () => router.push(`${RAIZ_SITIO_WEB}/configuracion`) },
  ];

  const secundarias = (
    <>
      <button
        type="button"
        onClick={() => void recargar(true)}
        aria-label={t('ventas.recargar')}
        title={t('ventas.recargar')}
        className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-10 px-0')}
      >
        <RefreshCw aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, actualizando && 'animate-spin motion-reduce:animate-none')} strokeWidth={TRAZO_ICONO} />
      </button>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('ventas.probarCompra')}
        </a>
      ) : (
        <button type="button" disabled title={t('ventas.probarCompraSinSitio')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('ventas.probarCompra')}
        </button>
      )}
    </>
  );

  // Móvil (B/10-02): «5 de 6 listos» es el subtítulo del MobileHeader, no una línea del cuerpo.
  const conteoCorto = progreso && progreso.total > 0 ? t('ventas.progreso.corto', { listos: progreso.listos, total: progreso.total }) : undefined;

  return (
    <MarcoSitioWeb
      href={RUTA_VENTAS}
      subtitulo={estado === 'listo' ? t('ventas.subtitulo') : undefined}
      movil={estado === 'listo' && conteoCorto ? { subtitulo: conteoCorto } : undefined}
      sinVerSitio
      accionesSecundarias={secundarias}
      menu={menu}
      // Sin permiso: el vacío propio de B/10-03 (con el permiso que sí existe), sin acciones en la cabecera.
      estado={estado === 'sin_permiso' ? 'listo' : estado}
      acciones={estado === 'sin_permiso' ? <></> : undefined}
      onReintentar={() => void recargar()}
      esqueleto={<EsqueletoVentas />}
      nombreContenido={t('ventas.nombreContenido')}
    >
      {estado === 'sin_permiso' ? (
        <EmptyState variante="forbidden" titulo={t('ventas.sinPermiso.titulo')} descripcion={t('ventas.sinPermiso.descripcion')} />
      ) : datos && progreso && progreso.sinVender ? (
        <EmptyState
          variante="empty"
          icono={Package}
          titulo={t('ventas.vacio.titulo')}
          descripcion={t('ventas.vacio.descripcion')}
          accionSecundaria={{ etiqueta: t('ventas.vacio.conectarPasarela'), href: RUTA_CONEXIONES, icono: ExternalLink }}
          accion={{ etiqueta: t('ventas.vacio.verGuia'), href: RAIZ_SITIO_WEB }}
        />
      ) : datos ? (
        <div className="flex flex-col gap-4 lg:gap-6">
          {/* Progreso: tarjeta en escritorio; en móvil se reduce a una línea (B/10-02). */}
          {progreso && progreso.total > 0 && (
            <Tarjeta className="hidden lg:flex">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-6 text-fg">{t('ventas.progreso.titulo', { listos: progreso.listos, total: progreso.total })}</p>
                    <p className="text-[13px] leading-[18px] text-fg-secondary">{lineaFalta(progreso.faltan, t) ?? t('ventas.progreso.todoListo')}</p>
                  </div>
                  <BarraProgreso
                    valor={progreso.listos}
                    max={progreso.total}
                    etiqueta={t('ventas.progreso.etiqueta')}
                    tono={progreso.listos === progreso.total ? 'exito' : 'marca'}
                    className="sm:w-56"
                  />
                </div>
            </Tarjeta>
          )}

          {/* Escritorio: 7 tarjetas en dos columnas (B/10-01). */}
          <div className="hidden gap-6 lg:grid lg:grid-cols-2">
            {tarjetas.map((x) =>
              esTarjetaError(x) ? (
                <TarjetaVentaConError key={x.tema} tema={x.tema} onReintentar={() => void recargar(true)} reintentando={actualizando} />
              ) : (
                <TarjetaEstadoVenta
                  key={x.tema}
                  tarjeta={x}
                  moneda={datos.moneda}
                  onEditarCheckout={() => setCheckoutAbierto(true)}
                  onGestionarTarifas={() => setEnviosAbierto(true)}
                  onAlternarReservas={(v) => void onAlternarReservas(v)}
                  reservasOcupado={reservasOcupado}
                />
              ),
            )}
          </div>

          {/* Móvil 390 (B/10-02): los temas forman UNA lista agrupada con separadores; el detalle abre una hoja.
              Una tarjeta que no se pudo leer va aparte, con su «Reintentar». */}
          <div className="flex flex-col gap-4 lg:hidden">
            {tarjetas.filter(esTarjetaError).map((x) => (
              <TarjetaVentaConError key={x.tema} tema={x.tema} onReintentar={() => void recargar(true)} reintentando={actualizando} />
            ))}
            {leidas.length > 0 && (
              <ul aria-label={t('ventas.nombreContenido')} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {leidas.map((x) => (
                  <li key={x.tema}>
                    <ListCard
                      inicio="icono"
                      icono={ICONO_TEMA_VENTA[x.tema]}
                      titulo={t(`ventas.temasCortos.${x.tema}`)}
                      subtitulo={resumenTarjeta(x.resumen, t, datos.moneda)}
                      estado={<EstadoVentaBadge tarjeta={x} tamano="sm" />}
                      onClick={() => setDetalle(x.tema)}
                      className="rounded-none border-0"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {datos?.checkout && (
        <DialogoCheckout
          abierto={checkoutAbierto}
          onAbiertoChange={setCheckoutAbierto}
          ajustes={datos.checkout}
          simboloMoneda={simboloMoneda(datos.moneda)}
          onGuardar={guardarCheckout}
          esRestaurante={datos.giro === 'restaurante'}
        />
      )}

      <SeccionEnvios
        abierto={enviosAbierto}
        onAbiertoChange={setEnviosAbierto}
        disponible={!!enlaceEnvios?.visible}
        soloLectura={!datos?.permisos.editar}
        onCerrar={() => void recargar(true)}
      />

      {/* Hoja de detalle en móvil: mismas filas y acciones que la tarjeta de escritorio. */}
      {datos &&
        leidas
          .filter((x) => x.tema === detalle)
          .map((x) => (
            <PanelAdaptable
              key={x.tema}
              abierto
              onAbiertoChange={(v) => !v && setDetalle(null)}
              titulo={t(`ventas.temas.${x.tema}`)}
              icono={ICONO_TEMA_VENTA[x.tema]}
              antetitulo={<EstadoVentaBadge tarjeta={x} tamano="sm" />}
              pantallaCompletaMovil
            >
              <TarjetaEstadoVenta
                incrustada
                tarjeta={x}
                moneda={datos.moneda}
                onEditarCheckout={() => {
                  setDetalle(null);
                  setCheckoutAbierto(true);
                }}
                onGestionarTarifas={() => {
                  setDetalle(null);
                  setEnviosAbierto(true);
                }}
                onAlternarReservas={(v) => void onAlternarReservas(v)}
                reservasOcupado={reservasOcupado}
              />
            </PanelAdaptable>
          ))}
    </MarcoSitioWeb>
  );
}
