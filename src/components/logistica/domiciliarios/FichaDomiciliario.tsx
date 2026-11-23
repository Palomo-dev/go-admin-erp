'use client';

/**
 * Ficha sencilla de un domiciliario: datos, estado, carga del día (sus envíos en curso y los
 * entregados hoy) y acciones (llamar, WhatsApp, ver cuadres, activar o desactivar). En móvil es una
 * hoja a pantalla completa (`PanelAdaptable`).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bike, HandCoins, MessageCircle, Phone, Power } from 'lucide-react';
import { FilaDato, ListaDatos, PanelAdaptable, StatusBadge, clasesBoton } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { telefonoWhatsApp } from '@/lib/services/clientesListadoService';
import { TONO_ESTADO_DOMICILIARIO, cobraContraentrega } from '@/lib/logistica/domiciliarios';
import { ESTADOS_EN_RUTA, enlaceLlamar, enlaceWhatsApp } from '@/lib/logistica/misEnvios';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';
import { InsigniaEstadoApp } from '../misEnvios/piezas';
import type { FilaDomiciliario } from './tipos';

export interface FichaDomiciliarioProps {
  fila: FilaDomiciliario | null;
  onCerrar: () => void;
  nombreSede: (id: number | null) => string;
  puedeGestionar: boolean;
  onCambiarActivo: (f: FilaDomiciliario) => void;
}

export function FichaDomiciliario({ fila, onCerrar, nombreSede, puedeGestionar, onCambiarActivo }: FichaDomiciliarioProps) {
  const t = useTranslations('logistica.domiciliario');
  const moneda = useMonedaOrganizacion();
  if (!fila) return null;

  const { d, carga } = fila;
  const telefono = d.phone ?? d.employee?.phone ?? null;
  const llamar = enlaceLlamar(telefono);
  const whatsapp = enlaceWhatsApp(telefonoWhatsApp(telefono));
  const enCurso = fila.envios.filter((e) => ESTADOS_EN_RUTA.includes(e.status) || e.status === 'failed_attempt');

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={fila.nombre}
      descripcion={d.is_external ? t('externo') : t('empleado')}
      icono={Bike}
      ancho={560}
      antetitulo={<StatusBadge estado={fila.estado} etiqueta={t(`estados.${fila.estado}`)} tono={TONO_ESTADO_DOMICILIARIO[fila.estado]} />}
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          {puedeGestionar && (
            <button
              type="button"
              onClick={() => onCambiarActivo(fila)}
              disabled={d.is_active && carga.enCamino > 0}
              title={d.is_active && carga.enCamino > 0 ? t('acciones.noDesactivarEnRuta') : undefined}
              className={clasesBoton({ variante: 'secundario' })}
            >
              <Power aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {d.is_active ? t('acciones.desactivar') : t('acciones.activar')}
            </button>
          )}
          <Link href={`${RUTAS_LOGISTICA.cuadres}?domiciliario=${d.id}`} className={clasesBoton({ variante: 'primario' })}>
            <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.verCuadres')}
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {(llamar || whatsapp) && (
          <div className="flex gap-2">
            {llamar && (
              <a href={llamar} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                <Phone aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.llamar')}
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.whatsapp')}
              </a>
            )}
          </div>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('ficha.cargaDelDia')}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra etiqueta={t('ficha.asignados')} valor={String(carga.asignados)} />
            <Cifra etiqueta={t('ficha.enCamino')} valor={String(carga.enCamino)} />
            <Cifra etiqueta={t('ficha.entregadosHoy')} valor={String(carga.entregadosHoy)} />
            <Cifra etiqueta={t('ficha.porCuadrar')} valor={moneda.formatear(carga.porCuadrar)} />
          </div>
          {enCurso.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {enCurso.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-fg">{e.shipment_number}</span>
                    <span className="truncate text-xs text-fg-muted">{[e.delivery_contact_name, e.delivery_address].filter(Boolean).join(' · ')}</span>
                  </span>
                  <InsigniaEstadoApp estado={e.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-secondary">{t('ficha.sinEnvios')}</p>
          )}
        </section>

        <ListaDatos etiqueta={t('ficha.datos')}>
          <FilaDato etiqueta={t('columnas.celular')} valor={telefono ?? '—'} />
          <FilaDato etiqueta={t('ficha.documento')} valor={d.document_number ? `${d.document_type ?? ''} ${d.document_number}`.trim() : '—'} />
          <FilaDato etiqueta={t('columnas.sede')} valor={nombreSede(d.branch_id)} />
          <FilaDato etiqueta={t('columnas.vehiculo')} valor={d.vehicle_type ? t(`alta.vehiculos.${d.vehicle_type}`) : '—'} />
          <FilaDato etiqueta={t('ficha.contraentrega')} valor={cobraContraentrega(d.metadata) ? t('ficha.si') : t('ficha.no')} />
          <FilaDato etiqueta={t('ficha.misEnvios')} valor={d.user_id ? t('ficha.conCuenta') : t('ficha.sinCuenta')} />
          <FilaDato etiqueta={t('ficha.licencia')} valor={d.license_number ?? t('ficha.sinLicencia')} />
        </ListaDatos>
      </div>
    </PanelAdaptable>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line px-3 py-2">
      <span className="text-xs text-fg-secondary">{etiqueta}</span>
      <span className="text-base font-semibold text-fg">{valor}</span>
    </div>
  );
}
