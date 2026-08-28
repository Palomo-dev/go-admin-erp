---
name: docker-containerization
description: Usar SIEMPRE al crear o modificar Dockerfiles, docker-compose, o configurar entornos de desarrollo/producción contenerizados. Aplica a servicios FastAPI, Node/Next.js, Postgres local, y cualquier stack que se despliegue como contenedor.
---

# Docker y contenerización

## Dockerfiles
- Usa builds multi-stage: una etapa para instalar dependencias/compilar, otra
  ligera para producción — no arrastres devDependencies ni herramientas de build
  a la imagen final.
- Usa imágenes base `slim`/`alpine` cuando sea posible, pero verifica compatibilidad
  (alpine usa musl, puede dar problemas con algunas libs nativas de Python/Node).
- Copia primero los archivos de dependencias (`package.json`/`requirements.txt`)
  e instala antes de copiar el resto del código — aprovecha el cache de capas de
  Docker para no reinstalar dependencias en cada build por un cambio de código.
- Nunca corras el proceso como `root` en producción — crea un usuario sin
  privilegios en el Dockerfile.
- No incluyas `.env` con secrets reales en la imagen — pásalos en runtime
  (variables de entorno del contenedor), no en build time, salvo que sean
  necesarios para el build y no sensibles.

## docker-compose (desarrollo local)
- Un servicio por proceso (app, db, redis, etc.), con `depends_on` y healthchecks
  para que la app no arranque antes de que Postgres esté listo.
- Usa volúmenes para persistencia de datos de Postgres en desarrollo, y bind
  mounts del código fuente para hot-reload sin rebuildear la imagen en cada cambio.
- `.dockerignore` siempre presente (`node_modules`, `.git`, `.env`, `__pycache__`)
  para builds más rápidos y no filtrar secrets.

## Para este stack específico
- Postgres/Supabase local vía `supabase start` (CLI) es preferible a levantar
  Postgres manualmente en docker-compose si el proyecto ya usa Supabase, para
  mantener paridad con producción (mismas extensiones, RLS, etc.).
- FastAPI: usa `uvicorn`/`gunicorn` con workers configurados según CPU disponible
  en el contenedor, no el default de un solo worker en producción.

## Checklist antes de considerar la imagen lista
- [ ] Build multi-stage, imagen final sin herramientas de desarrollo.
- [ ] No corre como root.
- [ ] Healthcheck definido.
- [ ] Tamaño de imagen razonable (revisa con `docker images`, no debería ser
      varios GB para un servicio simple).
