'use client';

/**
 * Pestaña «Recibidas» (Figma R1 `2404:146165`, R9 vacía `2408:147945`, R10 sin
 * permiso `2408:148389`, M1 móvil `2409:148539`): mercancía de un consignante en
 * tu poder. KPIs En tu poder (a precio pactado, cuentas de orden) · Vendido sin
 * liquidar · Tu remuneración · Por pagar a consignantes; búsqueda por nota o
 * consignante. Los datos llegan de la página (una sola lectura para las tres pestañas).
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, HandCoins, PackageCheck, PackageOpen, Plus, Receipt, Wallet } from 'lucide-react';
import { AvisoTonal, DataTable, KpiStrip, ListCard, ListToolbar, SearchInput, StatCard, StatusBadge, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import {
  BADGE_ESTADO_RECIBIDA,
  enTuPoder,
  filtrarRecibidas,
  kpisRecibidas,
  rutaLiquidarRecibida,
  rutaRecibida,
  type NotaRecibida,
} from '@/lib/inventario/consignaciones/recibidas';

const NS = 'consignacionesR4';

export interface ListadoRecibidasProps {
  notas: readonly NotaRecibida[];
  cargando: boolean;
  estadoError: 'sinPermiso' | 'error' | null;
  puedeCrear: boolean;
  onRecibir: () => void;
  onReintentar: () => void;
}

export function ListadoRecibidas({ notas, cargando, estadoError, puedeCrear, onRecibir, onReintentar }: ListadoRecibidasProps) {
  const t = useTranslations(NS);
  const router = useRouter();
  const fmt = useMonedaOrganizacion().formatear;
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const [texto, setTexto] = useState('');
  const filas = useMemo(() => filtrarRecibidas(notas, texto), [notas, texto]);
  const kpis = useMemo(() => kpisRecibidas(notas), [notas]);
  const abrir = (n: NotaRecibida) => router.push(rutaRecibida(n.id));

  const enPoderValor = (n: NotaRecibida) => n.lineas.reduce((s, l) => s + enTuPoder(l) * l.precioPactado, 0);
  const enPoderUnidades = (n: NotaRecibida) => n.lineas.reduce((s, l) => s + enTuPoder(l), 0);

  const acciones = (n: NotaRecibida): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => abrir(n) },
    ...(puedeCrear && n.vendidoSinLiquidar > 0 ? [{ id: 'liquidar', etiqueta: t('acciones.liquidar'), icono: Receipt, onSelect: () => router.push(rutaLiquidarRecibida(n.id)) }] : []),
  ];
  const badge = (n: NotaRecibida) => <StatusBadge estado={BADGE_ESTADO_RECIBIDA[n.estado]} etiqueta={t(`estados.${n.estado}`)} />;
  const origen = (n: NotaRecibida) => <StatusBadge estado={n.vinculada ? 'en proceso' : 'borrador'} etiqueta={n.vinculada ? t('origen.goAdmin') : t('origen.externo')} />;

  const columnas: ColumnaTabla<NotaRecibida>[] = [
    { id: 'nota', encabezado: t('columnas.nota'), celda: (n) => <span className="font-medium text-fg">{n.numero}</span> },
    { id: 'consignante', encabezado: t('columnas.consignante'), celda: (n) => <span className="truncate">{n.consignante}</span> },
    { id: 'contrato', encabezado: t('columnas.contrato'), ocultarDebajo: 'lg', celda: (n) => t(`condiciones.contratos.${n.contrato}`) },
    { id: 'origen', encabezado: t('columnas.origen'), ocultarDebajo: 'lg', celda: origen },
    { id: 'fecha', encabezado: t('columnas.fecha'), ocultarDebajo: 'lg', celda: (n) => <span className="whitespace-nowrap tabular-nums">{formatDate(n.fecha)}</span> },
    { id: 'unidades', encabezado: t('columnas.unidades'), variante: 'importe', ocultarDebajo: 'lg', celda: (n) => entero(enPoderUnidades(n)) },
    { id: 'poder', encabezado: t('columnas.enTuPoder'), variante: 'importe', celda: (n) => fmt(enPoderValor(n)) },
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'centro', celda: badge },
  ];

  const estado = estadoError === 'sinPermiso' ? 'sinPermiso' : cargando && notas.length === 0 ? 'cargando' : estadoError ? 'error' : filas.length === 0 ? (texto ? 'sinResultados' : 'vacio') : 'listo';

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar busqueda={<SearchInput value={texto} onChange={setTexto} cargando={cargando} placeholder={t('buscar.recibidas')} etiqueta={t('buscar.etiqueta')} />} />
      {estado !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard etiqueta={t('kpis.enTuPoder')} icono={PackageCheck} cargando={cargando} valor={fmt(kpis.enTuPoder)} detalle={t('kpis.aPrecioPactado')} />
          <StatCard etiqueta={t('kpis.vendidoSinLiquidar')} icono={Receipt} cargando={cargando} valor={fmt(kpis.vendidoSinLiquidar)} detalle={t('kpis.notas', { n: kpis.notasConVentas })} />
          <StatCard etiqueta={t('kpis.remuneracion')} icono={HandCoins} cargando={cargando} valor={fmt(kpis.remuneracion)} detalle={t('kpis.remuneracionDetalle')} />
          <StatCard etiqueta={t('kpis.porPagar')} icono={Wallet} cargando={cargando} valor={fmt(kpis.porPagar)} detalle={t('kpis.porPagarDetalle')} />
        </KpiStrip>
      )}
      <DataTable
        etiqueta={t('pestanas.recibidas')}
        columnas={columnas}
        filas={filas}
        obtenerId={(n) => n.id}
        estado={estado}
        onFilaClick={abrir}
        etiquetaFila={(n) => t('etiquetaFila', { numero: n.numero, tercero: n.consignante })}
        acciones={acciones}
        tarjetaMovil={(n) => (
          <ListCard
            icono={PackageOpen}
            titulo={`${n.numero} · ${n.consignante}`}
            subtitulo={[formatDate(n.fecha), t('unidadesN', { n: entero(enPoderUnidades(n)) })].join(' · ')}
            valor={fmt(enPoderValor(n))}
            estado={badge(n)}
            acciones={acciones(n)}
            onClick={() => abrir(n)}
          />
        )}
        vacio={{
          titulo: t('vacio.recibidasTitulo'),
          descripcion: t('vacio.recibidasDescripcion'),
          icono: PackageOpen,
          accion: puedeCrear ? { etiqueta: t('acciones.recibir'), onClick: onRecibir, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={onReintentar}
        termino={texto}
      />
      {estado !== 'sinPermiso' && <AvisoTonal tono="informacion" titulo={t('avisoAjena.titulo')} descripcion={t('avisoAjena.descripcion')} />}
    </div>
  );
}
