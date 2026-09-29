'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPOS_UNIDAD, type TipoUnidad, type Unidad, type UnidadDian } from './tipos';
import { CODIGO_UNIDAD, codigoSugerido } from './logicaUnidades';
import { ErrorUnidades, unidadesService } from './servicioUnidades';

const SIN_DIAN = 'ninguna';

export interface DialogoUnidadProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  /** null: unidad nueva. Solo se editan las propias. */
  unidad: Unidad | null;
  unidades: readonly Unidad[];
  dian: readonly UnidadDian[];
  onGuardada: (mensaje: string) => void;
}

/**
 * «Nueva unidad» / «Editar unidad» (Figma `595:345266`): código (hasta 3
 * letras: así cabe en las conversiones), nombre, tipo y la unidad DIAN con la
 * que se factura (factura electrónica: `units.dian_unit_measure_id`, la lee el
 * disparador de `invoice_items`). Solo unidades propias: las del sistema son
 * de solo lectura.
 */
export function DialogoUnidad({ abierto, onAbiertoChange, organizacionId, unidad, unidades, dian, onGuardada }: DialogoUnidadProps) {
  const t = useTranslations('inventarioUnidades');
  const [codigo, setCodigo] = useState('');
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoUnidad>('count');
  const [dianId, setDianId] = useState<number | null>(null);
  const [activo, setActivo] = useState(true);
  const [errores, setErrores] = useState<{ codigo?: string; nombre?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const tomados = useMemo(() => new Set(unidades.map((u) => u.codigo)), [unidades]);

  useEffect(() => {
    if (!abierto) return;
    setCodigo(unidad?.codigo ?? '');
    setCodigoTocado(!!unidad);
    setNombre(unidad?.nombre ?? '');
    setTipo(unidad?.tipo ?? 'count');
    setDianId(unidad?.dian_id ?? null);
    setActivo(unidad?.activo ?? true);
    setErrores({});
  }, [abierto, unidad]);

  const cambiarNombre = (v: string) => {
    setNombre(v);
    setErrores((e) => ({ ...e, nombre: undefined }));
    if (!unidad && !codigoTocado) setCodigo(codigoSugerido(v, tomados));
  };

  const guardar = async () => {
    const e: typeof errores = {};
    const c = codigo.trim().toUpperCase();
    if (!unidad) {
      if (!CODIGO_UNIDAD.test(c)) e.codigo = t('unidad.errorCodigo');
      else if (tomados.has(c)) e.codigo = t('unidad.errorCodigoEnUso', { codigo: c });
    }
    if (!nombre.trim()) e.nombre = t('unidad.errorNombre');
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      await unidadesService.guardar(organizacionId, unidad?.codigo ?? null, { codigo: c, nombre: nombre.trim(), tipo, dian_id: dianId, activo });
      onGuardada(unidad ? t('toast.unidadActualizada', { codigo: c }) : t('toast.unidadCreada', { codigo: c }));
      onAbiertoChange(false);
    } catch (err) {
      const codigoError = err instanceof ErrorUnidades ? err.codigo : '';
      if (codigoError === 'codigo_en_uso') setErrores({ codigo: t('unidad.errorCodigoEnUso', { codigo: c }) });
      else if (codigoError === 'codigo_invalido') setErrores({ codigo: t('unidad.errorCodigo') });
      else if (codigoError === 'tipo_con_conversiones') setErrores({ general: t('unidad.errorTipoConConversiones') });
      else if (err instanceof ErrorUnidades && err.sqlstate === '42501') setErrores({ general: t('errores.sinPermiso') });
      else setErrores({ general: t('errores.desconocido') });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={unidad ? t('unidad.tituloEditar', { codigo: unidad.codigo }) : t('unidad.tituloNueva')}
      icono={Ruler}
      ancho={440}
      primario={{ etiqueta: unidad ? t('unidad.guardar') : t('unidad.crear'), onClick: () => void guardar(), cargando: guardando }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void guardar();
        }}
      >
        <FormField etiqueta={t('unidad.codigo')} obligatorio error={errores.codigo} ayuda={unidad ? t('unidad.ayudaCodigoFijo') : t('unidad.ayudaCodigo')}>
          <Input
            value={codigo}
            onChange={(ev) => {
              setCodigo(ev.target.value.toUpperCase());
              setCodigoTocado(true);
              setErrores((x) => ({ ...x, codigo: undefined }));
            }}
            maxLength={3}
            disabled={!!unidad}
            className="h-10 font-mono uppercase"
            autoFocus={!unidad}
          />
        </FormField>
        <FormField etiqueta={t('unidad.nombre')} obligatorio error={errores.nombre}>
          <Input value={nombre} onChange={(ev) => cambiarNombre(ev.target.value)} maxLength={40} className="h-10" autoFocus={!!unidad} />
        </FormField>
        <FormField etiqueta={t('unidad.tipo')}>
          {(c) => (
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoUnidad)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_UNIDAD.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`tipos.${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('unidad.dian')} ayuda={t('unidad.ayudaDian')}>
          {(c) => (
            <Select value={dianId ? String(dianId) : SIN_DIAN} onValueChange={(v) => setDianId(v === SIN_DIAN ? null : Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_DIAN}>{t('unidad.dianNinguna')}</SelectItem>
                {dian.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.codigo} · {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {unidad && (
          <label className="flex cursor-pointer items-center gap-3 text-sm text-fg">
            <Switch checked={activo} onCheckedChange={setActivo} />
            {t('unidad.activa')}
          </label>
        )}
        {errores.general && (
          <p role="alert" className="text-sm text-danger-text">
            {errores.general}
          </p>
        )}
      </form>
    </Dialogo>
  );
}
