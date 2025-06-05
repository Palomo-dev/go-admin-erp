# GO Admin ERP

Sistema de administración ERP modular basado en Next.js 15.3.1 y Supabase.

## Estructura del Proyecto

El proyecto está organizado en módulos, cada uno con su propia funcionalidad:

- **Inicio**: Dashboard principal
- **CRM**: Gestión de relaciones con clientes
- **HRM**: Gestión de recursos humanos
- **Finanzas**: Gestión financiera
- **Inventario**: Control de inventario
- **POS**: Sistema de punto de venta
- **PMS**: Sistema de gestión de proyectos
- **Calendario**: Gestión de eventos y calendario
- **Organización**: Estructura organizacional
- **Reportes**: Generación de informes
- **Timeline**: Línea de tiempo de actividades
- **Transporte**: Gestión de transporte
- **Notificaciones**: Sistema de notificaciones
- **Integraciones**: Conexiones con servicios externos

## Requisitos

- Node.js ^18.18.0 || ^19.8.0 || >= 20.0.0
- NPM o Yarn

## Instalación

1. Clona el repositorio
2. Instala las dependencias:

```bash
npm install
# o
yarn install
```

3. Crea un archivo `.env.local` con las siguientes variables:

```
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase
```

4. Inicia el servidor de desarrollo:

```bash
npm run dev
# o
yarn dev
```

5. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Autenticación

El sistema utiliza Supabase Auth para la autenticación de usuarios:

- Login básico con email/password
- Registro de usuarios en dos pasos (datos personales y datos de organización)

## Tecnologías

- Next.js 15.3.1
- React 19.0.0
- Supabase
- Tailwind CSS
