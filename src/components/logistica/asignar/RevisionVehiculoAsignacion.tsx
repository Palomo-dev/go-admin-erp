'use client';

/**
 * Hoja «Asignar» › bloque Vehículo (Logística 1b, Figma «21 Logística» 3158-11641, 3158-11808,
 * 3159-11941). Presentacional: la preselección, la revisión de documentos y si el bloqueo aplica
 * los responde la base (`logistica_revisar_asignacion`); aquí solo se muestran.
 *
 * - El selector arranca en lo que sugirió el servidor (envío > por defecto > «a pie / bici»).
 * - Moto, carro y camioneta: vehículo obligatorio (con el bloqueo de la organización activo).
 * - Bici y a pie: «A pie» y «Bici sin vehículo registrado» son opciones explícitas; desaparece
 *   «Sin vehículo (el del domiciliario)».
 * - Vencidos: bloquean (con excepción del supervisor) o solo avisan, según la organización.
 */
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Info, Scale, Stamp, XCircle } from 'lucide-react';
import { AvisoTonal, StatusBadge, clasesBoton } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { DeliveryVehicle } from '@/lib/services/deliveryIntegrationService';
import {
  SIN_VEHICULO,
  avisoCapacidad,
  requiereVehiculo,
  seleccionAValor,
  vehiculoDelTipo,
  type ItemRevision,
  type RevisionAsignacion,
  type Seleccion,
} from '@/lib/logistica/vehiculoAsignacion';
import { cn } from '@/utils/Utils';

export interface RevisionVehiculoProps {
  nombre: string;
  tipoPersona: string | null;
  vehiculos: readonly DeliveryVehicle[];
  /** vehicles.id → nombre de quien lo tiene por defecto (para «por defecto de Luisa»). */
  defectoDe: ReadonlyMap<string, string>;
  driverId: string;
  seleccion: Seleccion;
  onSeleccion: (valor: string) => void;
  revision: RevisionAsignacion | null;
  revisando: boolean;
  errorRevision: boolean;
  /** Cantidad de envíos (para los textos). */
  envios: number;
  onPedirExcepcion: () => void;
}

