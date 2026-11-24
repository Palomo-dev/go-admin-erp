'use client';

/**
 * Tabla de deals de partner (Figma «Ficha del partner» 1316:776081 y móvil
 * 1438:1908; también la pestaña «Deals» del directorio con la columna
 * Partner). Oportunidad + cliente, tipo, negocio, monto, comisión, estado de
 * la comisión y la acción que la máquina permite (`accionDeal`). Aprobar,
 * rechazar y registrar pago piden confirmación y van por
 * `PATCH /api/crm/partners/[id]/deals/[dealId]` (admin/manager en el servidor).
 * «Registrar pago» es un registro: aquí no se mueve dinero.
 */

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, HandCoins, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { ListCard } from '@/components/kit/ListCard';
import { clasesBoton } from '@/components/kit/botonClases';
import type { AccionFila } from '@/components/kit/acciones';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { formatMoney } from '@/lib/services/crm/partnerModel';
import type { CommissionStatus } from '@/lib/services/crm/partnerCommission';
import { accionDeal, estadoNegocio, ordenarDeals, tonoComision, tonoTipoDeal, TONO_NEGOCIO, type DealFila, type OrdenPartners } from './redPartnersLogica';
import { claveErrorPartners } from './redPartnersErrores';

export interface DealsTablaProps {
  deals: readonly DealFila[];
  estado: EstadoTabla;
  puedeGestionar: boolean;
  /** Pestaña «Deals» del directorio: muestra la columna Partner. */
  conPartner?: boolean;
  onTransicion: (partnerId: string, dealId: string, estado: CommissionStatus) => Promise<unknown>;
  onReintentar?: () => void;
  vacio?: { titulo: string; descripcion: string };
  pie?: React.ReactNode;
}

interface Pendiente {
  deal: DealFila;
  a: CommissionStatus;
}

