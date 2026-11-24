begin;

create function public.crear_aviso(p_tipo text,p_destino uuid,p_categoria text,p_titulo text,p_referencia text,p_cliente uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificaciones (destinatario_tipo,destinatario_id,tipo,titulo,referencia_id,cliente_id)
  select p_tipo,p_destino,p_categoria,p_titulo,p_referencia,p_cliente
  where (p_tipo='cliente' and exists (select 1 from public.clientes c where c.id=p_destino and c.auth_user_id is not null))
     or (p_tipo='profesional' and exists (select 1 from public.profesionales p where p.id=p_destino and p.auth_user_id is not null));
$$;
revoke all on function public.crear_aviso(text,uuid,text,text,text,uuid) from public,anon,authenticated;

create function public.aviso_chat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.chat_conversaciones%rowtype;
begin
  select * into c from public.chat_conversaciones where id=new.conversacion_id;
  if new.emisor_tipo='cliente' then
    perform public.crear_aviso('profesional',c.profesional_id,'chat','Tienes un mensaje nuevo.',c.id::text,c.cliente_id);
  else
    perform public.crear_aviso('cliente',c.cliente_id,'chat','Tienes un mensaje nuevo.',c.id::text,c.cliente_id);
  end if;
  return new;
end;
$$;
create trigger chat_nuevo_aviso after insert on public.chat_mensajes for each row execute function public.aviso_chat();

create function public.aviso_tarea()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then
    perform public.crear_aviso('profesional',old.profesional_id,'tarea','Has eliminado una tarea.',null,old.cliente_id);
    return old;
  elsif tg_op='INSERT' then
    perform public.crear_aviso('profesional',new.profesional_id,'tarea','Has creado una tarea.',new.id::text,new.cliente_id);
  elsif (new.titulo,new.descripcion,new.fecha_limite,new.completada,new.cliente_id)
        is distinct from (old.titulo,old.descripcion,old.fecha_limite,old.completada,old.cliente_id) then
    perform public.crear_aviso('profesional',new.profesional_id,'tarea','Has actualizado una tarea.',new.id::text,new.cliente_id);
  end if;
  return new;
end;
$$;
create trigger tarea_aviso after insert or update or delete on public.tareas_profesional for each row execute function public.aviso_tarea();

create function public.aviso_sesion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    perform public.crear_aviso('cliente',new.cliente_id,'agenda','Tienes una nueva cita.',new.id::text,new.cliente_id);
  elsif (new.cliente_id,new.titulo,new.tipo,new.inicio,new.fin,new.lugar,new.estado)
        is distinct from (old.cliente_id,old.titulo,old.tipo,old.inicio,old.fin,old.lugar,old.estado) then
    if old.cliente_id is distinct from new.cliente_id then
      perform public.crear_aviso('cliente',old.cliente_id,'agenda','Una cita ha dejado de estar asignada a ti.',null,old.cliente_id);
    end if;
    perform public.crear_aviso('cliente',new.cliente_id,'agenda',
      case when new.estado='cancelada' then 'Se ha cancelado una cita.' else 'Una cita se ha actualizado.' end,
      new.id::text,new.cliente_id);
  end if;
  return new;
end;
$$;
create trigger sesion_aviso after insert or update on public.sesiones for each row execute function public.aviso_sesion();

create function public.aviso_workout()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    perform public.crear_aviso('cliente',new.cliente_id,'entrenamiento','Tienes un entrenamiento asignado.',new.id::text,new.cliente_id);
    return new;
  elsif tg_op='DELETE' then
    perform public.crear_aviso('cliente',old.cliente_id,'entrenamiento','Se ha retirado un entrenamiento.',null,old.cliente_id);
    return old;
  elsif (new.fecha,new.nombre,new.descripcion,new.ejercicios)
        is distinct from (old.fecha,old.nombre,old.descripcion,old.ejercicios) then
    perform public.crear_aviso('cliente',new.cliente_id,'entrenamiento','Un entrenamiento se ha actualizado.',new.id::text,new.cliente_id);
  end if;
  return new;
end;
$$;
create trigger workout_aviso after insert or update or delete on public.clientes_workouts for each row execute function public.aviso_workout();

create function public.aviso_registro_workout()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_workout uuid; v_cliente uuid; v_profesional uuid;
begin
  if tg_op='DELETE' then v_workout:=old.workout_id; v_cliente:=old.cliente_id;
  else v_workout:=new.workout_id; v_cliente:=new.cliente_id; end if;
  select profesional_id into v_profesional from public.clientes_workouts where id=v_workout;
  if exists (select 1 from public.profesional_cliente pc where pc.cliente_id=v_cliente
    and pc.profesional_id=v_profesional and pc.rol in ('entrenador','nutricionista')) then
    perform public.crear_aviso('profesional',v_profesional,'entrenamiento',
      case when tg_op='INSERT' then 'Un cliente ha registrado un entrenamiento.' when tg_op='DELETE' then 'Un cliente ha eliminado un registro de entrenamiento.' else 'Un cliente ha actualizado un entrenamiento.' end,
      v_workout::text,v_cliente);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger registro_workout_aviso after insert or update or delete on public.clientes_workout_registros
  for each row execute function public.aviso_registro_workout();

create function public.aviso_comentario_workout()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.crear_aviso('cliente',new.cliente_id,'entrenamiento','Tienes un comentario en un entrenamiento.',new.workout_id::text,new.cliente_id);
  return new;
end;
$$;
create trigger comentario_workout_aviso after insert on public.clientes_workout_comentarios for each row execute function public.aviso_comentario_workout();

create function public.aviso_plan_nutricional()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then
    perform public.crear_aviso('cliente',old.cliente_id,'nutricion','Se ha retirado un plan nutricional.',null,old.cliente_id);
    return old;
  elsif tg_op='INSERT' then
    perform public.crear_aviso('cliente',new.cliente_id,'nutricion','Tienes un plan nutricional asignado.',new.id::text,new.cliente_id);
  elsif new.fin is distinct from old.fin then
    perform public.crear_aviso('cliente',new.cliente_id,'nutricion','Ha cambiado la vigencia de un plan nutricional.',new.id::text,new.cliente_id);
  end if;
  return new;
end;
$$;
create trigger plan_nutricional_aviso after insert or update or delete on public.clientes_planes_nutricionales for each row execute function public.aviso_plan_nutricional();

create function public.aviso_comentario_nutricion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.crear_aviso('cliente',new.cliente_id,'nutricion','Tienes un comentario en tu diario alimentario.',new.fecha::text,new.cliente_id);
  return new;
end;
$$;
create trigger comentario_nutricion_aviso after insert on public.clientes_nutricion_comentarios for each row execute function public.aviso_comentario_nutricion();

create function public.aviso_video_destinatario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_video uuid; v_cliente uuid; v_publicado boolean;
begin
  if tg_op='DELETE' then v_video:=old.video_id; v_cliente:=old.cliente_id;
  else v_video:=new.video_id; v_cliente:=new.cliente_id; end if;
  select publicado into v_publicado from public.biblioteca_videos where id=v_video;
  if v_publicado then
    perform public.crear_aviso('cliente',v_cliente,'video','Ha cambiado tu acceso a un vídeo. Revisa la biblioteca.',null,v_cliente);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger video_destinatario_aviso after insert or delete on public.video_destinatarios for each row execute function public.aviso_video_destinatario();

create function public.aviso_video()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  if tg_op='DELETE' then
    if old.publicado then
      for v in select cliente_id from public.video_destinatarios where video_id=old.id loop
        perform public.crear_aviso('cliente',v.cliente_id,'video','Ha cambiado tu acceso a un vídeo. Revisa la biblioteca.',null,v.cliente_id);
      end loop;
    end if;
    return old;
  end if;
  if (new.publicado is distinct from old.publicado) or
    (new.publicado and (new.titulo,new.descripcion,new.categoria,new.duracion_min,new.video_url)
      is distinct from (old.titulo,old.descripcion,old.categoria,old.duracion_min,old.video_url)) then
    for v in select cliente_id from public.video_destinatarios where video_id=new.id loop
      perform public.crear_aviso('cliente',v.cliente_id,'video','Ha cambiado tu acceso a un vídeo. Revisa la biblioteca.',null,v.cliente_id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger video_aviso_update after update on public.biblioteca_videos for each row execute function public.aviso_video();
create trigger video_aviso_delete before delete on public.biblioteca_videos for each row execute function public.aviso_video();

revoke all on function public.aviso_chat(),public.aviso_tarea(),public.aviso_sesion(),public.aviso_workout(),
  public.aviso_registro_workout(),public.aviso_comentario_workout(),public.aviso_plan_nutricional(),
  public.aviso_comentario_nutricion(),public.aviso_video_destinatario(),public.aviso_video() from public,anon,authenticated;

commit;
