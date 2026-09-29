# Modelo de datos: Cliente (FitNova Manager ↔ FitNova Go)

**Objetivo de este documento:** definir la tabla (o tablas) que van a sostener toda la ficha del cliente y la relación entre FitNova Manager (el entrenador invita) y FitNova Go (el cliente se registra y completa su perfil). Es solo diseño, no se ha implementado nada todavía.

Fuentes usadas para sacar los campos:
- `documentos informacion/ventnas inico go.pdf` (flujo de invitación y ventanas de onboarding de Go).
- `documentos informacion/analisis-estructura-harbiz-para-fitnovamanager.md` (columnas de la tabla de clientes y ficha de planificación en Manager).
- `fitnova-manager/clientes.html` y `fitnova-manager/cliente-perfil.html` (campos ya maquetados en Manager).
- `mockup-fitnova-go/perfil.html` y `mockup-fitnova-go/ajustes.html` (campos ya maquetados en Go).

---

## 1. Confirmación del flujo (según el PDF)

1. En Manager, el entrenador pulsa **"Añade un Cliente"** → formulario rápido (nombre + email).
2. Al enviar, se crea el cliente con estado **"Invitación enviada"** (pestaña Invitaciones de Clientes).
3. Se genera un **enlace único con token** hacia FitNova Go (instalación directa de la PWA, sin pasar por el navegador).
4. El cliente abre el enlace y completa el onboarding de Go, en este orden:
   1. Crear cuenta: **Nombre, Apellido, Email** + checkbox de aceptación de términos y política de privacidad.
   2. **Sexo/género** (para cálculos nutricionales y de composición corporal).
   3. **Objetivo**: Perder peso / Ponerme en forma / Ganar músculo.
   4. **Fecha de nacimiento**.
   5. **Peso** (kg).
   6. **Altura** (cm).
   7-10. **Cuestionario de salud tipo PAR-Q** (7 preguntas Sí/No sobre corazón, dolor de pecho, mareos, lesiones óseas/articulares, medicación de tensión y otras contraindicaciones médicas).
5. Al pulsar "Finalizar", el cliente pasa automáticamente en Manager de **"Invitación enviada" → "Activo"** (pestaña Activos) y entra ya a la app Go.

Esto confirma la relación 1 a 1 entre un registro de invitación y un registro de cliente, y que el onboarding de Go rellena datos que hoy ya vemos representados en Manager (`cliente-perfil.html` → pestaña Resumen) y en Go (`ajustes.html` → "Sobre mí").

---

## 2. Tabla principal: `clientes`

Es la tabla común a las dos apps (identidad + estado de la relación comercial). Todo lo demás cuelga de aquí por `cliente_id`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | Identificador único del cliente en ambas apps |
| `nombre` | varchar | Del alta rápida en Manager y confirmado en Go |
| `apellidos` | varchar | Se pide en Go (ventana 1), Manager solo pedía "nombre" en el alta rápida |
| `nombre_avatar` | varchar | Alias visible en Go (`ajustes.html` → "Nombre de avatar") |
| `email` | varchar (unique) | Clave de invitación y login |
| `telefono` | varchar (nullable) | Se pide más adelante en Ajustes de Go, no en el alta |
| `auth_user_id` | UUID (nullable, unique) | Identificador de cuenta del proveedor de autenticación; null hasta que el cliente crea su cuenta. La contraseña no se guarda en esta tabla |
| `foto_url` | varchar (nullable) | Foto de perfil (Go) |
| `fecha_nacimiento` | date (nullable) | Ventana 4 del onboarding |
| `genero` | enum(`no_especificado`,`hombre`,`mujer`) | Ventana 2 del onboarding / "Sobre mí" en Go |
| `estado` | enum(`lead`,`invitacion_enviada`,`activo`,`archivado`) | Controla en qué pestaña aparece en Manager > Clientes |
| `plan_id` | UUID (FK → `planes`) | Plan Básico / Premium (tabla de Negocio, ya prevista para más adelante) |
| `fecha_alta` | timestamp | Cuando el entrenador pulsa "Añadir cliente" |
| `fecha_activacion` | timestamp (nullable) | Cuando el cliente termina el onboarding en Go |
| `ultima_actividad` | timestamp (nullable) | Columna "Última actividad" en Manager |
| `creado_en` / `actualizado_en` | timestamp | Auditoría estándar |

