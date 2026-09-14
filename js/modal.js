// ============================================================
// modal.js
// Formulario emergente (modal) para crear y editar eventos,
// incluyendo recurrencia (simplificada: solo frecuencia + días)
// y el selector de alcance para series (Solo este / Siguientes / Toda).
// ============================================================

import { TIPOS_EVENTO, DIAS_SEMANA_LABELS, FRECUENCIAS_RECURRENCIA, CLASIFICACIONES_EVENTO, generarOcurrenciasEnRango, fechaToISO, diferenciaDiasISO } from './helpers.js';
import { guardarEvento, guardarEventoConRecurrencia, actualizarSerie, regenerarSerie, eliminarEvento } from './eventos-service.js';

let eventoEditandoId = null;
let eventoEditandoSerieId = null;
let eventoEditandoFechaISO = null;

function construirOpcionesTipo() {
  return TIPOS_EVENTO.map((t) => `<option value="${t}">${t}</option>`).join('');
}

function construirOpcionesFrecuencia() {
  return (
    '<option value="ninguna">No repetir</option>' +
    FRECUENCIAS_RECURRENCIA.map((f) => `<option value="${f.valor}">${f.etiqueta}</option>`).join('')
  );
}

function construirOpcionesClasificacion() {
  return (
    '<option value="">Selecciona...</option>' +
    CLASIFICACIONES_EVENTO.map((c) => `<option value="${c.valor}">${c.etiqueta}</option>`).join('')
  );
}

function construirCheckboxesDias() {
  // getUTCDay(): 0=domingo ... 6=sábado. Mostramos Lunes primero por comodidad visual.
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden
    .map(
      (num) => `
      <label class="check-dia">
        <input type="checkbox" class="chk-dia-semana" value="${num}"> ${DIAS_SEMANA_LABELS[num].slice(0, 3)}
      </label>
    `
    )
    .join('');
}

/** Debe llamarse una vez por página, apenas carga el script. */
export function inicializarModal() {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div id="modal-overlay" class="modal-overlay oculto">
      <div class="modal-caja">
        <div class="modal-header">
          <h2 id="modal-titulo">Nuevo evento</h2>
          <button id="modal-cerrar" class="modal-cerrar" type="button" aria-label="Cerrar">&times;</button>
        </div>
        <form id="form-evento" class="form-evento">
          <fieldset>
            <legend>Información del evento</legend>
            <label>Nombre del evento *
              <input type="text" id="f-nombre" required>
            </label>
            <label>Tipo de evento *
              <select id="f-tipo" required>${construirOpcionesTipo()}</select>
            </label>
            <label>Alcance del evento *
              <select id="f-clasificacion" required>${construirOpcionesClasificacion()}</select>
            </label>
            <div class="fila-doble">
              <label>Fecha *
                <input type="date" id="f-fecha" required>
              </label>
              <label>Hora
                <input type="time" id="f-hora">
              </label>
            </div>
            <label>Fecha final (solo si el evento dura varios días)
              <input type="date" id="f-fecha-fin-evento">
            </label>
            <p class="texto-ayuda" id="texto-ayuda-varios-dias"></p>
            <label>Lugar
              <input type="text" id="f-lugar" placeholder="Ej. Recinto ferial, coliseo, etc.">
            </label>
            <div class="fila-doble">
              <label>Municipio
                <input type="text" id="f-municipio">
              </label>
              <label>Departamento
                <input type="text" id="f-departamento">
              </label>
            </div>
            <label>Organizador
              <input type="text" id="f-organizador">
            </label>
          </fieldset>

          <fieldset>
            <legend>Información de contacto</legend>
            <label>Nombre del contacto
              <input type="text" id="f-contacto">
            </label>
            <div class="fila-doble">
              <label>Teléfono
                <input type="tel" id="f-telefono">
              </label>
              <label>Enlace o página web
                <input type="url" id="f-enlace" placeholder="https://">
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Seguimiento</legend>
            <label>Observaciones
              <textarea id="f-observaciones" rows="3"></textarea>
            </label>
            <label class="check-label">
              <input type="checkbox" id="f-importante"> ⭐ Marcar como evento importante
            </label>
          </fieldset>

          <fieldset id="fieldset-recurrencia">
            <legend>Recurrencia</legend>
            <label>Repetir evento
              <select id="f-repetir">${construirOpcionesFrecuencia()}</select>
            </label>
            <div id="grupo-dias-semana" class="dias-semana">
              <span class="dias-semana-titulo">Días:</span>
              ${construirCheckboxesDias()}
            </div>
            <label id="grupo-fecha-final">Fecha final hasta (solo si repites el evento)
              <input type="date" id="f-fecha-final">
            </label>
            <p class="texto-ayuda" id="texto-ayuda-recurrencia"></p>
          </fieldset>

          <div class="modal-acciones">
            <button type="button" id="modal-cancelar" class="btn-cancelar">Cancelar</button>
            <button type="submit" class="btn-primario">Guardar evento</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('modal-cerrar').addEventListener('click', cerrarModal);
  document.getElementById('modal-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') cerrarModal();
  });
  document.getElementById('form-evento').addEventListener('submit', manejarGuardar);

  document.getElementById('f-repetir').addEventListener('change', actualizarVisibilidadDias);
  document.getElementById('f-fecha').addEventListener('change', sincronizarMinimoFechaFinal);
  document.getElementById('f-fecha-fin-evento').addEventListener('change', actualizarAyudaVariosDias);
}

