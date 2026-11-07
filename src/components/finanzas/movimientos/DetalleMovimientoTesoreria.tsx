'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, DollarSign, MinusCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  AvisoTonal,
  DialogoMotivo,
  FilaDato,
  ListaDatos,
  PageHeader,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
} from '@/components/kit';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { DetailSkeleton } from '@/components/common/PageSkeletons';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { movimientosService, type MovementType, type UnifiedMovement } from '@/lib/services/movimientosService';
import { accionesPermitidas, estadoMovimiento, type AnulacionMovimiento } from '@/lib/finanzas/anulacionMovimiento';
import { DatosContablesMovimiento } from './DatosContablesMovimiento';

/**
 * Detalle de un ingreso o egreso de tesorería (Figma 36 · G2 «Egreso — detalle anulado»).
 *
 * El estado sale del dato: un movimiento está anulado si tiene su reverso
 * (`movimientosService.getAnulacion`); si no se puede comprobar, no se ofrece anular ni duplicar.
 * No hay botón de exportar: el motor de documentos no tiene comprobante para un movimiento de
 * caja o banco (`comprobante-egreso` es de `payments`) y el `.txt` que se bajaba no era un documento.
 */

type EstadoAnulacion = { tipo: 'cargando' } | { tipo: 'listo'; anulacion: AnulacionMovimiento | null } | { tipo: 'error' };

const RUTA: Record<MovementType, string> = { income: '/app/finanzas/ingresos', expense: '/app/finanzas/egresos' };

/** Lo mismo que mira `DatosContablesMovimiento` para no pintarse: sin datos, sin tarjeta vacía. */
function hayDatosContables(m: UnifiedMovement): boolean {
  return Boolean(m.categoria_nombre || m.cuenta_contable || m.tercero_nit || m.tercero_nombre || m.centro_costo_nombre || m.soporte_path);
}