> Las **etiquetas** de cliente (columna "Etiquetas" en Manager) se guardan en `etiquetas` (`id`, `nombre`) y `cliente_etiqueta` (`cliente_id`, `etiqueta_id`), porque un cliente puede tener varias.

> La asignación de profesionales se gestiona exclusivamente en `profesional_cliente`, que permite varios profesionales por cliente. No se duplica con un campo `entrenador_principal_id` en esta tabla.

---

## 3. Tabla puente: `invitaciones` (la pieza que hoy falta)

Es la que de verdad conecta Manager con Go. Hoy el botón "Enviar invitación" no hace nada real; esta tabla es lo que habría que crear primero.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | |
| `cliente_id` | UUID (FK → `clientes.id`) | Se crea el cliente en estado `invitacion_enviada` a la vez que la invitación |
| `token_hash` | varchar (unique) | Hash del token opaco enviado en la URL; nunca se persiste el token original |
| `profesional_id` | UUID (FK → `profesionales`) | Profesional que la envió |
| `email_destino` | varchar | Por si el cliente cambia el email al registrarse, queda constancia del original |
| `canal` | enum(`email`,`whatsapp`,`push`) | Cómo se envió |
| `estado` | enum(`pendiente`,`aceptada`,`expirada`,`cancelada`) | |
| `fecha_envio` | timestamp | |
| `fecha_expiracion` | timestamp | Recomendado: 7 días de validez |
| `fecha_aceptacion` | timestamp (nullable) | Cuando el cliente pulsa "Finalizar" en Go |

**Regla de negocio:** cuando `invitaciones.estado` pasa a `aceptada`, se dispara (mismo commit/transacción) `clientes.estado = 'activo'` y `clientes.fecha_activacion = now()`. Así Manager ve el cambio automático de pestaña que describe el PDF.

---

## 4. Tabla `clientes_objetivo` (1 a 1 con `clientes`)

Cubre la ventana 3 (objetivo) + peso/altura del onboarding + lo que ya se ve en `cliente-perfil.html` (Resumen) y en Go (`perfil.html` → Métricas → Objetivo).

| Campo | Tipo | Notas |
|---|---|---|
| `cliente_id` | UUID (PK, FK) | |
| `objetivo_tipo` | enum(`perder_peso`,`ponerme_en_forma`,`ganar_musculo`) | Ventana 3 |
| `altura_cm` | numeric | Ventana 6 |
| `peso_objetivo_kg` | numeric (nullable) | Se define después, en Go (`modal-objetivo`) |
| `notas_objetivo` | text (nullable) | Campo libre "Sobre mí" en Go |
| `notas_lesiones` | text (nullable) | Campo libre "Lesiones, alergias u otras observaciones" en Go |

> El peso inicial y el actual se consultan en `clientes_metricas`; no se duplican aquí. El primer registro de métricas se crea al completar el onboarding.

---

## 5. Tabla `clientes_salud_parq` (1 a 1 con `clientes`)

Las 7 preguntas de salud del onboarding (ventanas 7 a 10 del PDF), formato estándar PAR-Q. Datos sensibles: acceso restringido solo al propio cliente y a su entrenador/nutricionista asignado.

| Campo | Tipo | Pregunta original |
|---|---|---|
| `cliente_id` | UUID (PK, FK) | |
| `enfermedad_cardiaca_supervisada` | boolean | "¿Le han diagnosticado una enfermedad cardíaca que recomienda actividad física solo bajo supervisión médica?" |
| `dolor_pecho_actividad` | boolean | "¿Sufre dolor en el pecho cuando realiza actividad física?" |
| `dolor_pecho_reposo` | boolean | "¿Ha notado dolor en el pecho durante el último mes en reposo?" |
| `perdida_consciencia_mareo` | boolean | "¿Ha perdido la consciencia o el equilibrio tras sensación de mareo?" |
| `alteracion_osea_articular` | boolean | "¿Tiene alguna alteración ósea o articular que podría agravarse con la actividad física?" |
| `medicacion_presion_arterial` | boolean | "¿Le han recetado algún fármaco para la presión arterial u otro problema cardiocirculatorio?" |
| `otra_razon_medica` | boolean | "¿Conoce alguna otra razón médica que le impida hacer ejercicio sin supervisión?" |
| `fecha_cumplimentado` | timestamp | |

