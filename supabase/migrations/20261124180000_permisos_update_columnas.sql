begin;

-- =====================================================================
-- Supabase concede por defecto UPDATE de tabla completa a anon y
-- authenticated, así que los "grant update (columnas)" anteriores no
-- limitaban nada: un cliente podía cambiar, por ejemplo, su estado,
-- email o auth_user_id, o el origen y las calorías de una actividad
-- importada. Se quita el UPDATE de tabla y se vuelve a conceder solo
-- por columnas (revocar el de tabla también revoca los de columna).
-- =====================================================================

revoke update on public.clientes, public.clientes_objetivo,
  public.clientes_metricas, public.clientes_actividades from anon, authenticated;

grant update (nombre, apellidos, nombre_avatar, telefono, fecha_nacimiento, genero, foto_url, ultima_actividad)
  on public.clientes to authenticated;

grant update (altura_cm, peso_objetivo_kg, notas_objetivo, notas_lesiones)
  on public.clientes_objetivo to authenticated;

grant update (
  fecha, peso_kg, grasa_corporal_pct, pecho_cm, cuello_cm, hombros_cm,
  biceps_izq_cm, biceps_der_cm, antebrazo_izq_cm, antebrazo_der_cm,
  cintura_cm, cadera_cm, muslo_izq_cm, muslo_der_cm, gemelo_izq_cm, gemelo_der_cm
) on public.clientes_metricas to authenticated;

-- origen, inicio y calorias_kcal (datos del reloj) no son editables.
grant update (nombre, fecha, duracion_min, distancia_km, comentario, foto_ruta)
  on public.clientes_actividades to authenticated;

commit;
