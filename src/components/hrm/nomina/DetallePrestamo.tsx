'use client';

/**
 * Detalle de un préstamo con sus cuotas (Figma 20.21.2). Las escrituras usan el
 * servicio de préstamos que ya existía (`employeeLoansService`, con la RLS de
 * `hr.payroll.process`): aprobar genera las cuotas; la nómina las descuenta y el
 * cierre las marca pagadas (ADR-003 §3). Quien aprueba es el usuario de la sesión.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Check, X } from 'lucide-react';
import {
  ConfirmDialog,
  DataTable,
  DialogoMotivo,
  EmptyState,
  FilaDato,
  ListCard,
  ListaDatos,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type ColumnaTabla,
  type TonoBadge,
} from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import EmployeeLoansService, { type EmployeeLoan, type LoanInstallment } from '@/lib/services/employeeLoansService';
import { RUTA_NOMINA, usePersonasNomina, useResumenNomina } from './apiNomina';
import { TONO_DEDUCCION, estadoPrestamo } from './nominaLogica';
import { useDinero, useFechas } from './piezasNomina';
import { MIGA_RRHH } from './NominaPage';

const RUTA_PRESTAMOS = `${RUTA_NOMINA}?vista=prestamos`;
const TONO_CUOTA: Record<string, TonoBadge> = { pending: 'neutro', partial: 'advertencia', paid: 'exito', overdue: 'peligro', skipped: 'neutro' };

type Carga = { estado: 'cargando' } | { estado: 'error' } | { estado: 'noExiste' } | { estado: 'listo'; prestamo: EmployeeLoan; cuotas: LoanInstallment[] };

export function DetallePrestamo({ id }: { id: string }) {
  const t = useTranslations('hrmNomina.prestamo');
  const tp = useTranslations('hrmNomina.prestamos');
  const tn = useTranslations('hrmNomina');
  const f = useFechas();
  const dinero = useDinero();
  const { getToday } = useFormatDate();
  const { organization } = useOrganization();
  const { carga: cargaResumen } = useResumenNomina();
  const { carga: cargaPersonas } = usePersonasNomina();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [accion, setAccion] = useState<'aprobar' | 'rechazar' | 'anular' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const orgId = organization?.id ?? null;
  const resumen = cargaResumen.estado === 'listo' ? cargaResumen.datos : null;
  const puede = resumen?.permisos.procesar === true;

  const cargar = useCallback(async () => {
    if (!orgId) return;
    try {
      const s = new EmployeeLoansService(orgId);
      const prestamo = await s.getById(id);
      if (!prestamo) return setCarga({ estado: 'noExiste' });
      setCarga({ estado: 'listo', prestamo, cuotas: await s.getInstallments(id) });
    } catch {
      setCarga({ estado: 'error' });
    }
  }, [orgId, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const migas = [
    { etiqueta: tn('migas.rrhh'), href: MIGA_RRHH },
    { etiqueta: tn('titulo'), href: RUTA_NOMINA },
    { etiqueta: tn('vistas.prestamos'), href: RUTA_PRESTAMOS },
  ];

  const filas = useMemo(() => {
    if (carga.estado !== 'listo') return [];
    let saldo = Number(carga.prestamo.total_amount) || 0;
    return carga.cuotas.map((c) => {
      saldo = Math.max(0, saldo - (Number(c.amount) || 0));
      return { ...c, saldo_despues: saldo };
    });
  }, [carga]);

  if (carga.estado !== 'listo') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
        <PageHeader variante="form" titulo={t('titulo')} volverA={RUTA_PRESTAMOS} migas={migas} cargando={carga.estado === 'cargando'} />
        {carga.estado === 'cargando' ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : carga.estado === 'noExiste' ? (
          <EmptyState variante="empty" titulo={t('noExiste')} accion={{ etiqueta: t('volver'), href: RUTA_PRESTAMOS }} />
        ) : (
          <EmptyState variante="error" onReintentar={() => void cargar()} />
        )}
      </div>
    );
  }

  const l = carga.prestamo;
  const nombre = (cargaPersonas.estado === 'listo' ? cargaPersonas.datos.personas.find((x) => x.vinculo_id === l.employment_id)?.nombre : null) ?? l.employee_name ?? '—';
  const estado = estadoPrestamo(l.status, l.first_payment_date, getToday());
  const titulo = t('tituloDe', { numero: l.loan_number ?? '—', nombre });
  const subtitulo = [
    l.loan_type === 'advance' ? tp('clases.anticipo') : t('deLaEmpresa'),
    Number(l.interest_rate) > 0 ? t('conIntereses', { monto: dinero(l.principal), tasa: l.interest_rate ?? 0 }) : t('sinIntereses', { monto: dinero(l.principal) }),
    t('cuotasDe', { n: l.installments_total, valor: dinero(l.installment_amount) }),
  ].join(' · ');

  const columnas: ColumnaTabla<(typeof filas)[number]>[] = [
    { id: 'cuota', encabezado: t('columnas.cuota'), celda: (c) => t('nDeTotal', { n: c.installment_number, total: l.installments_total }) },
    { id: 'vence', encabezado: t('columnas.vence'), celda: (c) => f.corta(c.due_date) },
    { id: 'valor', encabezado: t('columnas.valor'), variante: 'importe', celda: (c) => dinero(c.amount) },
    { id: 'saldo', encabezado: t('columnas.saldo'), variante: 'importe', ocultarDebajo: 'md', celda: (c) => dinero(c.saldo_despues) },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (c) => {
        const k = c.payroll_slip_id && c.status === 'paid' ? 'descontada' : c.status ?? 'pending';
        return <StatusBadge estado={k} etiqueta={t(`cuotas.${['descontada', 'pending', 'partial', 'paid', 'overdue', 'skipped'].includes(k) ? k : 'pending'}`)} tono={k === 'descontada' ? 'exito' : TONO_CUOTA[k] ?? 'neutro'} />;
      },
    },
  ];

  const ejecutar = async (fn: (s: EmployeeLoansService) => Promise<unknown>, ok: string) => {
    if (!orgId) return;
    setOcupado(true);
    try {
      await fn(new EmployeeLoansService(orgId));
      toast.success(ok);
      setAccion(null);
      await cargar();
    } catch {
      toast.error(t('error'));
    } finally {
      setOcupado(false);
    }
  };

  const usuario = resumen?.usuario_id ?? null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        titulo={titulo}
        subtitulo={subtitulo}
        volverA={RUTA_PRESTAMOS}
        migas={migas}
        badge={<StatusBadge estado={estado} etiqueta={tp(`estados.${estado}`)} tono={TONO_DEDUCCION[estado]} tamano="md" />}
        acciones={
          puede && l.status === 'requested' ? (
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setAccion('rechazar')}>
                <X aria-hidden className="size-4" strokeWidth={1.5} />
                {t('rechazar')}
              </button>
              <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setAccion('aprobar')} disabled={!usuario}>
                <Check aria-hidden className="size-4" strokeWidth={1.5} />
                {t('aprobar')}
              </button>
            </>
          ) : puede && (l.status === 'active' || l.status === 'approved') ? (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setAccion('anular')}>
              <Ban aria-hidden className="size-4" strokeWidth={1.5} />
              {t('anular')}
            </button>
          ) : undefined
        }
        movil={{ subtitulo, accionesEnFila: true }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <DataTable
          etiqueta={t('cuotasTitulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(c) => c.id}
          estado={filas.length ? 'listo' : 'vacio'}
          tarjetaMovil={(c) => (
            <ListCard
              titulo={t('nDeTotal', { n: c.installment_number, total: l.installments_total })}
              subtitulo={f.corta(c.due_date)}
              valor={dinero(c.amount)}
              meta={t('saldoDespues', { valor: dinero(c.saldo_despues) })}
            />
          )}
          vacio={{ titulo: t('sinCuotas.titulo'), descripcion: t('sinCuotas.descripcion') }}
        />
        <div className="flex flex-col gap-4">
          <Tarjeta titulo={t('condiciones.titulo')}>
            <ListaDatos>
              <FilaDato etiqueta={t('condiciones.estado')} valor={<StatusBadge estado={estado} etiqueta={tp(`estados.${estado}`)} tono={TONO_DEDUCCION[estado]} />} />
              <FilaDato etiqueta={t('condiciones.monto')} valor={dinero(l.principal)} />
              <FilaDato etiqueta={t('condiciones.intereses')} valor={Number(l.interest_rate) > 0 ? `${l.interest_rate} % · ${dinero(l.total_interest)}` : t('condiciones.sinIntereses')} />
              <FilaDato etiqueta={t('condiciones.total')} valor={dinero(l.total_amount)} />
              <FilaDato etiqueta={t('condiciones.saldo')} valor={dinero(l.balance)} tamano="lg" separadorAntes />
              <FilaDato etiqueta={t('condiciones.descuento')} valor={l.auto_deduct ? t('condiciones.porNomina') : t('condiciones.manual')} />
              <FilaDato etiqueta={t('condiciones.maximo')} valor={l.max_deduction_pct !== null ? `${l.max_deduction_pct} %` : '—'} />
              {l.first_payment_date ? <FilaDato etiqueta={t('condiciones.primeraCuota')} valor={f.corta(l.first_payment_date)} /> : null}
            </ListaDatos>
            <p className="mt-3 text-[13px] leading-[18px] text-fg-secondary">{t('condiciones.nota')}</p>
          </Tarjeta>
        </div>
      </div>

      <ConfirmDialog
        abierto={accion === 'aprobar'}
        onAbiertoChange={(v) => !v && setAccion(null)}
        tono="marca"
        icono={Check}
        titulo={t('confirmarAprobar.titulo')}
        descripcion={t('confirmarAprobar.descripcion', { n: l.installments_total, valor: dinero(l.installment_amount) })}
        textoConfirmar={t('aprobar')}
        cargando={ocupado}
        onConfirmar={() => (usuario ? ejecutar((s) => s.approve(l.id, usuario), t('aprobado')) : undefined)}
      />
      <DialogoMotivo
        abierto={accion === 'rechazar'}
        onAbiertoChange={(v) => !v && setAccion(null)}
        icono={X}
        titulo={t('confirmarRechazar.titulo')}
        textoConfirmar={t('rechazar')}
        cargando={ocupado}
        onConfirmar={(motivo) => (usuario ? ejecutar((s) => s.reject(l.id, usuario, motivo), t('rechazado')) : undefined)}
      />
      <ConfirmDialog
        abierto={accion === 'anular'}
        onAbiertoChange={(v) => !v && setAccion(null)}
        tono="peligro"
        icono={Ban}
        titulo={t('confirmarAnular.titulo')}
        descripcion={t('confirmarAnular.descripcion', { saldo: dinero(l.balance) })}
        textoConfirmar={t('anular')}
        cargando={ocupado}
        onConfirmar={() => ejecutar((s) => s.cancel(l.id), t('anulado'))}
      />
    </div>
  );
}
