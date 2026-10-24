-- Revierte la función de colocación. No restaura documentos: eso se hace
-- con la instantánea de website_site_draft_snapshots (motivo antes_de_restaurar)
-- y volviendo published_revision_id a la revisión anterior.
drop function if exists public.fn_rellenar_paginas_legales(jsonb, jsonb);
