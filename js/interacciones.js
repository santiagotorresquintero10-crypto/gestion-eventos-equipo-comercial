// ============================================================
// interacciones.js
// Maneja los clics en los botones de cada tarjeta de evento
// (Editar, Eliminar, Marcar importante), incluyendo el caso de
// eventos que pertenecen a una serie recurrente.
// ============================================================

import { eliminarEvento, alternarImportante, eliminarSerie } from './eventos-service.js';
import { abrirModalEditar, mostrarSelectorAlcance } from './modal.js';
import { fechaToISO } from './helpers.js';

/**
 * @param {HTMLElement} contenedor - el elemento que contiene las tarjetas.
 * @param {(id: string) => object|undefined} obtenerEventoPorId - función que busca
 *        el evento completo en la caché local a partir de su id.
 */
export function activarAccionesTarjetas(contenedor, obtenerEventoPorId) {
  if (!contenedor) return;

  contenedor.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;

    const id = boton.dataset.id;
    const accion = boton.dataset.accion;
    const evento = obtenerEventoPorId(id);
    if (!evento) return;

    if (accion === 'eliminar') {
      await manejarEliminar(boton, id, evento);
    } else if (accion === 'importante') {
      boton.disabled = true;
      try {
        await alternarImportante(id, evento.importante);
      } catch (err) {
        console.error('Error al actualizar evento importante:', err);
      } finally {
        boton.disabled = false;
      }
    } else if (accion === 'editar') {
      abrirModalEditar({ ...evento, fechaISO: fechaToISO(evento.fecha) });
    }
  });
}

async function manejarEliminar(boton, id, evento) {
  if (evento.serieId) {
    const alcance = await mostrarSelectorAlcance();
    if (!alcance) return;

    if (alcance === 'solo') {
      const confirmado = confirm(
        `¿Eliminar solo esta ocurrencia de "${evento.nombre}"? Esta acción no se puede deshacer.`
      );
      if (!confirmado) return;
      boton.disabled = true;
      try {
        await eliminarEvento(id);
      } catch (err) {
        console.error('Error al eliminar evento:', err);
        alert('No se pudo eliminar el evento. Intenta de nuevo.');
        boton.disabled = false;
      }
      return;
    }

    const mensaje =
      alcance === 'toda'
        ? `Esto eliminará TODA la serie de "${evento.nombre}" (todas sus fechas). Esta acción no se puede deshacer.`
        : `Esto eliminará "${evento.nombre}" a partir de esta fecha en adelante. Esta acción no se puede deshacer.`;
    const confirmado = confirm(mensaje);
    if (!confirmado) return;

    boton.disabled = true;
    try {
      await eliminarSerie(evento.serieId, fechaToISO(evento.fecha), alcance);
    } catch (err) {
      console.error('Error al eliminar la serie:', err);
      alert('No se pudo eliminar la serie. Intenta de nuevo.');
      boton.disabled = false;
    }
    return;
  }

  // Evento normal, sin recurrencia.
  const confirmado = confirm(
    `¿Está seguro de eliminar el evento "${evento.nombre}"? Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  boton.disabled = true;
  try {
    await eliminarEvento(id);
  } catch (err) {
    console.error('Error al eliminar evento:', err);
    alert('No se pudo eliminar el evento. Intenta de nuevo.');
    boton.disabled = false;
  }
}
