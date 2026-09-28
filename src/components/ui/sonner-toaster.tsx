'use client';

/**
 * Contenedor de los avisos de `sonner`.
 *
 * 95 archivos llaman a `toast` de sonner (confirmaciones de guardado, errores de
 * red, «correo de confirmación enviado»…) pero su `<Toaster />` nunca se montó,
 * así que ninguno de esos avisos llegaba a verse: el usuario guardaba, fallaba
 * o reenviaba sin enterarse. Convive con el `Toaster` de shadcn (`use-toast`),
 * que sigue siendo el de los componentes que lo usan.
 *
 * Sigue el tema claro/oscuro de next-themes y los tokens del sistema de diseño.
 */
import { Toaster } from 'sonner';
import { useTheme } from 'next-themes';

export function SonnerToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      richColors
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast: 'font-sans rounded-xl border border-line shadow-lg',
          title: 'text-sm font-semibold',
          description: 'text-[13px]',
        },
      }}
    />
  );
}
