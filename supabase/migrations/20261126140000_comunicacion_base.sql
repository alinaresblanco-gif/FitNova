begin;

create table public.chat_conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  cliente_user_id uuid not null references auth.users(id) on delete cascade,
  profesional_user_id uuid not null references auth.users(id) on delete cascade,
  cliente_nombre text not null,
  profesional_nombre text not null,
  leido_cliente bigint not null default 0,
  leido_profesional bigint not null default 0,
  creado_en timestamptz not null default now(),
  unique (cliente_id, profesional_id)
);

create table public.chat_mensajes (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null references public.chat_conversaciones(id) on delete cascade,
  emisor_tipo text not null check (emisor_tipo in ('cliente','profesional')),
  envio_id uuid not null,
  texto varchar(4000),
  archivo_ruta text unique,
  archivo_nombre varchar(200),
  archivo_tipo text check (archivo_tipo in ('image/jpeg','image/png','image/webp','application/pdf')),
  creado_en timestamptz not null default now(),
  unique (conversacion_id,emisor_tipo,envio_id),
  check (length(btrim(coalesce(texto,''))) > 0 or archivo_ruta is not null),
  check ((archivo_ruta is null and archivo_nombre is null and archivo_tipo is null)
    or (archivo_ruta is not null and length(btrim(archivo_nombre)) > 0 and archivo_tipo is not null))
);
create index chat_mensajes_conversacion_idx on public.chat_mensajes (conversacion_id,id desc);

create table public.notificaciones (
  id bigint generated always as identity primary key,
  destinatario_tipo text not null check (destinatario_tipo in ('cliente','profesional')),
  destinatario_id uuid not null,
  tipo text not null,
  titulo text not null,
  referencia_id text,
  cliente_id uuid,
  creado_en timestamptz not null default now(),
  leido_en timestamptz
);
create index notificaciones_destinatario_idx on public.notificaciones (destinatario_tipo,destinatario_id,id desc);

