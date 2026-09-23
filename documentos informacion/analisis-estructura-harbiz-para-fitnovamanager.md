# Analisis estructural de Harbiz
## Referencia funcional para FitNovaManager

**Fecha del analisis:** 23 de septiembre de 2026  
**Aplicacion analizada:** Harbiz, plataforma para profesionales del wellness  
**URL principal:** https://app.harbiz.io/home-profesional  
**Cuenta visible durante el analisis:** entorno de demostracion `blancogo`

---

## 1. Alcance y criterio de lectura

Este documento recoge la estructura funcional visible en la sesion autenticada del navegador y la organiza como referencia de producto para FitNovaManager.

Se distinguen tres niveles:

- **Observado:** elementos y comportamientos que se han visto directamente en la interfaz.
- **Inferido:** relaciones razonables a partir de rutas, etiquetas, enlaces y nombres de acciones.
- **Pendiente:** modulos o configuraciones que requieren abrir mas vistas para confirmarse.

El objetivo no es copiar la marca ni el contenido comercial de Harbiz. El objetivo es entender su arquitectura de producto, sus flujos y la forma en que agrupa la operativa de un profesional del fitness.

---

## 2. Modelo general del producto

Harbiz se presenta como un backoffice para profesionales del entrenamiento y el wellness. El profesional gestiona desde un mismo entorno:

- Clientes.
- Entrenamientos individuales y grupales.
- Programas.
- Nutricion y recetas.
- Videos y archivos.
- Formularios y feedback.
- Agenda y citas.
- Mensajeria.
- Cumplimiento de clientes.
- Suscripciones y pagos.
- Colaboradores.
- Ayuda y soporte.

La aplicacion combina dos tipos de experiencia:

1. **Centro de operaciones:** dashboard con informacion resumida y accesos directos.
2. **Herramientas de gestion:** listados, calendarios, editores, perfiles y planificaciones.

La navegacion intenta que las tareas frecuentes se puedan ejecutar desde el inicio sin recorrer varios menus.

---

## 3. Mapa de rutas observado

| Ruta | Vista | Estado |
|---|---|---|
| `/login` | Inicio de sesion | Observada antes de compartir la sesion autenticada |
| `/home-profesional` | Dashboard profesional | Observada |
| `/chat` | Mensajeria | Observada |
| `/clientes/listado?from=dashboardProfessional` | Listado de clientes | Observada |
| `/clientes/{id}/planificacion` | Planificacion de cliente | Enlace observado; vista pendiente de lectura completa |
| `/recuperar-contrasena` | Recuperacion de contrasena | Enlace observado en login |

Las rutas adicionales de workouts, programas, nutricion, agenda, videos, formularios, pagos y configuracion aparecen como funciones o accesos del dashboard, pero sus URLs exactas deben validarse recorriendo cada accion.

---

## 4. Vista de inicio de sesion

### Objetivo
Permitir el acceso del profesional a la plataforma.

### Elementos observados

- Titulo: `Inicia sesion`.
- Campo `Tu email`.
- Campo `Contrasena`.
- Control para mostrar u ocultar la contrasena.
- Boton `Inicia sesion`.
- Enlace `No recuerdas tu contrasena? Recuperala aqui`.
- Boton `Registrate`.
- Texto comercial: no necesita tarjeta de credito.
- Selector de idioma en espanol.

### Comportamiento

- Al solicitar `/home-profesional` sin sesion valida, la aplicacion redirige a `/login`.
- La pantalla esta centrada en una sola tarea y no muestra navegacion de producto.

### Aplicacion para FitNovaManager

- Mantener un login simple.
- Separar autenticacion de la experiencia operativa.
- Incluir recuperacion de contrasena.
- Preparar desde el principio roles de administrador, entrenador, nutricionista y colaborador.

---

## 5. Dashboard profesional

### 5.1 Cabecera y navegacion global

La cabecera observada contiene:

- Identificador o avatar del profesional, visible como `B` en la cuenta demo.
- Controles iconograficos para acceder a modulos globales.
- Acceso al chat.
- Acceso a ayuda.
- Widget flotante de soporte Intercom.

La navegacion utiliza muchos iconos sin texto permanente. El significado se descubre mediante el contexto o los tooltips. Para FitNovaManager conviene conservar la rapidez, pero acompanarla con tooltips y un modo expandido con etiquetas.

### 5.2 Mensaje de bienvenida

El dashboard muestra un mensaje de orientacion:

- `Es hora de recuperar tu tiempo.`
- `Toma el control!`

Sirve como encabezado emocional y da paso a las acciones principales.

### 5.3 Accesos rapidos