---

## 6. Tabla `clientes_metricas` (histórico, 1 a N)

Serie temporal de medidas corporales. Ya está maquetada en Go (`perfil.html` → Métricas) y resumida en Manager (progreso del cliente).

| Campo | Tipo |
|---|---|
| `id` | UUID (PK) |
| `cliente_id` | UUID (FK) |
| `fecha` | date |
| `peso_kg` | numeric (nullable en métricas posteriores; requerido en el registro inicial del onboarding) |
| `grasa_corporal_pct` | numeric (nullable) |
| `pecho_cm`, `cuello_cm`, `hombros_cm` | numeric (nullable) |
| `biceps_izq_cm`, `biceps_der_cm` | numeric (nullable) |
| `antebrazo_izq_cm`, `antebrazo_der_cm` | numeric (nullable) |
| `cintura_cm`, `cadera_cm` | numeric (nullable) |
| `muslo_izq_cm`, `muslo_der_cm` | numeric (nullable) |
| `gemelo_izq_cm`, `gemelo_der_cm` | numeric (nullable) |
| `origen` | enum(`cliente`,`profesional`) | Quién registró la medición |
| `creado_en` | timestamp |

---

## 7. Tabla `clientes_facturacion` (1 a 1, datos sensibles)

Solo necesaria si se activan pagos (Negocio). Ya está maquetada en Go (`ajustes.html` → "Datos de facturación").

| Campo | Tipo |
|---|---|
| `cliente_id` | UUID (PK, FK) |
| `dni_nif` | varchar (nullable) |
| `direccion` | varchar (nullable) |
| `codigo_postal` | varchar (nullable) |
| `ciudad` | varchar (nullable) |
| `region` | varchar (nullable) |
| `pais` | varchar (nullable) |

## 8. Tabla `metodos_pago` (1 a N)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | |
| `cliente_id` | UUID (FK) | |
| `tipo_tarjeta` | varchar | Visa / Mastercard... |
| `ultimos_4_digitos` | varchar(4) | Nunca guardar el número completo |
| `token_pasarela` | varchar | Referencia externa (Stripe/Redsys), no datos de tarjeta reales |
| `predeterminada` | boolean | |

---

## 9. Tabla `clientes_preferencias` (1 a 1, ajustes de Go)

| Campo | Tipo | Notas |
|---|---|---|
| `cliente_id` | UUID (PK, FK) | |
| `sistema_medidas` | enum(`metrico`,`imperial`) | |
| `notificaciones_activas` | boolean | |
| `idioma` | varchar | |

## 10. Tabla `profesional_cliente` (relación N a N)

Un cliente puede tener entrenador y nutricionista a la vez (ya se ve en `perfil.html` → "Tus profesionales").

| Campo | Tipo |
|---|---|
| `id` | UUID (PK) |
| `cliente_id` | UUID (FK) |
| `profesional_id` | UUID (FK → tabla `profesionales` de Equipo) |
| `rol` | enum(`entrenador`,`nutricionista`,`recepcion`) |
| `fecha_asignacion` | timestamp |

## 11. Tabla `consentimientos` (evidencia legal, RGPD)

El checkbox "Acepto términos y política de privacidad" de la ventana 1 no debe ser solo visual: hay que dejar constancia.

| Campo | Tipo |
|---|---|
| `id` | UUID (PK) |
| `cliente_id` | UUID (FK) |
| `tipo` | enum(`terminos`,`privacidad`,`salud`) |
| `version_documento` | varchar |
| `fecha_aceptacion` | timestamp |
| `ip` | varchar |

---

## 12. Lo que falta para que la relación Manager ↔ Go sea real

Hoy las dos apps son HTML/CSS/JS estáticos, sin servidor ni base de datos. Para que "Enviar invitación" haga algo de verdad hace falta:

