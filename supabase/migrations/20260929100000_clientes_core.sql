begin;

create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombre varchar(100) not null,
  apellidos varchar(150),
  email varchar(254) not null,
  rol text not null check (rol in ('administrador', 'entrenador', 'nutricionista', 'colaborador')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index profesionales_email_normalizado_uidx
  on public.profesionales (lower(btrim(email)));

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nombre varchar(100) not null,
  apellidos varchar(150),
  nombre_avatar varchar(40),
  email varchar(254) not null,
  telefono varchar(30),
  foto_url text,
  fecha_nacimiento date check (fecha_nacimiento is null or fecha_nacimiento <= current_date),
  genero text check (genero is null or genero in ('no_especificado', 'hombre', 'mujer')),
  estado text not null default 'invitacion_enviada'
    check (estado in ('lead', 'invitacion_enviada', 'activo', 'archivado')),
  fecha_alta timestamptz not null default now(),
  fecha_activacion timestamptz,
  ultima_actividad timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index clientes_email_normalizado_uidx
  on public.clientes (lower(btrim(email)));

create table public.profesional_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  rol text not null check (rol in ('entrenador', 'nutricionista', 'recepcion')),
  fecha_asignacion timestamptz not null default now(),
  unique (cliente_id, profesional_id, rol)
);

create index profesional_cliente_profesional_idx
  on public.profesional_cliente (profesional_id, cliente_id);

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  token_hash char(64) not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_destino varchar(254) not null,
  canal text not null default 'email' check (canal = 'email'),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'aceptada', 'expirada', 'cancelada', 'fallida')),
  fecha_envio timestamptz,
  fecha_expiracion timestamptz not null,
  fecha_aceptacion timestamptz,
  creado_en timestamptz not null default now(),
  check (fecha_expiracion > creado_en),
  check ((estado <> 'aceptada') or fecha_aceptacion is not null)
);

create unique index invitaciones_una_vigente_por_cliente_uidx
  on public.invitaciones (cliente_id)
  where estado in ('pendiente', 'enviada');

create index invitaciones_profesional_estado_idx
  on public.invitaciones (profesional_id, estado, creado_en desc);

create table public.clientes_objetivo (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  objetivo_tipo text not null
    check (objetivo_tipo in ('perder_peso', 'ponerme_en_forma', 'ganar_musculo')),
  altura_cm numeric(5, 2) not null check (altura_cm > 0),
  peso_objetivo_kg numeric(5, 2) check (peso_objetivo_kg is null or peso_objetivo_kg > 0),
  notas_objetivo text,
  notas_lesiones text
);

create table public.clientes_salud_parq (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  enfermedad_cardiaca_supervisada boolean not null,
  dolor_pecho_actividad boolean not null,
  dolor_pecho_reposo boolean not null,
  perdida_consciencia_mareo boolean not null,
  alteracion_osea_articular boolean not null,
  medicacion_presion_arterial boolean not null,
  otra_razon_medica boolean not null,
  fecha_cumplimentado timestamptz not null default now()
);

create table public.clientes_metricas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha timestamptz not null default now(),
  peso_kg numeric(6, 2) check (peso_kg is null or peso_kg > 0),
  grasa_corporal_pct numeric(5, 2) check (grasa_corporal_pct is null or grasa_corporal_pct between 0 and 100),
  pecho_cm numeric(6, 2) check (pecho_cm is null or pecho_cm > 0),
  cuello_cm numeric(6, 2) check (cuello_cm is null or cuello_cm > 0),
  hombros_cm numeric(6, 2) check (hombros_cm is null or hombros_cm > 0),
  biceps_izq_cm numeric(6, 2) check (biceps_izq_cm is null or biceps_izq_cm > 0),
  biceps_der_cm numeric(6, 2) check (biceps_der_cm is null or biceps_der_cm > 0),
  antebrazo_izq_cm numeric(6, 2) check (antebrazo_izq_cm is null or antebrazo_izq_cm > 0),
  antebrazo_der_cm numeric(6, 2) check (antebrazo_der_cm is null or antebrazo_der_cm > 0),
  cintura_cm numeric(6, 2) check (cintura_cm is null or cintura_cm > 0),
  cadera_cm numeric(6, 2) check (cadera_cm is null or cadera_cm > 0),
  muslo_izq_cm numeric(6, 2) check (muslo_izq_cm is null or muslo_izq_cm > 0),
  muslo_der_cm numeric(6, 2) check (muslo_der_cm is null or muslo_der_cm > 0),
  gemelo_izq_cm numeric(6, 2) check (gemelo_izq_cm is null or gemelo_izq_cm > 0),
  gemelo_der_cm numeric(6, 2) check (gemelo_der_cm is null or gemelo_der_cm > 0),
  origen text not null check (origen in ('cliente', 'profesional')),
  creado_en timestamptz not null default now()
);

