-- Documentos (fase 2, motor único): el bucket `invoices` deja de ser público.
--
-- Antes: `public = true` (cualquiera con la URL leía el PDF de una factura) y
-- cuatro políticas en storage.objects que dejaban a CUALQUIER usuario
-- autenticado subir, sobrescribir o borrar objetos del bucket, de cualquier
-- organización. Hoy el bucket guarda 6 objetos viejos (5 PDF y 1 HTML de
-- 2026-08-08 a 2026-08-14, bajo `facturas-venta/`); no se borran.
--
-- Después: bucket privado, solo PDF, máximo 10 MB. Nadie con la llave anon ni
-- con una sesión de usuario lee ni escribe: solo el servidor (service role),
-- con la organización ya validada (`src/lib/documents/server/almacen.ts`,
-- ruta `<organization_id>/<tipo>/<id>.pdf`), y la lectura es por URL firmada
-- de 5 minutos.

update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf']
 where id = 'invoices';

drop policy if exists "Public read access for invoices" on storage.objects;
drop policy if exists "Authenticated users can upload invoices" on storage.objects;
drop policy if exists "Authenticated users can update invoices" on storage.objects;
drop policy if exists "Authenticated users can delete invoices" on storage.objects;
