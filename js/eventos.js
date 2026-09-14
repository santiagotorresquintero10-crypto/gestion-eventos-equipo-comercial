// ============================================================
// eventos.js
// Lógica exclusiva de eventos.html: listado completo de próximos
// eventos, buscador, filtros y accesos rápidos.
// ============================================================

import { escucharEventos } from './eventos-service.js';
import { fechaToISO, calcularDiasEvento, crearTarjetaEventoHTML, ordenarPorUrgencia } from './helpers.js';
import { inicializarModal, abrirModalNuevo } from './modal.js';
import { activarAccionesTarjetas } from './interacciones.js';
import { inicializarCentroAlertas } from './alertas.js';

let eventosCache = [];
let accesoRapidoActivo = 'todos';
let filtroClasificacionActivo = 'todos';

inicializarModal();
inicializarCentroAlertas();
document.getElementById('btn-nuevo-evento').addEventListener('click', abrirModalNuevo);

const contenedor = document.getElementById('lista-eventos');
activarAccionesTarjetas(contenedor, (id) => eventosCache.find((ev) => ev.id === id));

const inputBuscar = document.getElementById('buscar-evento');
const filtroTipo = document.getElementById('filtro-tipo');
const filtroMunicipio = document.getElementById('filtro-municipio');
const filtroDepartamento = document.getElementById('filtro-departamento');
const filtroMes = document.getElementById('filtro-mes');

[inputBuscar, filtroTipo, filtroMunicipio, filtroDepartamento, filtroMes].forEach((el) => {
  el.addEventListener('input', renderizarLista);
  el.addEventListener('change', renderizarLista);
});

document.querySelectorAll('.chip-filtro').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip-filtro').forEach((c) => c.classList.remove('activo'));
    chip.classList.add('activo');
    accesoRapidoActivo = chip.dataset.filtro;
    renderizarLista();
  });
});

document.querySelectorAll('.chip-clasificacion').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip-clasificacion').forEach((c) => c.classList.remove('activo'));
    chip.classList.add('activo');
    filtroClasificacionActivo = chip.dataset.clasificacion;
    renderizarLista();
  });
});

escucharEventos((eventos) => {
  eventosCache = eventos;
  poblarFiltroTipo(eventos);
  renderizarLista();
});

// Recalcula cada minuto: si alguien deja la pestaña abierta y pasa la
// medianoche (o un evento pasa de "faltan 2 días" a "mañana"), la vista
// se actualiza sola, sin depender de un cambio nuevo en Firestore.
setInterval(renderizarLista, 60000);

function poblarFiltroTipo(eventos) {
  const seleccionActual = filtroTipo.value;
  const tiposUnicos = [...new Set(eventos.map((ev) => ev.tipo).filter(Boolean))].sort();
  filtroTipo.innerHTML =
    '<option value="">Todos los tipos</option>' +
    tiposUnicos.map((t) => `<option value="${t}">${t}</option>`).join('');
  filtroTipo.value = seleccionActual;
}

function renderizarLista() {
  let lista = eventosCache.map((ev) => ({
    ...ev,
    fechaISO: fechaToISO(ev.fecha),
    dias: calcularDiasEvento(ev)
  }));

  // Esta vista es de próximos eventos; los pasados viven en historico.html
  lista = lista.filter((ev) => ev.dias >= 0);

  const texto = inputBuscar.value.trim().toLowerCase();
  if (texto) lista = lista.filter((ev) => ev.nombre.toLowerCase().includes(texto));

  if (filtroTipo.value) lista = lista.filter((ev) => ev.tipo === filtroTipo.value);

  if (filtroMunicipio.value.trim()) {
    const m = filtroMunicipio.value.trim().toLowerCase();
    lista = lista.filter((ev) => (ev.municipio || '').toLowerCase().includes(m));
  }

  if (filtroDepartamento.value.trim()) {
    const d = filtroDepartamento.value.trim().toLowerCase();
    lista = lista.filter((ev) => (ev.departamento || '').toLowerCase().includes(d));
  }

  if (filtroMes.value) lista = lista.filter((ev) => ev.fechaISO.slice(0, 7) === filtroMes.value);

  if (accesoRapidoActivo === 'hoy') lista = lista.filter((ev) => ev.dias === 0);
  else if (accesoRapidoActivo === 'semana') lista = lista.filter((ev) => ev.dias <= 7);
  else if (accesoRapidoActivo === 'mes') lista = lista.filter((ev) => ev.dias <= 30);
  else if (accesoRapidoActivo === 'importantes') lista = lista.filter((ev) => ev.importante);

  if (filtroClasificacionActivo !== 'todos') {
    lista = lista.filter((ev) => ev.clasificacion === filtroClasificacionActivo);
  }

  document.getElementById('contador-resultados').textContent =
    `${lista.length} evento${lista.length === 1 ? '' : 's'} encontrado${lista.length === 1 ? '' : 's'}`;

  lista = ordenarPorUrgencia(lista);

  contenedor.innerHTML = lista.length
    ? lista.map(crearTarjetaEventoHTML).join('')
    : '<p class="mensaje-vacio">No se encontraron eventos con estos filtros.</p>';
}
