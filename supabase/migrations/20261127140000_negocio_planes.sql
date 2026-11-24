begin;

create table public.negocio_planes (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  descripcion varchar(2000),
  modalidad text not null check (modalidad in ('unico', 'semanal', 'mensual', 'trimestral', 'anual')),
  precio_centimos integer not null check (precio_centimos between 1 and 99999999),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.negocio_propuestas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.negocio_planes(id) on delete restrict,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nombre varchar(120) not null,
  descripcion varchar(2000),
  modalidad text not null check (modalidad in ('unico', 'semanal', 'mensual', 'trimestral', 'anual')),
  precio_centimos integer not null check (precio_centimos between 1 and 99999999),
  estado text not null default 'borrador' check (estado in ('borrador', 'retirada')),
  creado_en timestamptz not null default now(),
  retirada_en timestamptz,
  check ((estado = 'retirada') = (retirada_en is not null))
);

create index negocio_planes_profesional_idx on public.negocio_planes (profesional_id, activo);
create index negocio_propuestas_profesional_idx on public.negocio_propuestas (profesional_id, cliente_id);
create unique index negocio_propuesta_borrador_idx
  on public.negocio_propuestas (profesional_id, cliente_id, plan_id) where estado = 'borrador';
create trigger negocio_planes_actualizado_en before update on public.negocio_planes
  for each row execute function public.set_actualizado_en();

alter table public.negocio_planes enable row level security;
alter table public.negocio_propuestas enable row level security;
revoke all on public.negocio_planes, public.negocio_propuestas from public, anon, authenticated;
grant select on public.negocio_planes, public.negocio_propuestas to authenticated;
grant all on public.negocio_planes, public.negocio_propuestas to service_role;

create policy negocio_planes_propios on public.negocio_planes for select to authenticated
  using (profesional_id = public.profesional_actual_id());
create policy negocio_propuestas_propias on public.negocio_propuestas for select to authenticated
  using (profesional_id = public.profesional_actual_id() and public.es_profesional_salud_de(cliente_id));

create function public.negocio_guardar_plan(p_id uuid, p_nombre text, p_descripcion text, p_modalidad text, p_precio_centimos integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_id uuid;
begin
  if v_profesional is null then raise exception 'Se necesita un perfil profesional.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 120 then raise exception 'Escribe un nombre válido.'; end if;
  if length(p_descripcion) > 2000 then raise exception 'La descripción es demasiado larga.'; end if;
  if p_modalidad is null or p_modalidad not in ('unico', 'semanal', 'mensual', 'trimestral', 'anual') then
    raise exception 'Selecciona una modalidad válida.';
  end if;
  if p_precio_centimos is null or p_precio_centimos not between 1 and 99999999 then
    raise exception 'Introduce un importe válido mayor que cero.';
  end if;
  if p_id is null then
    insert into public.negocio_planes (profesional_id, nombre, descripcion, modalidad, precio_centimos)
      values (v_profesional, btrim(p_nombre), nullif(btrim(p_descripcion), ''), p_modalidad, p_precio_centimos)
      returning id into v_id;
  else
    update public.negocio_planes set nombre = btrim(p_nombre), descripcion = nullif(btrim(p_descripcion), ''),
      modalidad = p_modalidad, precio_centimos = p_precio_centimos
      where id = p_id and profesional_id = v_profesional and activo returning id into v_id;
    if v_id is null then raise exception 'Plan activo propio no encontrado.'; end if;
  end if;
  return v_id;
end;
$$;

create function public.negocio_archivar_plan(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.negocio_planes set activo = false
    where id = p_id and profesional_id = public.profesional_actual_id() and activo;
  if not found then raise exception 'Plan activo propio no encontrado.'; end if;
end;
$$;

create function public.negocio_clientes_disponibles()
returns table (id uuid, nombre text, apellidos text, email text)
language sql stable security definer set search_path = '' as $$
  select distinct c.id, c.nombre::text, c.apellidos::text, c.email::text
  from public.clientes c join public.profesional_cliente pc on pc.cliente_id = c.id
  where pc.profesional_id = public.profesional_actual_id()
    and pc.rol in ('entrenador', 'nutricionista') and c.estado = 'activo'
  order by 2, 3, 4;
$$;

create function public.negocio_crear_propuesta(p_plan uuid, p_cliente uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_plan public.negocio_planes%rowtype;
  v_id uuid;
begin
  if v_profesional is null or not coalesce(public.es_profesional_salud_de(p_cliente), false)
    or not exists (select 1 from public.clientes where id = p_cliente and estado = 'activo') then
    raise exception 'Solo puedes preparar propuestas para clientes activos asignados a ti.';
  end if;
  select * into v_plan from public.negocio_planes
    where id = p_plan and profesional_id = v_profesional and activo for share;
  if not found then raise exception 'Plan activo propio no encontrado.'; end if;
  if exists (select 1 from public.negocio_propuestas where profesional_id = v_profesional
    and cliente_id = p_cliente and plan_id = p_plan and estado = 'borrador') then
    raise exception 'Ya existe una propuesta borrador de este plan para este cliente.';
  end if;
  insert into public.negocio_propuestas (plan_id, profesional_id, cliente_id, nombre, descripcion, modalidad, precio_centimos)
    values (v_plan.id, v_profesional, p_cliente, v_plan.nombre, v_plan.descripcion, v_plan.modalidad, v_plan.precio_centimos)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.negocio_retirar_propuesta(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.negocio_propuestas set estado = 'retirada', retirada_en = now()
    where id = p_id and profesional_id = public.profesional_actual_id() and estado = 'borrador'
      and public.es_profesional_salud_de(cliente_id);
  if not found then raise exception 'Propuesta propia no encontrada o sin acceso al cliente.'; end if;
end;
$$;

revoke all on function public.negocio_guardar_plan(uuid, text, text, text, integer),
  public.negocio_archivar_plan(uuid), public.negocio_clientes_disponibles(),
  public.negocio_crear_propuesta(uuid, uuid), public.negocio_retirar_propuesta(uuid)
  from public, anon;
grant execute on function public.negocio_guardar_plan(uuid, text, text, text, integer),
  public.negocio_archivar_plan(uuid), public.negocio_clientes_disponibles(),
  public.negocio_crear_propuesta(uuid, uuid), public.negocio_retirar_propuesta(uuid)
  to authenticated;

commit;
