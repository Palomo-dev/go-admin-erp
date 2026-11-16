'use client';

/**
 * Laboral (Figma 95-hrm-03-04): puesto y contrato vigentes. No se editan aquí:
 * cada cambio va con fecha de efecto, motivo y aprobación («Registrar un cambio»).
 */
import { useTranslations } from 'next-intl';
import { AvisoTonal, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { antiguedad } from '@/lib/hrm/personas/logica';
import type { ContextoFicha } from './FichaEmpleado';
import { fechaCorta, useValorCampo } from '../textosPersonas';

interface Fila {
  id: string;
  dato: string;
  valor: string;
  desde?: string;
  detalle: string;
}

export function PestanaLaboral({ ficha, registrarCambio, irA }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.laboral');
  const tc = useTranslations('hrmPersonas.comun');
  const valorCampo = useValorCampo();
  const v = ficha.vinculo;
  const ant = antiguedad(v?.ingreso, ficha.hoy);

  const puesto: Fila[] = ficha.laboral.map((l) => ({
    id: l.campo,
    dato: t(`campos.${l.campo}`),
    valor: valorCampo(l.campo, l.valor, l.nombre),
    desde: fechaCorta(l.desde),
    detalle:
      l.source === 'cambio_directo'
        ? t('cambioDirecto')
        : [l.motivo ?? t('ingreso'), l.aprobo ? t('aprobo', { nombre: l.aprobo }) : null].filter(Boolean).join(' · '),
  }));

  const contrato: Fila[] = v
    ? [
        {
          id: 'tipo',
          dato: t('tipoContrato'),
          valor: v.tipo_contrato ? tc(`contratos.${v.tipo_contrato}`) : '—',
          detalle: v.fin_contrato ? t('hasta', { fecha: fechaCorta(v.fin_contrato) }) : '',
        },
        { id: 'ingreso', dato: t('fechaIngreso'), valor: fechaCorta(v.ingreso), detalle: ant ? t('antiguedad', { anios: ant.anios, meses: ant.meses }) : '' },
        {
          id: 'prueba',
          dato: t('periodoPrueba'),
          valor: v.fin_prueba ? t('hasta', { fecha: fechaCorta(v.fin_prueba) }) : '—',
          detalle: v.fin_prueba ? (v.fin_prueba < ficha.hoy ? t('termino', { fecha: fechaCorta(v.fin_prueba) }) : t('enCurso')) : t('sinPrueba'),
        },
        { id: 'retiro', dato: t('fechaRetiro'), valor: v.retiro ? fechaCorta(v.retiro) : '—', detalle: v.motivo_retiro ?? (v.retiro ? '' : t('sinRetiro')) },
        { id: 'documento', dato: t('documento'), valor: t('verDocumentos'), detalle: t('enDocumentos') },
      ]
    : [];

  const columnasPuesto: ColumnaTabla<Fila>[] = [
    { id: 'dato', encabezado: t('columnas.dato'), celda: (f) => <span className="font-medium text-fg">{f.dato}</span> },
    { id: 'valor', encabezado: t('columnas.valorVigente'), celda: (f) => f.valor },
    { id: 'desde', encabezado: t('columnas.desde'), ocultarDebajo: 'md', celda: (f) => <span className="whitespace-nowrap tabular-nums">{f.desde}</span> },
    { id: 'detalle', encabezado: t('columnas.ultimoCambio'), ocultarDebajo: 'lg', celda: (f) => <span className="text-fg-secondary">{f.detalle}</span> },
  ];
  const columnasContrato: ColumnaTabla<Fila>[] = [
    { id: 'dato', encabezado: t('columnas.dato'), celda: (f) => <span className="font-medium text-fg">{f.dato}</span> },
    {
      id: 'valor',
      encabezado: t('columnas.valor'),
      celda: (f) =>
        f.id === 'documento' ? (
          <button type="button" onClick={() => irA('documentos')} className="text-sm font-medium text-fg hover:underline">
            {f.valor}
          </button>
        ) : (
          f.valor
        ),
    },
    { id: 'detalle', encabezado: t('columnas.detalle'), ocultarDebajo: 'md', celda: (f) => <span className="text-fg-secondary">{f.detalle}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AvisoTonal
        tono="informacion"
        titulo={t('aviso')}
        accion={ficha.permisos.registrar_cambio && v?.estado !== 'retirado' ? { etiqueta: t('registrarCambio'), onClick: () => registrarCambio() } : undefined}
      />
      <TablaSubseccion titulo={t('puesto')} columnas={columnasPuesto} filas={puesto} obtenerId={(f) => f.id} densidad="compacta" />
      <TablaSubseccion titulo={t('contrato')} columnas={columnasContrato} filas={contrato} obtenerId={(f) => f.id} densidad="compacta" />
    </div>
  );
}
