export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `html` y `body` tienen `overflow: hidden` (globals.css: el shell de la app
    // desplaza sus propios paneles), así que el acceso necesita su propio scroll:
    // sin él, en móvil el registro no bajaba más allá de la contraseña.
    <div className="h-dvh overflow-y-auto overscroll-contain bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {children}
    </div>
  );
}
