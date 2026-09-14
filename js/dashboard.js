// ============================================================
// dashboard.js
// Lógica exclusiva de index.html: indicadores ejecutivos (Hoy,
// Esta semana, Este mes, Próximos, con desglose Nacional/Internacional),
// filtros rápidos y un adelanto de los próximos eventos ordenado por
// urgencia real (fecha + hora).
// ============================================================

import { escucharEventos } from './eventos-service.js';
import {
  calcularDiasEvento,
  crearTarjetaEventoHTML,
  ordenarPorUrgencia
} from './helpers.js';
import { inicializarModal, abrirModalNuevo } from './modal.js';
import { activarAccionesTarjetas } from './interacciones.js';
import { inicializarCentroAlertas } from './alertas.js';

let eventosCache = [];
let filtroActivo = 'todos'; // 'todos' | 'nacional' | 'internacional' | 'importantes'

inicializarModal();
inicializarCentroAlertas();

const botonNuevo = document.getElementById('btn-nuevo-evento');
if (botonNuevo) botonNuevo.addEventListener('click', abrirModalNuevo);

const contenedorProximos = document.getElementById('lista-proximos-dashboard');
activarAccionesTarjetas(contenedorProximos, (id) => eventosCache.find((ev) => ev.id === id));

document.querySelectorAll('.chip-filtro').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip-filtro').forEach((c) => c.classList.remove('activo'));
    chip.classList.add('activo');
    filtroActivo = chip.dataset.filtro;
    renderizarDashboard(eventosCache);
  });
});

escucharEventos((eventos) => {
  eventosCache = eventos;
  renderizarDashboard(eventos);
});

// Recalcula cada minuto: si alguien deja la pestaña abierta y cambia el
// día, los indicadores y las tarjetas se actualizan solos.
setInterval(() => renderizarDashboard(eventosCache), 60000);

/** "6 Nacionales · 4 Internacionales" a partir de un grupo de eventos ya filtrado por fecha. */
function textoDesglose(grupo) {
  const nacionales = grupo.filter((ev) => ev.clasificacion === 'nacional').length;
  const internacionales = grupo.filter((ev) => ev.clasificacion === 'internacional').length;
  return `${nacionales} Nacionales · ${internacionales} Internacionales`;
}

function renderizarDashboard(eventos) {
  // Todos los indicadores, la campana, el calendario y "Próximos eventos"
  // parten de esta misma colección de Firestore — no hay un cálculo
  // paralelo en ningún lado, así que siempre van a coincidir entre sí.
  const conDias = eventos.map((ev) => ({
    ...ev,
    dias: calcularDiasEvento(ev)
  }));

  const proximos = conDias.filter((ev) => ev.dias >= 0);
  const hoy = proximos.filter((ev) => ev.dias === 0);
  const semana = proximos.filter((ev) => ev.dias <= 7);
  const mes = proximos.filter((ev) => ev.dias <= 30);

  document.getElementById('stat-hoy').textContent = hoy.length;
  document.getElementById('stat-semana').textContent = semana.length;
  document.getElementById('stat-mes').textContent = mes.length;
  document.getElementById('stat-proximos').textContent = proximos.length;

  document.getElementById('stat-hoy-desglose').textContent = textoDesglose(hoy);
  document.getElementById('stat-semana-desglose').textContent = textoDesglose(semana);
  document.getElementById('stat-mes-desglose').textContent = textoDesglose(mes);
  document.getElementById('stat-proximos-desglose').textContent = textoDesglose(proximos);

  let listaFiltrada = proximos;
  if (filtroActivo === 'nacional') listaFiltrada = proximos.filter((ev) => ev.clasificacion === 'nacional');
  else if (filtroActivo === 'internacional') listaFiltrada = proximos.filter((ev) => ev.clasificacion === 'internacional');
  else if (filtroActivo === 'importantes') listaFiltrada = proximos.filter((ev) => ev.importante);

  const destacados = ordenarPorUrgencia(listaFiltrada).slice(0, 6);

  contenedorProximos.innerHTML = destacados.length
    ? destacados.map(crearTarjetaEventoHTML).join('')
    : '<p class="mensaje-vacio">No hay eventos que coincidan con este filtro.</p>';
}
