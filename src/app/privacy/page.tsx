import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidad | GoAdmin ERP',
  description: 'Política de privacidad de GoAdmin ERP — cómo usamos cámara, ubicación, notificaciones, NFC y biometría.',
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Última actualización: 24 de agosto de 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introducción</h2>
            <p>
              GoAdmin ERP (&ldquo;GoAdmin&rdquo;, &ldquo;la aplicación&rdquo;) es una plataforma de gestión empresarial
              (ERP/CRM) que ofrece módulos de POS, inventario, clientes, transporte, recursos humanos,
              gimnasio, reservas y más. Esta política describe cómo recopilamos, usamos y protegemos
              la información cuando utilizas nuestra aplicación móvil (Android e iOS) y nuestra
              plataforma web.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Datos que recopilamos</h2>
            <h3 className="text-lg font-medium mb-2">2.1 Datos de cuenta</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Correo electrónico y contraseña (hash)</li>
              <li>Nombre, rol y organización</li>
              <li>Foto de perfil (opcional)</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">2.2 Datos de actividad empresarial</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Ventas, facturas, productos, clientes, proveedores</li>
              <li>Marcación de asistencia, check-ins de gimnasio</li>
              <li>Notificaciones internas de la plataforma</li>
              <li>Configuración de impresoras y dispositivos</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">2.3 Datos del dispositivo móvil</h3>
            <p>La aplicación móvil puede acceder a los siguientes sensores y datos del dispositivo,
              exclusivamente para funcionalidades de la app y con tu consentimiento:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Cámara:</strong> escaneo de códigos de barras/QR, fotos de productos, fotos de clientes, fotos de entrega de transporte.</li>
              <li><strong>Ubicación (GPS):</strong> marcación de asistencia con geolocalización, seguimiento de transporte.</li>
              <li><strong>Biometría (Face ID / huella):</strong> inicio de sesión rápido. Los datos biométricos nunca salen del dispositivo; se usan únicamente para desbloquear credenciales guardadas localmente.</li>
              <li><strong>NFC:</strong> lectura de tags NFC para check-in de gimnasio y marcación de asistencia.</li>
              <li><strong>Bluetooth:</strong> conexión con impresoras térmicas de tickets.</li>
              <li><strong>Notificaciones push:</strong> alertas en tiempo real sobre ventas, reservas, mensajes y eventos.</li>
              <li><strong>Almacenamiento (Filesystem):</strong> exportación de reportes en PDF/CSV al dispositivo.</li>
              <li><strong>Vibración (Haptics):</strong> feedback táctil en acciones de POS.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Cómo usamos los datos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Para proporcionar las funcionalidades del ERP/CRM (gestión de ventas, inventario, clientes, etc.).</li>
              <li>Para enviar notificaciones push sobre eventos relevantes (nuevas ventas, reservas, mensajes).</li>
              <li>Para registrar la asistencia de empleados y check-ins de gimnasio.</li>
              <li>Para conectar con impresoras térmicas vía Bluetooth.</li>
              <li>Para mejorar la experiencia de usuario (feedback háptico, navegación, exportación de reportes).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Datos que NO recopilamos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Datos biométricos:</strong> la huella y Face ID nunca se envían a nuestros servidores. Se procesan exclusivamente en el dispositivo.</li>
              <li><strong>Contactos:</strong> no accedemos a la libreta de contactos.</li>
              <li><strong>Mensajes SMS:</strong> no leemos SMS.</li>
              <li><strong>Historial de navegación:</strong> no rastreamemos tu navegación fuera de la app.</li>
              <li><strong>Datos analíticos de terceros:</strong> no usamos SDKs de tracking como Facebook Analytics o Google Analytics para móviles.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Almacenamiento y seguridad</h2>
            <p>
              Los datos se almacenan en Supabase (PostgreSQL) con cifrado en tránsito (TLS) y
              cifrado en reposo. Las credenciales de login biométrico se guardan localmente en
              el dispositivo con codificación base64 + reverse (obfuscación ligera), nunca en
              texto plano. Las políticas de Row Level Security (RLS) aseguran que cada
              organización solo accede a sus propios datos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Permisos del dispositivo</h2>
            <p>La aplicación solicita los siguientes permisos, cada uno con una justificación:</p>
            <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-2 border-b">Permiso</th>
                  <th className="text-left px-4 py-2 border-b">Justificación</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-4 py-2 border-b">Cámara</td><td className="px-4 py-2 border-b">Escaneo de códigos, fotos de productos/clientes</td></tr>
                <tr><td className="px-4 py-2 border-b">Ubicación</td><td className="px-4 py-2 border-b">Marcación de asistencia, transporte</td></tr>
                <tr><td className="px-4 py-2 border-b">Biometría</td><td className="px-4 py-2 border-b">Login rápido con Face ID/huella</td></tr>
                <tr><td className="px-4 py-2 border-b">NFC</td><td className="px-4 py-2 border-b">Check-in gimnasio, marcación asistencia</td></tr>
                <tr><td className="px-4 py-2 border-b">Bluetooth</td><td className="px-4 py-2 border-b">Impresoras térmicas de tickets</td></tr>
                <tr><td className="px-4 py-2 border-b">Notificaciones</td><td className="px-4 py-2 border-b">Alertas en tiempo real</td></tr>
                <tr><td className="px-4 py-2 border-b">Almacenamiento</td><td className="px-4 py-2 border-b">Exportar PDF/CSV al dispositivo</td></tr>
                <tr><td className="px-4 py-2">Vibración</td><td className="px-4 py-2">Feedback táctil en POS</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Tus derechos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Acceso: puedes solicitar una copia de tus datos.</li>
              <li>Rectificación: puedes corregir datos inexactos desde la plataforma.</li>
              <li>Eliminación: puedes solicitar la eliminación de tu cuenta y datos asociados.</li>
              <li>Portabilidad: puedes exportar tus datos en formato CSV/PDF.</li>
              <li>Revocación de permisos: puedes desactivar cualquier permiso desde la configuración del dispositivo en cualquier momento.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Contacto</h2>
            <p>
              Para preguntas sobre esta política de privacidad o para ejercer tus derechos,
              contacta a: <a href="mailto:privacidad@goadmin.io" className="text-blue-600 dark:text-blue-400 underline">privacidad@goadmin.io</a>
            </p>
          </section>

          <div className="pt-8 border-t border-gray-200 dark:border-gray-700">
            <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