export function DealsTabla({ deals, estado, puedeGestionar, conPartner, onTransicion, onReintentar, vacio, pie }: DealsTablaProps) {
  const t = useTranslations('crm.redPartners');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const [orden, setOrden] = useState<OrdenPartners | null>(null);
  const [confirmar, setConfirmar] = useState<Pendiente | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const filas = useMemo(() => ordenarDeals(deals, orden), [deals, orden]);
  const dinero = (v: number | string | null | undefined, d: DealFila) => formatMoney(v, d.opportunity?.currency ?? null);
  const nombreOpp = (d: DealFila) => d.opportunity?.name || t('deals.oportunidadNoDisponible');

  const aplicar = async () => {
    if (!confirmar) return;
    setOcupado(true);
    try {
      await onTransicion(confirmar.deal.partner_id, confirmar.deal.id, confirmar.a);
      toast({ title: t(`deals.hecho.${confirmar.a}`), description: `${nombreOpp(confirmar.deal)} · ${dinero(confirmar.deal.commission_amount, confirmar.deal)}` });
      setConfirmar(null);
    } catch (e) {
      toast({ title: t('deals.errorTransicion'), description: t(claveErrorPartners(e)), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const accion = (d: DealFila) => {
    const a = accionDeal(d, puedeGestionar);
    const pedir = (to: CommissionStatus) => () => setConfirmar({ deal: d, a: to });
    switch (a) {
      case 'aprobarRechazar':
        return (
          <div className="flex items-center gap-2">
            <button type="button" onClick={pedir('approved')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('deals.aprobar')}
            </button>
            <button type="button" onClick={pedir('rejected')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              {t('deals.rechazar')}
            </button>
          </div>
        );
      case 'rechazar':
        return (
          <button type="button" onClick={pedir('rejected')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            {t('deals.rechazar')}
          </button>
        );
      case 'registrarPago':
        return (
          <button type="button" onClick={pedir('paid')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('deals.registrarPago')}
          </button>
        );
      case 'pagada':
        return <span className="text-[13px] text-fg-secondary">{t('deals.pagadaEl', { fecha: formatDateInTz(d.commission_paid_at, timezone, { locale: idioma, day: 'numeric', month: 'short' }) })}</span>;
      case 'esperaGanar':
        return <span className="text-[13px] text-fg-secondary">{t('deals.esperaGanar')}</span>;
      case 'noCuenta':
        return <span className="text-[13px] text-fg-secondary">{t('deals.noCuenta')}</span>;
      default:
        return null;
    }
  };

  const columnas: ColumnaTabla<DealFila>[] = [
    {
      id: 'oportunidad',
      encabezado: t('deals.col.oportunidad'),
      ordenable: true,
      celda: (d) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-fg">{nombreOpp(d)}</span>
          {d.opportunity?.customer_name && <span className="truncate text-xs text-fg-secondary">{d.opportunity.customer_name}</span>}
        </div>
      ),
    },
    ...(conPartner
      ? [{ id: 'partner', encabezado: t('deals.col.partner'), celda: (d: DealFila) => <span className="text-sm text-fg">{d.partner?.name ?? '—'}</span> }]
      : []),
    {
      id: 'tipo',
      encabezado: t('deals.col.tipo'),
      celda: (d) => <Badge tono={tonoTipoDeal(d.deal_type)} tamano="sm">{t(`tipos.${d.deal_type}`)}</Badge>,
    },
    {
      id: 'negocio',
      encabezado: t('deals.col.negocio'),
      celda: (d) => {
        const n = estadoNegocio(d.opportunity?.status);
        return <Badge tono={TONO_NEGOCIO[n]} tamano="sm">{t(`negocio.${n}`)}</Badge>;
      },
    },
    { id: 'monto', encabezado: t('deals.col.monto'), variante: 'importe', ordenable: true, celda: (d) => (d.opportunity?.amount != null ? dinero(d.opportunity.amount, d) : '—') },
    ...(puedeGestionar ? [{ id: 'comision', encabezado: t('deals.col.comision'), variante: 'importe' as const, celda: (d: DealFila) => dinero(d.commission_amount, d) }] : []),
    {
      id: 'estado',
      encabezado: t('deals.col.estado'),
      celda: (d) => <Badge tono={tonoComision(d.commission_status)} tamano="sm">{t(`comision.${d.commission_status}`)}</Badge>,
    },
    { id: 'accion', encabezado: t('deals.col.accion'), celda: accion, className: 'w-[200px]' },
  ];

  const accionesMovil = (d: DealFila): AccionFila[] => {
    const a = accionDeal(d, puedeGestionar);
    const pedir = (to: CommissionStatus) => () => setConfirmar({ deal: d, a: to });
    if (a === 'aprobarRechazar') return [{ id: 'aprobar', etiqueta: t('deals.aprobar'), icono: Check, onSelect: pedir('approved') }, { id: 'rechazar', etiqueta: t('deals.rechazar'), icono: XCircle, destructiva: true, onSelect: pedir('rejected') }];
    if (a === 'rechazar') return [{ id: 'rechazar', etiqueta: t('deals.rechazar'), icono: XCircle, destructiva: true, onSelect: pedir('rejected') }];
    if (a === 'registrarPago') return [{ id: 'pagar', etiqueta: t('deals.registrarPago'), icono: HandCoins, onSelect: pedir('paid') }];
    return [];
  };

  const tarjeta = (d: DealFila) => {
    const n = estadoNegocio(d.opportunity?.status);
    const rechazada = d.commission_status === 'rejected';
    const titulo = [d.opportunity?.customer_name, nombreOpp(d)].filter(Boolean).join(' · ');
    const linea = rechazada
      ? t('deals.noCuenta')
      : !puedeGestionar
        ? t(`comision.${d.commission_status}`)
        : n === 'abierto' && d.commission_status === 'pending'
          ? t('movil.comisionEstimada', { monto: dinero(d.commission_amount, d) })
          : d.commission_status === 'paid'
            ? t('movil.comisionPagada', { monto: dinero(d.commission_amount, d) })
            : t('movil.comisionPorPagar', { monto: dinero(d.commission_amount, d) });
    return (
      <ListCard
        titulo={titulo}
        insignia={
          rechazada ? (
            <Badge tono="neutro" tamano="sm">{t('movil.rechazado')}</Badge>
          ) : (
            <Badge tono={n === 'abierto' ? 'marca' : TONO_NEGOCIO[n]} tamano="sm">{t(`negocio.${n}`)}</Badge>
          )
        }
        subtitulo={linea}
        meta={conPartner ? d.partner?.name : undefined}
        acciones={accionesMovil(d)}
      />
    );
  };

  const desc = confirmar
    ? `${nombreOpp(confirmar.deal)} · ${dinero(confirmar.deal.commission_amount, confirmar.deal)}. ${t(`deals.confirmar.${confirmar.a}.descripcion`)}`
    : '';

  return (
    <>
      <DataTable<DealFila>
        columnas={columnas}
        filas={filas}
        obtenerId={(d) => d.id}
        etiqueta={t('deals.etiqueta')}
        estado={estado}
        orden={orden ? { campo: orden.campo, direccion: orden.direccion } : null}
        onOrdenar={(campo) =>
          setOrden((o) => (!o || o.campo !== campo ? { campo, direccion: 'asc' } : o.direccion === 'asc' ? { campo, direccion: 'desc' } : null))
        }
        tarjetaMovil={tarjeta}
        vacio={vacio ? { titulo: vacio.titulo, descripcion: vacio.descripcion } : undefined}
        error={{ titulo: t('estados.error.titulo'), descripcion: t('estados.error.descripcion') }}
        onReintentar={onReintentar}
        filasEsqueleto={5}
        pie={pie}
      />
      <ConfirmDialog
        abierto={confirmar !== null}
        onAbiertoChange={(a) => {
          if (!a && !ocupado) setConfirmar(null);
        }}
        titulo={confirmar ? t(`deals.confirmar.${confirmar.a}.titulo`) : ''}
        descripcion={desc}
        textoConfirmar={confirmar ? t(`deals.confirmar.${confirmar.a}.boton`) : ''}
        tono={confirmar?.a === 'rejected' ? 'peligro' : 'marca'}
        onConfirmar={aplicar}
        cargando={ocupado}
      />
    </>
  );
}
