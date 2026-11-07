'use client';

/**
 * Nueva vigencia o corrección de una vigencia del perfil tributario (Figma
 * 2335:136222, «Nueva vigencia» y «⋮ › Editar»). La validación es la misma
 * función que usa el servidor (`validarSolicitudPerfil`); el servidor y la RPC
 * vuelven a validar y a exigir `finance.approve`.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { CampoFecha, Dialogo, FormField, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import {
  PERIODICIDADES_ICA,
  PERIODICIDADES_IVA,
  REGIMENES,
  RESPONSABILIDAD,
  validarSolicitudPerfil,
  type IcaMunicipio,
  type PeriodicidadIca,
  type PeriodicidadIva,
  type Regimen,
  type VigenciaPerfil,
} from '@/lib/finanzas/tributario/perfil';
import { tributarioCliente, type MunicipioOpcion } from '../tributarioCliente';
import { codigoDe } from '../piezas';

export interface VigenciaDialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null = nueva vigencia. */
  vigencia: VigenciaPerfil | null;
  /** Datos con los que arranca una vigencia nueva (la más reciente o lo del RUT). */
  base: Omit<VigenciaPerfil, 'id' | 'vigenteDesde' | 'vigenteHasta'>;
  inicioPropuesto: string;
  catalogo: { codigo: string; descripcion: string }[];
  hoy: string;
  onGuardado: () => void;
}

interface Estado {
  vigenteDesde: string;
  regimen: Regimen;
  responsabilidades: string[];
  agenteRetencion: boolean;
  responsableInc: boolean;
  periodicidadIva: PeriodicidadIva;
  notas: string;
  ica: IcaMunicipio[];
}

function estadoInicial(p: VigenciaDialogoProps): Estado {
  const fuente = p.vigencia ?? p.base;
  return {
    vigenteDesde: p.vigencia?.vigenteDesde ?? p.inicioPropuesto,
    regimen: fuente.regimen,
    responsabilidades: [...fuente.responsabilidades],
    agenteRetencion: fuente.agenteRetencion,
    responsableInc: fuente.responsableInc,
    periodicidadIva: fuente.periodicidadIva,
    notas: fuente.notas ?? '',
    ica: fuente.ica.map((i) => ({ ...i })),
  };
}

