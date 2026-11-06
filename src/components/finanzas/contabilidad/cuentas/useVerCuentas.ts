'use client';

import { useCallback, useEffect, useState } from 'react';
import { CuentasAutomaticasService } from './CuentasAutomaticasService';

const CLAVE_LOCAL = 'go.ver-cuentas-contables';

function leerLocal(): boolean | null {
  try {
    const valor = window.localStorage.getItem(CLAVE_LOCAL);
    return valor === null ? null : valor === '1';
  } catch {
    return null;
  }
}

function escribirLocal(valor: boolean) {
  try {
    window.localStorage.setItem(CLAVE_LOCAL, valor ? '1' : '0');
  } catch {
    // Navegador sin almacenamiento: la preferencia sigue en el perfil.
  }
}

/**
 * «Ver cuentas contables». La preferencia vive en el perfil de la persona: la
 * sigue a cualquier equipo. El navegador solo evita el parpadeo al entrar.
 * Solo decide qué se ve: nunca toca las líneas del documento.
 */
export function useVerCuentas(): { activo: boolean; cambiar: (valor: boolean) => void } {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    const guardada = leerLocal();
    if (guardada !== null) setActivo(guardada);
    CuentasAutomaticasService.verCuentas()
      .then((valor) => {
        if (!vivo) return;
        setActivo(valor);
        escribirLocal(valor);
      })
      .catch(() => {
        // Sin conexión con el perfil: se queda con lo que hay.
      });
    return () => {
      vivo = false;
    };
  }, []);

  const cambiar = useCallback((valor: boolean) => {
    setActivo(valor);
    escribirLocal(valor);
    CuentasAutomaticasService.guardarVerCuentas(valor).catch((error) => {
      console.error(error);
    });
  }, []);

  return { activo, cambiar };
}