/**
 * El selector nativo de "Fecha final" (de la recurrencia) y el de "Fecha
 * final" (de varios días) no dejan elegir algo anterior a la fecha inicial.
 */
function sincronizarMinimoFechaFinal() {
  const fechaInicial = document.getElementById('f-fecha').value;
  if (!fechaInicial) return;
  document.getElementById('f-fecha-final').min = fechaInicial;
  document.getElementById('f-fecha-fin-evento').min = fechaInicial;
  actualizarAyudaVariosDias();
}

/** Texto de ayuda: "Este evento durará 3 días" mientras se elige la fecha final. */
function actualizarAyudaVariosDias() {
  const inicio = document.getElementById('f-fecha').value;
  const fin = document.getElementById('f-fecha-fin-evento').value;
  const ayuda = document.getElementById('texto-ayuda-varios-dias');
  if (inicio && fin && fin > inicio) {
    const dias = diferenciaDiasISO(inicio, fin) + 1;
    ayuda.textContent = `Este evento durará ${dias} días (del ${inicio.split('-').reverse().join('/')} al ${fin.split('-').reverse().join('/')}).`;
  } else {
    ayuda.textContent = '';
  }
}

function actualizarVisibilidadDias() {
  document.getElementById('texto-ayuda-recurrencia').textContent = '';
}

function resetearRecurrencia() {
  document.getElementById('f-repetir').value = 'ninguna';
  document.querySelectorAll('.chk-dia-semana').forEach((chk) => (chk.checked = false));
  document.getElementById('f-fecha-final').value = '';
  actualizarVisibilidadDias();
}

/** Marca en los checkboxes los días guardados de una recurrencia existente. */
function precargarRecurrencia(recurrencia) {
  if (!recurrencia) {
    resetearRecurrencia();
    return;
  }
  document.getElementById('f-repetir').value = recurrencia.frecuencia || 'ninguna';
  const diasGuardados = new Set(recurrencia.dias || []);
  document.querySelectorAll('.chk-dia-semana').forEach((chk) => {
    chk.checked = diasGuardados.has(Number(chk.value));
  });
  document.getElementById('f-fecha-final').value = recurrencia.fechaFinal || '';
  actualizarVisibilidadDias();
}

/** Abre el modal vacío, listo para crear un evento nuevo. */
export function abrirModalNuevo() {
  eventoEditandoId = null;
  eventoEditandoSerieId = null;
  eventoEditandoFechaISO = null;

  document.getElementById('modal-titulo').textContent = 'Nuevo evento';
  document.getElementById('form-evento').reset();
  resetearRecurrencia();
  document.getElementById('f-fecha-final').min = '';
  document.getElementById('f-fecha-fin-evento').value = '';
  document.getElementById('f-fecha-fin-evento').min = '';
  document.getElementById('texto-ayuda-varios-dias').textContent = '';
  document.getElementById('modal-overlay').classList.remove('oculto');
  document.getElementById('f-nombre').focus();
}

/**
 * Abre el modal con los datos de un evento existente para editarlo.
 * IMPORTANTE: si el evento tiene una recurrencia guardada, se muestra y
 * se pre-selecciona tal cual quedó guardada (antes esto no pasaba: la
 * sección de recurrencia se ocultaba por completo al editar).
 * @param {object} evento - debe incluir fechaISO ("YYYY-MM-DD") ya calculado.
 */
