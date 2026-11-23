begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.sesiones (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  titulo varchar(150) not null check (length(btrim(titulo)) > 0),
  tipo text not null check (tipo in ('entrenamiento_personal', 'seguimiento')),
  inicio timestamptz not null check (isfinite(inicio)),
  fin timestamptz not null check (isfinite(fin) and fin > inicio),
  lugar varchar(500),
  estado text not null default 'programada'
    check (estado in ('programada', 'cancelada', 'completada')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sesiones_profesional_sin_solapamiento exclude using gist
    (profesional_id with =, tstzrange(inicio, fin, '[)') with &&)
    where (estado = 'programada'),
  constraint sesiones_cliente_sin_solapamiento exclude using gist
    (cliente_id with =, tstzrange(inicio, fin, '[)') with &&)
    where (estado = 'programada')
);

create index sesiones_cliente_inicio_idx on public.sesiones (cliente_id, inicio);
create index sesiones_profesional_inicio_idx on public.sesiones (profesional_id, inicio);
create trigger sesiones_actualizado_en before update on public.sesiones
  for each row execute function public.set_actualizado_en();

alter table public.sesiones enable row level security;
grant select on public.sesiones to authenticated;
grant all on public.sesiones to service_role;

create policy sesiones_select_related on public.sesiones
  for select to authenticated using (
    cliente_id = public.cliente_actual_id()
    or (
      profesional_id = public.profesional_actual_id()
      and exists (
        select 1 from public.profesional_cliente pc
        where pc.profesional_id = sesiones.profesional_id
          and pc.cliente_id = sesiones.cliente_id
      )
    )
  );

-- La escritura solo pasa por RPC: nadie puede cambiar el propietario ni el estado directamente.
create function public.guardar_sesion(
  p_cliente_id uuid,
  p_titulo text,
  p_tipo text,
  p_inicio timestamptz,
  p_fin timestamptz,
  p_lugar text default null,
  p_sesion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_id uuid;
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: se necesita un perfil profesional';
  end if;
  if not exists (
    select 1 from public.clientes c
    join public.profesional_cliente pc on pc.cliente_id = c.id
    where c.id = p_cliente_id and c.estado = 'activo'
      and pc.profesional_id = v_profesional_id
  ) then
    raise exception 'Selecciona un cliente activo de tu cartera';
  end if;
  if p_titulo is null or length(btrim(p_titulo)) not between 1 and 150
    or p_tipo is null or p_tipo not in ('entrenamiento_personal', 'seguimiento')
    or p_inicio is null or p_fin is null
    or not isfinite(p_inicio) or not isfinite(p_fin) or p_fin <= p_inicio
    or length(p_lugar) > 500 then
    raise exception 'Revisa título, tipo, horario, duración y lugar de la sesión';
  end if;

  if p_sesion_id is null then
    insert into public.sesiones (profesional_id, cliente_id, titulo, tipo, inicio, fin, lugar)
    values (v_profesional_id, p_cliente_id, btrim(p_titulo), p_tipo, p_inicio, p_fin, nullif(btrim(p_lugar), ''))
    returning id into v_id;
  else
    update public.sesiones
    set cliente_id = p_cliente_id, titulo = btrim(p_titulo), tipo = p_tipo,
      inicio = p_inicio, fin = p_fin, lugar = nullif(btrim(p_lugar), '')
    where id = p_sesion_id and profesional_id = v_profesional_id
      and estado = 'programada'
      and exists (
        select 1 from public.profesional_cliente pc
        where pc.profesional_id = v_profesional_id and pc.cliente_id = sesiones.cliente_id
      )
    returning id into v_id;
    if v_id is null then
      raise exception 'Sesión no disponible para editar: comprueba permisos y estado';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.cambiar_estado_sesion(p_sesion_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_sesion public.sesiones%rowtype;
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: se necesita un perfil profesional';
  end if;
  if p_estado is null or p_estado not in ('cancelada', 'completada') then
    raise exception 'Estado de sesión no válido';
  end if;
  select s.* into v_sesion from public.sesiones s
  where s.id = p_sesion_id and s.profesional_id = v_profesional_id
    and exists (
      select 1 from public.profesional_cliente pc
      where pc.profesional_id = v_profesional_id and pc.cliente_id = s.cliente_id
    )
  for update;
  if not found or v_sesion.estado <> 'programada' then
    raise exception 'Sesión no disponible: comprueba permisos y estado';
  end if;
  if p_estado = 'completada' and v_sesion.fin > now() then
    raise exception 'Solo puedes completar una sesión cuyo horario ya ha terminado';
  end if;
  update public.sesiones set estado = p_estado where id = v_sesion.id;
end;
$$;

revoke all on function public.guardar_sesion(uuid, text, text, timestamptz, timestamptz, text, uuid) from public;
revoke all on function public.cambiar_estado_sesion(uuid, text) from public;
grant execute on function public.guardar_sesion(uuid, text, text, timestamptz, timestamptz, text, uuid) to authenticated;
grant execute on function public.cambiar_estado_sesion(uuid, text) to authenticated;

commit;