export function VigenciaDialogo(props: VigenciaDialogoProps) {
  const { abierto, onAbiertoChange, vigencia, catalogo, hoy, onGuardado } = props;
  const t = useTranslations('finanzasTributarioR4.perfil');
  const tc = useTranslations('finanzasTributarioR4.comun');
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(props));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setEstado(estadoInicial(props));
      setError(null);
    }
    // Solo al abrir: mientras está abierto, el formulario es de la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const cambiar = <K extends keyof Estado>(k: K, v: Estado[K]) => setEstado((e) => ({ ...e, [k]: v }));
  const alternarResp = (codigo: string, marcada: boolean) =>
    setEstado((e) => ({
      ...e,
      responsabilidades: marcada
        ? [...e.responsabilidades.filter((r) => !(codigo === RESPONSABILIDAD.responsableIva && r === RESPONSABILIDAD.noResponsableIva) && !(codigo === RESPONSABILIDAD.noResponsableIva && r === RESPONSABILIDAD.responsableIva)), codigo]
        : e.responsabilidades.filter((r) => r !== codigo),
    }));

  const guardar = async () => {
    const v = validarSolicitudPerfil({
      id: vigencia?.id ?? null,
      vigenteDesde: estado.vigenteDesde,
      regimen: estado.regimen,
      responsabilidades: estado.responsabilidades,
      agenteRetencion: estado.agenteRetencion,
      responsableInc: estado.responsableInc,
      periodicidadIva: estado.periodicidadIva,
      notas: estado.notas,
      ica: estado.ica.map((i) => ({ municipioId: i.municipioId, periodicidad: i.periodicidad, tarifaPorMil: i.tarifaPorMil, actividad: i.actividad })),
    });
    if (!v.ok) {
      setError(t(`errores.${v.error}`));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await tributarioCliente.guardarPerfil(v.datos);
      onGuardado();
      onAbiertoChange(false);
    } catch (err) {
      const codigo = codigoDe(err);
      setError(t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={vigencia ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}
      descripcion={vigencia ? t('dialogo.descripcionEditar') : t('dialogo.descripcionNueva')}
      ancho={672}
      primario={{ etiqueta: t('dialogo.guardar'), onClick: () => void guardar(), cargando: guardando }}
      textoCancelar={tc('cancelar')}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('campos.vigenteDesde')} obligatorio ayuda={vigencia ? t('campos.vigenteDesdeFija') : t('campos.vigenteDesdeAyuda')}>
            {(c) => (
              <CampoFecha id={c.id} valor={estado.vigenteDesde} onValorChange={(d) => cambiar('vigenteDesde', d)} hoy={hoy} disabled={!!vigencia} />
            )}
          </FormField>
          <FormField etiqueta={t('campos.regimen')} obligatorio>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={estado.regimen}
                onCambiar={(v) => cambiar('regimen', v as Regimen)}
                opciones={REGIMENES.map((r) => ({ valor: r, etiqueta: t(`regimen.${r}`) }))}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          <FormField etiqueta={t('campos.periodicidadIva')} obligatorio ayuda={t('campos.periodicidadIvaAyuda')}>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={estado.periodicidadIva}
                onCambiar={(v) => cambiar('periodicidadIva', v as PeriodicidadIva)}
                opciones={PERIODICIDADES_IVA.map((p) => ({ valor: p, etiqueta: t(`periodicidadIva.${p}`) }))}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-fg">{t('campos.responsabilidades')}</legend>
          <p className="text-xs text-fg-secondary">{t('campos.responsabilidadesAyuda')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalogo.map((r) => {
              const id = `resp-${r.codigo}`;
              return (
                <label key={r.codigo} htmlFor={id} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg">
                  <Checkbox
                    id={id}
                    checked={estado.responsabilidades.includes(r.codigo)}
                    onCheckedChange={(v) => alternarResp(r.codigo, v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{r.codigo}</span> · {r.descripcion}
                  </span>
                </label>
              );
            })}
          </div>
          <label htmlFor="agente-retencion" className="flex items-start gap-2 text-sm text-fg">
            <Checkbox id="agente-retencion" checked={estado.agenteRetencion} onCheckedChange={(v) => cambiar('agenteRetencion', v === true)} className="mt-0.5" />
            <span>
              {t('campos.agenteRetencion')}
              <span className="block text-xs text-fg-secondary">{t('campos.agenteRetencionAyuda')}</span>
            </span>
          </label>
          <label htmlFor="responsable-inc" className="flex items-start gap-2 text-sm text-fg">
            <Checkbox id="responsable-inc" checked={estado.responsableInc} onCheckedChange={(v) => cambiar('responsableInc', v === true)} className="mt-0.5" />
            <span>{t('campos.responsableInc')}</span>
          </label>
        </fieldset>

        <EditorIca ica={estado.ica} onCambiar={(ica) => cambiar('ica', ica)} />

        <FormField etiqueta={t('campos.notas')}>
          {(c) => <Textarea id={c.id} value={estado.notas} onChange={(e) => cambiar('notas', e.target.value)} rows={2} maxLength={1000} />}
        </FormField>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

function EditorIca({ ica, onCambiar }: { ica: IcaMunicipio[]; onCambiar: (ica: IcaMunicipio[]) => void }) {
  const t = useTranslations('finanzasTributarioR4.perfil');
  const [q, setQ] = useState('');
  const [opciones, setOpciones] = useState<MunicipioOpcion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const control = useRef<AbortController | null>(null);

  useEffect(() => {
    control.current?.abort();
    if (q.trim().length < 2) {
      setOpciones([]);
      return;
    }
    const c = new AbortController();
    control.current = c;
    setBuscando(true);
    const temporizador = setTimeout(() => {
      tributarioCliente
        .municipios(q, c.signal)
        .then((r) => setOpciones(r.municipios))
        .catch(() => {
          if (!c.signal.aborted) setOpciones([]);
        })
        .finally(() => {
          if (!c.signal.aborted) setBuscando(false);
        });
    }, 250);
    return () => {
      clearTimeout(temporizador);
      c.abort();
    };
  }, [q]);

  const agregar = (m: MunicipioOpcion) => {
    if (ica.some((i) => i.municipioId === m.id)) return;
    onCambiar([...ica, { municipioId: m.id, municipio: m.nombre, departamento: m.departamento, periodicidad: 'bimestral', tarifaPorMil: null, actividad: null }]);
    setQ('');
    setOpciones([]);
  };
  const cambiarFila = (i: number, cambio: Partial<IcaMunicipio>) => onCambiar(ica.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-fg">{t('campos.ica')}</legend>
      <p className="text-xs text-fg-secondary">{t('campos.icaAyuda')}</p>
      {ica.length > 0 && (
        <ul className="space-y-2">
          {ica.map((f, i) => (
            <li key={f.municipioId} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
              <div className="text-sm text-fg">
                <span className="font-medium">{f.municipio ?? f.municipioId}</span>
                {f.departamento && <span className="block text-xs text-fg-secondary">{f.departamento}</span>}
              </div>
              <FormField etiqueta={t('campos.icaPeriodicidad')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={f.periodicidad}
                    onCambiar={(v) => cambiarFila(i, { periodicidad: v as PeriodicidadIca })}
                    opciones={PERIODICIDADES_ICA.map((p) => ({ valor: p, etiqueta: t(`periodicidadIca.${p}`) }))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('campos.icaTarifa')}>
                {(c) => (
                  <Input
                    id={c.id}
                    inputMode="decimal"
                    value={f.tarifaPorMil ?? ''}
                    onChange={(e) => {
                      const texto = e.target.value.replace(',', '.');
                      const n = texto.trim() === '' ? null : Number(texto);
                      cambiarFila(i, { tarifaPorMil: n === null || Number.isFinite(n) ? n : f.tarifaPorMil });
                    }}
                  />
                )}
              </FormField>
              <button
                type="button"
                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                onClick={() => onCambiar(ica.filter((_, j) => j !== i))}
                aria-label={t('campos.icaQuitar', { municipio: f.municipio ?? '' })}
              >
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormField etiqueta={t('campos.icaAgregar')} ayuda={buscando ? t('campos.icaBuscando') : undefined}>
        {(c) => <Input id={c.id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('campos.icaBuscar')} autoComplete="off" />}
      </FormField>
      {opciones.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-line" aria-label={t('campos.icaResultados')}>
          {opciones.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-subtle disabled:opacity-60"
                onClick={() => agregar(m)}
                disabled={ica.some((i) => i.municipioId === m.id)}
              >
                <Plus aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                <span>
                  {m.nombre}
                  {m.departamento && <span className="text-fg-secondary"> · {m.departamento}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
