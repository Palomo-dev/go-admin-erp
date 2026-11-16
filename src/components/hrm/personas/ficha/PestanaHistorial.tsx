'use client';

/**
 * Historial (Figma 95-hrm-03-10 y 04-06): cada cambio con fecha de efecto,
 * antes y ahora, motivo y quién lo aprobó. Sin permiso de salario, el evento
 * se ve y el valor no. Con permiso, los montos se piden por su ruta (queda
 * registrado) y se ve «Así lo lee la nómina».
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Check, Download } from 'lucide-react';
import { ChipsOpcion, Tarjeta, clasesBoton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { useCarga, type EventoFicha } from '../apiPersonas';
import { fechaCorta, useValorCampo } from '../textosPersonas';
import { EventoHistorial, type EstadoEvento } from '../piezas/EventoHistorial';
import type { ContextoFicha } from './FichaEmpleado';

type Filtro = 'todos' | 'salario' | 'cargo' | 'sede' | 'jornada' | 'seguridad';
const CAMPOS_FILTRO: Record<Exclude<Filtro, 'todos'>, string[]> = {
  salario: ['salario', 'periodo_salario'],
  cargo: ['cargo', 'area', 'jefe'],
  sede: ['sede', 'centro_costo'],
  jornada: ['jornada_horas_semana', 'tipo_contrato', 'fin_contrato'],
  seguridad: ['eps', 'afp', 'arl', 'ccf', 'cesantias'],
};

export function PestanaHistorial({ ficha }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.historial');
  const tc = useTranslations('hrmPersonas.comun');
  const valorCampo = useValorCampo();
  const { formatDate } = useFormatDate();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const verSalario = ficha.permisos.grupos.salario_pago.ver;
  const salario = useCarga<{ historial: { id: string; anterior: unknown; nuevo: unknown }[] }>(
    verSalario ? `/api/hrm/personas/${ficha.persona.id}/datos/salario_pago` : null
  );
  const montos = useMemo(
    () => new Map(salario.carga.estado === 'listo' ? salario.carga.datos.historial.map((h) => [h.id, h]) : []),
    [salario.carga]
  );

  const estado = (e: EventoFicha): EstadoEvento => {
    if (e.estado === 'pendiente') return 'pendiente';
    if (e.estado === 'rechazado') return 'rechazado';
    if (e.estado === 'anulado') return 'anulado';
    if (e.programado) return 'programado';
    const vigente = ficha.historial
      .filter((x) => x.campo === e.campo && x.estado === 'aprobado' && x.desde <= ficha.hoy)
      .sort((a, b) => b.desde.localeCompare(a.desde) || b.creado.localeCompare(a.creado))[0];
    return vigente?.id === e.id ? 'vigente' : 'reemplazado';
  };
  const esSalario = (e: EventoFicha) => e.campo === 'salario' || e.campo === 'periodo_salario';
  const antesAhora = (e: EventoFicha) => {
    if (esSalario(e)) {
      const m = montos.get(e.id);
      return m ? { antes: valorCampo(e.campo, m.anterior, null), ahora: valorCampo(e.campo, m.nuevo, null), oculto: false } : { oculto: true };
    }
    return { antes: valorCampo(e.campo, e.anterior, e.anterior_nombre), ahora: valorCampo(e.campo, e.nuevo, e.nuevo_nombre), oculto: false };
  };
  const pie = (e: EventoFicha) =>
    [
      e.estado === 'rechazado' && e.rechazo
        ? t('rechazo', { nombre: e.rechazo.por ?? '—', fecha: formatDate(e.rechazo.en), comentario: e.rechazo.comentario ?? '' })
        : e.estado === 'pendiente'
          ? t('espera', { nombres: (e.espera ?? []).join(', ') || '—' })
          : e.aprobo && e.aprobado_en
            ? t('aproboEl', { nombre: e.aprobo, fecha: formatDate(e.aprobado_en) })
            : null,
      e.source === 'cambio_directo' ? t('cambioDirecto') : e.registro ? t('registro', { nombre: e.registro }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const eventos = ficha.historial.filter((e) => filtro === 'todos' || CAMPOS_FILTRO[filtro].includes(e.campo));
  const programadoSalario = ficha.historial.find((e) => e.campo === 'salario' && e.programado);
  const mProgramado = programadoSalario ? montos.get(programadoSalario.id) : undefined;

  const exportar = () => {
    const csv = aCsv([
      [t('csv.cambio'), t('csv.efecto'), t('csv.antes'), t('csv.ahora'), t('csv.motivo'), t('csv.estado')],
      ...eventos.map((e) => {
        const v = antesAhora(e);
        return [t(`titulos.${e.campo}`), e.desde, v.oculto ? t('oculto') : v.antes ?? '', v.oculto ? t('oculto') : v.ahora ?? '', e.motivo, t(`estados.${estado(e)}`)];
      }),
    ]);
    descargarCsv(t('archivo', { nombre: ficha.persona.nombre }), csv);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChipsOpcion<Filtro>
            etiqueta={t('filtrar')}
            valor={filtro}
            onValorChange={setFiltro}
            opciones={(['todos', 'salario', 'cargo', 'sede', 'jornada', 'seguridad'] as const).map((f) => ({ valor: f, etiqueta: t(`filtros.${f}`) }))}
          />
          <button type="button" onClick={exportar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Download aria-hidden className="size-4" strokeWidth={1.5} />
            {t('exportar')}
          </button>
        </div>
        <ol>
          {eventos.map((e, i) => {
            const v = antesAhora(e);
            return (
              <EventoHistorial
                key={e.id}
                campo={e.campo}
                titulo={t(`titulos.${e.campo}`)}
                estado={estado(e)}
                efecto={e.desde}
                antes={v.oculto ? undefined : v.antes}
                ahora={v.oculto ? undefined : v.ahora}
                oculto={v.oculto}
                motivo={e.motivo}
                pie={pie(e)}
                destacado={i === 0 && e.programado}
                ultimo={false}
              />
            );
          })}
          {ficha.vinculo && (filtro === 'todos' || filtro === 'cargo') ? (
            <EventoHistorial
              campo="ingreso"
              titulo={t('ingreso')}
              estado="vigente"
              efecto={ficha.vinculo.ingreso}
              resumen={[ficha.vinculo.cargo, ficha.vinculo.sede, ficha.vinculo.tipo_contrato ? tc(`contratos.${ficha.vinculo.tipo_contrato}`) : null]
                .filter(Boolean)
                .join(' · ')}
              ultimo
            />
          ) : null}
        </ol>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {programadoSalario && mProgramado ? (
          <Tarjeta titulo={t('nomina')} icono={Calendar}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-subtle px-3 py-2">
                <p className="text-xs text-fg-secondary">{t('hasta', { fecha: fechaCorta(diaAnterior(programadoSalario.desde)) })}</p>
                <p className="text-sm font-medium tabular-nums text-fg">{valorCampo('salario', mProgramado.anterior, null)}</p>
              </div>
              <div className="rounded-lg bg-brand-tint px-3 py-2">
                <p className="text-xs text-brand-deep">{t('desde', { fecha: fechaCorta(programadoSalario.desde) })}</p>
                <p className="text-sm font-medium tabular-nums text-fg">{valorCampo('salario', mProgramado.nuevo, null)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-fg-secondary">{t('nominaNota')}</p>
          </Tarjeta>
        ) : null}
        <Tarjeta titulo={t('comoFunciona')}>
          <ul className="flex flex-col gap-2">
            {(['uno', 'dos', 'tres', 'cuatro', 'cinco'] as const).map((k) => (
              <li key={k} className="flex gap-2 text-sm text-fg-secondary">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} />
                {t(`como.${k}`)}
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}

function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d - 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}
