begin;

create table public.clientes_archivos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  autor_user_id uuid not null references auth.users(id) on delete restrict,
  ruta text not null unique,
  nombre varchar(200) not null check (length(btrim(nombre)) > 0),
  tipo text not null check (tipo in ('application/pdf','image/jpeg','image/png','image/webp',
    'application/msword','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  creado_en timestamptz not null default now()
);
create index clientes_archivos_cliente_idx on public.clientes_archivos (cliente_id, creado_en desc);
create table public.archivos_limpieza (
  ruta text primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade
);
alter table public.clientes_archivos enable row level security;
alter table public.archivos_limpieza enable row level security;
revoke all on public.clientes_archivos, public.archivos_limpieza from public, anon, authenticated;
grant select on public.clientes_archivos to authenticated;
grant all on public.clientes_archivos, public.archivos_limpieza to service_role;
create policy clientes_archivos_leer on public.clientes_archivos for select to authenticated
  using (public.can_access_client_health(cliente_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seguimiento-archivos', 'seguimiento-archivos', false, 20971520,
  array['application/pdf','image/jpeg','image/png','image/webp',
    'application/msword','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create function public.archivo_ruta_valida(p_ruta text, p_cliente uuid, p_usuario uuid)
returns boolean language sql immutable set search_path = '' as $$
  select p_cliente is not null and p_usuario is not null and p_ruta is not null
    and split_part(p_ruta,'/',1) = p_cliente::text and split_part(p_ruta,'/',2) = p_usuario::text
    and split_part(p_ruta,'/',3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and p_ruta = p_cliente::text || '/' || p_usuario::text || '/' || split_part(p_ruta,'/',3);
$$;
revoke all on function public.archivo_ruta_valida(text,uuid,uuid) from public, anon;
grant execute on function public.archivo_ruta_valida(text,uuid,uuid) to authenticated;

create function public.archivo_registrado(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clientes_archivos where ruta = p_ruta);
$$;
revoke all on function public.archivo_registrado(text) from public, anon;
grant execute on function public.archivo_registrado(text) to authenticated;

create function public.archivo_limpieza_propia(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.archivos_limpieza where ruta = p_ruta and usuario_id = auth.uid());
$$;
revoke all on function public.archivo_limpieza_propia(text) from public, anon;
grant execute on function public.archivo_limpieza_propia(text) to authenticated;

create policy seguimiento_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'seguimiento-archivos'
    and public.archivo_ruta_valida(name, public.cliente_de_ruta_foto(name), auth.uid())
    and public.can_access_client_health(public.cliente_de_ruta_foto(name))
    and exists (select 1 from public.clientes c where c.id = public.cliente_de_ruta_foto(name) and c.estado = 'activo'));
create policy seguimiento_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'seguimiento-archivos'
    and public.can_access_client_health(public.cliente_de_ruta_foto(name))
    and (exists (select 1 from public.clientes_archivos a where a.ruta = name)
      or public.archivo_ruta_valida(name, public.cliente_de_ruta_foto(name), auth.uid())
      or public.archivo_limpieza_propia(name)));
create policy seguimiento_archivos_limpiar on storage.objects for delete to authenticated
  using (bucket_id = 'seguimiento-archivos'
    and (public.archivo_ruta_valida(name, public.cliente_de_ruta_foto(name), auth.uid())
      or public.archivo_limpieza_propia(name))
    and not public.archivo_registrado(name));

create function public.registrar_archivo_seguimiento(p_cliente uuid, p_ruta text, p_nombre text, p_tipo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not coalesce(public.can_access_client_health(p_cliente),false)
    or not exists (select 1 from public.clientes c where c.id = p_cliente and c.estado = 'activo')
    or not public.archivo_ruta_valida(p_ruta,p_cliente,auth.uid())
    then raise exception 'No tienes permiso para guardar este archivo.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 200
    or p_tipo is null or p_tipo not in ('application/pdf','image/jpeg','image/png','image/webp',
      'application/msword','application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    then raise exception 'Nombre o tipo de archivo no válido.'; end if;
  if lower(p_nombre) !~ (case p_tipo
    when 'application/pdf' then '[.]pdf$'
    when 'image/jpeg' then '[.]jpe?g$'
    when 'image/png' then '[.]png$'
    when 'image/webp' then '[.]webp$'
    when 'application/msword' then '[.]doc$'
    when 'application/vnd.ms-excel' then '[.]xls$'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '[.]docx$'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then '[.]xlsx$'
  end) then raise exception 'La extensión no corresponde al tipo de archivo.'; end if;
  perform 1 from storage.objects o where o.bucket_id='seguimiento-archivos'
    and o.name=p_ruta and o.metadata->>'mimetype'=p_tipo
    and case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::numeric between 1 and 20971520 else false end
    for update;
  if not found then raise exception 'El archivo no está disponible o supera el límite de 20 MB.'; end if;
  insert into public.clientes_archivos (cliente_id, autor_user_id, ruta, nombre, tipo)
    values (p_cliente, auth.uid(), p_ruta, btrim(p_nombre), p_tipo) returning id into v_id;
  return v_id;
end;
$$;

create function public.quitar_archivo_seguimiento(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_ruta text;
begin
  delete from public.clientes_archivos where id = p_id
    and (autor_user_id = auth.uid() or cliente_id = public.cliente_actual_id())
    and public.can_access_client_health(cliente_id) returning ruta into v_ruta;
  if v_ruta is null then raise exception 'Archivo no encontrado o sin permiso para eliminarlo.'; end if;
  insert into public.archivos_limpieza (ruta,usuario_id) values (v_ruta,auth.uid())
    on conflict (ruta) do update set usuario_id=excluded.usuario_id;
  return v_ruta;
end;
$$;
create function public.finalizar_limpieza_archivo(p_ruta text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from storage.objects where bucket_id='seguimiento-archivos' and name=p_ruta)
    then raise exception 'El archivo todavía existe en Storage.'; end if;
  delete from public.archivos_limpieza where ruta=p_ruta and usuario_id=auth.uid();
end;
$$;
revoke all on function public.registrar_archivo_seguimiento(uuid,text,text,text),
  public.quitar_archivo_seguimiento(uuid), public.finalizar_limpieza_archivo(text) from public, anon;
grant execute on function public.registrar_archivo_seguimiento(uuid,text,text,text),
  public.quitar_archivo_seguimiento(uuid), public.finalizar_limpieza_archivo(text) to authenticated;

commit;
