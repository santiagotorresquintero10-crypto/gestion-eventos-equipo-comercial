# Gestión de Eventos – Equipo Comercial

Aplicación interna para registrar, consultar y hacer seguimiento a eventos
agropecuarios de interés comercial (subastas, ferias, remates, congresos, etc).

## Cómo abrir el proyecto

1. Abre la carpeta `gestion-eventos-comercial` en Visual Studio Code.
2. Instala la extensión **Live Server** (si no la tienes).
3. Clic derecho sobre `index.html` → **"Open with Live Server"**.
4. Se abrirá el Dashboard en tu navegador.

No necesitas instalar Node.js ni ejecutar `npm install`: todo el proyecto
funciona con HTML, CSS y JavaScript puro, cargando Firebase desde un CDN.

## Estructura

```
gestion-eventos-comercial/
├── index.html          → Dashboard (indicadores + próximos eventos destacados)
├── eventos.html         → Listado completo de próximos eventos + buscador + filtros
├── calendario.html      → Vista mensual de calendario
├── historico.html        → Eventos ya realizados
├── css/styles.css       → Todos los estilos (paleta tomada del logo)
├── js/
│   ├── firebase-config.js  → Conexión con tu proyecto de Firebase
│   ├── helpers.js          → Fechas, cálculo de días, estado de proximidad, tarjetas, recurrencia
│   ├── eventos-service.js  → CRUD contra la colección "eventos" en Firestore (incluye series recurrentes)
│   ├── modal.js            → Formulario de nuevo/editar evento (compartido) + selector de alcance de series
│   ├── interacciones.js    → Clics de Editar / Eliminar / Marcar importante
│   ├── dashboard.js         → Lógica propia de index.html
│   ├── eventos.js           → Lógica propia de eventos.html
│   ├── calendario.js        → Lógica propia de calendario.html
│   └── historico.js         → Lógica propia de historico.html
└── img/logo.png         → Logo de Central Ganadera S.A.
```

## Colección en Firestore: `eventos`

Cada documento tiene estos campos:

| Campo          | Tipo       |
|----------------|------------|
| nombre         | string     |
| tipo           | string     |
| fecha          | timestamp  |
| hora           | string     |
| lugar          | string     |
| municipio      | string     |
| departamento   | string     |
| organizador    | string     |
| contacto       | string     |
| telefono       | string     |
| enlace         | string     |
| observaciones  | string     |
| importante     | boolean    |
| fechaCreacion  | timestamp  |

`fecha` se guarda siempre como medianoche UTC del día elegido, para poder
ordenar cronológicamente y calcular "días restantes" de forma confiable sin
que la zona horaria del navegador desplace el día. Los cálculos de "hoy",
"mañana", etc. usan la zona horaria de Colombia (America/Bogota).

## ⚠️ Importante sobre las reglas de Firestore

Esta versión NO tiene Firebase Authentication. Mientras trabajes solo en tu
computador (localhost) el riesgo es bajo, pero **antes de publicar esta app
en una URL pública**, hay que endurecer las reglas de seguridad de Firestore
(están en modo de prueba con fecha de vencimiento). Avísame cuando lleguemos
a esa etapa para configurarlas correctamente.

## Eventos recurrentes

Al crear un evento nuevo, el formulario incluye una sección **"Recurrencia"**:
No repetir / Todos los días / Todas las semanas (eligiendo días) / Cada 2
semanas / Todos los meses / Personalizado (cada N días), con opción de
finalizar Nunca (máx. 100 eventos por seguridad), en una fecha, o después de
N repeticiones. Cada fecha generada se guarda como un evento independiente en
Firestore, unidos por un mismo `serieId`.

Al **editar** o **eliminar** un evento que pertenece a una serie, la app
pregunta automáticamente: *Solo este evento* / *Este evento y los siguientes*
/ *Toda la serie* — así nunca se modifica una serie completa por accidente.

## Clasificación Nacional / Internacional