Existe un bloque titulado `Accesos rapidos` con boton `Configurar accesos rapidos`.

Las acciones visibles son:

| Accion | Descripcion asociada |
|---|---|
| Crea con IA tu Workout | Entrenamientos + rapido |
| Crea con IA tu Programa | Programas + rapido |
| Anade un Cliente | Nuevo cliente al instante |
| Crea con IA un Plan Nutri | Tu asistente de nutricion |
| Crea con IA una Receta | Tu asistente de nutricion |
| Crea tus Workouts | Guia sus entrenamientos |
| Crea tu Programa | Multiplica tu tiempo x4 |
| Crea un Plan Nutri | Trabaja en su nutricion |
| Asigna Cardio | Encuentra el adecuado |
| Comparte Archivos | Marca la diferencia |
| Prepara Formularios | Mejora con feedback |
| Agenda una Sesion | Gestiona tu tiempo |
| Registra tus Recetas | Aprovecha tu contenido |
| Anota tus Citas | Sesiones individuales |
| Sube tus videos | Carga tu contenido |

### Patron funcional

- Cada acceso rapido representa una tarea de negocio, no una pagina generica.
- Hay acciones normales y acciones asistidas por IA.
- El usuario puede personalizar los accesos visibles.
- Las acciones de alta frecuencia se colocan en la primera pantalla.

### Aplicacion para FitNovaManager

Crear accesos configurables para:

- Nuevo cliente.
- Nueva sesion.
- Nuevo entrenamiento.
- Nuevo plan.
- Registrar medicion.
- Enviar mensaje.
- Subir documento.
- Revisar tareas pendientes.

---

## 6. Bloques informativos del dashboard

### 6.1 Tarjetas de valor y onboarding

Se observan tarjetas rotatorias con mensajes comerciales y de activacion:

- `Gana tiempo`: mas de dos dias ahorrados por semana.
- `Gana clientes`: profesionales que han escalado su negocio.
- `Gana mas`: periodo de prueba y automatizacion de la gestion.

Cada tarjeta incluye:

- Icono o ilustracion.
- Titulo corto.
- Dato destacado.
- Explicacion breve.
- Boton de cierre.

Hay indicadores para cambiar de tarjeta manualmente.

**Lectura para FitNovaManager:** este tipo de bloque puede servir para onboarding, pero no debe ocupar demasiado espacio en un entorno operativo. En FitNovaManager seria preferible usarlo para avisos de progreso, tareas pendientes o recomendaciones utiles.

### 6.2 Carrusel promocional

El dashboard incluye carruseles con contenido como:

- Sesion gratuita de configuracion.
- Activacion de plan.
- Plantillas listas para empezar.
- Ofertas de partners.
- Funciones nuevas de nutricion e IA.

El carrusel funciona como bloque clicable con imagen, titulo y subtitulo.

### 6.3 Actividad reciente

Bloque titulado `Actividad reciente` con contador.

Elementos observados:

- Buscador o accion `Buscar...`.
- Boton `Filtrar actividad`.
- Estado vacio cuando no existen registros.
- Mensaje orientativo: asignar tareas y observar los primeros pasos de los clientes.
- Boton `Ver mis clientes`.

**Estados que FitNovaManager deberia contemplar:**

- Sin actividad.
- Actividad reciente.
- Resultado filtrado vacio.
- Error de carga.
- Carga en progreso.

### 6.4 Agendar tareas

Bloque titulado `Agendar tareas` con contador.

Cuando no hay tareas planificadas muestra un estado positivo indicando que el profesional va por buen camino.

Esto representa un sistema de tareas ligado a clientes y fechas. Debe diferenciarse de una simple agenda de citas.

### 6.5 Proximos eventos

Bloque titulado `Proximos eventos` con contador.

Incluye un selector de modo:

- Vista calendario.
- Vista lista, seleccionada durante el analisis.

Los eventos se agrupan por horizonte temporal:

- `Esta semana`.
- `La semana que viene`.
- `Mas adelante`.

Cada evento muestra:

- Nombre de la sesion.
- Fecha relativa o fecha exacta.
- Hora de inicio y fin.
- Tipo de servicio, por ejemplo `Entrenamiento personal`.
- Numero de participantes o plazas, por ejemplo `2/24` o `2/8`.
- Iconos contextuales.

Ejemplos observados:

- `Sesion tren inferior`.
- `Sesion inicial grupal`.

Incluye boton `Ver lista de eventos completa`.

**Aplicacion para FitNovaManager:** separar visualmente:

- Citas individuales.
- Clases grupales.
- Tareas internas.
- Entregas o revisiones de planes.
- Recordatorios de seguimiento.