1. **Backend con base de datos** (Postgres/MySQL/Firestore/Supabase — a decidir) que contenga como mínimo las tablas `clientes`, `invitaciones`, `etiquetas` y `cliente_etiqueta` de este documento.
2. **API** con al menos estos endpoints:
   - `POST /invitaciones` (Manager crea cliente + invitación + token)
   - `GET /invitaciones/:token` (Go calcula el hash del token recibido, lo compara con `token_hash` y muestra el onboarding si sigue vigente)
   - `POST /invitaciones/:token/completar` (Go guarda todos los datos del onboarding y marca la invitación como aceptada)
3. **Servicio de envío de email** (SendGrid, Resend, Amazon SES...) para mandar el enlace real con el token.
4. **Autenticación gestionada por el proveedor elegido** — la app no debe guardar ni gestionar hashes de contraseñas en `clientes`; solo almacena el identificador de usuario que devuelve el proveedor.
5. **Instalación directa de la PWA** al abrir el enlace: esto depende del `manifest.webmanifest` de Go y de cabeceras/comportamiento del navegador (Android permite "prompt" de instalación automática bajo ciertas condiciones; iOS no permite instalación silenciosa, habrá que prever una pantalla intermedia "Instala FitNova Go" para esos casos).

---

## 13. Primer esquema de Clientes (v1)

Este alcance cubre el flujo Manager → invitación → onboarding Go → cliente activo. Los tipos son compatibles con PostgreSQL; la referencia concreta a la tabla de usuarios se decide al elegir el proveedor de autenticación.

### Convenciones

- IDs `uuid`; fechas con hora `timestamptz` en UTC; cumpleaños `date`.
- Medidas con `numeric`, no `float`.
- Normalizar email con `lower(trim(email))` y exigir unicidad sin distinguir mayúsculas.
- La aplicación nunca almacena contraseñas ni sus hashes; solo el identificador del usuario del proveedor.

### Tablas v1

#### `profesionales`

Perfil mínimo del usuario de Manager que invita y atiende clientes.

| Campo | Tipo y regla |
|---|---|
| `id` | `uuid` PK |
| `auth_user_id` | `uuid` NOT NULL UNIQUE; FK al usuario del proveedor, pendiente de concretar |
| `nombre` | `varchar(100)` NOT NULL |
| `apellidos` | `varchar(150)` nullable |
| `email` | `varchar(254)` NOT NULL, único normalizado |
| `rol` | `text` NOT NULL; CHECK en `administrador`, `entrenador`, `nutricionista`, `colaborador` |
| `creado_en`, `actualizado_en` | `timestamptz` NOT NULL, valor inicial del servidor |

#### `clientes`

| Campo | Tipo y regla |
|---|---|
| `id` | `uuid` PK |
| `auth_user_id` | `uuid` nullable UNIQUE hasta que Go crea la cuenta |
| `nombre` | `varchar(100)` NOT NULL |
| `apellidos` | `varchar(150)` nullable hasta completar onboarding |
| `nombre_avatar` | `varchar(40)` nullable |
| `email` | `varchar(254)` NOT NULL, único normalizado |
| `telefono` | `varchar(30)` nullable |
| `foto_url` | `text` nullable |
| `fecha_nacimiento` | `date` nullable; validar que no sea futura |
| `genero` | `text` nullable; restringir a las opciones finales del onboarding |
| `estado` | `text` NOT NULL DEFAULT `invitacion_enviada`; CHECK en `lead`, `invitacion_enviada`, `activo`, `archivado` |
| `fecha_alta`, `creado_en`, `actualizado_en` | `timestamptz` NOT NULL, valores iniciales del servidor |
| `fecha_activacion`, `ultima_actividad` | `timestamptz` nullable |

No incluir `password_hash`, `entrenador_principal_id` ni `peso_actual_kg`. `plan_id` se añadirá cuando exista la tabla `planes` y se diseñe su flujo.

#### `invitaciones`

