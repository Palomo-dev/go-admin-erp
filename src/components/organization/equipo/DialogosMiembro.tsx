'use client';

/**
 * Diálogos de una fila de Miembros (Figma 08, sección 10): cambiar rol, editar
 * cargo y quitar de una sede. Rol y cargo dejaron de ser un `<select>` en la
 * fila que aplicaba el cambio al instante (P1-6): se eligen aquí y la frase de
 * confirmación dice qué va a pasar antes de aplicarlo.
 */
import { useEffect, useState } from 'react';
import { MapPinOff, Briefcase, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Miembro } from '@/lib/organizacion/miembros';

export interface OpcionSimple {
  id: string;
  nombre: string;
}

function Selector({ etiqueta, valor, onValor, opciones, placeholder }: { etiqueta: string; valor: string; onValor: (v: string) => void; opciones: readonly OpcionSimple[]; placeholder: string }) {
  return (
    <FormField etiqueta={etiqueta}>
      {(campo) => (
        <Select value={valor} onValueChange={onValor}>
          <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function DialogoRol({
  miembro,
  roles,
  nombreRol,
  onCerrar,
  onConfirmar,
}: {
  miembro: Miembro | null;
  roles: readonly OpcionSimple[];
  nombreRol: (id: number | null, nombre: string | null) => string;
  onCerrar: () => void;
  onConfirmar: (rolId: number) => Promise<void>;
}) {
  const t = useTranslations('org.acceso.miembros.dialogos');
  const [rol, setRol] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setRol(miembro?.rolId ? String(miembro.rolId) : ''), [miembro]);
  const cambia = !!miembro && rol !== '' && Number(rol) !== miembro.rolId;
  const nuevo = roles.find((r) => r.id === rol);
  return (
    <Dialogo
      abierto={miembro !== null}
      onAbiertoChange={(a) => !a && !guardando && onCerrar()}
      titulo={t('rol.titulo', { nombre: miembro?.nombre || miembro?.email || '' })}
      icono={ShieldCheck}
      ancho={520}
      descripcion={t('rol.descripcion')}
      primario={{
        etiqueta: t('rol.confirmar'),
        cargando: guardando,
        deshabilitada: !cambia,
        motivo: cambia ? undefined : t('rol.sinCambio'),
        onClick: async () => {
          if (!cambia) return;
          setGuardando(true);
          try {
            await onConfirmar(Number(rol));
          } finally {
            setGuardando(false);
          }
        },
      }}
    >
      <Selector etiqueta={t('rol.campo')} valor={rol} onValor={setRol} opciones={roles} placeholder={t('rol.elegir')} />
      {cambia && miembro && nuevo && (
        <p role="status" className="rounded-lg bg-subtle p-3 text-[13px] text-fg-secondary">
          {t('rol.consecuencia', { nombre: miembro.nombre || miembro.email, antes: nombreRol(miembro.rolId, miembro.rolNombre), despues: nuevo.nombre })}
        </p>
      )}
    </Dialogo>
  );
}

const SIN_CARGO = '__sin_cargo__';

export function DialogoCargo({
  miembro,
  cargos,
  onCerrar,
  onConfirmar,
}: {
  miembro: Miembro | null;
  cargos: readonly OpcionSimple[];
  onCerrar: () => void;
  onConfirmar: (cargoId: string | null) => Promise<void>;
}) {
  const t = useTranslations('org.acceso.miembros.dialogos');
  const [cargo, setCargo] = useState(SIN_CARGO);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setCargo(miembro?.cargoId ?? SIN_CARGO), [miembro]);
  const actual = miembro?.cargoId ?? SIN_CARGO;
  const cambia = !!miembro && cargo !== actual;
  return (
    <Dialogo
      abierto={miembro !== null}
      onAbiertoChange={(a) => !a && !guardando && onCerrar()}
      titulo={t('cargo.titulo', { nombre: miembro?.nombre || miembro?.email || '' })}
      icono={Briefcase}
      ancho={520}
      descripcion={t('cargo.descripcion')}
      primario={{
        etiqueta: t('cargo.confirmar'),
        cargando: guardando,
        deshabilitada: !cambia,
        motivo: cambia ? undefined : t('cargo.sinCambio'),
        onClick: async () => {
          if (!cambia) return;
          setGuardando(true);
          try {
            await onConfirmar(cargo === SIN_CARGO ? null : cargo);
          } finally {
            setGuardando(false);
          }
        },
      }}
    >
      <Selector
        etiqueta={t('cargo.campo')}
        valor={cargo}
        onValor={setCargo}
        opciones={[{ id: SIN_CARGO, nombre: t('cargo.ninguno') }, ...cargos]}
        placeholder={t('cargo.elegir')}
      />
    </Dialogo>
  );
}

export function DialogoQuitarSede({
  miembro,
  onCerrar,
  onConfirmar,
}: {
  miembro: Miembro | null;
  onCerrar: () => void;
  onConfirmar: (sedeId: number) => Promise<void>;
}) {
  const t = useTranslations('org.acceso.miembros.dialogos');
  const [sede, setSede] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setSede(''), [miembro]);
  const nombreSede = miembro?.sedes.find((s) => String(s.id) === sede)?.nombre;
  return (
    <Dialogo
      abierto={miembro !== null}
      onAbiertoChange={(a) => !a && !guardando && onCerrar()}
      titulo={t('sede.titulo', { nombre: miembro?.nombre || miembro?.email || '' })}
      icono={MapPinOff}
      ancho={520}
      descripcion={t('sede.descripcion')}
      primario={{
        etiqueta: t('sede.confirmar'),
        destructiva: true,
        cargando: guardando,
        deshabilitada: !sede,
        motivo: sede ? undefined : t('sede.elegir'),
        onClick: async () => {
          if (!sede) return;
          setGuardando(true);
          try {
            await onConfirmar(Number(sede));
          } finally {
            setGuardando(false);
          }
        },
      }}
    >
      <Selector
        etiqueta={t('sede.campo')}
        valor={sede}
        onValor={setSede}
        opciones={(miembro?.sedes ?? []).map((s) => ({ id: String(s.id), nombre: s.nombre }))}
        placeholder={t('sede.elegir')}
      />
      {nombreSede && miembro && (
        <p role="status" className="rounded-lg bg-subtle p-3 text-[13px] text-fg-secondary">
          {t('sede.consecuencia', { nombre: miembro.nombre || miembro.email, sede: nombreSede })}
        </p>
      )}
    </Dialogo>
  );
}