Cada evento tiene un campo obligatorio **"Alcance del evento"** (Nacional /
Internacional), independiente del campo "Tipo de evento" que ya existía
(Subasta, Feria, Congreso, etc. — la categoría del evento). Se le puso un
nombre distinto a propósito para no chocar con ese campo ya existente; si
prefieres otro nombre, es un cambio de una sola línea en `js/modal.js`.

- **Calendario**: cada día con eventos muestra puntitos de color (🔵 azul =
  nacional, 🟣 morado = internacional) debajo del número, sin abrir nada.
  Hay una leyenda y un filtro (Todos / Nacionales / Internacionales) arriba
  del calendario.
- **Tarjetas** (dashboard, próximos eventos, calendario, histórico): muestran
  una etiqueta con el mismo color junto al estado del evento, y el detalle
  completo incluye la línea "Tipo: Nacional/Internacional".
- **Eventos recurrentes**: la clasificación se guarda una sola vez en el
  formulario y se propaga automáticamente a todas las apariciones generadas
  (usa el mismo mecanismo que ya existía para nombre, lugar, etc.). Si editas
  la clasificación de una serie con "Este evento y los siguientes" o "Toda la
  serie", se actualiza correctamente en todas las ocurrencias afectadas.
- **Eventos antiguos** (creados antes de este cambio): no tienen este campo
  en Firestore, así que no muestran ninguna etiqueta ni punto en el
  calendario hasta que los edites y elijas Nacional o Internacional — no se
  les asume un valor por defecto.

## Mensaje de alerta dinámico en las tarjetas

Cada tarjeta de evento cambia su texto según los días restantes — nunca es
texto fijo, siempre se calcula contra la fecha real y la fecha actual:

- Hoy → 📅 "Este evento es hoy"
- Mañana → ⚠️ "Este evento vence mañana"
- 2 a 7 días → ⏰ "Faltan X días para este evento"
- Más de 7 días o ya pasado → texto normal, sin alerta

Los colores de cada tarjeta (borde y badge) siguen el mismo esquema de 5
niveles que ya existía (hoy/mañana/próximo/esta semana/lejano).

**Próximos eventos** también tiene su propio filtro Todos/Nacionales/
Internacionales, independiente de los filtros de fecha que ya existían.

## Eventos de varios días

Al crear o editar un evento, el campo **"Fecha final (solo si el evento
dura varios días)"** es opcional. Si se deja vacío, el evento funciona
exactamente igual que siempre (un solo día). Si se llena, el evento se
guarda como **un solo documento** en Firestore con `fecha` (inicio) y
`fechaFin`, y:

- **Calendario**: el evento aparece en cada día del rango. Los días que
  son continuación (no el de inicio) se marcan con un fondo suave y una
  barra verde abajo, para distinguir que es el mismo evento repartido y
  no varios eventos independientes.
- **Editar o eliminar**: como es un solo documento, afecta automáticamente
  todas las fechas del rango — no hay nada que sincronizar entre días.
- **Dashboard / Próximos eventos / Histórico**: un evento de varios días
  cuenta como "HOY" mientras está en curso (no solo el primer día), y
  solo pasa a Histórico cuando termina de verdad.
- **Recurrencia**: si un evento de varios días también se repite, cada
  ocurrencia conserva la misma duración, calculada desde su propia fecha.
- **Compatibilidad**: funciona junto con clasificación Nacional/
  Internacional, filtros y alertas de vencimiento sin cambios adicionales.

## Qué falta (según el plan original)

- **Paso 15 — Seguimiento comercial** (responsable, cliente, estado del
  seguimiento): la estructura de Firestore ya está preparada para agregar
  estos campos después sin romper nada existente, pero no están creados aún.

## Próximos pasos sugeridos

1. Prueba crear un evento recurrente (ej. "todos los martes") y verifica que
   aparezca en todas las fechas correctas.
2. Prueba editar y eliminar un evento de una serie, y confirma que el
   selector "Solo este / Siguientes / Toda la serie" funciona como esperas.
3. Cuéntame si algo no funciona como esperabas.
