'use client';

/**
 * Piezas de «Mi vehículo hoy» (Figma Envío/FilaDocumento y «11/12»): fila de documento con su
 * vigencia, tarjeta del vehículo, la fila «Mi vehículo hoy» de la lista del celular y el bloque de
 * la excepción con PIN. Las usan la página del celular y el panel del computador.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Car, ChevronRight, IdCard, KeyRound, Minus, ShieldCheck, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import type { EstadoDocumento, VigenciaDocumento } from '@/lib/logistica/misEnvios';
import { cn } from '@/utils/Utils';
import type { DocumentoVehiculo, MiVehiculo } from './useMiVehiculo';

const TONO: Record<EstadoDocumento, 'peligro' | 'advertencia' | 'exito' | 'neutro'> = {
  vencido: 'peligro',
  por_vencer: 'advertencia',
  vigente: 'exito',
  sin_dato: 'neutro',
};

/** «6 dic 2026» de un `date` (sin zona: es un día calendario). */
export function useFechaCorta() {
  const locale = useLocaleIntl();
  return (d: string | null | undefined) =>
    d ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : '';
}

/** Insignia de vigencia: «Vencido», «En 11 días», «Vigente», «Sin fecha». */
export function InsigniaVigencia({ vigencia }: { vigencia: VigenciaDocumento }) {
  const t = useTranslations('logistica.misEnvios.vehiculo.vigencia');
  const etiqueta = vigencia.estado === 'por_vencer' ? t('enDias', { n: vigencia.dias ?? 0 }) : t(vigencia.estado);
  return <StatusBadge estado={vigencia.estado} etiqueta={etiqueta} tono={TONO[vigencia.estado]} apariencia="contorno" />;
}

export function FilaDocumento({ doc }: { doc: DocumentoVehiculo }) {
  const t = useTranslations('logistica.misEnvios.vehiculo');
  const fecha = useFechaCorta();
  const Icono = doc.clave === 'licencia' ? IdCard : doc.vigencia.estado === 'vencido' ? XCircle : doc.vigencia.estado === 'por_vencer' ? AlertTriangle : doc.vigencia.estado === 'sin_dato' ? Minus : ShieldCheck;
  const tono =
    doc.vigencia.estado === 'vencido'
      ? 'bg-danger-subtle text-danger-text'
      : doc.vigencia.estado === 'por_vencer'
        ? 'bg-warning-subtle text-warning-text'
        : doc.vigencia.estado === 'vigente'
          ? 'bg-success-subtle text-success-text'
          : 'bg-subtle text-fg-muted';
  const nombre = doc.clave === 'licencia' ? (doc.categoria ? t('documentos.licenciaCategoria', { categoria: doc.categoria }) : t('documentos.licencia')) : t(`documentos.${doc.clave}`);
  const detalle = !doc.vence
    ? t('sinFecha')
    : doc.vigencia.estado === 'vencido'
      ? t('vencio', { fecha: fecha(doc.vence) })
      : doc.vigencia.estado === 'vigente' && doc.clave !== 'licencia'
        ? t('vigenteHasta', { fecha: fecha(doc.vence) })
        : t('vence', { fecha: fecha(doc.vence) });
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tono)}>
        <Icono className="size-5" strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] text-fg">{nombre}</span>
        <span className={cn('text-sm', doc.vigencia.estado === 'vencido' ? 'text-danger-text' : 'text-fg-secondary')}>{detalle}</span>
      </span>
      <InsigniaVigencia vigencia={doc.vigencia} />
    </li>
  );
}