### 6.6 Revisar cumplimiento

Bloque titulado `Revisar cumplimiento` con contador.

Incluye clientes que necesitan revision y muestra:

- Nombre del cliente.
- Enlace a su planificacion.
- Porcentaje o indicador de cumplimiento de distintos periodos.

Ejemplos observados:

- Cliente con cumplimiento mensual `0%` y semanal `0%`.
- Cliente con cumplimiento mensual `11%` y semanal `20%`.

El objetivo es detectar rapidamente a quien necesita una intervencion del profesional.

### 6.7 Suscripciones

Bloque titulado `Suscripciones`.

El estado vacio o promocional anima a activar los pagos integrados. El mensaje propone automatizar el cobro y seguir la evolucion del negocio.

Accion visible:

- `Activa Pagos Harbiz gratis`.

Para FitNovaManager este modulo puede incluir:

- Estado de suscripcion del cliente.
- Proximo cobro.
- Pagos pendientes.
- Historial.
- Paquetes o membresias.
- Alertas de impago.

---

## 7. Vista de mensajeria

**Ruta:** `/chat`

### 7.1 Selector de audiencia

La vista permite cambiar entre:

- `Clientes`.
- `Colaboradores`.

### 7.2 Filtro de asignacion

Checkbox activo:

- `Ver solo mis clientes asignados`.

Esto indica que el producto contempla equipos con varios profesionales y asignacion de cartera.

### 7.3 Acciones

- `Mensaje masivo`.
- Buscador `Buscar por nombre`.
- Indicador `Tienes 0 chats sin leer`.

### 7.4 Lista de conversaciones

Cada fila contiene:

- Iniciales o avatar.
- Nombre del contacto.
- Fecha del ultimo mensaje.
- Extracto del mensaje.
- Estado de lectura implicito por el contador general.

Mensajes observados en la demo:

- Solicitudes para cambiar un entrenamiento de dia.
- Comunicacion relacionada con la planificacion semanal.

### 7.5 Funciones que conviene replicar

- Mensajeria 1 a 1.
- Mensajes masivos segmentados.
- Filtro por profesional asignado.
- Busqueda de conversaciones.
- Indicador de no leidos.
- Enlace desde el mensaje hacia el cliente y su planificacion.

### 7.6 Funciones pendientes de validar

- Adjuntos.
- Notas de voz.
- Plantillas de mensaje.
- Programacion de mensajes.
- Historial completo.
- Conversacion de grupo.
- Notificaciones push.

---

## 8. Vista de clientes

**Ruta:** `/clientes/listado?from=dashboardProfessional`

### 8.1 Encabezado

- Breadcrumb o contexto `Clientes / Mis clientes`.
- Titulo `Mis clientes`.
- Accion iconografica en el encabezado.

### 8.2 Pestañas de estado

Se observan cuatro pestañas:

| Pestana | Funcion | Contador observado |
|---|---|---:|
| Activos | Clientes en cartera activa | 2 |
| Invitaciones enviadas | Invitaciones pendientes de aceptar | 0 |
| Archivados | Clientes retirados de la cartera activa | 0 |
| Leads | Contactos potenciales | 0 |

### 8.3 Herramientas del listado

- Busqueda.
- Filtros mediante boton iconografico.
- Checkbox de seleccion individual.
- Posible seleccion global de filas.
- Acciones sobre varios clientes.

### 8.4 Tabla de clientes

Columnas observadas:

1. Seleccion.
2. Avatar o imagen.
3. Cliente.
4. Etiquetas.
5. Profesionales.
6. Activacion.
7. Aplicacion.
8. Plan.
9. Estado del plan.
10. Ultimo pago.
11. Cumplimiento.
12. Ultima actividad.

Cada cliente incluye enlace hacia:

`/clientes/{id}/planificacion`

### 8.5 Datos de ejemplo visibles

La cuenta de demostracion muestra clientes como:

- `[DEMO] BLANCO DEMO`.
- `[DEMO] DANY ROCA`.

Tambien se muestra el correo del cliente y etiquetas de demo.

### 8.6 Operaciones que debe soportar FitNovaManager

- Crear cliente.
- Editar datos.
- Enviar invitacion.
- Archivar cliente.
- Reactivar cliente.
- Convertir lead en cliente.
- Asignar profesional.
- Etiquetar.
- Filtrar por plan.
- Filtrar por cumplimiento.
- Filtrar por actividad.
- Abrir planificacion.
- Seleccionar varios y ejecutar una accion comun.

### 8.7 Estados necesarios

