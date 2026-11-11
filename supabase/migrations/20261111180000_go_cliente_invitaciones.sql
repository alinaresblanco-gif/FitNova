begin;

-- =====================================================================
-- Ciclo del cliente en FitNova Go: permisos de escritura propios + ciclo
-- de vida de invitaciones en Manager (expirar / cancelar).
-- =====================================================================

-- Devuelve el id de clientes.id ligado al usuario autenticado actual, o null.
create or replace function public.cliente_actual_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.clientes c
  where c.auth_user_id = (select auth.uid());
$$;

revoke all on function public.cliente_actual_id() from public;
grant execute on function public.cliente_actual_id() to authenticated;

-- ---------------------------------------------------------------------
-- 1. El cliente puede actualizar su propia ficha (columnas limitadas).
--    Nunca puede tocar estado, email ni auth_user_id (no están en el grant).
-- ---------------------------------------------------------------------
grant update (nombre, apellidos, nombre_avatar, telefono, fecha_nacimiento, genero, foto_url, ultima_actividad)
  on public.clientes to authenticated;

create policy clientes_update_own
  on public.clientes for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. El cliente puede actualizar su objetivo ("Sobre mí" en Go).
-- ---------------------------------------------------------------------
grant update (altura_cm, peso_objetivo_kg, notas_objetivo, notas_lesiones)
  on public.clientes_objetivo to authenticated;

create policy clientes_objetivo_update_own
  on public.clientes_objetivo for update to authenticated
  using (cliente_id = public.cliente_actual_id())
  with check (cliente_id = public.cliente_actual_id());

-- ---------------------------------------------------------------------
-- 3. El cliente puede registrar y borrar SUS propias métricas (origen cliente).
--    Las métricas registradas por el profesional no se pueden borrar desde Go.
-- ---------------------------------------------------------------------
grant insert, delete on public.clientes_metricas to authenticated;

create policy clientes_metricas_insert_own
  on public.clientes_metricas for insert to authenticated
  with check (
    cliente_id = public.cliente_actual_id()
    and origen = 'cliente'
  );

create policy clientes_metricas_delete_own
  on public.clientes_metricas for delete to authenticated
  using (
    cliente_id = public.cliente_actual_id()
    and origen = 'cliente'
  );

-- ---------------------------------------------------------------------
-- 4. Marca como expiradas las invitaciones vencidas.
--    La llama Manager al cargar la vista de Clientes.
-- ---------------------------------------------------------------------
create or replace function public.expirar_invitaciones_vencidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.profesional_actual_id() is null then
    raise exception 'No autorizado: el usuario actual no es un profesional registrado';
  end if;

  update public.invitaciones
    set estado = 'expirada'
    where estado in ('pendiente', 'enviada')
      and fecha_expiracion <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expirar_invitaciones_vencidas() from public;
grant execute on function public.expirar_invitaciones_vencidas() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Cancela una invitación enviada por el profesional actual.
--    Si el cliente estaba en "invitacion_enviada", vuelve a "lead".
-- ---------------------------------------------------------------------
create or replace function public.cancelar_invitacion(p_invitacion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_cliente_id uuid;
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: el usuario actual no es un profesional registrado';
  end if;

  update public.invitaciones i
    set estado = 'cancelada'
    where i.id = p_invitacion_id
      and i.profesional_id = v_profesional_id
      and i.estado in ('pendiente', 'enviada', 'expirada')
    returning i.cliente_id into v_cliente_id;

  if v_cliente_id is null then
    raise exception 'Invitación no encontrada o ya resuelta';
  end if;

  update public.clientes c
    set estado = 'lead', actualizado_en = now()
    where c.id = v_cliente_id
      and c.estado = 'invitacion_enviada';
end;
$$;

revoke all on function public.cancelar_invitacion(uuid) from public;
grant execute on function public.cancelar_invitacion(uuid) to authenticated;

commit;
