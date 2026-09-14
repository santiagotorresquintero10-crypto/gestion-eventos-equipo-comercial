// ============================================================
// helpers.js
// Funciones compartidas: fechas (zona horaria Colombia), cálculo
// de días restantes, estado de proximidad y renderizado de tarjetas.
// ============================================================

export const TIPOS_EVENTO = [
  'Subasta',
  'Feria',
  'Remate',
  'Congreso',
  'Exposición',
  'Encuentro comercial',
  'Evento ganadero',
  'Evento porcino',
  'Feria municipal',
  'Evento empresarial',
  'Otro'
];

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Convierte un Timestamp de Firestore a texto ISO "YYYY-MM-DD".
 * El Timestamp se guarda siempre como medianoche UTC de la fecha elegida,
 * por eso toISOString() devuelve el mismo día sin importar la hora local.
 */
export function fechaToISO(timestamp) {
  const d = timestamp.toDate();
  return d.toISOString().slice(0, 10);
}

/**
 * Convierte "YYYY-MM-DD" a un objeto Date en medianoche UTC.
 * Usamos UTC siempre para evitar que la zona horaria del navegador
 * desplace el día por accidente.
 */
export function isoToDateUTC(isoString) {
  const [y, m, d] = isoString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Suma (o resta, si N es negativo) N días a una fecha ISO. */
export function sumarDiasISO(fechaISO, dias) {
  const d = isoToDateUTC(fechaISO);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Diferencia en días completos entre dos fechas ISO (fin - inicio). */
export function diferenciaDiasISO(fechaInicioISO, fechaFinISO) {
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.round((isoToDateUTC(fechaFinISO) - isoToDateUTC(fechaInicioISO)) / msPorDia);
}

/**
 * Lista de fechas ISO, una por cada día entre inicio y fin (ambos
 * incluidos). Para un evento de un solo día, devuelve un array de 1
 * elemento. Tiene un límite de seguridad de 90 días para evitar rangos
 * mal escritos por error.
 */
export function diasISOEnRango(fechaInicioISO, fechaFinISO) {
  const MAX_DIAS = 90;
  const inicio = isoToDateUTC(fechaInicioISO);
  const fin = isoToDateUTC(fechaFinISO || fechaInicioISO);
  const dias = [];
  const cursor = new Date(inicio);
  while (cursor <= fin && dias.length < MAX_DIAS) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

/**
 * Fecha de "hoy" en la zona horaria de Colombia (America/Bogota),
 * en formato "YYYY-MM-DD". Colombia no tiene horario de verano,
 * así que esto es estable durante todo el año.
 */
export function obtenerHoyISO() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Calcula cuántos días faltan (positivo), o hace cuántos días pasó
 * (negativo), comparando la fecha del evento contra "hoy" en Colombia.
 */
export function calcularDiasRestantes(fechaISO) {
  const hoy = isoToDateUTC(obtenerHoyISO());
  const fecha = isoToDateUTC(fechaISO);
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.round((fecha - hoy) / msPorDia);
}

/**
 * Fecha ISO de fin de un evento: usa `fechaFin` si el evento dura varios
 * días; si no, es el mismo día de inicio (comportamiento idéntico al de
 * siempre para eventos de un solo día).
 */
export function fechaFinEventoISO(evento) {
  return evento.fechaFin ? fechaToISO(evento.fechaFin) : fechaToISO(evento.fecha);
}

/**
 * Calcula el estado temporal de un evento considerando su rango completo:
 *   positivo = faltan tantos días para que INICIE
 *   0        = está en curso HOY (o es de un solo día y es hoy)
 *   negativo = ya TERMINÓ hace tantos días
 * Para un evento de un solo día (fechaFin ausente), esto es exactamente
 * lo mismo que calcularDiasRestantes() de siempre.
 */
export function calcularDiasEvento(evento) {
  const inicioISO = fechaToISO(evento.fecha);
  const finISO = fechaFinEventoISO(evento);
  const hoyISO = obtenerHoyISO();
  if (hoyISO < inicioISO) return calcularDiasRestantes(inicioISO);
  if (hoyISO <= finISO) return 0;
  return calcularDiasRestantes(finISO);
}

/**
 * Devuelve el estado de proximidad (texto + clase CSS) según las
 * reglas del Paso 5: HOY, MAÑANA, EVENTO PRÓXIMO, ESTA SEMANA, PRÓXIMAMENTE.
 */
export function obtenerEstadoProximidad(dias) {
  if (dias < 0) return { texto: 'REALIZADO', clase: 'estado-pasado' };
  if (dias === 0) return { texto: 'HOY', clase: 'estado-hoy' };
  if (dias === 1) return { texto: 'MAÑANA', clase: 'estado-manana' };
  if (dias >= 2 && dias <= 3) return { texto: 'EVENTO PRÓXIMO', clase: 'estado-proximo' };
  if (dias >= 4 && dias <= 7) return { texto: 'ESTA SEMANA', clase: 'estado-semana' };
  return { texto: 'PRÓXIMAMENTE', clase: 'estado-lejano' };
}

/** Texto legible: "10 de septiembre de 2026" */
export function formatearFechaLegible(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return `${d} de ${NOMBRES_MES[m - 1]} de ${y}`;
}

/**
 * Mensaje de alerta de vencimiento (icono + frase). Lo sigue usando el
 * centro de alertas (campana) para el listado emergente; la tarjeta ya no
 * lo usa por separado desde que se combinó con la etiqueta compacta.
 * Devuelve null para eventos ya pasados o a más de 7 días.
 */
export function obtenerMensajeAlerta(dias) {
  if (dias < 0 || dias > 7) return null;
  if (dias === 0) return { icono: '📅', texto: 'Este evento es hoy' };
  if (dias === 1) return { icono: '⚠️', texto: 'Este evento vence mañana' };
  return { icono: '⏰', texto: `Faltan ${dias} días para este evento` };
}

/**
 * Etiqueta compacta de proximidad para la cabecera de la tarjeta: un solo
 * emoji + texto corto que reemplaza los dos mensajes que antes se repetían
 * (el badge de estado y el mensaje de alerta). Reutiliza la misma "clase"
 * de obtenerEstadoProximidad() para el color del borde, así que los 5
 * niveles de color existentes no cambian, solo el texto que se muestra.
 */
export function obtenerEtiquetaCompacta(dias) {
  if (dias < 0) return { emoji: '⚪', texto: 'REALIZADO' };
  if (dias === 0) return { emoji: '🔴', texto: 'HOY' };
  if (dias === 1) return { emoji: '🟠', texto: 'MAÑANA' };
  if (dias <= 3) return { emoji: '🟡', texto: `EN ${dias} DÍAS` };
  return { emoji: '⚪', texto: `EN ${dias} DÍAS` };
}

/**
 * Ordena una lista de eventos (que ya deben traer su propiedad `dias`
 * calculada) de más urgente a menos urgente: primero por días restantes,
 * y si dos eventos caen el mismo día, por hora. Se usa tanto en el
 * Dashboard como en Próximos eventos para que el orden sea siempre el
 * mismo en toda la aplicación (misma fuente de datos, mismo criterio).
 */
export function ordenarPorUrgencia(eventos) {
  return [...eventos].sort((a, b) => {
    if (a.dias !== b.dias) return a.dias - b.dias;
    return (a.hora || '').localeCompare(b.hora || '');
  });
}

/** Escapa texto simple para insertarlo en HTML sin romper el markup. */
function escaparHTML(texto) {
  if (!texto) return '';
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

/**
 * Clasificación Nacional / Internacional de un evento. Es un campo
 * independiente de "tipo" (que es la categoría: Subasta, Feria, etc.).
 */
export const CLASIFICACIONES_EVENTO = [
  { valor: 'nacional', etiqueta: 'Nacional', icono: '🇨🇴' },
  { valor: 'internacional', etiqueta: 'Internacional', icono: '🌎' }
];

/**
 * Devuelve { texto, icono, clase } para una clasificación. Si el evento es
 * antiguo y no tiene clasificación asignada todavía, devuelve null (no se
 * muestra nada en vez de mostrar un valor inventado).
 */
export function obtenerEtiquetaClasificacion(clasificacion) {
  const info = CLASIFICACIONES_EVENTO.find((c) => c.valor === clasificacion);
  if (!info) return null;
  return { texto: info.etiqueta, icono: info.icono, clase: `clasificacion-${info.valor}` };
}

/**
 * FRECUENCIAS soportadas. Se eliminó "diaria" y "personalizada": con el
 * selector de días siempre visible, "todas las semanas" marcando los 7 días
 * ya cubre el caso de "todos los días", así que mantenerlas por separado
 * solo duplicaba la misma lógica con otro nombre.
 */
export const FRECUENCIAS_RECURRENCIA = [
  { valor: 'semanal', etiqueta: 'Todas las semanas' },
  { valor: 'quincenal', etiqueta: 'Cada 2 semanas' },
  { valor: 'mensual', etiqueta: 'Todos los meses' }
];

export const DIAS_SEMANA_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Lunes (medianoche UTC) de la semana a la que pertenece la fecha dada. */
function obtenerLunesDeSemana(fecha) {
  const d = new Date(fecha);
  const diaSemana = d.getUTCDay(); // 0 = domingo
  const diferencia = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setUTCDate(d.getUTCDate() + diferencia);
  return d;
}

/** ¿Qué ocurrencia del mes es esta fecha para su día de semana? (1ª, 2ª, 3ª...) */
function ordinalEnMes(fecha) {
  return Math.ceil(fecha.getUTCDate() / 7);
}

/**
 * Fecha del N-ésimo "weekday" (0=domingo..6=sábado) de un mes/año dado.
 * Si ese mes no tiene esa N-ésima ocurrencia (ej. no hay 5º viernes),
 * se usa la última ocurrencia disponible de ese día en el mes, para no
 * saltarse el mes por completo.
 */
function fechaOrdinalEnMes(año, mesIndice0, weekday, ordinal) {
  const primerDiaMes = new Date(Date.UTC(año, mesIndice0, 1));
  const primerWeekday = primerDiaMes.getUTCDay();
  const offsetPrimeraOcurrencia = (weekday - primerWeekday + 7) % 7;
  let dia = 1 + offsetPrimeraOcurrencia + (ordinal - 1) * 7;

  const diasEnMes = new Date(Date.UTC(año, mesIndice0 + 1, 0)).getUTCDate();
  if (dia > diasEnMes) dia -= 7; // usar la ocurrencia anterior si no existe la pedida

  return new Date(Date.UTC(año, mesIndice0, dia));
}

/**
 * Genera las fechas ISO ("YYYY-MM-DD") en las que caen las ocurrencias de
 * una recurrencia, dentro de un rango [fechaDesdeISO, fechaHastaISO].
 *
 * @param {{frecuencia: 'semanal'|'quincenal'|'mensual', dias: number[]}} config
 *        dias: 0=domingo .. 6=sábado (uno o varios)
 * @param {string} fechaAnclaISO - fecha original del evento (primera ocurrencia
 *        de la serie). Se usa para calcular la paridad de semanas en
 *        "quincenal" y la posición ordinal (1ª, 2ª... semana del mes) en "mensual".
 * @param {string} fechaDesdeISO - desde cuándo generar (inclusive)
 * @param {string} fechaHastaISO - hasta cuándo generar (inclusive)
 */
export function generarOcurrenciasEnRango(config, fechaAnclaISO, fechaDesdeISO, fechaHastaISO) {
  const MAX_OCURRENCIAS = 1000; // límite de seguridad contra bucles infinitos, no una restricción de negocio
  const ancla = isoToDateUTC(fechaAnclaISO);
  const desde = isoToDateUTC(fechaDesdeISO);
  const hasta = isoToDateUTC(fechaHastaISO);
  const dias = Array.isArray(config.dias) ? config.dias : [];
  const resultado = new Set();

  if (dias.length === 0 || hasta < desde) return [];

  if (config.frecuencia === 'mensual') {
    const ordinal = ordinalEnMes(ancla);
    const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
    while (cursor <= hasta && resultado.size < MAX_OCURRENCIAS) {
      dias.forEach((weekday) => {
        const fecha = fechaOrdinalEnMes(cursor.getUTCFullYear(), cursor.getUTCMonth(), weekday, ordinal);
        if (fecha >= ancla && fecha >= desde && fecha <= hasta) {
          resultado.add(fecha.toISOString().slice(0, 10));
        }
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    // 'semanal' y 'quincenal': se recorre día a día dentro del rango.
    const lunesAncla = obtenerLunesDeSemana(ancla);
    const cursor = new Date(desde);
    while (cursor <= hasta && resultado.size < MAX_OCURRENCIAS) {
      const weekday = cursor.getUTCDay();
      if (dias.includes(weekday) && cursor >= ancla) {
        let incluir = true;
        if (config.frecuencia === 'quincenal') {
          const lunesCursor = obtenerLunesDeSemana(cursor);
          const semanasDesdeAncla = Math.round((lunesCursor - lunesAncla) / (7 * 86400000));
          incluir = semanasDesdeAncla % 2 === 0;
        }
        if (incluir) resultado.add(cursor.toISOString().slice(0, 10));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return Array.from(resultado).sort();
}

/** Texto legible de la recurrencia para mostrar en la tarjeta, ej: "Todos los meses · Martes, Jueves · hasta 31/12/2026" */
export function describirRecurrencia(recurrencia) {
  if (!recurrencia) return '';
  const etiquetaFrecuencia = FRECUENCIAS_RECURRENCIA.find((f) => f.valor === recurrencia.frecuencia)?.etiqueta || '';
  const dias = (recurrencia.dias || []).slice().sort().map((d) => DIAS_SEMANA_LABELS[d]).join(', ');
  const hasta = recurrencia.fechaFinal ? ` · hasta ${recurrencia.fechaFinal.split('-').reverse().join('/')}` : '';
  return `${etiquetaFrecuencia} · ${dias}${hasta}`;
}

/**
 * Genera el HTML de una tarjeta de evento reutilizable en dashboard,
 * listado de próximos eventos y calendario.
 */
export function crearTarjetaEventoHTML(evento) {
  const fechaISO = fechaToISO(evento.fecha);
  const finISO = fechaFinEventoISO(evento);
  const esVariosDias = finISO !== fechaISO;
  const dias = calcularDiasEvento(evento);
  const estado = obtenerEstadoProximidad(dias);
  const compacta = obtenerEtiquetaCompacta(dias);
  const estrella = evento.importante ? '⭐' : '';
  const recurrente = evento.serieId
    ? `<span class="tarjeta-recurrente" title="${escaparHTML(describirRecurrencia(evento.recurrencia))}">🔁</span>`
    : '';
  const variosDiasBadge = esVariosDias
    ? `<span class="tarjeta-varios-dias" title="Evento de varios días">📆 ${diferenciaDiasISO(fechaISO, finISO) + 1} días</span>`
    : '';
  const clasificacion = obtenerEtiquetaClasificacion(evento.clasificacion);

  const ubicacion = [evento.municipio, evento.departamento].filter(Boolean).join(', ');

  // Una sola línea combina proximidad + clasificación (antes eran dos
  // mensajes distintos que decían prácticamente lo mismo).
  const etiquetaCombinada = clasificacion
    ? `${compacta.emoji} ${compacta.texto} · ${clasificacion.icono} ${clasificacion.texto}`
    : `${compacta.emoji} ${compacta.texto}`;

  // Fecha: "10 de octubre de 2026" para un solo día, o
  // "10 – 12 de octubre de 2026" cuando el evento dura varios días.
  const textoFecha = esVariosDias
    ? `${formatearFechaLegible(fechaISO)} – ${formatearFechaLegible(finISO)}`
    : formatearFechaLegible(fechaISO);

  return `
    <article class="tarjeta-evento ${estado.clase} ${evento.importante ? 'es-importante' : ''}" data-id="${evento.id}">
      <div class="tarjeta-header">
        <span class="badge-estado">${etiquetaCombinada}</span>
        ${variosDiasBadge}
        ${recurrente}
        ${estrella ? `<span class="tarjeta-estrella" title="Evento importante">${estrella}</span>` : ''}
      </div>
      <h3 class="tarjeta-nombre">${escaparHTML(evento.nombre)}</h3>
      <p class="tarjeta-tipo">${escaparHTML(evento.tipo)}</p>
      <p class="tarjeta-dato"><strong>Fecha:</strong> ${textoFecha}${evento.hora ? ' · ' + escaparHTML(evento.hora) : ''}</p>
      ${evento.lugar ? `<p class="tarjeta-dato"><strong>Lugar:</strong> ${escaparHTML(evento.lugar)}</p>` : ''}
      ${ubicacion ? `<p class="tarjeta-dato"><strong>Ubicación:</strong> ${escaparHTML(ubicacion)}</p>` : ''}
      ${evento.organizador ? `<p class="tarjeta-dato"><strong>Organizador:</strong> ${escaparHTML(evento.organizador)}</p>` : ''}
      ${(evento.contacto || evento.telefono) ? `<p class="tarjeta-dato"><strong>Contacto:</strong> ${escaparHTML(evento.contacto)}${evento.telefono ? ' · ' + escaparHTML(evento.telefono) : ''}</p>` : ''}
      ${evento.observaciones ? `<p class="tarjeta-dato"><strong>Observaciones:</strong> ${escaparHTML(evento.observaciones)}</p>` : ''}
      ${evento.enlace ? `<p class="tarjeta-dato"><a href="${escaparHTML(evento.enlace)}" target="_blank" rel="noopener">Ver enlace ↗</a></p>` : ''}
      <div class="tarjeta-acciones">
        <button class="btn-accion btn-importante" data-accion="importante" data-id="${evento.id}">${evento.importante ? '★ Quitar importante' : '☆ Marcar importante'}</button>
        <button class="btn-accion btn-editar" data-accion="editar" data-id="${evento.id}">Editar</button>
        <button class="btn-accion btn-eliminar" data-accion="eliminar" data-id="${evento.id}">Eliminar</button>
      </div>
    </article>
  `;
}
