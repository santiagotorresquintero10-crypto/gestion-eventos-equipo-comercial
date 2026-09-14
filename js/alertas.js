// ============================================================
// alertas.js
// Centro de alertas (campana): cuenta y lista los próximos eventos
// que están dentro de la ventana de alerta (0 a 7 días), deduplicando
// series recurrentes para mostrar solo su ocurrencia más próxima, con
// filtro propio por clasificación.
//
// IMPORTANTE: todo el HTML de este widget (campana + panel + botón X)
// se construye aquí mismo con innerHTML, exactamente igual que hace
// modal.js con #modal-root. Esto garantiza que el marcado y el
// JavaScript siempre estén sincronizados entre sí — no depende de que
// el HTML de cada página tenga el marcado correcto por separado.
// ============================================================

import { escucharEventos } from './eventos-service.js';
import { fechaToISO, calcularDiasRestantes, obtenerEstadoProximidad, obtenerMensajeAlerta, obtenerEtiquetaClasificacion, formatearFechaLegible } from './helpers.js';
import { abrirModalEditar } from './modal.js';

let eventosCache = [];
let filtroActivo = 'todos'; // 'todos' | 'nacional' | 'internacional'
let intervaloRefresco = null;

/**
 * Se llama una vez por página (después de inicializarModal()). Requiere
 * que exista un <div id="alertas-root"></div> en el HTML de esa página.
 */
export function inicializarCentroAlertas() {
  const raiz = document.getElementById('alertas-root');
  if (!raiz) return; // por si alguna página no incluye el widget

  raiz.innerHTML = `
    <div class="campana-wrapper">
      <button id="btn-campana" class="btn-campana" type="button" aria-label="Alertas">
        🔔
        <span id="campana-contador" class="campana-contador oculto">0</span>
      </button>
      <div id="panel-alertas" class="panel-alertas oculto">
        <div class="panel-alertas-header">
          <h3>Próximos eventos</h3>
          <button type="button" id="btn-cerrar-alertas" class="btn-cerrar-alertas" aria-label="Cerrar">&times;</button>
        </div>
        <div class="chips-rapidos panel-alertas-filtros">
          <button type="button" class="chip-clasificacion-alerta activo" data-clasificacion="todos">Todas</button>
          <button type="button" class="chip-clasificacion-alerta" data-clasificacion="nacional">Nacionales</button>
          <button type="button" class="chip-clasificacion-alerta" data-clasificacion="internacional">Internacionales</button>
        </div>
        <div id="lista-alertas" class="lista-alertas">
          <p class="mensaje-vacio">Cargando alertas...</p>
        </div>
      </div>
    </div>
  `;

  const boton = document.getElementById('btn-campana');
  const panel = document.getElementById('panel-alertas');
  const botonCerrar = document.getElementById('btn-cerrar-alertas');

  const cerrarPanel = () => panel.classList.add('oculto');
  const abrirPanel = () => panel.classList.remove('oculto');

  // --- Campana: abre o cierra ---
  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.contains('oculto') ? abrirPanel() : cerrarPanel();
  });

  // --- Botón "✕": cierra, igual que "modal-cerrar" en modal.js ---
  botonCerrar.addEventListener('click', (e) => {
    e.stopPropagation();
    cerrarPanel();
  });

  // --- Clic afuera del panel (y de la campana) también cierra ---
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('oculto') && !panel.contains(e.target) && !boton.contains(e.target)) {
      cerrarPanel();
    }
  });

  // --- Tecla Escape también cierra ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.classList.contains('oculto')) cerrarPanel();
  });

  // --- Filtro Todas / Nacionales / Internacionales, dentro del panel ---
  document.querySelectorAll('.chip-clasificacion-alerta').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.chip-clasificacion-alerta').forEach((c) => c.classList.remove('activo'));
      chip.classList.add('activo');
      filtroActivo = chip.dataset.clasificacion;
      render();
    });
  });

  // --- Clic en un evento de la lista: cierra el panel y abre su edición ---
  const contenedorLista = document.getElementById('lista-alertas');
  contenedorLista.addEventListener('click', (e) => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const evento = eventosCache.find((ev) => ev.id === item.dataset.id);
    if (!evento) return;
    cerrarPanel();
    abrirModalEditar({ ...evento, fechaISO: fechaToISO(evento.fecha) });
  });

  escucharEventos((eventos) => {
    eventosCache = eventos;
    render();
  });

  // Recalcula cada minuto para que, si alguien deja la pestaña abierta y
  // cambia el día (o pasa de "faltan 2 días" a "mañana"), se actualice
  // solo, sin depender de que llegue un cambio nuevo desde Firestore.
  if (!intervaloRefresco) {
    intervaloRefresco = setInterval(render, 60000);
  }
}

/**
 * Calcula la lista de alertas vigentes: eventos entre 0 y 7 días,
 * deduplicados por serie (solo la ocurrencia más próxima de cada serie
 * recurrente), ordenados de más urgente a menos urgente.
 */
function calcularAlertas() {
  const candidatos = eventosCache
    .map((ev) => {
      const fechaISO = fechaToISO(ev.fecha);
      return { ...ev, fechaISO, dias: calcularDiasRestantes(fechaISO) };
    })
    .filter((ev) => ev.dias >= 0 && ev.dias <= 7);

  const porGrupo = new Map();
  candidatos.forEach((ev) => {
    const clave = ev.serieId || ev.id;
    const actual = porGrupo.get(clave);
    if (!actual || ev.dias < actual.dias) porGrupo.set(clave, ev);
  });

  let lista = Array.from(porGrupo.values()).sort((a, b) => a.dias - b.dias);

  if (filtroActivo !== 'todos') {
    lista = lista.filter((ev) => ev.clasificacion === filtroActivo);
  }

  return lista;
}

function render() {
  const contador = document.getElementById('campana-contador');
  const contenedorLista = document.getElementById('lista-alertas');
  if (!contador || !contenedorLista) return;

  const alertas = calcularAlertas();

  const totalSinFiltro = filtroActivo === 'todos' ? alertas.length : calcularAlertasSinFiltro().length;
  contador.textContent = String(totalSinFiltro);
  contador.classList.toggle('oculto', totalSinFiltro === 0);

  contenedorLista.innerHTML = alertas.length
    ? alertas.map(crearItemAlertaHTML).join('')
    : '<p class="mensaje-vacio">Sin alertas por ahora.</p>';
}

function calcularAlertasSinFiltro() {
  const filtroOriginal = filtroActivo;
  filtroActivo = 'todos';
  const resultado = calcularAlertas();
  filtroActivo = filtroOriginal;
  return resultado;
}

function crearItemAlertaHTML(evento) {
  const estado = obtenerEstadoProximidad(evento.dias);
  const alerta = obtenerMensajeAlerta(evento.dias);
  const clasificacion = obtenerEtiquetaClasificacion(evento.clasificacion);

  return `
    <button type="button" class="item-alerta ${estado.clase}" data-id="${evento.id}">
      <span class="item-alerta-punto"></span>
      <span class="item-alerta-info">
        <strong>${evento.nombre}</strong>
        ${clasificacion ? `<span class="item-alerta-clasificacion">${clasificacion.icono} ${clasificacion.texto}</span>` : ''}
        <span class="item-alerta-mensaje">${alerta ? `${alerta.icono} ${alerta.texto}` : ''}</span>
        <span class="item-alerta-fecha">${formatearFechaLegible(evento.fechaISO)}</span>
      </span>
    </button>
  `;
}