export function abrirModalEditar(evento) {
  eventoEditandoId = evento.id;
  eventoEditandoSerieId = evento.serieId || null;
  eventoEditandoFechaISO = evento.fechaISO;

  document.getElementById('modal-titulo').textContent = evento.serieId ? 'Editar evento (parte de una serie 🔁)' : 'Editar evento';
  document.getElementById('f-nombre').value = evento.nombre || '';
  document.getElementById('f-tipo').value = evento.tipo || '';
  document.getElementById('f-clasificacion').value = evento.clasificacion || '';
  document.getElementById('f-fecha').value = evento.fechaISO || '';
  document.getElementById('f-fecha-fin-evento').value = evento.fechaFin ? fechaToISO(evento.fechaFin) : '';
  document.getElementById('f-hora').value = evento.hora || '';
  document.getElementById('f-lugar').value = evento.lugar || '';
  document.getElementById('f-municipio').value = evento.municipio || '';
  document.getElementById('f-departamento').value = evento.departamento || '';
  document.getElementById('f-organizador').value = evento.organizador || '';
  document.getElementById('f-contacto').value = evento.contacto || '';
  document.getElementById('f-telefono').value = evento.telefono || '';
  document.getElementById('f-enlace').value = evento.enlace || '';
  document.getElementById('f-observaciones').value = evento.observaciones || '';
  document.getElementById('f-importante').checked = !!evento.importante;

  precargarRecurrencia(evento.recurrencia);
  document.getElementById('f-fecha-final').min = evento.fechaISO || '';
  document.getElementById('f-fecha-fin-evento').min = evento.fechaISO || '';
  actualizarAyudaVariosDias();

  document.getElementById('modal-overlay').classList.remove('oculto');
}

function cerrarModal() {
  document.getElementById('modal-overlay').classList.add('oculto');
  eventoEditandoId = null;
  eventoEditandoSerieId = null;
  eventoEditandoFechaISO = null;
}

/**
 * Muestra un selector de alcance (Solo este / Este y los siguientes / Toda la serie).
 * Se usa tanto al editar como al eliminar un evento que pertenece a una serie.
 * @returns {Promise<'solo'|'siguientes'|'toda'|null>} null si el usuario cancela.
 */
export function mostrarSelectorAlcance() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-caja modal-caja-chica">
        <h3>¿Qué desea modificar?</h3>
        <p class="texto-ayuda">Este evento pertenece a una serie recurrente 🔁</p>
        <div class="opciones-alcance">
          <button type="button" data-alcance="solo" class="btn-alcance">Solo este evento</button>
          <button type="button" data-alcance="siguientes" class="btn-alcance">Este evento y los siguientes</button>
          <button type="button" data-alcance="toda" class="btn-alcance">Toda la serie</button>
        </div>
        <button type="button" class="btn-cancelar btn-cancelar-alcance">Cancelar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-alcance]');
      if (boton) {
        document.body.removeChild(overlay);
        resolve(boton.dataset.alcance);
        return;
      }
      if (e.target.classList.contains('btn-cancelar-alcance') || e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });
  });
}

function leerDatosFormulario() {
  return {
    nombre: document.getElementById('f-nombre').value.trim(),
    tipo: document.getElementById('f-tipo').value,
    clasificacion: document.getElementById('f-clasificacion').value,
    fechaISO: document.getElementById('f-fecha').value,
    fechaFinRangoISO: document.getElementById('f-fecha-fin-evento').value || null,
    hora: document.getElementById('f-hora').value,
    lugar: document.getElementById('f-lugar').value.trim(),
    municipio: document.getElementById('f-municipio').value.trim(),
    departamento: document.getElementById('f-departamento').value.trim(),
    organizador: document.getElementById('f-organizador').value.trim(),
    contacto: document.getElementById('f-contacto').value.trim(),
    telefono: document.getElementById('f-telefono').value.trim(),
    enlace: document.getElementById('f-enlace').value.trim(),
    observaciones: document.getElementById('f-observaciones').value.trim(),
    importante: document.getElementById('f-importante').checked
  };
}

