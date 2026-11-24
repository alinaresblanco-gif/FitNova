begin;

create table public.biblioteca_videos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  titulo varchar(120) not null check (length(btrim(titulo)) > 0),
  descripcion varchar(2000),
  categoria varchar(100),
  duracion_min smallint check (duracion_min between 1 and 600),
  video_url varchar(500) not null check (public.video_url_valida(video_url)),
  publicado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.video_destinatarios (
  video_id uuid not null references public.biblioteca_videos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  primary key (video_id, cliente_id)
);

create table public.video_favoritos (
  video_id uuid not null references public.biblioteca_videos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (video_id, cliente_id)
);

create index biblioteca_videos_profesional_idx on public.biblioteca_videos (profesional_id, actualizado_en desc);
create index video_destinatarios_cliente_idx on public.video_destinatarios (cliente_id, video_id);
create trigger biblioteca_videos_actualizado_en before update on public.biblioteca_videos
  for each row execute function public.set_actualizado_en();

alter table public.biblioteca_videos enable row level security;
alter table public.video_destinatarios enable row level security;
alter table public.video_favoritos enable row level security;
revoke all on public.biblioteca_videos, public.video_destinatarios, public.video_favoritos from anon, authenticated;
grant select, delete on public.biblioteca_videos to authenticated;
grant select on public.video_destinatarios to authenticated;
grant select, insert, delete on public.video_favoritos to authenticated;
grant all on public.biblioteca_videos, public.video_destinatarios, public.video_favoritos to service_role;

create function public.video_visible_para_cliente(p_video uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.biblioteca_videos v
    join public.video_destinatarios d on d.video_id = v.id
    join public.clientes c on c.id = d.cliente_id
    join public.profesional_cliente pc on pc.cliente_id = c.id and pc.profesional_id = v.profesional_id
    where v.id = p_video and v.publicado and c.id = public.cliente_actual_id()
      and c.estado = 'activo' and pc.rol in ('entrenador', 'nutricionista')
  );
$$;
revoke all on function public.video_visible_para_cliente(uuid) from public, anon;
grant execute on function public.video_visible_para_cliente(uuid) to authenticated;

create policy biblioteca_videos_select on public.biblioteca_videos for select to authenticated
  using (profesional_id = public.profesional_actual_id() or public.video_visible_para_cliente(id));
create policy biblioteca_videos_delete on public.biblioteca_videos for delete to authenticated
  using (profesional_id = public.profesional_actual_id());
create policy video_destinatarios_select on public.video_destinatarios for select to authenticated
  using (exists (select 1 from public.biblioteca_videos v
                 where v.id = video_id and v.profesional_id = public.profesional_actual_id()));
create policy video_favoritos_select on public.video_favoritos for select to authenticated
  using (cliente_id = public.cliente_actual_id() and public.video_visible_para_cliente(video_id));
create policy video_favoritos_insert on public.video_favoritos for insert to authenticated
  with check (cliente_id = public.cliente_actual_id() and public.video_visible_para_cliente(video_id));
create policy video_favoritos_delete on public.video_favoritos for delete to authenticated
  using (cliente_id = public.cliente_actual_id());

create function public.clientes_para_videos()
returns table (id uuid, nombre text, apellidos text)
language sql stable security definer set search_path = '' as $$
  select distinct c.id, c.nombre::text, c.apellidos::text
  from public.clientes c
  join public.profesional_cliente pc on pc.cliente_id = c.id
  where pc.profesional_id = public.profesional_actual_id()
    and pc.rol in ('entrenador', 'nutricionista') and c.estado = 'activo'
  order by c.nombre::text, c.apellidos::text, c.id;
$$;
revoke all on function public.clientes_para_videos() from public, anon;
grant execute on function public.clientes_para_videos() to authenticated;

create function public.guardar_video(
  p_id uuid, p_titulo text, p_descripcion text, p_categoria text,
  p_duracion_min integer, p_url text, p_publicado boolean, p_clientes uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_id uuid;
begin
  if v_profesional is null then raise exception 'No hay un perfil profesional asociado.'; end if;
  if p_titulo is null or length(btrim(p_titulo)) not between 1 and 120 then
    raise exception 'El título debe tener entre 1 y 120 caracteres.';
  end if;
  if length(p_descripcion) > 2000 or length(p_categoria) > 100 then
    raise exception 'La descripción o categoría es demasiado larga.';
  end if;
  if p_duracion_min is not null and p_duracion_min not between 1 and 600 then
    raise exception 'La duración debe estar entre 1 y 600 minutos.';
  end if;
  if p_url is null or not public.video_url_valida(p_url) then
    raise exception 'Introduce un enlace válido de YouTube o Vimeo.';
  end if;
  if p_publicado is null or p_clientes is null then raise exception 'Selecciona el estado y los destinatarios.'; end if;
  if p_publicado and cardinality(p_clientes) = 0 then raise exception 'Selecciona al menos un cliente para publicar.'; end if;
  if exists (
    select 1 from unnest(p_clientes) x(id)
    where x.id is null or not exists (
      select 1 from public.clientes c join public.profesional_cliente pc on pc.cliente_id = c.id
      where c.id = x.id and c.estado = 'activo' and pc.profesional_id = v_profesional
        and pc.rol in ('entrenador', 'nutricionista')
    )
  ) then raise exception 'Solo puedes elegir clientes activos asignados a ti.'; end if;
  if p_id is null then
    insert into public.biblioteca_videos (profesional_id, titulo, descripcion, categoria, duracion_min, video_url, publicado)
    values (v_profesional, btrim(p_titulo), nullif(btrim(p_descripcion), ''), nullif(btrim(p_categoria), ''), p_duracion_min, p_url, p_publicado)
    returning id into v_id;
  else
    update public.biblioteca_videos set titulo = btrim(p_titulo), descripcion = nullif(btrim(p_descripcion), ''),
      categoria = nullif(btrim(p_categoria), ''), duracion_min = p_duracion_min, video_url = p_url, publicado = p_publicado
    where id = p_id and profesional_id = v_profesional returning id into v_id;
    if v_id is null then raise exception 'No se encontró el vídeo propio.'; end if;
    delete from public.video_destinatarios where video_id = v_id and not (cliente_id = any(p_clientes));
  end if;
  insert into public.video_destinatarios (video_id, cliente_id)
    select v_id, x.id from unnest(p_clientes) x(id)
    on conflict do nothing;
  return v_id;
end;
$$;
revoke all on function public.guardar_video(uuid, text, text, text, integer, text, boolean, uuid[]) from public, anon;
grant execute on function public.guardar_video(uuid, text, text, text, integer, text, boolean, uuid[]) to authenticated;

commit;
