begin;

-- =====================================================================
-- Diario alimentario (etapa 1 de Nutrición).
--   - clientes_comidas: lo que come el cliente (tipo de comida, alimentos
--     en texto, cómo se ha sentido y foto opcional). El cliente crea,
--     edita y borra las suyas; sus profesionales asignados solo leen.
--   - clientes_agua: vasos de agua por día. Solo se escribe con la RPC
--     guardar_agua (el cliente actual, de 0 a 40 vasos).
--   - clientes_nutricion_comentarios: comentarios del entrenador o
--     nutricionista asignado sobre un día del diario. El autor (nombre y
--     rol) lo rellena un trigger, no el navegador.
-- Fotos: bucket privado progreso-fotos, ruta <cliente_id>/comidas/<uuid>.jpg.
-- Supabase concede ALL por defecto a anon/authenticated en tablas nuevas:
-- se revoca y se concede solo lo necesario.
-- =====================================================================

create table public.clientes_comidas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null check (fecha >= date '2000-01-01'),
  comida varchar(20) not null
    check (comida in ('desayuno', 'media_manana', 'comida', 'merienda', 'cena', 'snack', 'otro')),
  alimentos varchar(1000) not null check (length(btrim(alimentos)) > 0),
  sensacion varchar(10) check (sensacion in ('muy_bien', 'bien', 'regular', 'mal')),
  foto_ruta text unique check (
    foto_ruta is null
    or (public.cliente_de_ruta_foto(foto_ruta) = cliente_id and split_part(foto_ruta, '/', 2) = 'comidas')
  ),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index clientes_comidas_cliente_fecha_idx
  on public.clientes_comidas (cliente_id, fecha desc, creado_en);

create trigger clientes_comidas_actualizado_en before update on public.clientes_comidas
  for each row execute function public.set_actualizado_en();

alter table public.clientes_comidas enable row level security;
revoke all on public.clientes_comidas from anon, authenticated;
grant select, insert, delete on public.clientes_comidas to authenticated;
grant update (fecha, comida, alimentos, sensacion, foto_ruta) on public.clientes_comidas to authenticated;
grant all on public.clientes_comidas to service_role;

create policy clientes_comidas_select_related
  on public.clientes_comidas for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_comidas_insert_own
  on public.clientes_comidas for insert to authenticated
  with check (cliente_id = public.cliente_actual_id());

create policy clientes_comidas_update_own
  on public.clientes_comidas for update to authenticated
  using (cliente_id = public.cliente_actual_id())
  with check (cliente_id = public.cliente_actual_id());

create policy clientes_comidas_delete_own
  on public.clientes_comidas for delete to authenticated
  using (cliente_id = public.cliente_actual_id());

-- ---------------------------------------------------------------------
create table public.clientes_agua (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null check (fecha >= date '2000-01-01'),
  vasos smallint not null check (vasos between 0 and 40),
  actualizado_en timestamptz not null default now(),
  primary key (cliente_id, fecha)
);

alter table public.clientes_agua enable row level security;
revoke all on public.clientes_agua from anon, authenticated;
grant select on public.clientes_agua to authenticated;
grant all on public.clientes_agua to service_role;

create policy clientes_agua_select_related
  on public.clientes_agua for select to authenticated
  using (public.can_access_client_health(cliente_id));

create or replace function public.guardar_agua(p_fecha date, p_vasos integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_actual_id();
begin
  if v_cliente is null then
    raise exception 'No hay un cliente vinculado a esta cuenta.';
  end if;
  if p_vasos is null or p_vasos < 0 or p_vasos > 40 then
    raise exception 'El número de vasos debe estar entre 0 y 40.';
  end if;
  if p_fecha is null or p_fecha < date '2000-01-01' or p_fecha > current_date + 1 then
    raise exception 'La fecha no es válida.';
  end if;
  insert into public.clientes_agua (cliente_id, fecha, vasos)
  values (v_cliente, p_fecha, p_vasos)
  on conflict (cliente_id, fecha) do update
    set vasos = excluded.vasos, actualizado_en = now();
end;
$$;

revoke all on function public.guardar_agua(date, integer) from public;
grant execute on function public.guardar_agua(date, integer) to authenticated;

-- ---------------------------------------------------------------------
create table public.clientes_nutricion_comentarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null check (fecha >= date '2000-01-01'),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  autor_nombre varchar(260),
  autor_rol text,
  texto varchar(1000) not null check (length(btrim(texto)) > 0),
  creado_en timestamptz not null default now()
);

create index clientes_nutricion_comentarios_cliente_fecha_idx
  on public.clientes_nutricion_comentarios (cliente_id, fecha desc, creado_en);

create or replace function public.nutricion_comentario_autor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select btrim(p.nombre || ' ' || coalesce(p.apellidos, ''))
    into new.autor_nombre
    from public.profesionales p
    where p.id = new.profesional_id;
  select pc.rol
    into new.autor_rol
    from public.profesional_cliente pc
    where pc.cliente_id = new.cliente_id
      and pc.profesional_id = new.profesional_id
      and pc.rol in ('entrenador', 'nutricionista')
    order by (pc.rol = 'nutricionista') desc
    limit 1;
  new.creado_en := now();
  return new;
end;
$$;

revoke all on function public.nutricion_comentario_autor() from public;

create trigger clientes_nutricion_comentarios_autor before insert on public.clientes_nutricion_comentarios
  for each row execute function public.nutricion_comentario_autor();

alter table public.clientes_nutricion_comentarios enable row level security;
revoke all on public.clientes_nutricion_comentarios from anon, authenticated;
grant select, delete on public.clientes_nutricion_comentarios to authenticated;
grant insert (cliente_id, fecha, profesional_id, texto) on public.clientes_nutricion_comentarios to authenticated;
grant all on public.clientes_nutricion_comentarios to service_role;

create policy clientes_nutricion_comentarios_select_related
  on public.clientes_nutricion_comentarios for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_nutricion_comentarios_insert_profesional
  on public.clientes_nutricion_comentarios for insert to authenticated
  with check (
    profesional_id = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
  );

create policy clientes_nutricion_comentarios_delete_own
  on public.clientes_nutricion_comentarios for delete to authenticated
  using (profesional_id = public.profesional_actual_id());

commit;