/** Lee la recurrencia del formulario. Devuelve null si "No repetir" está seleccionado. */
function leerConfigRecurrencia() {
  const frecuencia = document.getElementById('f-repetir').value;
  if (frecuencia === 'ninguna') return null;

  const dias = Array.from(document.querySelectorAll('.chk-dia-semana:checked')).map((chk) => Number(chk.value));
  const fechaFinal = document.getElementById('f-fecha-final').value;
  return { frecuencia, dias, fechaFinal };
}

async function manejarGuardar(e) {
  e.preventDefault();
  const datos = leerDatosFormulario();
  const nuevaRecurrencia = leerConfigRecurrencia();

  if (!datos.clasificacion) {
    alert('Selecciona el alcance del evento: Nacional o Internacional.');
    return;
  }

  if (datos.fechaFinRangoISO && datos.fechaFinRangoISO < datos.fechaISO) {
    alert('La fecha final del evento no puede ser anterior a la fecha de inicio.');
    return;
  }

  if (nuevaRecurrencia) {
    if (nuevaRecurrencia.dias.length === 0) {
      alert('Selecciona al menos un día para la recurrencia, o elige "No repetir".');
      return;
    }
    if (!nuevaRecurrencia.fechaFinal) {
      alert('La fecha final es obligatoria cuando el evento se repite.');
      return;
    }
    if (nuevaRecurrencia.fechaFinal < datos.fechaISO) {
      alert('La fecha final no puede ser anterior a la fecha inicial del evento.');
      return;
    }
  }

  const boton = e.target.querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    if (eventoEditandoId && eventoEditandoSerieId) {
      // Editando un evento que YA pertenece a una serie: preguntar alcance primero.
      const alcance = await mostrarSelectorAlcance();
      if (!alcance) {
        boton.disabled = false;
        boton.textContent = 'Guardar evento';
        return;
      }

      if (alcance === 'solo') {
        // Solo este evento puntual: se guarda como evento normal, sin tocar la recurrencia.
        await guardarEvento(datos, eventoEditandoId);
      } else if (nuevaRecurrencia) {
        // Se pidió aplicar a "siguientes" o "toda" Y además hay una recurrencia
        // configurada en el formulario -> se regenera la serie con el nuevo patrón
        // (incluye el caso de solo haber cambiado la fecha final: ampliarla o acortarla).
        await regenerarSerie(eventoEditandoSerieId, eventoEditandoFechaISO, nuevaRecurrencia, datos, alcance);
      } else {
        // Se pidió "siguientes"/"toda" pero se dejó "No repetir": solo se
        // actualizan los datos normales (nombre, lugar, etc.), sin regenerar fechas.
        await actualizarSerie(eventoEditandoSerieId, eventoEditandoFechaISO, datos, alcance);
      }
    } else if (eventoEditandoId) {
      // Editando un evento normal (sin serie). Si ahora se le agrega recurrencia,
      // se convierte en el punto de partida de una serie nueva.
      if (nuevaRecurrencia) {
        const fechas = generarOcurrenciasEnRango(nuevaRecurrencia, datos.fechaISO, datos.fechaISO, nuevaRecurrencia.fechaFinal);
        datos.recurrencia = nuevaRecurrencia;
        await guardarEventoConRecurrencia(datos, fechas, datos.fechaISO);
        // El evento original (ya no recurrente) se reemplaza por la nueva serie.
        await eliminarEvento(eventoEditandoId);
      } else {
        await guardarEvento(datos, eventoEditandoId);
      }
    } else {
      // Creando un evento nuevo.
      if (nuevaRecurrencia) {
        const fechas = generarOcurrenciasEnRango(nuevaRecurrencia, datos.fechaISO, datos.fechaISO, nuevaRecurrencia.fechaFinal);
        if (fechas.length === 0) {
          alert('La configuración de recurrencia no generó ninguna fecha. Revisa los días y la fecha final elegidos.');
          boton.disabled = false;
          boton.textContent = 'Guardar evento';
          return;
        }
        datos.recurrencia = nuevaRecurrencia;
        await guardarEventoConRecurrencia(datos, fechas, datos.fechaISO);
      } else {
        await guardarEvento(datos, null);
      }
    }
    cerrarModal();
  } catch (err) {
    console.error('Error al guardar evento:', err);
    alert('Ocurrió un error al guardar el evento. Revisa la consola (F12) para más detalles.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar evento';
  }
}