| Campo | Tipo y regla |
|---|---|
| `id` | `uuid` PK |
| `cliente_id` | `uuid` NOT NULL FK → `clientes.id` |
| `profesional_id` | `uuid` NOT NULL FK → `profesionales.id` |
| `token_hash` | `char(64)` NOT NULL UNIQUE; SHA-256 del token aleatorio |
| `email_destino` | `varchar(254)` NOT NULL |
| `canal` | `text` NOT NULL DEFAULT `email`; CHECK = `email` en v1 |
| `estado` | `text` NOT NULL; CHECK en `pendiente`, `enviada`, `aceptada`, `expirada`, `cancelada`, `fallida` |
| `fecha_envio`, `fecha_aceptacion` | `timestamptz` nullable |
| `fecha_expiracion`, `creado_en` | `timestamptz` NOT NULL |

El token original solo va en el enlace del correo: no se persiste, es de un solo uso y caduca a los 7 días. Solo puede haber una invitación vigente por cliente; reenviar invalida la anterior o la cancela antes de crear otra.

#### `profesional_cliente`

Mantiene la asignación N:N. Campos: `id uuid PK`, `cliente_id uuid NOT NULL FK`, `profesional_id uuid NOT NULL FK`, `rol text NOT NULL CHECK (entrenador, nutricionista, recepcion)` y `fecha_asignacion timestamptz NOT NULL`. Añadir UNIQUE (`cliente_id`, `profesional_id`, `rol`). Es la relación canónica de profesionales.

#### `clientes_objetivo`

`cliente_id uuid PK/FK`; `objetivo_tipo text NOT NULL CHECK (perder_peso, ponerme_en_forma, ganar_musculo)`; `altura_cm numeric(5,2) NOT NULL`; `peso_objetivo_kg numeric(5,2)` nullable; `notas_objetivo text` y `notas_lesiones text` nullable. El rango de altura se validará según límites acordados para el producto.

#### `clientes_salud_parq`

Una fila por cliente (`cliente_id uuid PK/FK`) con siete respuestas `boolean NOT NULL` y `fecha_cumplimentado timestamptz NOT NULL`, creada al completar el cuestionario. `requiere_supervision_medica` se calcula a partir de las respuestas y no se guarda duplicado. Acceso solo para el cliente y profesionales autorizados.

#### `clientes_metricas`

`id uuid PK`; `cliente_id uuid NOT NULL FK`; `fecha timestamptz NOT NULL`; medidas como `numeric` nullable; `origen text NOT NULL CHECK (cliente, profesional)`; `creado_en timestamptz NOT NULL`. El peso es obligatorio en la medición inicial del onboarding. Las mediciones posteriores agregan filas y no sobrescriben el histórico.

#### `consentimientos`

`id uuid PK`; `cliente_id uuid NOT NULL FK`; `tipo text NOT NULL CHECK (terminos, privacidad, salud)`; `version_documento varchar(40) NOT NULL`; `fecha_aceptacion timestamptz NOT NULL`; `ip inet` nullable. UNIQUE (`cliente_id`, `tipo`, `version_documento`). La base legal y el consentimiento para tratar datos de salud requieren revisión legal antes de producción.

#### `etiquetas` y `cliente_etiqueta`

`etiquetas`: `id uuid PK`, `nombre varchar(50) NOT NULL UNIQUE` (normalizado). `cliente_etiqueta`: `cliente_id uuid NOT NULL FK`, `etiqueta_id uuid NOT NULL FK`, PK compuesta (`cliente_id`, `etiqueta_id`).

### Tablas aplazadas

`clientes_facturacion`, `metodos_pago`, `clientes_preferencias` y `planes` no son necesarios para completar el alta. Se implementarán con sus ventanas y controles propios. `clientes_metricas` entra en v1 para el peso inicial y el histórico básico.

### Finalización atómica del onboarding

La operación final guarda perfil, objetivo, PAR-Q, consentimientos y medida inicial; vincula `auth_user_id`; acepta la invitación y activa al cliente. Debe completarse en una transacción: si falla una parte, el cliente no queda parcialmente activado.

## Siguiente paso

No hay backend configurado en el proyecto. Recomiendo Supabase (PostgreSQL + Auth + políticas RLS) porque Manager y Go son apps estáticas que necesitan compartir cuentas y datos. Antes de crear una migración real, falta confirmar el proveedor; después definimos RLS y email y conectamos el flujo de invitación.
