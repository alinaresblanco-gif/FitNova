begin;

create function public.listar_videos_cliente()
returns table (
  id uuid, titulo varchar, descripcion varchar, categoria varchar,
  duracion_min smallint, video_url varchar, creado_en timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select v.id, v.titulo, v.descripcion, v.categoria, v.duracion_min, v.video_url, v.creado_en
  from public.biblioteca_videos v
  where public.video_visible_para_cliente(v.id);
$$;
revoke all on function public.listar_videos_cliente() from public, anon;
grant execute on function public.listar_videos_cliente() to authenticated;

commit;
