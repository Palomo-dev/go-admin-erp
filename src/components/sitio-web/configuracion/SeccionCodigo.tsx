'use client';

/**
 * Configuración › «Código y píxeles» (Figma B/12-01, nota 3 de B/12-05): SOLO
 * código a medida, con interruptor, autor y alcance, y el aviso de peligro. Los
 * píxeles comunes (Meta, GA4/GTM, Google Ads) se configuran con campos tipados
 * en Analítica. Lo que se añade o cambia queda en el estado sucio de la página
 * y se guarda con la barra única.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { AvisoTonal, ConfirmDialog, Dialogo, FormField, FormSection, RowActionsMenu, SegmentedControl, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import type { CodigoMedida, PosicionCodigo } from '@/lib/website/configuracionSitio';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { enlacesConfiguracion } from './enlaces';
import { ICONOS_SECCION_CONFIGURACION } from './iconosSecciones';
import type { TraductorConfiguracion } from './textos';

export interface SeccionCodigoProps {
  t: TraductorConfiguracion;
  codigo: CodigoMedida[];
  onCambiar: (codigo: CodigoMedida[]) => void;
  /** Sin la migración: la lista es de solo lectura. */
  pendiente: boolean;
  deshabilitado?: boolean;
}

interface Borrador {
  indice: number | null;
  nombre: string;
  alcance: 'todas' | 'ruta';
  ruta: string;
  posicion: PosicionCodigo;
  codigo: string;
}

const VACIO: Borrador = { indice: null, nombre: '', alcance: 'todas', ruta: '', posicion: 'body', codigo: '' };

/** Errores del diálogo (las mismas reglas que valida el servidor). */
export function erroresCodigo(b: Borrador): { nombre?: true; ruta?: true; codigo?: true } {
  const e: { nombre?: true; ruta?: true; codigo?: true } = {};
  if (!b.nombre.trim()) e.nombre = true;
  if (b.alcance === 'ruta' && !/^\/[\w\-/]*$/.test(b.ruta.trim())) e.ruta = true;
  if (!b.codigo.trim()) e.codigo = true;
  return e;
}

