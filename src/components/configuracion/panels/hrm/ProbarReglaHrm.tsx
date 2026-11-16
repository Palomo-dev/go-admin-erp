'use client';

/**
 * «Probar una regla» (diseño 10.RH.2, pantallazos 95-hrm-config-19 y 21):
 * describe una solicitud de ejemplo y muestra qué regla se aplica y a quién le
 * llegaría, con reemplazos y respaldo a RR. HH. No crea nada ni avisa a nadie
 * (`fn_hr_aprobacion_probar` usa el mismo plan que una solicitud real).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, CircleCheck, CircleAlert } from 'lucide-react';
import { CampoFecha, CampoNumero, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useToast } from '@/components/ui/use-toast';
import type { DatosAprobaciones, ResultadoPrueba } from '@/lib/hrm/configuracion/tipos';
import { PieHrm, SelectorHrm, pedirHrm, useFormatoHrm } from './comun';
import { TIPOS_SOLICITUD_UI, URL_APROBACIONES } from './AprobacionesPanel';

/** Qué dato pide cada tipo para evaluar las condiciones. */
const DATO_DEL_TIPO: Partial<Record<string, 'dias' | 'horas' | 'monto' | 'aumentoPct'>> = {
  ausencia: 'dias',
  horas_extra: 'horas',
  prestamo: 'monto',
  cambio_salario: 'aumentoPct',
};

export function ProbarReglaHrm({ datos, onVerRegla }: { datos: DatosAprobaciones; onVerRegla: (id: string) => void }) {
  const t = useTranslations('hrmConfig.aprobaciones.probar');
  const ta = useTranslations('hrmConfig.aprobaciones');
  const f = useFormatoHrm();
  const locale = useLocaleIntl();
  const { toast } = useToast();
  const [tipo, setTipo] = useState('ausencia');
  const [vinculo, setVinculo] = useState<string | null>(null);
  const [fecha, setFecha] = useState(datos.hoy);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dato = DATO_DEL_TIPO[tipo];

  const probar = async () => {
    if (!vinculo) {
      setError(t('errores.empleado'));
      return;
    }
    setProbando(true);
    setError(null);
    try {
      const r = await pedirHrm<ResultadoPrueba>(URL_APROBACIONES, {
        metodo: 'POST',
        cuerpo: { accion: 'probar', tipo, vinculoId: vinculo, fecha, ...(dato ? { [dato]: cantidad } : {}) },
      });
      setResultado(r);
    } catch {
      toast({ title: t('errores.probar'), variant: 'destructive' });
    } finally {
      setProbando(false);
    }
  };

  const nombrePaso = (p: ResultadoPrueba['pasos'][number]) => {
    const quien = p.personas.map((x) => x.reemplazo?.nombre ?? x.nombre);
    const lista = quien.length === 0 ? t('nadie') : new Intl.ListFormat(locale, { type: 'disjunction' }).format(quien);
    return `${p.tipo === 'cargo' && p.cargo_nombre ? p.cargo_nombre : ta(`aprobador.${p.tipo}`)}: ${lista}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t('ayuda')}</p>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t('tipo')}
            <SelectorHrm
              valor={tipo}
              onValor={(v) => {
                setTipo(v);
                setCantidad(null);
                setResultado(null);
              }}
              etiqueta={t('tipo')}
              opciones={TIPOS_SOLICITUD_UI.map((x) => ({ valor: x, etiqueta: ta(`tipo.${x}`) }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t('empleado')}
            <SelectorHrm
              valor={vinculo}
              onValor={(v) => {
                setVinculo(v);
                setResultado(null);
              }}
              etiqueta={t('empleado')}
              marcador={datos.empleados.length === 0 ? t('sinEmpleados') : t('elegirEmpleado')}
              opciones={datos.empleados.map((e) => ({ valor: e.id, etiqueta: [e.nombre, e.cargo, e.sede].filter(Boolean).join(' · ') }))}
              deshabilitado={datos.empleados.length === 0}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {dato && (
            <label className="flex w-40 flex-col gap-1.5 text-sm font-medium text-fg">
              {t(`dato.${dato}`)}
              <CampoNumero valor={cantidad} onValorChange={setCantidad} minimo={0} sufijo={dato === 'aumentoPct' ? '%' : undefined} tamano="sm" />
            </label>
          )}
          <div className="flex flex-col gap-1.5">
            <span id="hrm-probar-desde" className="text-sm font-medium text-fg">
              {t('desde')}
            </span>
            <CampoFecha valor={fecha} onValorChange={(d) => setFecha(d || datos.hoy)} hoy={datos.hoy} limpiable={false} aria-labelledby="hrm-probar-desde" tamano="sm" />
          </div>
          <button type="button" className={`${clasesBoton({ variante: 'primario', tamano: 'sm' })} ml-auto`} disabled={probando} onClick={() => void probar()}>
            {t('probar')}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>

      {resultado && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-line-brand bg-brand-tint p-4">
          <p className="flex items-start gap-2 text-base font-medium text-fg">
            {resultado.pasos.length > 0 ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />}
            {resultado.regla
              ? t('seAplica', { orden: resultado.regla.orden, tipo: ta(`tipo.${tipo}`), nombre: resultado.regla.nombre })
              : resultado.pasos.length > 0
                ? t('porDefecto')
                : t('autoaprobada')}
          </p>
          {resultado.otras.length > 0 && (
            <p className="text-sm text-fg-secondary">
              {t('tambienCumple', { reglas: resultado.otras.map((o) => t('reglaN', { orden: o.orden, nombre: o.nombre })).join(', ') })}
            </p>
          )}
          {resultado.pasos.map((p) => (
            <div key={p.orden} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-medium text-brand-deep">{p.orden}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{nombrePaso(p)}</p>
                <p className="text-[13px] text-fg-muted">
                  {p.personas.find((x) => x.reemplazo)
                    ? (() => {
                        const x = p.personas.find((y) => y.reemplazo)!;
                        return t('reemplaza', { nombre: x.nombre, desde: f.diaCorto(x.reemplazo!.desde), hasta: f.diaCorto(x.reemplazo!.hasta), motivo: x.reemplazo!.motivo });
                      })()
                    : p.respaldo
                      ? t('respaldo')
                      : p.personas.length > 1
                        ? t('bastaUno', { n: p.personas.length })
                        : null}
                </p>
              </div>
            </div>
          ))}
          {resultado.regla && (
            <button type="button" onClick={() => onVerRegla(resultado.regla!.id)} className="inline-flex items-center gap-1 self-start text-sm font-medium text-brand hover:underline">
              {t('verRegla')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          )}
        </section>
      )}
      <PieHrm etiqueta={t('soloPrueba')} />
    </div>
  );
}
