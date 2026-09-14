// ============================================================
// calendario.js
// Lógica exclusiva de calendario.html: cuadrícula mensual con
// indicadores de días con eventos (incluida la clasificación
// Nacional/Internacional), filtro por clasificación, y panel de
// detalle del día seleccionado.
// ============================================================

import { escucharEventos } from './eventos-service.js';
import { fechaToISO, fechaFinEventoISO, diasISOEnRango, obtenerHoyISO, crearTarjetaEventoHTML } from './helpers.js';
import { inicializarModal, abrirModalNuevo } from './modal.js';
import { activarAccionesTarjetas } from './interacciones.js';
import { inicializarCentroAlertas } from './alertas.js';

let eventosCache = [];
let fechaVista = new Date();
let fechaSeleccionadaISO = obtenerHoyISO();
let filtroClasificacionActivo = 'todos'; // 'todos' | 'nacional' | 'internacional'

inicializarModal();
inicializarCentroAlertas();
document.getElementById('btn-nuevo-evento').addEventListener('click', abrirModalNuevo);

const grid = document.getElementById('calendario-grid');
const tituloMes = document.getElementById('calendario-titulo');
const panelDia = document.getElementById('panel-dia-eventos');
activarAccionesTarjetas(panelDia, (id) => eventosCache.find((ev) => ev.id === id));

document.getElementById('btn-mes-anterior').addEventListener('click', () => {
  fechaVista.setMonth(fechaVista.getMonth() - 1);
  render();
});
document.getElementById('btn-mes-siguiente').addEventListener('click', () => {
  fechaVista.setMonth(fechaVista.getMonth() + 1);
  render();
});
document.getElementById('btn-hoy').addEventListener('click', () => {
  fechaVista = new Date();
  fechaSeleccionadaISO = obtenerHoyISO();
  render();
});

document.querySelectorAll('.chip-clasificacion').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip-clasificacion').forEach((c) => c.classList.remove('activo'));
    chip.classList.add('activo');
    filtroClasificacionActivo = chip.dataset.clasificacion;
    render();
  });
});

escucharEventos((eventos) => {
  eventosCache = eventos;
  render();
});

setInterval(render, 60000);

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Aplica el filtro de clasificación (Todos/Nacionales/Internacionales) sin tocar los datos originales. */
function eventosFiltrados() {
  if (filtroClasificacionActivo === 'todos') return eventosCache;
  return eventosCache.filter((ev) => ev.clasificacion === filtroClasificacionActivo);
}

function render() {
  const año = fechaVista.getFullYear();
  const mes = fechaVista.getMonth(); // 0-indexado
  tituloMes.textContent = `${NOMBRES_MES[mes]} ${año}`;

  const eventosPorFecha = {};
  eventosFiltrados().forEach((ev) => {
    const inicioISO = fechaToISO(ev.fecha);
    const finISO = fechaFinEventoISO(ev);
    // Un evento de varios días se registra en CADA fecha de su rango, no
    // solo en la de inicio, para que el calendario lo muestre todos los
    // días correspondientes (sigue siendo el mismo documento/evento).
    diasISOEnRango(inicioISO, finISO).forEach((iso) => {
      if (!eventosPorFecha[iso]) eventosPorFecha[iso] = [];
      eventosPorFecha[iso].push({ ...ev, esInicioDeRango: iso === inicioISO, esFinDeRango: iso === finISO });
    });
  });

  const diaSemanaInicio = new Date(Date.UTC(año, mes, 1)).getUTCDay();
  const diasEnMes = new Date(Date.UTC(año, mes + 1, 0)).getUTCDate();
  const hoyISO = obtenerHoyISO();

  let celdas = NOMBRES_DIA.map((d) => `<div class="calendario-dia-nombre">${d}</div>`).join('');

  for (let i = 0; i < diaSemanaInicio; i++) {
    celdas += `<div class="calendario-celda vacia"></div>`;
  }

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const iso = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const eventosDelDia = eventosPorFecha[iso] || [];
    const cantidad = eventosDelDia.length;
    const esHoy = iso === hoyISO;
    const esSeleccionado = iso === fechaSeleccionadaISO;

    const hayNacional = eventosDelDia.some((ev) => ev.clasificacion === 'nacional');
    const hayInternacional = eventosDelDia.some((ev) => ev.clasificacion === 'internacional');
    const esContinuacion = eventosDelDia.some((ev) => !ev.esInicioDeRango);
    const puntosClasificacion = `
      ${hayNacional ? '<span class="punto-clasificacion punto-nacional" title="Evento(s) nacional(es)"></span>' : ''}
      ${hayInternacional ? '<span class="punto-clasificacion punto-internacional" title="Evento(s) internacional(es)"></span>' : ''}
    `;

    celdas += `
      <button type="button" class="calendario-celda ${esHoy ? 'es-hoy' : ''} ${esSeleccionado ? 'es-seleccionada' : ''} ${esContinuacion ? 'es-continuacion' : ''}" data-fecha="${iso}">
        <span class="celda-numero">${dia}</span>
        <span class="celda-puntos">${puntosClasificacion}</span>
        ${cantidad > 0 ? `<span class="celda-indicador" title="${cantidad} evento(s)">${cantidad}</span>` : ''}
        ${esContinuacion ? '<span class="celda-barra-varios-dias" title="Evento de varios días en curso"></span>' : ''}
      </button>
    `;
  }

  grid.innerHTML = celdas;

  grid.querySelectorAll('.calendario-celda[data-fecha]').forEach((celda) => {
    celda.addEventListener('click', () => {
      fechaSeleccionadaISO = celda.dataset.fecha;
      render();
    });
  });

  renderPanelDia(eventosPorFecha);
}

function renderPanelDia(eventosPorFecha) {
  const eventosDelDia = eventosPorFecha[fechaSeleccionadaISO] || [];
  const titulo = `<h3 class="panel-dia-titulo">Eventos del ${fechaSeleccionadaISO.split('-').reverse().join('/')}</h3>`;

  panelDia.innerHTML =
    titulo +
    (eventosDelDia.length
      ? eventosDelDia.map(crearTarjetaEventoHTML).join('')
      : '<p class="mensaje-vacio">No hay eventos programados este día.</p>');
}
