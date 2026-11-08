'use client';

/**
 * Detalle de una nota recibida (Figma R3 `2405:147166`, M2 móvil `2409:148766`):
 * existencias del consignante (recibido, vendido, devuelto, en tu poder) con su
 * precio pactado, condiciones del contrato, control en cuentas de orden y
 * liquidaciones. Acciones «Devolver mercancía» y «Liquidar»; en el celular van en
 * `movil.menu` (el kit oculta el PageHeader por debajo de `lg`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList, Receipt, Undo2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, DataTable, Dialogo, FilaDato, KpiStrip, ListaDatos, PageHeader, StatCard, StatusBadge, Tarjeta, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { toastSuccess } from '@/components/ui/use-toast';
import { ErrorPeticionSaldoFavor, nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import {
  BADGE_ESTADO_RECIBIDA,
  RUTA_CONSIGNACIONES_INVENTARIO,
  enTuPoder,
  rutaLiquidarRecibida,
  type LineaRecibida,
  type NotaRecibida,
} from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';

function DevolverDialog({ nota, abierto, onAbiertoChange, onHecho }: { nota: NotaRecibida; abierto: boolean; onAbiertoChange: (v: boolean) => void; onHecho: () => void }) {
  const t = useTranslations(NS);
  const [cantidades, setCantidades] = useState<Record<string, number | null>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');
  useEffect(() => {
    if (!abierto) return;
    setCantidades({});
    setError(null);
    clave.current = nuevaClaveIdempotencia('consignacion-devolver');
  }, [abierto]);
  const lineas = nota.lineas.filter((l) => enTuPoder(l) > 0);
  const elegidas = lineas.filter((l) => (cantidades[l.id] ?? 0) > 0);
  const excede = lineas.some((l) => (cantidades[l.id] ?? 0) > enTuPoder(l));
  const confirmar = async () => {
    if (elegidas.length === 0 || excede) return;
    setEnviando(true);
    setError(null);
    try {
      await consignacionesRecibidasService.devolver(nota.id, elegidas.map((l) => ({ linea_id: l.id, qty: cantidades[l.id] ?? 0 })), clave.current);
      toastSuccess(t('devolver.exito'));
      onAbiertoChange(false);
      onHecho();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('devolver.titulo')}
      descripcion={t('devolver.descripcion', { consignante: nota.consignante })}
      icono={Undo2}
      ancho={560}
      primario={{ etiqueta: t('devolver.confirmar'), onClick: () => void confirmar(), cargando: enviando, deshabilitada: elegidas.length === 0 || excede }}
    >
      <div className="flex flex-col gap-3">
        {lineas.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-fg">{l.producto}</p>
              <p className="text-xs text-fg-muted">{t('devolver.enTuPoder', { n: enTuPoder(l) })}</p>
            </div>
            <div className="w-32">
              <CampoNumero
                aria-label={t('devolver.cantidadDe', { producto: l.producto })}
                valor={cantidades[l.id] ?? null}
                onValorChange={(v) => setCantidades((c) => ({ ...c, [l.id]: v }))}
                minimo={0}
                maximo={enTuPoder(l)}
                decimales={3}
                alinear="derecha"
                tamano="sm"
              />
            </div>
          </div>
        ))}
        <p className="text-xs text-fg-muted">{t('devolver.asiento')}</p>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

export function DetalleRecibida({ notaId }: { notaId: string }) {
  const t = useTranslations(NS);
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const fmt = useMonedaOrganizacion().formatear;
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const [nota, setNota] = useState<NotaRecibida | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [devolver, setDevolver] = useState(false);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    consignacionesRecibidasService
      .detalle(notaId)
      .then((r) => {
        if (!vigente) return;
        setPendiente(r.pendiente);
        setNota(r.nota);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : 'error_desconocido'));
    return () => {
      vigente = false;
    };
  }, [notaId, recarga]);

  const totales = useMemo(() => {
    const l = nota?.lineas ?? [];
    const suma = (f: (x: LineaRecibida) => number) => l.reduce((s, x) => s + f(x), 0);
    return {
      recibido: suma((x) => x.recibido),
      recibidoValor: suma((x) => x.recibido * x.precioPactado),
      vendido: suma((x) => x.vendido),
      vendidoValor: suma((x) => x.vendido * x.precioPactado),
      devuelto: suma((x) => x.devuelto),
      devueltoValor: suma((x) => x.devuelto * x.precioPactado),
      poder: suma((x) => enTuPoder(x)),
      poderValor: suma((x) => enTuPoder(x) * x.precioPactado),
    };
  }, [nota]);

  const puedeDevolver = permisos.crear && !!nota && totales.poder > 0;
  const puedeLiquidar = permisos.crear && !!nota && nota.vendidoSinLiquidar !== 0;
  const titulo = nota ? `${nota.numero} · ${nota.consignante}` : '…';

  const columnas: ColumnaTabla<LineaRecibida>[] = [
    { id: 'producto', encabezado: t('columnas.productoConsignante'), celda: (l) => l.productoConsignante ?? l.producto },
    { id: 'tuProducto', encabezado: t('columnas.tuProducto'), ocultarDebajo: 'lg', celda: (l) => l.producto },
    { id: 'recibido', encabezado: t('columnas.recibido'), variante: 'importe', ocultarDebajo: 'lg', celda: (l) => entero(l.recibido) },
    { id: 'vendido', encabezado: t('columnas.vendido'), variante: 'importe', celda: (l) => entero(l.vendido) },
    { id: 'devuelto', encabezado: t('columnas.devuelto'), variante: 'importe', ocultarDebajo: 'lg', celda: (l) => entero(l.devuelto) },
    { id: 'poder', encabezado: t('columnas.enTuPoder'), variante: 'importe', celda: (l) => entero(enTuPoder(l)) },
    { id: 'precio', encabezado: t('columnas.precioPactado'), variante: 'importe', ocultarDebajo: 'lg', celda: (l) => fmt(l.precioPactado) },
    { id: 'valor', encabezado: t('columnas.valorEnTuPoder'), variante: 'importe', celda: (l) => fmt(enTuPoder(l) * l.precioPactado) },
  ];

  if (error === 'sin_permiso') {
    return (
      <div className="p-4 sm:p-6">
        <AvisoTonal tono="neutro" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={titulo}
        variante="detail"
        icono={ClipboardList}
        cargando={!nota && !error && !pendiente}
        volverA={`${RUTA_CONSIGNACIONES_INVENTARIO}?pestana=recibidas`}
        subtitulo={
          nota
            ? t('detalle.subtitulo', {
                fecha: formatDate(nota.fecha),
                contrato: t(`condiciones.contratos.${nota.contrato}`),
                origen: nota.vinculada ? t('detalle.vinculada', { numero: nota.numeroExterno ?? '—' }) : t('origen.externo'),
              })
            : undefined
        }
        badge={nota ? <StatusBadge estado={BADGE_ESTADO_RECIBIDA[nota.estado]} etiqueta={t(`estados.${nota.estado}`)} tamano="md" /> : undefined}
        migas={[{ etiqueta: t('migas.inventario'), href: '/app/inventario' }, { etiqueta: t('migas.consignaciones'), href: `${RUTA_CONSIGNACIONES_INVENTARIO}?pestana=recibidas` }, { etiqueta: nota?.numero ?? '…' }]}
        acciones={
          <>
            {puedeDevolver && (
              <button type="button" onClick={() => setDevolver(true)} className={clasesBoton({ variante: 'secundario' })}>
                <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.devolver')}
              </button>
            )}
            {puedeLiquidar && (
              <button type="button" onClick={() => router.push(rutaLiquidarRecibida(notaId))} className={clasesBoton({ variante: 'primario' })}>
                <Receipt aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.liquidar')}
              </button>
            )}
          </>
        }
        movil={{
          titulo: nota?.numero,
          subtitulo: nota?.consignante,
          menu: [
            { id: 'liquidar', etiqueta: t('acciones.liquidar'), icono: Receipt, onSelect: () => router.push(rutaLiquidarRecibida(notaId)), oculta: !puedeLiquidar },
            { id: 'devolver', etiqueta: t('acciones.devolver'), icono: Undo2, onSelect: () => setDevolver(true), oculta: !puedeDevolver },
          ],
        }}
      />

      {pendiente && <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />}
      {error && error !== 'sin_permiso' && <AvisoTonal tono="peligro" titulo={t('errorCarga')} accion={{ etiqueta: t('reintentar'), onClick: recargar }} />}

      {nota && (
        <>
          <KpiStrip etiqueta={t('kpis.etiqueta')}>
            <StatCard etiqueta={t('kpis.recibido')} valor={t('kpis.unidadesValor', { n: entero(totales.recibido), valor: fmt(totales.recibidoValor) })} detalle={t('kpis.aPrecioPactado')} />
            <StatCard etiqueta={t('kpis.vendido')} valor={t('kpis.unidadesValor', { n: entero(totales.vendido), valor: fmt(totales.vendidoValor) })} detalle={t('kpis.sinLiquidar', { valor: fmt(nota.vendidoSinLiquidar) })} />
            <StatCard etiqueta={t('kpis.devuelto')} valor={t('kpis.unidadesValor', { n: entero(totales.devuelto), valor: fmt(totales.devueltoValor) })} />
            <StatCard etiqueta={t('kpis.enTuPoder')} valor={t('kpis.unidadesValor', { n: entero(totales.poder), valor: fmt(totales.poderValor) })} detalle={t('kpis.noEsInventario')} />
          </KpiStrip>

          <DataTable etiqueta={t('detalle.existencias')} columnas={columnas} filas={nota.lineas} obtenerId={(l) => l.id} estado="listo" />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Tarjeta titulo={t('detalle.condiciones')}>
              <ListaDatos>
                <FilaDato etiqueta={t('condiciones.contrato')} valor={t(`condiciones.contratos.${nota.contrato}`)} />
                <FilaDato etiqueta={t('condiciones.precio')} valor={t(`condiciones.precios.${nota.precioModo}`)} />
                <FilaDato
                  etiqueta={t('condiciones.remuneracion')}
                  valor={
                    nota.remuneracionModo === 'porcentaje'
                      ? t('detalle.porcentajeSobre', { pct: nota.comisionPct, base: t(`condiciones.bases.${nota.baseComision}`) })
                      : t('condiciones.remuneraciones.precio_liquidacion')
                  }
                />
                {nota.obligacionDueno && <FilaDato etiqueta={t('condiciones.obligacion')} valor={t(`condiciones.obligaciones.${nota.obligacionDueno}`)} />}
                <FilaDato etiqueta={t('condiciones.riesgos.devoluciones')} valor={t(`detalle.asume.${nota.riesgos.devoluciones}`)} />
                <FilaDato etiqueta={t('condiciones.riesgos.perdidas')} valor={t(`detalle.asume.${nota.riesgos.perdidas}`)} />
                <FilaDato etiqueta={t('condiciones.riesgos.gastos')} valor={t(`detalle.asume.${nota.riesgos.gastos}`)} />
                <FilaDato etiqueta={t('condiciones.factura')} valor={t(nota.contrato === 'intermediacion' ? 'detalle.facturaMandatario' : `detalle.factura.${nota.factura}`)} />
              </ListaDatos>
            </Tarjeta>
            <Tarjeta titulo={t('detalle.cuentasOrden')}>
              <ListaDatos>
                <FilaDato etiqueta={t('asiento.cuenta', { cuenta: nota.cuentas.contra ?? '—', nombre: t('asiento.contraOrdenCorto') })} valor={fmt(totales.poderValor)} />
                <FilaDato etiqueta={t('asiento.cuenta', { cuenta: nota.cuentas.orden ?? '—', nombre: t('asiento.ordenCorto') })} valor={fmt(totales.poderValor)} />
                {nota.cuentas.recaudo && <FilaDato etiqueta={t('asiento.cuenta', { cuenta: nota.cuentas.recaudo, nombre: t('asiento.recaudoCorto') })} />}
                {nota.cuentas.remuneracion && <FilaDato etiqueta={t('asiento.cuenta', { cuenta: nota.cuentas.remuneracion, nombre: t('asiento.remuneracionCorto') })} />}
                {nota.cuentas.costo && <FilaDato etiqueta={t('asiento.cuenta', { cuenta: nota.cuentas.costo, nombre: t('asiento.costoCorto') })} />}
              </ListaDatos>
            </Tarjeta>
          </div>

          {nota.liquidaciones.length > 0 && (
            <Tarjeta titulo={t('detalle.liquidaciones', { n: nota.liquidaciones.length })}>
              <ListaDatos divisores>
                {nota.liquidaciones.map((q) => (
                  <FilaDato
                    key={q.id}
                    etiqueta={`${formatDate(q.creada)} · ${t(`estadosLiquidacion.${q.estado}`)}`}
                    descripcion={t('detalle.liquidacionResumen', { venta: fmt(q.venta), remuneracion: fmt(q.remuneracion) })}
                    valor={fmt(q.porPagar)}
                    href={q.facturaCompraId ? `/app/finanzas/facturas-compra/${q.facturaCompraId}` : undefined}
                  />
                ))}
              </ListaDatos>
            </Tarjeta>
          )}

          {nota.vinculada && <AvisoTonal tono="informacion" titulo={t('detalle.vinculadaTitulo', { consignante: nota.consignante })} descripcion={t('detalle.vinculadaDescripcion')} />}
          {puedeDevolver && <DevolverDialog nota={nota} abierto={devolver} onAbiertoChange={setDevolver} onHecho={recargar} />}
        </>
      )}
    </div>
  );
}
