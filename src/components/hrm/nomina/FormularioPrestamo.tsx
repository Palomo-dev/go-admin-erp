'use client';

/**
 * Nuevo préstamo o anticipo (Figma 20.21.4). Lo crea el servicio de préstamos que ya
 * existía (`employeeLoansService.create`, RLS `hr.payroll.process`): nace
 * «solicitado» y no se descuenta hasta que se aprueba. Las libranzas no son
 * préstamos de la empresa: se registran como novedad del período.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { AvisoTonal, CampoFecha, CampoNumero, EmptyState, FilaDato, FormField, ListaDatos, PageHeader, SegmentedControl, Tarjeta, clasesBoton } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import EmployeeLoansService from '@/lib/services/employeeLoansService';
import { SelectorPersona, useEmpleadosVigentes } from '../ausencias/SelectorPersona';
import { RUTA_NOMINA, rutaPrestamo, useResumenNomina } from './apiNomina';
import { useDinero } from './piezasNomina';
import { MIGA_RRHH } from './NominaPage';

const RUTA_PRESTAMOS = `${RUTA_NOMINA}?vista=prestamos`;

export function FormularioPrestamo() {
  const t = useTranslations('hrmNomina.nuevoPrestamo');
  const tn = useTranslations('hrmNomina');
  const router = useRouter();
  const dinero = useDinero();
  const { getToday } = useFormatDate();
  const { organization } = useOrganization();
  const { carga } = useResumenNomina();
  const empleados = useEmpleadosVigentes(true);
  const [vinculo, setVinculo] = useState('');
  const [tipo, setTipo] = useState<'general' | 'advance'>('general');
  const [monto, setMonto] = useState<number | null>(null);
  const [cuotas, setCuotas] = useState<number | null>(1);
  const [primera, setPrimera] = useState('');
  const [tasa, setTasa] = useState<number | null>(0);
  const [maximo, setMaximo] = useState<number | null>(30);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!primera) setPrimera(getToday());
  }, [primera, getToday]);

  const migas = [
    { etiqueta: tn('migas.rrhh'), href: MIGA_RRHH },
    { etiqueta: tn('titulo'), href: RUTA_NOMINA },
    { etiqueta: tn('vistas.prestamos'), href: RUTA_PRESTAMOS },
  ];

  if (carga.estado === 'sinPermiso' || (carga.estado === 'listo' && !carga.datos.permisos.procesar)) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
        <PageHeader variante="form" titulo={t('titulo')} volverA={RUTA_PRESTAMOS} migas={migas} />
        <EmptyState variante="forbidden" titulo={t('sinPermiso')} accion={{ etiqueta: t('volver'), href: RUTA_PRESTAMOS }} />
      </div>
    );
  }

  const n = tipo === 'advance' ? 1 : cuotas;
  const valido = !!vinculo && !!monto && monto > 0 && !!n && n >= 1 && !!primera;
  const cuotaSinIntereses = monto && n ? monto / n : null;

  const crear = async () => {
    if (!valido || !organization?.id || !monto || !n) return;
    setGuardando(true);
    try {
      const l = await new EmployeeLoansService(organization.id).create({
        employment_id: vinculo,
        loan_type: tipo,
        // Vacío: el servicio usa la moneda base de la organización (nunca una cableada).
        currency_code: '',
        principal: monto,
        interest_rate: tipo === 'advance' ? 0 : tasa ?? 0,
        installments_total: n,
        first_payment_date: primera,
        auto_deduct: true,
        max_deduction_pct: maximo ?? 30,
        notes: notas.trim() || undefined,
      });
      toast.success(t('creado'));
      router.push(rutaPrestamo(l.id));
    } catch {
      toast.error(t('error'));
    } finally {
      setGuardando(false);
    }
  };

  const botones = (
    <>
      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => router.push(RUTA_PRESTAMOS)}>
        {t('cancelar')}
      </button>
      <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} disabled={!valido || guardando} onClick={() => void crear()}>
        <Plus aria-hidden className="size-4" strokeWidth={1.5} />
        {t('crear')}
      </button>
    </>
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader variante="form" titulo={t('titulo')} subtitulo={t('subtitulo')} volverA={RUTA_PRESTAMOS} migas={migas} acciones={botones} movil={{ accionesEnFila: true }} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Tarjeta titulo={t('datos')}>
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('empleado')} obligatorio>
              {(c) => <SelectorPersona id={c.id} valor={vinculo} onCambiar={(v) => setVinculo(v)} empleados={empleados} />}
            </FormField>
            <FormField etiqueta={t('tipo')}>
              {(c) => (
                <SegmentedControl
                  id={c.id}
                  aria-labelledby={c.idEtiqueta}
                  valor={tipo}
                  onValorChange={setTipo}
                  opciones={[
                    { valor: 'general', etiqueta: t('tipos.prestamo') },
                    { valor: 'advance', etiqueta: t('tipos.anticipo') },
                  ]}
                />
              )}
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('monto')} obligatorio>
                {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} decimales={0} minimo={0} alinear="derecha" />}
              </FormField>
              <FormField etiqueta={t('cuotas')} obligatorio ayuda={tipo === 'advance' ? t('anticipoUnaCuota') : undefined}>
                {(c) => <CampoNumero id={c.id} valor={n} onValorChange={setCuotas} decimales={0} minimo={1} maximo={120} disabled={tipo === 'advance'} alinear="derecha" />}
              </FormField>
              <FormField etiqueta={t('primeraCuota')} obligatorio>
                {(c) => <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={primera} onValorChange={setPrimera} hoy={getToday()} required />}
              </FormField>
              <FormField etiqueta={t('intereses')} ayuda={t('interesesAyuda')}>
                {(c) => <CampoNumero id={c.id} valor={tipo === 'advance' ? 0 : tasa} onValorChange={setTasa} decimales={2} minimo={0} maximo={100} sufijo="%" disabled={tipo === 'advance'} alinear="derecha" />}
              </FormField>
              <FormField etiqueta={t('maximo')} ayuda={t('maximoAyuda')}>
                {(c) => <CampoNumero id={c.id} valor={maximo} onValorChange={setMaximo} decimales={0} minimo={1} maximo={50} sufijo="%" alinear="derecha" />}
              </FormField>
            </div>
            <FormField etiqueta={t('notas')} ayuda={t('notasAyuda')}>
              {(c) => <Textarea id={c.id} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} rows={3} />}
            </FormField>
          </div>
        </Tarjeta>
        <div className="flex flex-col gap-4">
          <Tarjeta titulo={t('asiQueda')}>
            <ListaDatos>
              <FilaDato etiqueta={t('cuota')} valor={cuotaSinIntereses ? t('cuotaDe', { valor: dinero(Math.round(cuotaSinIntereses)), n: n ?? 0 }) : '—'} />
              {tasa && tasa > 0 && tipo !== 'advance' ? <FilaDato etiqueta={t('interesesAparte')} valor={t('alCrear')} /> : null}
              <FilaDato etiqueta={t('limite')} valor={`${maximo ?? 30} %`} />
            </ListaDatos>
            <p className="mt-3 text-[13px] leading-[18px] text-fg-secondary">{t('limiteNota')}</p>
          </Tarjeta>
          <AvisoTonal tono="informacion" titulo={t('aprobacion.titulo')} descripcion={t('aprobacion.descripcion')} />
          <AvisoTonal tono="advertencia" titulo={t('autorizacion.titulo')} descripcion={t('autorizacion.descripcion')} />
        </div>
      </div>
    </div>
  );
}