create table public.tareas_profesional (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  titulo varchar(180) not null check (length(btrim(titulo)) > 0),
  descripcion varchar(2000),
  fecha_limite date,
  completada boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index tareas_profesional_idx on public.tareas_profesional (profesional_id,completada,fecha_limite);
create trigger tareas_actualizado_en before update on public.tareas_profesional
  for each row execute function public.set_actualizado_en();

alter table public.chat_conversaciones enable row level security;
alter table public.chat_mensajes enable row level security;
alter table public.notificaciones enable row level security;
alter table public.tareas_profesional enable row level security;
revoke all on public.chat_conversaciones, public.chat_mensajes, public.notificaciones, public.tareas_profesional from anon, authenticated;
grant select (id,cliente_id,profesional_id,cliente_nombre,profesional_nombre,leido_cliente,leido_profesional,creado_en) on public.chat_conversaciones to authenticated;
grant select on public.chat_mensajes, public.notificaciones, public.tareas_profesional to authenticated;
grant all on public.chat_conversaciones, public.chat_mensajes, public.notificaciones, public.tareas_profesional to service_role;

create function public.chat_puede_leer(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_conversaciones c
    where c.id=p_id and (c.cliente_user_id=(select auth.uid()) or c.profesional_user_id=(select auth.uid())));
$$;
create function public.chat_puede_escribir(p_id uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_conversaciones conv
    join public.clientes c on c.id=conv.cliente_id
    join public.profesionales p on p.id=conv.profesional_id
    where conv.id=p_id and c.estado='activo'
      and c.auth_user_id=conv.cliente_user_id and p.auth_user_id=conv.profesional_user_id
      and ((p_tipo='cliente' and conv.cliente_user_id=(select auth.uid()))
        or (p_tipo='profesional' and conv.profesional_user_id=(select auth.uid())))
      and exists (select 1 from public.profesional_cliente pc where pc.cliente_id=c.id
        and pc.profesional_id=p.id and pc.rol in ('entrenador','nutricionista'))
  );
$$;
revoke all on function public.chat_puede_leer(uuid), public.chat_puede_escribir(uuid,text) from public, anon;
grant execute on function public.chat_puede_leer(uuid), public.chat_puede_escribir(uuid,text) to authenticated;

create policy chat_conversaciones_leer on public.chat_conversaciones for select to authenticated using (public.chat_puede_leer(id));
create policy chat_mensajes_leer on public.chat_mensajes for select to authenticated using (public.chat_puede_leer(conversacion_id));
create policy notificaciones_leer on public.notificaciones for select to authenticated using (
  (destinatario_tipo='cliente' and destinatario_id=public.cliente_actual_id())
  or (destinatario_tipo='profesional' and destinatario_id=public.profesional_actual_id())
);
create policy tareas_leer on public.tareas_profesional for select to authenticated
  using (profesional_id=public.profesional_actual_id());

create function public.chat_contactos(p_tipo text)
returns table (conversacion_id uuid, cliente_id uuid, profesional_id uuid, nombre text,
  activo boolean, ultimo_id bigint, ultimo_texto text, no_leidos bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_tipo is null or p_tipo not in ('cliente','profesional')
     or (p_tipo='cliente' and public.cliente_actual_id() is null)
     or (p_tipo='profesional' and public.profesional_actual_id() is null) then
    raise exception 'No hay un perfil válido para el chat.';
  end if;
  return query
  with parejas as (
    select pc.cliente_id, pc.profesional_id
    from public.profesional_cliente pc join public.clientes c on c.id=pc.cliente_id
    join public.profesionales p on p.id=pc.profesional_id
    where c.estado='activo' and c.auth_user_id is not null and p.auth_user_id is not null and pc.rol in ('entrenador','nutricionista')
      and ((p_tipo='cliente' and c.id=public.cliente_actual_id())
        or (p_tipo='profesional' and pc.profesional_id=public.profesional_actual_id()))
    union
    select conv.cliente_id,conv.profesional_id from public.chat_conversaciones conv
    where (p_tipo='cliente' and conv.cliente_user_id=(select auth.uid()) and conv.cliente_id=public.cliente_actual_id())
       or (p_tipo='profesional' and conv.profesional_user_id=(select auth.uid()) and conv.profesional_id=public.profesional_actual_id())
  )
  select conv.id, pairs.cliente_id, pairs.profesional_id,
    case when p_tipo='cliente' then coalesce(conv.profesional_nombre,btrim(pro.nombre||' '||coalesce(pro.apellidos,'')))
      else coalesce(conv.cliente_nombre,btrim(cli.nombre||' '||coalesce(cli.apellidos,''))) end,
    cli.estado='activo' and cli.auth_user_id is not null and pro.auth_user_id is not null
      and (conv.id is null or public.chat_puede_escribir(conv.id,p_tipo))
      and exists (select 1 from public.profesional_cliente pc where pc.cliente_id=pairs.cliente_id
        and pc.profesional_id=pairs.profesional_id and pc.rol in ('entrenador','nutricionista')),
    last_msg.id, coalesce(last_msg.texto::text,case when last_msg.id is not null then 'Archivo adjunto' end),
    (select count(*) from public.chat_mensajes m where m.conversacion_id=conv.id
      and m.emisor_tipo<>p_tipo and m.id>case when p_tipo='cliente' then conv.leido_cliente else conv.leido_profesional end)
  from parejas pairs
  join public.clientes cli on cli.id=pairs.cliente_id
  join public.profesionales pro on pro.id=pairs.profesional_id
  left join public.chat_conversaciones conv on conv.cliente_id=pairs.cliente_id and conv.profesional_id=pairs.profesional_id
    and ((p_tipo='cliente' and conv.cliente_user_id=(select auth.uid()))
      or (p_tipo='profesional' and conv.profesional_user_id=(select auth.uid())))
  left join lateral (select m.id,m.texto from public.chat_mensajes m where m.conversacion_id=conv.id order by m.id desc limit 1) last_msg on true
  order by last_msg.id desc nulls last, 4;
end;
$$;

create function public.chat_abrir(p_cliente uuid,p_profesional uuid,p_tipo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('cliente','profesional')
    or (p_tipo='cliente' and p_cliente is distinct from public.cliente_actual_id())
    or (p_tipo='profesional' and p_profesional is distinct from public.profesional_actual_id()) then
    raise exception 'No tienes acceso a esta conversación.';
  end if;
  select conv.id into v_id from public.chat_conversaciones conv
    where conv.cliente_id=p_cliente and conv.profesional_id=p_profesional;
  if found then
    if not public.chat_puede_leer(v_id) then raise exception 'No tienes acceso a esta conversación.'; end if;
    return v_id;
  end if;
  insert into public.chat_conversaciones (cliente_id,profesional_id,cliente_user_id,profesional_user_id,cliente_nombre,profesional_nombre)
    select c.id,p.id,c.auth_user_id,p.auth_user_id,btrim(c.nombre||' '||coalesce(c.apellidos,'')),
      btrim(p.nombre||' '||coalesce(p.apellidos,''))
    from public.clientes c join public.profesionales p on p.id=p_profesional
    where c.id=p_cliente and c.estado='activo' and c.auth_user_id is not null and p.auth_user_id is not null
      and exists (select 1 from public.profesional_cliente pc where pc.cliente_id=c.id and pc.profesional_id=p.id
        and pc.rol in ('entrenador','nutricionista'))
    on conflict (cliente_id,profesional_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.chat_conversaciones where cliente_id=p_cliente and profesional_id=p_profesional;
    if v_id is null or not public.chat_puede_leer(v_id) then raise exception 'No se pudo abrir la conversación.'; end if;
  end if;
  return v_id;
end;
$$;

create function public.chat_marcar_leido(p_conversacion uuid,p_tipo text,p_hasta bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_hasta is null or not exists (select 1 from public.chat_mensajes where id=p_hasta and conversacion_id=p_conversacion) then
    raise exception 'Mensaje no válido.';
  end if;
  update public.chat_conversaciones set
    leido_cliente=case when p_tipo='cliente' then greatest(leido_cliente,p_hasta) else leido_cliente end,
    leido_profesional=case when p_tipo='profesional' then greatest(leido_profesional,p_hasta) else leido_profesional end
  where id=p_conversacion and ((p_tipo='cliente' and cliente_user_id=(select auth.uid()))
    or (p_tipo='profesional' and profesional_user_id=(select auth.uid())));
  if not found then raise exception 'No tienes acceso a esta conversación.'; end if;
end;
$$;

create function public.marcar_notificaciones(p_tipo text,p_ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_destino uuid;
begin
  if p_tipo='cliente' then v_destino:=public.cliente_actual_id();
  elsif p_tipo='profesional' then v_destino:=public.profesional_actual_id();
  else raise exception 'Tipo de destinatario no válido.'; end if;
  if v_destino is null or p_ids is null or cardinality(p_ids)>500 then raise exception 'Solicitud no válida.'; end if;
  update public.notificaciones set leido_en=coalesce(leido_en,now())
    where destinatario_tipo=p_tipo and destinatario_id=v_destino and id=any(p_ids);
end;
$$;

create function public.guardar_tarea(p_id uuid,p_titulo text,p_descripcion text,p_fecha date,p_cliente uuid,p_completada boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_profesional uuid:=public.profesional_actual_id(); v_anterior uuid; v_id uuid;
begin
  if v_profesional is null then raise exception 'No hay un perfil profesional.'; end if;
  if p_titulo is null or length(btrim(p_titulo)) not between 1 and 180
     or length(p_descripcion)>2000 or p_completada is null then raise exception 'Revisa los datos de la tarea.'; end if;
  if p_id is not null then
    select cliente_id into v_anterior from public.tareas_profesional where id=p_id and profesional_id=v_profesional;
    if not found then raise exception 'No se encontró la tarea propia.'; end if;
  end if;
  if p_cliente is not null and (p_id is null or p_cliente is distinct from v_anterior)
    and not exists (select 1 from public.profesional_cliente where cliente_id=p_cliente and profesional_id=v_profesional) then
    raise exception 'Solo puedes vincular clientes asignados a ti.';
  end if;
  if p_id is null then
    insert into public.tareas_profesional (profesional_id,cliente_id,titulo,descripcion,fecha_limite,completada)
      values (v_profesional,p_cliente,btrim(p_titulo),nullif(btrim(p_descripcion),''),p_fecha,p_completada) returning id into v_id;
  else
    update public.tareas_profesional set cliente_id=p_cliente,titulo=btrim(p_titulo),descripcion=nullif(btrim(p_descripcion),''),
      fecha_limite=p_fecha,completada=p_completada where id=p_id and profesional_id=v_profesional returning id into v_id;
  end if;
  return v_id;
end;
$$;
create function public.eliminar_tarea(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.tareas_profesional where id=p_id and profesional_id=public.profesional_actual_id();
  if not found then raise exception 'No se encontró la tarea propia.'; end if;
end;
$$;
revoke all on function public.chat_contactos(text),public.chat_abrir(uuid,uuid,text),
  public.chat_marcar_leido(uuid,text,bigint),public.marcar_notificaciones(text,bigint[]),
  public.guardar_tarea(uuid,text,text,date,uuid,boolean),public.eliminar_tarea(uuid) from public,anon;
grant execute on function public.chat_contactos(text),public.chat_abrir(uuid,uuid,text),
  public.chat_marcar_leido(uuid,text,bigint),public.marcar_notificaciones(text,bigint[]),
  public.guardar_tarea(uuid,text,text,date,uuid,boolean),public.eliminar_tarea(uuid) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('chat-adjuntos','chat-adjuntos',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.chat_archivo_puede_leer(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_mensajes m where m.archivo_ruta=p_ruta and public.chat_puede_leer(m.conversacion_id))
    or (split_part(p_ruta,'/',2)=(select auth.uid())::text
      and not exists (select 1 from public.chat_mensajes m where m.archivo_ruta=p_ruta));
$$;
create function public.chat_archivo_puede_subir(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_conversaciones c
    where c.id::text=split_part(p_ruta,'/',1)
      and split_part(p_ruta,'/',2)=(select auth.uid())::text
      and split_part(p_ruta,'/',3) ~ '^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
      and split_part(p_ruta,'/',4)=''
      and (public.chat_puede_escribir(c.id,'cliente') or public.chat_puede_escribir(c.id,'profesional')));
$$;
create function public.chat_archivo_puede_borrar(p_ruta text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('chat-archivo:' || p_ruta,0));
  return split_part(p_ruta,'/',2)=(select auth.uid())::text
    and not exists (select 1 from public.chat_mensajes where archivo_ruta=p_ruta);
end;
$$;
revoke all on function public.chat_archivo_puede_leer(text),public.chat_archivo_puede_subir(text),public.chat_archivo_puede_borrar(text) from public,anon;
grant execute on function public.chat_archivo_puede_leer(text),public.chat_archivo_puede_subir(text),public.chat_archivo_puede_borrar(text) to authenticated;
create policy chat_adjuntos_select on storage.objects for select to authenticated
  using (bucket_id='chat-adjuntos' and public.chat_archivo_puede_leer(name));
create policy chat_adjuntos_insert on storage.objects for insert to authenticated
  with check (bucket_id='chat-adjuntos' and public.chat_archivo_puede_subir(name));
create policy chat_adjuntos_delete on storage.objects for delete to authenticated
  using (bucket_id='chat-adjuntos' and public.chat_archivo_puede_borrar(name));

create function public.chat_enviar(p_conversacion uuid,p_tipo text,p_envio uuid,p_texto text,p_ruta text,p_nombre text,p_mime text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_existente public.chat_mensajes%rowtype;
begin
  perform 1 from public.clientes c join public.chat_conversaciones conv on conv.cliente_id=c.id
    where conv.id=p_conversacion for share of c;
  perform 1 from public.profesionales p join public.chat_conversaciones conv on conv.profesional_id=p.id
    where conv.id=p_conversacion for share of p;
  perform 1 from public.profesional_cliente pc join public.chat_conversaciones conv
    on conv.cliente_id=pc.cliente_id and conv.profesional_id=pc.profesional_id
    where conv.id=p_conversacion and pc.rol in ('entrenador','nutricionista') for share of pc;
  if not exists (select 1 from public.chat_conversaciones c where c.id=p_conversacion
    and ((p_tipo='cliente' and c.cliente_user_id=(select auth.uid()))
      or (p_tipo='profesional' and c.profesional_user_id=(select auth.uid())))) then
    raise exception 'La conversación está cerrada o no tienes permiso.';
  end if;
  if p_envio is null or length(p_texto)>4000 or (length(btrim(coalesce(p_texto,'')))=0 and p_ruta is null) then
    raise exception 'Escribe un mensaje o adjunta un archivo.';
  end if;
  if p_ruta is not null then perform pg_advisory_xact_lock(hashtextextended('chat-archivo:' || p_ruta,0)); end if;
  select * into v_existente from public.chat_mensajes
    where conversacion_id=p_conversacion and emisor_tipo=p_tipo and envio_id=p_envio;
  if found then
    if (v_existente.texto,v_existente.archivo_ruta,v_existente.archivo_nombre,v_existente.archivo_tipo)
      is distinct from (nullif(btrim(p_texto),''),p_ruta,p_nombre,p_mime) then
      raise exception 'Este envío ya se usó para otro mensaje.';
    end if;
    return v_existente.id;
  end if;
  if not public.chat_puede_escribir(p_conversacion,p_tipo) then raise exception 'La conversación está cerrada o no tienes permiso.'; end if;
  if p_ruta is not null then
    if not public.chat_archivo_puede_subir(p_ruta) or split_part(p_ruta,'/',1)<>p_conversacion::text
      or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf')
      or p_nombre is null or length(btrim(p_nombre)) not between 1 and 200
      or not exists (select 1 from storage.objects o where o.bucket_id='chat-adjuntos' and o.name=p_ruta
        and o.metadata->>'mimetype'=p_mime and (o.metadata->>'size')::bigint between 1 and 5242880) then
      raise exception 'El archivo no es válido o no se ha subido.';
    end if;
  elsif p_nombre is not null or p_mime is not null then raise exception 'Los datos del archivo no son válidos.';
  end if;
  insert into public.chat_mensajes (conversacion_id,emisor_tipo,envio_id,texto,archivo_ruta,archivo_nombre,archivo_tipo)
  values (p_conversacion,p_tipo,p_envio,nullif(btrim(p_texto),''),p_ruta,p_nombre,p_mime)
  on conflict (conversacion_id,emisor_tipo,envio_id) do nothing returning id into v_id;
  if v_id is null then
    select * into v_existente from public.chat_mensajes where conversacion_id=p_conversacion and emisor_tipo=p_tipo and envio_id=p_envio;
    if (v_existente.texto,v_existente.archivo_ruta,v_existente.archivo_nombre,v_existente.archivo_tipo)
      is distinct from (nullif(btrim(p_texto),''),p_ruta,p_nombre,p_mime) then raise exception 'Este envío ya se usó para otro mensaje.'; end if;
    v_id:=v_existente.id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.chat_enviar(uuid,text,uuid,text,text,text,text) from public,anon;
grant execute on function public.chat_enviar(uuid,text,uuid,text,text,text,text) to authenticated;

commit;
