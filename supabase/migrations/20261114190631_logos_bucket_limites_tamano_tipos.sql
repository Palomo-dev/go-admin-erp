-- Límites del bucket público `logos` (tamaño máximo y tipos de imagen).
--
-- Hasta hoy no tenía ninguno: cualquier archivo de cualquier tamaño. Lo usan
-- el logo de la organización (OrganizationInfoTab: hasta 5 MB, image/*;
-- LogoUploader: hasta 2 MB), el logo web de la sucursal (BranchForm vía
-- ImageUploader: 2 MB, PNG/JPG/WebP/SVG) y, desde el 2026-11-14, el logo y la
-- «Imagen propia» del chat del sitio web (2 MB, PNG/JPG/SVG/WebP, bajo
-- `<organización>/chat-widget/<canal>/`).
--
-- El tope es el mayor que ya acepta algún cargador (5 MB), para no romper a
-- ninguno; el chat valida sus 2 MB en el navegador. Los tipos cubren lo que
-- esos cargadores aceptan y se ve en la web (`image/jpg` lo reportan algunos
-- navegadores para .jpg). Al aplicarla había 9 objetos: 7 PNG y 2 WebP, el
-- mayor de 269 KB; ninguno queda fuera.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif', 'image/avif']
where id = 'logos';
