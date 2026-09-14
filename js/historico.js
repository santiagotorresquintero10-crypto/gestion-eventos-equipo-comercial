// ============================================================
// historico.js
// Lógica exclusiva de historico.html: eventos cuya fecha ya pasó.
// No se mueven registros en Firestore; se calcula comparando la
// fecha del evento contra la fecha actual (Paso 11).
// ============================================================

import { escucharEventos } from './eventos-service.js';
import { fechaToISO, calcularDiasEvento, fechaFinEventoISO, formatearFechaLegible, obtenerEtiquetaClasificacion } from './helpers.js';
import { inicializarModal, abrirModalEditar } from './modal.js';
import { activarAccionesTarjetas } from './interacciones.js';
import { inicializarCentroAlertas } from './alertas.js';

let eventosCache = [];

inicializarModal();
inicializarCentroAlertas();

const contenedor = document.getElementById('lista-historico');
const inputBuscar = document.getElementById('buscar-historico');

activarAccionesTarjetas(contenedor, (id) => eventosCache.find((ev) => ev.id === id));
inputBuscar.addEventListener('input', renderizar);

escucharEventos((eventos) => {
  eventosCache = eventos;
  renderizar();
});

function renderizar() {
  const texto = inputBuscar.value.trim().toLowerCase();

  let historico = eventosCache
    .map((ev) => ({
      ...ev,
      fechaISO: fechaToISO(ev.fecha),
      dias: calcularDiasEvento(ev)
    }))
    .filter((ev) => ev.dias < 0)
    .sort((a, b) => b.fechaISO.localeCompare(a.fechaISO)); // más reciente primero

  if (texto) {
    historico = historico.filter((ev) => ev.nombre.toLowerCase().includes(texto));
  }

  document.getElementById('contador-historico').textContent =
    `${historico.length} evento${historico.length === 1 ? '' : 's'} realizado${historico.length === 1 ? '' : 's'}`;

  contenedor.innerHTML = historico.length
    ? historico.map(crearTarjetaHistorico).join('')
    : '<p class="mensaje-vacio">Todavía no hay eventos pasados registrados.</p>';
}

function crearTarjetaHistorico(evento) {
  const ubicacion = [evento.municipio, evento.departamento].filter(Boolean).join(', ');
  const clasificacion = obtenerEtiquetaClasificacion(evento.clasificacion);
  const badgeClasificacion = clasificacion
    ? `<span class="badge-clasificacion ${clasificacion.clase}">${clasificacion.icono} ${clasificacion.texto}</span>`
    : '';
  const finISO = fechaFinEventoISO(evento);
  const textoFecha = finISO !== evento.fechaISO
    ? `${formatearFechaLegible(evento.fechaISO)} – ${formatearFechaLegible(finISO)}`
    : formatearFechaLegible(evento.fechaISO);
  return `
    <article class="tarjeta-evento estado-pasado" data-id="${evento.id}">
      <div class="tarjeta-header">
        <span class="badge-estado">REALIZADO</span>
        ${badgeClasificacion}
        <span class="tarjeta-dias">${textoFecha}</span>
        ${evento.importante ? '<span class="tarjeta-estrella" title="Era un evento importante">⭐</span>' : ''}
      </div>
      <h3 class="tarjeta-nombre">${evento.nombre}</h3>
      <p class="tarjeta-tipo">${evento.tipo}</p>
      ${evento.lugar ? `<p class="tarjeta-dato"><strong>Lugar:</strong> ${evento.lugar}</p>` : ''}
      ${ubicacion ? `<p class="tarjeta-dato"><strong>Ubicación:</strong> ${ubicacion}</p>` : ''}
      ${evento.observaciones ? `<p class="tarjeta-dato"><strong>Observaciones:</strong> ${evento.observaciones}</p>` : ''}
      <div class="tarjeta-acciones">
        <button class="btn-accion btn-editar" data-accion="editar" data-id="${evento.id}">Ver / Editar</button>
        <button class="btn-accion btn-eliminar" data-accion="eliminar" data-id="${evento.id}">Eliminar</button>
      </div>
    </article>
  `;
}