/** Cabecera del vehículo: placa grande, tipo · dueño · capacidad y la insignia. */
export function CabeceraVehiculo({ v, compacta = false }: { v: MiVehiculo; compacta?: boolean }) {
  const t = useTranslations('logistica.misEnvios.vehiculo');
  const tv = useTranslations('logisticaVehiculo');
  if (!v.vehiculo) return null;
  const veh = v.vehiculo;
  const tipo = tv.has(`tiposCorto.${veh.vehicle_type}`) ? tv(`tiposCorto.${veh.vehicle_type}`) : veh.vehicle_type;
  const datos = [
    tipo.charAt(0).toUpperCase() + tipo.slice(1),
    veh.ownership ? t(`dueno.${veh.ownership}`) : null,
    Number(veh.capacity_kg) > 0 ? t('capacidad', { kg: Number(veh.capacity_kg) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const vencido = v.peor?.estado === 'vencido';
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn('flex shrink-0 items-center justify-center rounded-full', compacta ? 'size-10' : 'size-14', vencido ? 'bg-danger-subtle text-danger-text' : 'bg-brand-tint text-brand')}
      >
        <Car className={compacta ? 'size-5' : 'size-7'} strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('font-semibold text-fg', compacta ? 'text-base' : 'text-2xl')}>{veh.plate ?? tv('sinPlaca')}</span>
        <span className="text-sm text-fg-secondary">{datos}</span>
      </span>
      {vencido ? (
        <StatusBadge estado="vencido" etiqueta={t('documentoVencido')} tono="peligro" apariencia="contorno" />
      ) : v.porDefecto ? (
        <StatusBadge estado="defecto" etiqueta={t('porDefecto')} tono="neutro" />
      ) : null}
    </div>
  );
}

/** Fila «Mi vehículo hoy · KLM 48E — Moto · SOAT vence en 11 días» de la lista del celular. */
export function FilaVehiculoHoy({ v, href }: { v: MiVehiculo; href: string }) {
  const t = useTranslations('logistica.misEnvios.vehiculo');
  const tv = useTranslations('logisticaVehiculo');
  if (v.estado !== 'listo' || !v.vehiculo) return null;
  const tipo = tv.has(`tiposCorto.${v.vehiculo.vehicle_type}`) ? tv(`tiposCorto.${v.vehiculo.vehicle_type}`) : v.vehiculo.vehicle_type;
  const peorDoc = [...v.documentosVehiculo, ...(v.licencia ? [v.licencia] : [])].find((d) => d.vigencia === v.peor);
  const aviso =
    peorDoc && v.peor && (v.peor.estado === 'vencido' || v.peor.estado === 'por_vencer')
      ? v.peor.estado === 'vencido'
        ? t('filaVencido', { documento: t(`documentos.${peorDoc.clave === 'licencia' ? 'licencia' : peorDoc.clave}`) })
        : t('filaPorVencer', { documento: t(`documentos.${peorDoc.clave === 'licencia' ? 'licencia' : peorDoc.clave}`), n: v.peor.dias ?? 0 })
      : t('filaAlDia');
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Car aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] text-fg">{t('filaTitulo', { placa: v.vehiculo.plate ?? tv('sinPlaca') })}</span>
        <span className={cn('truncate text-sm', v.peor?.estado === 'vencido' ? 'text-danger-text' : v.peor?.estado === 'por_vencer' ? 'text-warning-text' : 'text-fg-secondary')}>
          {`${tipo.charAt(0).toUpperCase() + tipo.slice(1)} · ${aviso}`}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
    </Link>
  );
}

/** «Hoy te asignaron con excepción»: quién autorizó, a qué hora, por qué y cuántos envíos. */
export function BloqueExcepcion({ v, zona }: { v: MiVehiculo; zona: string }) {
  const t = useTranslations('logistica.misEnvios.vehiculo.excepcion');
  const locale = useLocaleIntl();
  if (!v.excepcion) return null;
  const hora = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(v.excepcion.at));
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
        <KeyRound aria-hidden="true" className="size-5 text-danger-text" strokeWidth={1.5} />
        {t('titulo')}
      </h2>
      <dl className="flex flex-col gap-2 text-sm">
        {v.autorizoNombre && (
          <div className="flex justify-between gap-3">
            <dt className="text-fg-secondary">{t('autorizo')}</dt>
            <dd className="text-right text-fg">{v.autorizoNombre}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-fg-secondary">{t('hora')}</dt>
          <dd className="text-right text-fg">{t('conPin', { hora })}</dd>
        </div>
        {v.excepcion.motivo && (
          <div className="flex justify-between gap-3">
            <dt className="text-fg-secondary">{t('motivo')}</dt>
            <dd className="text-right text-fg">{v.excepcion.motivo}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-fg-secondary">{t('envios')}</dt>
          <dd className="text-right text-fg">{t('enviosHoy', { n: v.excepcion.envios })}</dd>
        </div>
      </dl>
      <p className="text-sm text-fg-secondary">{t('nota')}</p>
    </section>
  );
}