export function SeccionCodigo({ t, codigo, onCambiar, pendiente, deshabilitado }: SeccionCodigoProps) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [quitar, setQuitar] = useState<number | null>(null);
  const bloqueado = deshabilitado || pendiente;
  const analitica = enlacesConfiguracion.analitica();

  const detalle = (c: CodigoMedida) => {
    const posicion = c.posicion === 'head' ? t('codigo.head') : t('codigo.body');
    const alcance = c.alcance === 'todas' ? t('codigo.detalleTodas') : c.alcance;
    return c.autor ? t('codigo.detalleAutor', { posicion, alcance, autor: c.autor }) : t('codigo.detalle', { posicion, alcance });
  };

  const abrir = (indice: number | null) => {
    setIntentado(false);
    if (indice === null) return setBorrador({ ...VACIO });
    const c = codigo[indice];
    setBorrador({
      indice,
      nombre: c.nombre,
      alcance: c.alcance === 'todas' ? 'todas' : 'ruta',
      ruta: c.alcance === 'todas' ? '' : c.alcance,
      posicion: c.posicion,
      codigo: c.codigo,
    });
  };

  const confirmar = () => {
    if (!borrador) return;
    setIntentado(true);
    if (Object.keys(erroresCodigo(borrador)).length > 0) return;
    const item = {
      nombre: borrador.nombre.trim(),
      alcance: borrador.alcance === 'todas' ? 'todas' : borrador.ruta.trim(),
      posicion: borrador.posicion,
      codigo: borrador.codigo,
    };
    if (borrador.indice === null) {
      onCambiar([...codigo, { id: null, activo: true, autor: null, creadoEn: null, ...item }]);
    } else {
      onCambiar(codigo.map((c, i) => (i === borrador.indice ? { ...c, ...item } : c)));
    }
    setBorrador(null);
  };

  const errores = borrador && intentado ? erroresCodigo(borrador) : {};

  return (
    <FormSection
      id="codigo"
      icono={ICONOS_SECCION_CONFIGURACION.codigo}
      titulo={t('secciones.codigo')}
      descripcion={
        <>
          {t('codigo.descripcion')}{' '}
          {analitica && (
            <Link href={analitica} className="font-medium text-link underline-offset-2 hover:underline">
              {t('codigo.irPixeles')}
            </Link>
          )}
        </>
      }
    >
      <AvisoTonal tono="peligro" icono={ShieldAlert} titulo={t('codigo.avisoTitulo')} descripcion={t('codigo.avisoDescripcion')} />
      {codigo.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('codigo.vacio')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {codigo.map((c, i) => (
            <li key={c.id ?? `nuevo-${i}`} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{c.nombre}</p>
                <p className={cn('text-xs leading-4', c.legado ? 'text-warning-text' : 'text-fg-secondary')}>
                  {c.legado ? t('codigo.legado') : detalle(c)}
                </p>
              </div>
              {!c.legado && (
                <>
                  <Switch
                    checked={c.activo}
                    disabled={bloqueado}
                    aria-label={t('codigo.activar', { nombre: c.nombre })}
                    onCheckedChange={(v) => onCambiar(codigo.map((x, j) => (j === i ? { ...x, activo: v } : x)))}
                  />
                  <RowActionsMenu
                    titulo={c.nombre}
                    acciones={[
                      { id: 'editar', etiqueta: t('codigo.editar'), icono: Pencil, onSelect: () => abrir(i), deshabilitada: bloqueado },
                      { id: 'quitar', etiqueta: t('codigo.quitar'), icono: Trash2, onSelect: () => setQuitar(i), destructiva: true, deshabilitada: bloqueado },
                    ]}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={bloqueado} onClick={() => abrir(null)}>
          <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('codigo.anadir')}
        </button>
      </div>

      <Dialogo
        abierto={borrador !== null}
        onAbiertoChange={(v) => !v && setBorrador(null)}
        titulo={borrador?.indice === null ? t('codigo.dialogoNuevo') : t('codigo.dialogoEditar')}
        descripcion={t('codigo.dialogoDescripcion')}
        icono={ICONOS_SECCION_CONFIGURACION.codigo}
        ancho={560}
        primario={{ etiqueta: t('codigo.guardarDialogo'), onClick: confirmar }}
      >
        {borrador && (
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('codigo.nombre')} obligatorio error={errores.nombre ? t('codigo.errores.nombre') : null}>
              <Input value={borrador.nombre} maxLength={80} placeholder={t('codigo.nombrePlaceholder')} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} />
            </FormField>
            <FormField etiqueta={t('codigo.alcance')}>
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  opciones={[
                    { valor: 'todas', etiqueta: t('codigo.alcanceTodas') },
                    { valor: 'ruta', etiqueta: t('codigo.alcanceRuta') },
                  ]}
                  valor={borrador.alcance}
                  onValorChange={(v) => setBorrador({ ...borrador, alcance: v })}
                />
              )}
            </FormField>
            {borrador.alcance === 'ruta' && (
              <FormField etiqueta={t('codigo.ruta')} obligatorio error={errores.ruta ? t('codigo.errores.ruta') : null}>
                <Input value={borrador.ruta} placeholder={t('codigo.rutaPlaceholder')} onChange={(e) => setBorrador({ ...borrador, ruta: e.target.value })} />
              </FormField>
            )}
            <FormField etiqueta={t('codigo.posicion')}>
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  opciones={[
                    { valor: 'head', etiqueta: t('codigo.head') },
                    { valor: 'body', etiqueta: t('codigo.body') },
                  ]}
                  valor={borrador.posicion}
                  onValorChange={(v) => setBorrador({ ...borrador, posicion: v })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('codigo.contenido')} obligatorio error={errores.codigo ? t('codigo.errores.codigo') : null}>
              <Textarea
                value={borrador.codigo}
                rows={8}
                spellCheck={false}
                className="font-mono text-xs"
                onChange={(e) => setBorrador({ ...borrador, codigo: e.target.value })}
              />
            </FormField>
          </div>
        )}
      </Dialogo>

      <ConfirmDialog
        abierto={quitar !== null}
        onAbiertoChange={(v) => !v && setQuitar(null)}
        titulo={quitar !== null ? t('codigo.quitarTitulo', { nombre: codigo[quitar]?.nombre ?? '' }) : ''}
        descripcion={t('codigo.quitarDescripcion')}
        textoConfirmar={t('codigo.quitar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={() => {
          if (quitar !== null) onCambiar(codigo.filter((_, i) => i !== quitar));
          setQuitar(null);
        }}
      />
    </FormSection>
  );
}