export function RevisionVehiculoAsignacion({
  nombre,
  tipoPersona,
  vehiculos,
  defectoDe,
  driverId,
  seleccion,
  onSeleccion,
  revision,
  revisando,
  errorRevision,
  envios,
  onPedirExcepcion,
}: RevisionVehiculoProps) {
  const t = useTranslations('logisticaVehiculo');
  const { formatPlain } = useFormatDate();
  const tipo = (x: string | null | undefined) => (x && t.has(`tiposCorto.${x}`) ? t(`tiposCorto.${x}`) : x ?? '');
  const placa = (v: { plate?: string | null; placa?: string | null }) => v.plate ?? v.placa ?? t('sinPlaca');
  const requiere = requiereVehiculo(tipoPersona);
  const bloqueoEfectivo = !!revision && revision.bloqueoActivo && revision.hayAutorizadorConPin;
  const ofrecerSinVehiculo = !requiere;

  const duenoTexto = (v: DeliveryVehicle) => {
    if (v.ownership === 'driver') return t('duenoCorto.driver');
    return t(`duenoCorto.${v.ownership ?? 'company'}`);
  };
  const etiquetaVehiculo = (v: DeliveryVehicle) => {
    const de = defectoDe.get(v.id);
    const extra = v.id && driverId && de ? (defectoDe.get(v.id) === nombre ? t('asignar.porDefecto') : t('asignar.porDefectoDe', { nombre: de })) : null;
    return [placa(v), tipo(v.vehicle_type), duenoTexto(v), extra].filter(Boolean).join(' · ');
  };
  // Primero los del tipo de la persona (una moto para quien reparte en moto).
  const ordenados = [...vehiculos].sort((a, b) => Number(vehiculoDelTipo(tipoPersona, b.vehicle_type)) - Number(vehiculoDelTipo(tipoPersona, a.vehicle_type)) || (a.plate ?? '').localeCompare(b.plate ?? ''));

  const insignia = requiere
    ? bloqueoEfectivo
      ? { tono: 'advertencia' as const, texto: t('asignar.obligatorio', { tipo: tipo(tipoPersona) }) }
      : { tono: 'neutro' as const, texto: t('asignar.recomendado', { tipo: tipo(tipoPersona) }) }
    : { tono: 'neutro' as const, texto: tipoPersona ? t('asignar.opcionalEn', { tipo: tipo(tipoPersona) }) : t('asignar.opcional') };

  const ayuda = !revision
    ? t('asignar.ayudaGeneral')
    : revision.origen === 'defecto'
      ? t('asignar.ayudaDefecto', { nombre })
      : revision.origen === 'envio'
        ? t('asignar.ayudaEnvio')
        : revision.origen === 'tipo'
          ? t('asignar.ayudaSinVehiculo')
          : t('asignar.ayudaGeneral');

  const etiquetaItem = (i: ItemRevision) => {
    if (i.causa === 'licencia' || i.causa === 'categoria_licencia') return t('asignar.causas.licencia', { categoria: i.categoria ?? '' }).trim();
    return t.has(`asignar.causas.${i.causa}`) ? t(`asignar.causas.${i.causa}`) : i.causa;
  };
  const detalleItem = (i: ItemRevision, vencido: boolean) => {
    if (i.causa === 'sin_licencia') return t('asignar.estadoItem.sinLicencia', { requeridas: i.requeridas.join(' / ') });
    if (i.causa === 'categoria_licencia') return t('asignar.estadoItem.categoria', { tipo: tipo(revision?.vehiculo?.tipo), requeridas: i.requeridas.join(' / ') });
    if (i.causa === 'vehiculo_requerido') return t('asignar.estadoItem.requerido');
    if (!i.vence) return '';
    if (vencido) return t('asignar.estadoItem.vencio', { fecha: formatPlain(i.vence) });
    return t('asignar.estadoItem.venceEn', { count: i.dias ?? 0, fecha: formatPlain(i.vence) });
  };

  const lineas: { item: ItemRevision; estado: 'vencido' | 'aviso' }[] = revision
    ? [
        ...revision.bloqueos.map((item) => ({ item, estado: (bloqueoEfectivo ? 'vencido' : 'aviso') as 'vencido' | 'aviso' })),
        ...revision.avisos.filter((a) => a.grupo !== 'capacidad').map((item) => ({ item, estado: 'aviso' as const })),
      ]
    : [];
  const capacidad = revision ? avisoCapacidad(revision) : null;
  const vehiculoRev = revision?.vehiculo ?? null;
  const nombreVehiculo = vehiculoRev ? vehiculoRev.placa ?? t('sinPlaca') : seleccion.tipo === 'sin' ? t(`sinVehiculo.${seleccion.motivo}`) : '—';
  const bloqueado = !!revision && revision.bloquea;
  const causasBloqueo = revision ? revision.bloqueos.map((b) => `${etiquetaItem(b)} ${detalleItem(b, true)}`.trim()).join(' · ') : '';
  const sinDocumentos = seleccion.tipo === 'sin' || (vehiculoRev && (vehiculoRev.tipo === 'bicycle' || vehiculoRev.dueno === 'third_party'));

  return (
    <section aria-labelledby="asignar-vehiculo" className="flex flex-col gap-2">
      <h3 id="asignar-vehiculo" className="flex items-center gap-2 text-base font-semibold text-fg">
        {t('asignar.vehiculo')}
        <StatusBadge estado={insignia.tono} tono={insignia.tono} etiqueta={insignia.texto} />
      </h3>
      <Select value={seleccionAValor(seleccion)} onValueChange={onSeleccion} disabled={revisando && !revision}>
        <SelectTrigger aria-labelledby="asignar-vehiculo" aria-invalid={bloqueado || undefined} className={cn('h-10 bg-surface', bloqueado ? 'border-line-danger' : 'border-line-strong')}>
          <SelectValue placeholder={t('asignar.elige')} />
        </SelectTrigger>
        <SelectContent>
          {ofrecerSinVehiculo &&
            SIN_VEHICULO.slice()
              .sort((a) => (a === tipoPersona ? -1 : 1))
              .map((m) => (
                <SelectItem key={m} value={`sin:${m}`}>
                  {t(`sinVehiculo.${m}`)}
                </SelectItem>
              ))}
          {ordenados.map((v) => (
            <SelectItem key={v.id} value={`v:${v.id}`}>
              {etiquetaVehiculo(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {bloqueado && revision?.bloqueos[0] && revision.bloqueos[0].causa !== 'vehiculo_requerido' && (
        <p className="text-xs text-danger-text">{t('asignar.bloqueado.inline', { causa: etiquetaItem(revision.bloqueos[0]) })}</p>
      )}
      <p className="text-xs text-fg-muted">{ayuda}</p>
      <p className="text-xs text-fg-muted">{t('asignar.soloLogistica')}</p>

      {errorRevision && <AvisoTonal tono="advertencia" compacto titulo={t('asignar.errorRevision')} />}
      {revision?.vehiculoOcupado && seleccion.tipo === 'vehiculo' && <AvisoTonal tono="peligro" rol="alert" compacto titulo={t('asignar.ocupado')} />}

      {bloqueado && revision && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={revision.admiteExcepcion ? t('asignar.bloqueado.titulo', { vehiculo: nombreVehiculo }) : t('asignar.requerido.titulo', { nombre, tipo: tipo(tipoPersona) })}
          descripcion={revision.admiteExcepcion ? t('asignar.bloqueado.descripcion', { causas: causasBloqueo }) : t('asignar.requerido.descripcion')}
        />
      )}
      {!bloqueado && revision && revision.bloqueos.length > 0 && (
        <AvisoTonal tono="advertencia" titulo={t('asignar.soloAviso.titulo')} descripcion={t('asignar.soloAviso.descripcion', { causas: causasBloqueo })} />
      )}

      {lineas.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('asignar.revision', { vehiculo: nombreVehiculo, nombre })}</h4>
          <ul className="flex flex-col gap-1.5">
            {lineas.map(({ item, estado }, i) => {
              const Icono = estado === 'vencido' ? XCircle : AlertTriangle;
              return (
                <li key={`${item.causa}-${i}`} className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm', estado === 'vencido' ? 'bg-danger-subtle' : 'bg-warning-subtle')}>
                  <Icono aria-hidden="true" className={cn('size-4 shrink-0', estado === 'vencido' ? 'text-danger-text' : 'text-warning-text')} strokeWidth={1.5} />
                  <span className={cn('min-w-0 flex-1', estado === 'vencido' ? 'text-danger-text' : 'text-fg')}>{etiquetaItem(item)}</span>
                  <span className={cn('text-xs', estado === 'vencido' ? 'text-danger-text' : 'text-warning-text')}>{detalleItem(item, item.vence != null && (item.dias == null || item.dias < 0))}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {revision && lineas.length === 0 && vehiculoRev && !sinDocumentos && (
        <p className="flex items-center gap-2 text-xs text-success-text">
          <CheckCircle2 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          {t('asignar.alDia')}
        </p>
      )}

      {capacidad && (
        <div className="flex gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm">
          <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="font-medium text-warning-text">{t('asignar.capacidad.titulo', { tipo: tipo(vehiculoRev?.tipo) })}</p>
            <p className="text-xs text-fg-secondary">
              {t(capacidad.causa === 'capacidad_m3' ? 'asignar.capacidad.m3' : 'asignar.capacidad.kg', {
                count: envios,
                valor: capacidad.valor ?? 0,
                capacidad: capacidad.capacidad ?? 0,
                vehiculo: nombreVehiculo,
              })}
            </p>
          </div>
        </div>
      )}

      {sinDocumentos && revision && (
        <AvisoTonal tono="informacion" compacto titulo={t('asignar.bici.titulo')} descripcion={t('asignar.bici.descripcion')} />
      )}

      {bloqueado && revision?.admiteExcepcion && (
        <>
          <p className="py-1 text-center text-xs text-fg-muted">{t('asignar.excepcion.o')}</p>
          <div className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning-text">
              <Stamp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('asignar.excepcion.titulo')}
            </p>
            <p className="text-xs text-fg-secondary">{t('asignar.excepcion.descripcion', { count: envios })}</p>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })} onClick={onPedirExcepcion}>
              <Stamp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('asignar.excepcion.boton')}
            </button>
          </div>
        </>
      )}
      {!revision && revisando && (
        <p className="flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
          <Info aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          {t('asignar.revisando')}
        </p>
      )}
    </section>
  );
}
