'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  EditorGrupoModificadores,
  NuevoGrupoModificadores,
  mover,
  type CambioGrupo,
  type CambioOpcion,
  type ModoSeleccion,
} from '../../detalle/variantes/EditorGrupoModificadores';
import { mismoTexto } from '../../detalle/variantes/catalogoAtributos';
import { nuevaClave, type GrupoModificadorForm } from '../../logica/formularioProducto';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Sección «Modificadores» del formulario único: el mismo editor del detalle
 * (`EditorGrupoModificadores`) sobre el estado local. No escribe en la base:
 * la lista completa viaja en `fn_producto_guardar` al pulsar Guardar.
 */
export function SeccionModificadores({ estado, cambiar, errores, modo, catalogos, moneda }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.modificadores');
  const te = useTranslations('productoForm.errores');
  const grupos = estado.modificadores;
  const [aQuitar, setAQuitar] = useState<GrupoModificadorForm | null>(null);

  const fijar = (lista: GrupoModificadorForm[]) => cambiar('modificadores', lista);
  const actualizarGrupo = (clave: string, fn: (g: GrupoModificadorForm) => GrupoModificadorForm) =>
    fijar(grupos.map((g) => (g.clave === clave ? fn(g) : g)));

  // Valores de variantes (catálogo + los de este formulario) para reutilizar como opción.
  const sugerencias = useMemo(() => {
    const out: string[] = [];
    const agregar = (v: string) => {
      const limpio = v.trim();
      if (limpio && !out.some((x) => mismoTexto(x, limpio))) out.push(limpio);
    };
    for (const tp of catalogos.tiposVariante) for (const v of tp.valores) agregar(v.value);
    for (const v of estado.variantes) for (const val of Object.values(v.attributes)) agregar(val);
    return out.sort((a, b) => a.localeCompare(b));
  }, [catalogos.tiposVariante, estado.variantes]);

  const existentes = catalogos.gruposModificador.filter((n) => !grupos.some((g) => mismoTexto(g.name, n)));

  const crearGrupo = (nombre: string, modoSel: ModoSeleccion): boolean => {
    fijar([
      ...grupos,
      {
        clave: nuevaClave('g'),
        name: nombre,
        selection_mode: modoSel,
        min_selections: 0,
        max_selections: modoSel === 'single' ? 1 : null,
        required: false,
        opciones: [],
      },
    ]);
    return true;
  };

  const quitarGrupo = (g: GrupoModificadorForm) => fijar(grupos.filter((x) => x.clave !== g.clave));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">{t('ayuda')}</p>

      {errores.modificadores && (
        <p role="alert" className="rounded-lg border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {te(errores.modificadores, { detalle: '' })}
        </p>
      )}

      {grupos.length === 0 && <p className="text-sm text-fg-muted">{t('vacio')}</p>}

      {grupos.map((g, i) => (
        <EditorGrupoModificadores
          key={g.clave}
          grupo={g}
          indice={i}
          total={grupos.length}
          moneda={moneda}
          sugerencias={sugerencias}
          onCambiarGrupo={(cambio: CambioGrupo) => actualizarGrupo(g.clave, (x) => ({ ...x, ...cambio }))}
          onMoverGrupo={(dir) => {
            const nuevo = mover(grupos, i, dir);
            if (nuevo) fijar(nuevo);
          }}
          onEliminarGrupo={() => (modo === 'editar' && g.id ? setAQuitar(g) : quitarGrupo(g))}
          onAgregarOpcion={(nombre, precio) => {
            actualizarGrupo(g.clave, (x) => ({
              ...x,
              opciones: [...x.opciones, { clave: nuevaClave('o'), name: nombre, extra_price: precio, is_active: true }],
            }));
            return true;
          }}
          onCambiarOpcion={(clave, cambio: CambioOpcion) =>
            actualizarGrupo(g.clave, (x) => ({ ...x, opciones: x.opciones.map((o) => (o.clave === clave ? { ...o, ...cambio } : o)) }))
          }
          onMoverOpcion={(clave, dir) =>
            actualizarGrupo(g.clave, (x) => ({ ...x, opciones: mover(x.opciones, x.opciones.findIndex((o) => o.clave === clave), dir) ?? x.opciones }))
          }
          onEliminarOpcion={(clave) => actualizarGrupo(g.clave, (x) => ({ ...x, opciones: x.opciones.filter((o) => o.clave !== clave) }))}
        />
      ))}

      <NuevoGrupoModificadores existentes={existentes} onCrear={crearGrupo} />

      <ConfirmDialog
        open={aQuitar !== null}
        onOpenChange={(abierto) => !abierto && setAQuitar(null)}
        title={t('quitarTitulo', { nombre: aQuitar?.name ?? '' })}
        description={t('quitarDescripcion')}
        confirmLabel={t('quitar')}
        cancelLabel={t('cancelar')}
        variant="destructive"
        onConfirm={() => {
          if (aQuitar) quitarGrupo(aQuitar);
        }}
      />
    </div>
  );
}