create index clientes_metricas_cliente_fecha_idx
  on public.clientes_metricas (cliente_id, fecha desc);

create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('terminos', 'privacidad', 'salud')),
  version_documento varchar(40) not null,
  fecha_aceptacion timestamptz not null default now(),
  ip inet,
  unique (cliente_id, tipo, version_documento)
);

create table public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(50) not null,
  creado_en timestamptz not null default now()
);

create unique index etiquetas_nombre_normalizado_uidx
  on public.etiquetas (lower(btrim(nombre)));

create table public.cliente_etiqueta (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  primary key (cliente_id, etiqueta_id)
);

create or replace function public.can_access_client(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.auth_user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.profesional_cliente pc
    join public.profesionales p on p.id = pc.profesional_id
    where pc.cliente_id = p_cliente_id
      and p.auth_user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_client_health(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.auth_user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.profesional_cliente pc
    join public.profesionales p on p.id = pc.profesional_id
    where pc.cliente_id = p_cliente_id
      and p.auth_user_id = (select auth.uid())
      and pc.rol in ('entrenador', 'nutricionista')
  );
$$;

create or replace function public.can_access_professional(p_profesional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profesionales p
    where p.id = p_profesional_id
      and p.auth_user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.profesional_cliente pc
    join public.clientes c on c.id = pc.cliente_id
    where pc.profesional_id = p_profesional_id
      and c.auth_user_id = (select auth.uid())
  );
$$;

revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.can_access_client_health(uuid) from public;
revoke all on function public.can_access_professional(uuid) from public;
grant execute on function public.can_access_client(uuid) to authenticated;
grant execute on function public.can_access_client_health(uuid) to authenticated;
grant execute on function public.can_access_professional(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profesionales',
    'clientes',
    'profesional_cliente',
    'invitaciones',
    'clientes_objetivo',
    'clientes_salud_parq',
    'clientes_metricas',
    'consentimientos',
    'etiquetas',
    'cliente_etiqueta'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

create policy profesionales_select_related
  on public.profesionales for select to authenticated
  using (public.can_access_professional(id));

create policy clientes_select_related
  on public.clientes for select to authenticated
  using (public.can_access_client(id));

create policy profesional_cliente_select_related
  on public.profesional_cliente for select to authenticated
  using (public.can_access_client(cliente_id));

create policy clientes_objetivo_select_related
  on public.clientes_objetivo for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_salud_parq_select_authorized
  on public.clientes_salud_parq for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_metricas_select_related
  on public.clientes_metricas for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy consentimientos_select_related
  on public.consentimientos for select to authenticated
  using (public.can_access_client(cliente_id));

create policy etiquetas_select_authenticated
  on public.etiquetas for select to authenticated
  using (true);

create policy cliente_etiqueta_select_related
  on public.cliente_etiqueta for select to authenticated
  using (public.can_access_client(cliente_id));

create trigger profesionales_set_actualizado_en
  before update on public.profesionales
  for each row execute function public.set_actualizado_en();

create trigger clientes_set_actualizado_en
  before update on public.clientes
  for each row execute function public.set_actualizado_en();

commit;
