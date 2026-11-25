begin;

drop index public.etiquetas_nombre_normalizado_uidx;

create unique index etiquetas_nombre_normalizado_uidx
  on public.etiquetas (lower(btrim(nombre)))
  where profesional_id is null;

commit;
