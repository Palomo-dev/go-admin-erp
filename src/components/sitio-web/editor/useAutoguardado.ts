/**
 * Autoguardado del borrador (Figma A/05m: «Guardar ≠ publicar: todo cambio va al borrador con
 * autoguardado»). Programa un guardado tras una espera corta desde el ÚLTIMO cambio, nunca deja
 * dos guardados a la vez y, si hay cambios mientras se guarda, vuelve a guardar al terminar.
 * `ahora()` (Ctrl+S, antes de publicar, de la vista previa o de cambiar de sitio) guarda ya lo
 * pendiente y devuelve si quedó guardado. Sin React: lo usa `useEditorSitio` y se prueba solo.
 */
export interface Autoguardado {
  /** Marca un cambio y (si está habilitado) programa el guardado. */
  programar: () => void;
  /** Guarda ya lo pendiente; espera al guardado en curso. `true` si no queda nada sin guardar. */
  ahora: () => Promise<boolean>;
  /** Hay cambios que aún no empezaron a guardarse. */
  pendiente: () => boolean;
  cancelar: () => void;
  /** Olvida lo pendiente (la vista se recargó desde el borrador). */
  reiniciar: () => void;
  /** En legacy no se autoguarda (guardar es publicar): solo se marcan los cambios. */
  habilitar: (si: boolean) => void;
}

export function programarAutoguardado(guardar: () => Promise<boolean>, esperaMs: number): Autoguardado {
  let sucio = false;
  let habilitado = true;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let enCurso: Promise<boolean> | null = null;

  const limpiar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
  };

  const ejecutar = async (): Promise<boolean> => {
    limpiar();
    if (enCurso) await enCurso;
    if (!sucio) return true;
    sucio = false;
    enCurso = guardar().catch(() => false);
    const ok = await enCurso;
    enCurso = null;
    if (!ok) {
      // Se conserva como pendiente: «Reintentar» lo vuelve a intentar.
      sucio = true;
      return false;
    }
    if (sucio && habilitado) temporizador = setTimeout(() => void ejecutar(), esperaMs);
    return !sucio;
  };

  return {
    programar: () => {
      sucio = true;
      if (!habilitado) return;
      limpiar();
      temporizador = setTimeout(() => void ejecutar(), esperaMs);
    },
    ahora: async () => {
      const ok = await ejecutar();
      // Lo que entró durante el guardado también se guarda antes de seguir.
      return ok && sucio ? ejecutar() : ok;
    },
    pendiente: () => sucio,
    cancelar: () => {
      limpiar();
    },
    reiniciar: () => {
      limpiar();
      sucio = false;
    },
    habilitar: (si: boolean) => {
      habilitado = si;
      if (!si) limpiar();
    },
  };
}