- Lista cargando.
- Lista vacia.
- Sin resultados para el filtro actual.
- Error de carga.
- Cliente seleccionado.
- Accion masiva confirmada.
- Invitacion pendiente.
- Cliente archivado.

---

## 9. Perfil y planificacion de cliente

La tabla de clientes enlaza con una vista de planificacion individual. Aunque no se ha completado la exploracion interna de esa pantalla, el enlace permite deducir que es una pieza central del producto.

### Funciones que deben validarse en esa vista

- Datos personales y contacto.
- Objetivos.
- Plan de entrenamiento.
- Calendario de sesiones.
- Cumplimiento.
- Mediciones y progreso.
- Nutricion.
- Formularios.
- Archivos compartidos.
- Conversacion.
- Notas internas.
- Historial de actividad.
- Asignacion de profesionales.

### Propuesta de estructura para FitNovaManager

Usar una cabecera fija con:

- Nombre y avatar.
- Estado del cliente.
- Etiquetas.
- Ultima actividad.
- Boton de mensaje.
- Boton de nueva tarea.

Y organizar el detalle en pestanas:

- Resumen.
- Entrenamiento.
- Nutricion.
- Agenda.
- Progreso.
- Formularios.
- Archivos.
- Pagos.
- Historial.

---

## 10. Catalogo funcional completo detectado

Este catalogo reúne todas las funciones que aparecen en textos, botones o bloques del dashboard, aunque algunas vistas aun requieren inspeccion directa.

### Clientes y CRM

- Alta de cliente.
- Clientes activos.
- Invitaciones.
- Archivados.
- Leads.
- Etiquetas.
- Asignacion a profesionales.
- Busqueda y filtros.
- Seguimiento de actividad.

### Entrenamiento

- Crear workout con IA.
- Crear workout manual.
- Asignar cardio.
- Crear programas.
- Asignar entrenamientos.
- Planificar sesiones.
- Gestionar entrenamientos grupales.
- Ver cumplimiento.

### Nutricion

- Crear plan nutricional con IA.
- Crear plan nutricional manual.
- Registrar recetas.
- Crear recetas con IA.
- Asociar recetas a planes.
- Gestionar contenido nutricional.

### Comunicacion y contenido

- Chat con clientes.
- Chat con colaboradores.
- Mensaje masivo.
- Compartir archivos.
- Subir videos.
- Formularios.
- Recoger feedback.

### Agenda

- Agendar sesiones.
- Registrar citas.
- Gestionar eventos individuales.
- Gestionar grupos.
- Ver calendario.
- Ver lista de eventos.
- Controlar plazas.
- Revisar proximas actividades.

### Negocio

- Suscripciones.
- Cobros.
- Ultimo pago.
- Estado del plan.
- Promociones.
- Planes premium.
- Ofertas de partners.

### Producto y soporte

- Accesos rapidos configurables.
- Tutoriales.
- Contacto con soporte.
- Intercom.
- Selector de idioma.
- Onboarding comercial.

---

## 11. Patrones de interfaz reutilizables

### Dashboard por bloques

Cada bloque tiene titulo, contador o dato destacado, contenido y una accion. Esta formula permite escanear la situacion del negocio en pocos segundos.

### Tablas de operacion

Las tablas estan pensadas para trabajo repetitivo: seleccionar, buscar, filtrar, comparar y abrir el detalle.

### Estados vacios con accion

Los estados vacios no solo dicen que no hay datos. Explican que hacer a continuacion y proporcionan un boton directo.

### Acciones rapidas

Las tareas mas importantes se presentan como acciones concretas en lenguaje natural, por ejemplo `Anade un Cliente` o `Agenda una Sesion`.

### Listas temporales

Los eventos se agrupan por proximidad temporal. Esto es mas legible que una lista cronologica plana.

### Contadores contextuales

Los contadores aparecen en actividad, tareas, eventos, cumplimiento y pestanas de clientes. Sirven para priorizar.

### Navegacion por iconos

Reduce el ruido visual, pero requiere tooltips, estados activos claros y etiquetas accesibles.

### Carruseles

Se utilizan para novedades, ofertas, plantillas y acciones comerciales. En FitNovaManager deberian limitarse para no desplazar la informacion operativa.

---

## 12. Arquitectura recomendada para FitNovaManager

### Navegacion principal

1. Inicio.
2. Clientes.
3. Agenda.
4. Entrenamientos.
5. Nutricion.
6. Mensajes.
7. Progreso y cumplimiento.
8. Pagos.
9. Contenido.
10. Configuracion.

### Inicio recomendado

Orden sugerido:

1. Acciones rapidas.
2. Alertas y tareas pendientes.
3. Agenda de hoy y proximos eventos.
4. Clientes que requieren atencion.
5. Cumplimiento semanal.
6. Actividad reciente.
7. Resumen de pagos.

### Roles

- Administrador.
- Entrenador.
- Nutricionista.
- Colaborador.
- Recepcion o gestion.

Cada rol debe tener permisos de lectura, creacion, edicion, asignacion y eliminacion definidos por modulo.

### Entidades principales

- Usuario profesional.
- Cliente.
- Lead.
- Colaborador.
- Workout.
- Programa.
- Plan nutricional.
- Receta.
- Sesion.
- Cita.
- Evento grupal.
- Tarea.
- Formulario.
- Respuesta.
- Archivo.
- Video.
- Mensaje.
- Suscripcion.
- Pago.
- Etiqueta.
- Registro de actividad.

---

## 13. Mejoras que FitNovaManager puede aportar

1. Mostrar texto junto a los iconos en el modo de escritorio.
2. Mantener una jerarquia visual mas clara entre operacion y promociones.
3. Incluir accesibilidad completa en botones, modales y cambios de vista.
4. Usar estados de carga, error y vacio consistentes.
5. Añadir filtros guardados para clientes y cumplimiento.
6. Permitir acciones masivas con confirmacion clara.
7. Conectar cada mensaje con el cliente y la tarea relacionada.
8. Separar citas, tareas y eventos en la agenda.
9. Mostrar alertas importantes antes que banners comerciales.
10. Mantener una vista global de negocio sin perder el detalle individual.

---

## 14. Aspectos tecnicos observados

Durante la navegacion aparecieron advertencias de consola relacionadas con:

- `bootstrap-slider.js`: conflicto de namespace entre `slider` y `bootstrapSlider`.
- Uso obsoleto de una API de `moment`.
- Falta de `Description` o `aria-describedby` en un dialogo.
- Bloqueos o cancelaciones de peticiones de analitica y publicidad.
- Advertencia de configuracion de identidad de Intercom.

No todos estos avisos afectan directamente al usuario, pero sirven como lista de riesgos a evitar en FitNovaManager:

- No depender de plugins con namespaces globales ambiguos.
- Usar APIs actuales.
- Añadir nombre y descripcion accesible a cada modal.
- Separar analitica de la funcionalidad principal.
- Evitar que un proveedor externo bloquee una vista.

---

## 15. Inventario pendiente de completar

Para cerrar una especificacion equivalente a una auditoria completa faltaria abrir y documentar directamente:

- Editor de workouts.
- Editor de programas.
- Editor de planes nutricionales.
- Editor de recetas.
- Biblioteca de ejercicios.
- Asignacion de cardio.
- Agenda completa.
- Vista calendario mensual o semanal.
- Formularios y respuestas.
- Biblioteca de archivos.
- Biblioteca de videos.
- Perfil completo del cliente.
- Pagos y suscripciones.
- Gestion de colaboradores.
- Configuracion de cuenta.
- Configuracion de marca y aplicacion.
- Notificaciones.
- Permisos y roles.
- Tutoriales.
- Flujos de IA.

Estos elementos forman parte del catalogo porque aparecen nombrados en el dashboard o en la navegacion, pero no deben considerarse especificados al cien por cien hasta observar sus pantallas internas.

---

## 16. Prioridad para construir FitNovaManager

### Fase 1: nucleo operativo

- Login.
- Dashboard.
- Clientes.
- Perfil y planificacion de cliente.
- Agenda.
- Mensajeria.

### Fase 2: entrega de servicio

- Workouts.
- Programas.
- Biblioteca de ejercicios.
- Nutricion.
- Recetas.
- Formularios.
- Archivos y videos.

### Fase 3: negocio y equipo

- Suscripciones.
- Pagos.
- Leads.
- Colaboradores.
- Roles y permisos.
- Informes.

### Fase 4: automatizacion

- Asistentes de IA.
- Plantillas.
- Acciones rapidas personalizables.
- Mensajes automaticos.
- Recordatorios.
- Indicadores avanzados de cumplimiento.

---

## Resumen final

Harbiz organiza el trabajo del profesional alrededor de tres preguntas:

1. Que tengo que hacer ahora.
2. Que clientes necesitan mi atencion.
3. Que contenido o servicio puedo crear y asignar rapidamente.

Su estructura mas relevante para FitNovaManager es la combinacion de dashboard operativo, listado de clientes, planificacion individual, agenda, mensajeria y seguimiento de cumplimiento. Los modulos de IA, nutricion, contenido, pagos y colaboradores completan el ecosistema, pero deben construirse despues del nucleo de clientes y agenda.
