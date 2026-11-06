'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, CampoNumero, DataTable, Dialogo, FormField, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService, { type PayrollSlip } from '@/lib/services/payrollService';
import { colillaCompleta, colillasPendientes, estadoRetencion } from '@/lib/services/nominaDeducciones';

type Concepto = 'retencion' | 'prestamo';

interface Props {
  ejecucionId: string;
  /** Avisa cuántas colillas faltan: la pantalla apaga «Aprobar» mientras falte alguna. */
  onPendientes: (pendientes: number) => void;
  /** Cambiaron los totales del periodo. */
  onCambio: () => void;
}

/** Colillas de la ejecución vigente, con lo que falta por escribir a mano. */
export function DeduccionesPeriodo({ ejecucionId, onPendientes, onCambio }: Props) {
  const t = useTranslations('nominaDeducciones');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { formatear } = useMonedaOrganizacion();
  const [colillas, setColillas] = useState<PayrollSlip[]>([]);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [edicion, setEdicion] = useState<{ colilla: PayrollSlip; concepto: Concepto } | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const servicio = useMemo(() => (organization?.id ? new PayrollService(organization.id) : null), [organization?.id]);

  const cargar = useCallback(async () => {
    if (!servicio) return;
    try {
      const filas = await servicio.getSlips({ run_id: ejecucionId });
      setColillas(filas);
      onPendientes(colillasPendientes(filas).length);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [ejecucionId, onPendientes, servicio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrir = (colilla: PayrollSlip, concepto: Concepto) => {
    setEdicion({ colilla, concepto });
    setValor(null);
    setNota('');
  };

  const guardar = async () => {
    if (!servicio || !edicion || valor === null) return;
    setGuardando(true);
    try {
      await servicio.fijarDeduccion(edicion.colilla.id, edicion.concepto, valor, nota);
      setEdicion(null);
      await cargar();
      onCambio();
    } catch (e) {
      const mensaje = (e as { message?: string } | null)?.message ?? '';
      const clave = mensaje.includes('neto_negativo')
        ? 'errores.netoNegativo'
        : mensaje.includes('sin_permiso')
          ? 'errores.sinPermiso'
          : mensaje.includes('no_editable')
            ? 'errores.noEditable'
            : 'errores.generico';
      toast({ title: t('errores.titulo'), description: t(clave), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const columnas = useMemo<ColumnaTabla<PayrollSlip>[]>(
    () => [
      { id: 'empleado', encabezado: t('columnas.empleado'), celda: (c) => c.employee_name || c.employee_code || '—' },
      { id: 'devengado', encabezado: t('columnas.devengado'), variante: 'importe', celda: (c) => formatear(c.gross_pay) },
      {
        id: 'seguridad',
        encabezado: t('columnas.saludPension'),
        variante: 'importe',
        celda: (c) => `(${formatear(Number(c.health_deduction ?? 0) + Number(c.pension_deduction ?? 0))})`,
      },
      {
        id: 'retencion',
        encabezado: t('columnas.retencion'),
        alinear: 'derecha',
        celda: (c) => {
          const e = estadoRetencion(c.tax_withholding);
          if (e === 'sin_calcular') {
            return (
              <button
                type="button"
                onClick={() => abrir(c, 'retencion')}
                className="text-warning-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('sinCalcular')}
              </button>
            );
          }
          return e === 'no_aplica'
            ? <span className="text-fg-secondary">{t('noAplica')}</span>
            : `(${formatear(c.tax_withholding)})`;
        },
      },
      {
        id: 'prestamo',
        encabezado: t('columnas.prestamos'),
        alinear: 'derecha',
        celda: (c) =>
          c.loan_deductions === null ? (
            <button
              type="button"
              onClick={() => abrir(c, 'prestamo')}
              className="text-warning-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('sinCalcular')}
            </button>
          ) : (
            `(${formatear(c.loan_deductions)})`
          ),
      },
      {
        id: 'neto',
        encabezado: t('columnas.neto'),
        variante: 'importe',
        celda: (c) => (colillaCompleta(c) ? formatear(c.net_pay) : '—'),
      },
    ],
    [formatear, t],
  );

  const pendientes = colillasPendientes(colillas);
  const primera = pendientes[0];
  const faltaPrestamo = pendientes.length > 0 && pendientes.every((c) => c.tax_withholding !== null);

  return (
    <div className="space-y-4">
      {primera && (
        <AvisoTonal
          tono="peligro"
          titulo={faltaPrestamo ? t('bloqueo.tituloPrestamo') : t('bloqueo.titulo')}
          descripcion={t('bloqueo.descripcion')}
          accion={{
            etiqueta: t('bloqueo.ingresar'),
            onClick: () => abrir(primera, primera.tax_withholding === null ? 'retencion' : 'prestamo'),
          }}
        />
      )}

      <DataTable<PayrollSlip>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={colillas}
        obtenerId={(c) => c.id}
        estado={estado}
        onReintentar={() => void cargar()}
        vacio={{ titulo: t('vacio') }}
      />

      <Dialogo
        abierto={edicion !== null}
        onAbiertoChange={(a) => !a && setEdicion(null)}
        titulo={t(edicion?.concepto === 'prestamo' ? 'dialogo.tituloPrestamo' : 'dialogo.titulo')}
        descripcion={edicion?.colilla.employee_name ?? undefined}
        primario={{
          etiqueta: t('dialogo.guardar'),
          onClick: () => void guardar(),
          cargando: guardando,
          deshabilitada: valor === null,
          motivo: t('dialogo.faltaValor'),
        }}
      >
        <div className="space-y-4">
          <FormField etiqueta={t('dialogo.valor')} ayuda={edicion?.concepto === 'prestamo' ? undefined : t('dialogo.ayudaCero')} obligatorio>
            {(campo) => <CampoNumero id={campo.id} valor={valor} onValorChange={setValor} minimo={0} decimales={2} alinear="derecha" />}
          </FormField>
          <FormField etiqueta={t('dialogo.nota')}>
            {(campo) => <Textarea id={campo.id} value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />}
          </FormField>
        </div>
      </Dialogo>
    </div>
  );
}
