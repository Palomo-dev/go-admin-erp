-- Reversión de 20261114190631_logos_bucket_limites_tamano_tipos: el bucket
-- `logos` vuelve a no tener límite de tamaño ni de tipos (como estaba antes).
update storage.buckets
set file_size_limit = null,
    allowed_mime_types = null
where id = 'logos';