export function DetalleMovimientoTesoreria({ id, tipo }: { id: string; tipo: MovementType }) {
  // Montos en la moneda base de la organización (monedaOrganizacion.ts); fechas en su zona.
  const { formatear } = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const router = useRouter();
  const t = useTranslations('finanzasContableR2.movimiento');
  const tt = useTranslations('tesoreria');
  const [movimiento, setMovimiento] = useState<UnifiedMovement | null>(null);
  const [cargando, setCargando] = useState(true);
  const [anulacion, setAnulacion] = useState<EstadoAnulacion>({ tipo: 'cargando' });
  const [anulando, setAnulando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const lista = RUTA[tipo];

  const cargarAnulacion = useCallback(async (m: UnifiedMovement) => {
    setAnulacion({ tipo: 'cargando' });
    try {
      setAnulacion({ tipo: 'listo', anulacion: await movimientosService.getAnulacion(m) });
    } catch {
      setAnulacion({ tipo: 'error' });
    }
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // El tipo va en la consulta: un ingreso abierto como egreso responde «no encontrado».
      const data = await movimientosService.getMovementByUuid(id, tipo);
      setMovimiento(data);
      if (data) void cargarAnulacion(data);
    } catch {
      toast({
        title: tt('errorTitulo'),
        description: tt(tipo === 'income' ? 'errorCarga.ingreso' : 'errorCarga.egreso'),
        variant: 'destructive',
        action: (
          <ToastAction altText={tt('reintentar')} onClick={() => void cargar()}>
            {tt('reintentar')}
          </ToastAction>
        ),
      });
    } finally {
      setCargando(false);
    }
  }, [cargarAnulacion, id, tipo, tt]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const confirmarAnulacion = async (motivo: string) => {
    if (!movimiento) return;
    setOcupado(true);
    try {
      // Id + fuente: un movimiento de banco se anula por su vía y nunca toca la caja.
      const r = await movimientosService.cancelMovement({ id: movimiento.id, source: movimiento.source }, motivo);
      if (r.success) {
        toast({ title: t('exito'), description: t(`anulado.${tipo}`) });
        router.push(lista);
      } else {
        toast({ title: tt('errorTitulo'), description: tt(`errores.${r.codigo ?? 'desconocido'}`), variant: 'destructive' });
      }
    } catch {
      toast({ title: tt('errorTitulo'), description: t('errorAnular'), variant: 'destructive' });
    } finally {
      setOcupado(false);
      setAnulando(false);
    }
  };

  const duplicar = async () => {
    if (!movimiento) return;
    try {
      const r = await movimientosService.duplicateMovement({ id: movimiento.id, source: movimiento.source }, '');
      if (r.success && r.uuid) {
        toast({ title: t('exito'), description: t(`duplicado.${tipo}`) });
        // La ruta de detalle espera el uuid, no el id numérico.
        router.push(`${lista}/${r.uuid}`);
      } else {
        toast({ title: tt('errorTitulo'), description: tt(`errores.${r.codigo ?? 'desconocido'}`), variant: 'destructive' });
      }
    } catch {
      toast({ title: tt('errorTitulo'), description: t('errorDuplicar'), variant: 'destructive' });
    }
  };

  if (cargando) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <DetailSkeleton />
      </div>
    );
  }

  if (!movimiento) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-fg">{t(`noEncontrado.${tipo}`)}</h2>
        <Link href={lista} className={clasesBoton({ variante: 'primario', className: 'mt-4' })}>
          {t('volverListado')}
        </Link>
      </div>
    );
  }

  const datosAnulacion = anulacion.tipo === 'listo' ? anulacion.anulacion : null;
  const estado = estadoMovimiento({ anulacion: datosAnulacion, esReverso: movimiento.es_reverso });
  const permitidas = anulacion.tipo === 'listo' ? accionesPermitidas(estado) : { anular: false, duplicar: false };
  const titulo = t(`titulo.${tipo}`, { id: movimiento.id });
  const registrado = formatDate(movimiento.created_at);
  const subtitulo = datosAnulacion
    ? t('subtituloAnulado', { fecha: registrado, anulado: formatDate(datosAnulacion.fecha) })
    : t('subtitulo', { fecha: registrado });

  const acciones: AccionFila[] = [
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(), oculta: !permitidas.duplicar },
    { id: 'anular', etiqueta: t('acciones.anular'), icono: XCircle, onSelect: () => setAnulando(true), destructiva: true, oculta: !permitidas.anular },
  ];
  const menu = <RowActionsMenu acciones={acciones} tamano="md" orientacion="horizontal" titulo={titulo} />;

  const origen = movimiento.source === 'cash'
    ? t('datos.caja')
    : movimiento.bank_account_name
      ? t('datos.bancoCuenta', { cuenta: movimiento.bank_account_name })
      : t('datos.banco');

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variante="detail"
        titulo={titulo}
        subtitulo={subtitulo}
        icono={tipo === 'income' ? DollarSign : MinusCircle}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t(`migas.${tipo}`), href: lista }, { etiqueta: titulo }]}
        volverA={lista}
        acciones={menu}
        movil={{ accion: menu, subtitulo }}
      />

      {/* Fuera de la cabecera: en celular la cabecera la pinta el shell y el estado debe seguir a la vista. */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
        {anulacion.tipo === 'cargando' ? null : anulacion.tipo === 'error' ? null : (
          <StatusBadge estado={estado === 'anulado' ? 'anulado' : estado === 'reverso' ? 'neutral' : 'confirmado'} etiqueta={t(`estado.${estado}`)} tamano="md" />
        )}
        {datosAnulacion && (
          <span>
            {[datosAnulacion.autor ? t('porAutor', { autor: datosAnulacion.autor }) : null, datosAnulacion.motivo ? t('motivo', { motivo: datosAnulacion.motivo }) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {anulacion.tipo === 'error' && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('errorEstado.titulo')}
          descripcion={t('errorEstado.descripcion')}
          accion={{ etiqueta: tt('reintentar'), onClick: () => void cargarAnulacion(movimiento) }}
        />
      )}

      <Tarjeta titulo={t('tarjetas.movimiento')}>
        <ListaDatos divisores etiqueta={t('tarjetas.movimiento')}>
          <FilaDato etiqueta={t('datos.concepto')} valor={movimiento.concept} />
          <FilaDato etiqueta={t('datos.monto')} valor={formatear(movimiento.amount)} />
          <FilaDato etiqueta={t('datos.fecha')} valor={registrado} />
          <FilaDato etiqueta={t('datos.origen')} valor={origen} />
          {movimiento.notes ? <FilaDato etiqueta={t('datos.notas')} valor={<span className="whitespace-pre-wrap text-left">{movimiento.notes}</span>} /> : null}
          <FilaDato etiqueta={t('datos.identificador')} valor={<span className="break-all font-mono text-xs">{movimiento.uuid}</span>} />
        </ListaDatos>
      </Tarjeta>

      {hayDatosContables(movimiento) && (
        <Tarjeta titulo={t('tarjetas.contables')}>
          <DatosContablesMovimiento movement={movimiento} />
        </Tarjeta>
      )}

      {estado === 'anulado' && (
        <AvisoTonal tono="informacion" titulo={t('avisoAnulado.titulo')} descripcion={t(`avisoAnulado.${tipo}`)} />
      )}
      {estado === 'reverso' && (
        <AvisoTonal tono="neutro" titulo={t('avisoReverso.titulo')} descripcion={t('avisoReverso.descripcion')} />
      )}

      <DialogoMotivo
        abierto={anulando}
        onAbiertoChange={(v) => !v && !ocupado && setAnulando(false)}
        titulo={tt(tipo === 'income' ? 'anular.ingreso.titulo' : 'anular.egreso.titulo')}
        descripcion={tt('anular.descripcion')}
        textoConfirmar={tt(tipo === 'income' ? 'anular.ingreso.boton' : 'anular.egreso.boton')}
        cargando={ocupado}
        onConfirmar={(motivo) => void confirmarAnulacion(motivo)}
      />
    </div>
  );
}
