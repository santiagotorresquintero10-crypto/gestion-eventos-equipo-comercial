// ============================================================
// eventos-service.js
// Toda la comunicación con la colección "eventos" de Firestore
// vive aquí: leer en tiempo real, crear, actualizar, eliminar,
// marcar/desmarcar como importante, y todo lo relacionado con
// series recurrentes (crear, editar, eliminar).
// ============================================================

import { db } from './firebase-config.js';
import { isoToDateUTC, generarOcurrenciasEnRango, sumarDiasISO, diferenciaDiasISO } from './helpers.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  getDocs,
  writeBatch,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const eventosRef = collection(db, 'eventos');

// Firestore permite máximo 500 operaciones por lote (writeBatch). Se deja
// margen por debajo de ese límite real de la plataforma.
const TAMANIO_MAXIMO_LOTE = 400;

/**
 * Escucha la colección "eventos" en tiempo real, ordenada por fecha
 * ascendente. Cada vez que algo cambie en Firestore (crear, editar,
 * eliminar), se vuelve a llamar el callback automáticamente.
 * Devuelve una función para cancelar la escucha si algún día se necesita.
 */
export function escucharEventos(callback) {
  const q = query(eventosRef, orderBy('fecha', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const eventos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(eventos);
    },
    (error) => {
      console.error('Error al escuchar eventos:', error);
      alert('No se pudieron cargar los eventos. Revisa tu conexión o las reglas de Firestore.');
    }
  );
}

/**
 * Guarda un evento nuevo o actualiza uno existente (sin tocar su recurrencia).
 * @param {object} datos - datos tomados del formulario (fechaISO en formato "YYYY-MM-DD")
 * @param {string|null} idExistente - si se pasa, actualiza; si no, crea uno nuevo
 */
export async function guardarEvento(datos, idExistente = null) {
  const payload = construirPayloadBase(datos, datos.fechaISO, datos.fechaFinRangoISO);

  if (idExistente) {
    await updateDoc(doc(db, 'eventos', idExistente), payload);
  } else {
    payload.fechaCreacion = serverTimestamp();
    await addDoc(eventosRef, payload);
  }
}

/** Elimina un evento de forma definitiva. La confirmación se pide antes, en la UI. */
export async function eliminarEvento(id) {
  await deleteDoc(doc(db, 'eventos', id));
}

/** Cambia el estado de "importante" de un evento (true -> false o viceversa). */
export async function alternarImportante(id, valorActual) {
  await updateDoc(doc(db, 'eventos', id), { importante: !valorActual });
}

/**
 * @param {object} datos
 * @param {string} fechaISO - fecha de inicio de ESTA ocurrencia puntual
 * @param {string|null} fechaFinISO - fecha de fin de ESTA ocurrencia (mismo
 *        día que fechaISO si el evento es de un solo día, o varios días
 *        después si dura varios días). Null/omitido = evento de un solo día.
 */
function construirPayloadBase(datos, fechaISO, fechaFinISO = null) {
  return {
    nombre: datos.nombre,
    tipo: datos.tipo,
    clasificacion: datos.clasificacion || '',
    fecha: Timestamp.fromDate(isoToDateUTC(fechaISO)),
    fechaFin: fechaFinISO && fechaFinISO !== fechaISO ? Timestamp.fromDate(isoToDateUTC(fechaFinISO)) : null,
    hora: datos.hora || '',
    lugar: datos.lugar || '',
    municipio: datos.municipio || '',
    departamento: datos.departamento || '',
    organizador: datos.organizador || '',
    contacto: datos.contacto || '',
    telefono: datos.telefono || '',
    enlace: datos.enlace || '',
    observaciones: datos.observaciones || '',
    importante: !!datos.importante
  };
}

/**
 * Ejecuta una lista de operaciones "set" (crear documento) en lotes de
 * máximo TAMANIO_MAXIMO_LOTE, para no chocar con el límite real de
 * Firestore de 500 operaciones por writeBatch cuando una recurrencia
 * genera muchísimas fechas (ej. semanal con varios días durante años).
 */
async function crearDocumentosEnLotes(listaDeDatos) {
  for (let i = 0; i < listaDeDatos.length; i += TAMANIO_MAXIMO_LOTE) {
    const trozo = listaDeDatos.slice(i, i + TAMANIO_MAXIMO_LOTE);
    const batch = writeBatch(db);
    trozo.forEach((payload) => {
      batch.set(doc(eventosRef), payload);
    });
    await batch.commit();
  }
}

/**
 * Ejecuta una lista de referencias a borrar en lotes de máximo
 * TAMANIO_MAXIMO_LOTE, por la misma razón que crearDocumentosEnLotes.
 */
async function borrarDocumentosEnLotes(listaDeRefs) {
  for (let i = 0; i < listaDeRefs.length; i += TAMANIO_MAXIMO_LOTE) {
    const trozo = listaDeRefs.slice(i, i + TAMANIO_MAXIMO_LOTE);
    const batch = writeBatch(db);
    trozo.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Crea una serie completa de eventos recurrentes en una sola operación.
 * Cada fecha generada queda como un documento independiente en Firestore,
 * unidos por un mismo "serieId". Cada documento guarda también:
 *   - recurrencia: { frecuencia, dias, fechaFinal } tal cual se eligió en el formulario
 *   - fechaAncla: la fecha ISO de la primera ocurrencia (necesaria para que
 *     el cálculo de "mensual" y "quincenal" sea correcto)
 *
 * Si el evento original dura varios días (datos.fechaFinRangoISO), cada
 * ocurrencia generada conserva esa misma duración, calculada desde su
 * propia fecha de inicio (ej. si el evento original dura 3 días, cada
 * repetición mensual también dura 3 días, empezando en su propia fecha).
 *
 * La cantidad de fechas ya viene acotada por fechaFinal (calculada en
 * modal.js antes de llamar esta función), así que aquí no se vuelve a
 * limitar el rango: solo se escribe lo que ya se generó.
 */
export async function guardarEventoConRecurrencia(datos, fechasISO, fechaAnclaISO) {
  const serieId = crypto.randomUUID();
  const duracionDias = datos.fechaFinRangoISO ? diferenciaDiasISO(datos.fechaISO, datos.fechaFinRangoISO) : 0;

  const documentos = fechasISO.map((fechaISO, index) => {
    const fechaFinISO = duracionDias > 0 ? sumarDiasISO(fechaISO, duracionDias) : null;
    return {
      ...construirPayloadBase(datos, fechaISO, fechaFinISO),
      serieId,
      indiceSerie: index,
      recurrencia: datos.recurrencia,
      fechaAncla: fechaAnclaISO,
      fechaCreacion: serverTimestamp()
    };
  });

  await crearDocumentosEnLotes(documentos);
  return serieId;
}

/**
 * Actualiza los campos "normales" (nombre, lugar, etc.) de varios eventos
 * de una misma serie a la vez, SIN tocar su recurrencia ni sus fechas de
 * inicio. Si cambió la duración (fechaFinRangoISO), sí recalcula la
 * fechaFin de cada documento — cada uno conserva su propia fecha de
 * inicio y solo se le aplica la nueva duración.
 * @param {'siguientes'|'toda'} alcance
 */
export async function actualizarSerie(serieId, fechaISODesde, datos, alcance) {
  const q = query(eventosRef, where('serieId', '==', serieId));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  const duracionDias = datos.fechaFinRangoISO ? diferenciaDiasISO(datos.fechaISO, datos.fechaFinRangoISO) : 0;

  snapshot.docs.forEach((d) => {
    const data = d.data();
    const fechaDocISO = data.fecha.toDate().toISOString().slice(0, 10);
    const aplica = alcance === 'toda' || fechaDocISO >= fechaISODesde;
    if (aplica) {
      const fechaFinISO = duracionDias > 0 ? sumarDiasISO(fechaDocISO, duracionDias) : null;
      batch.update(d.ref, {
        nombre: datos.nombre,
        tipo: datos.tipo,
        clasificacion: datos.clasificacion || '',
        fechaFin: fechaFinISO ? Timestamp.fromDate(isoToDateUTC(fechaFinISO)) : null,
        hora: datos.hora || '',
        lugar: datos.lugar || '',
        municipio: datos.municipio || '',
        departamento: datos.departamento || '',
        organizador: datos.organizador || '',
        contacto: datos.contacto || '',
        telefono: datos.telefono || '',
        enlace: datos.enlace || '',
        observaciones: datos.observaciones || '',
        importante: !!datos.importante
      });
    }
  });

  await batch.commit();
}

/**
 * Elimina varios eventos de una misma serie a la vez.
 * @param {'siguientes'|'toda'} alcance - 'solo' no debería llegar aquí,
 *        se maneja con eliminarEvento() normal; esta función es para 'siguientes' y 'toda'.
 */
export async function eliminarSerie(serieId, fechaISODesde, alcance) {
  const q = query(eventosRef, where('serieId', '==', serieId));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);

  snapshot.docs.forEach((d) => {
    const data = d.data();
    const fechaDocISO = data.fecha.toDate().toISOString().slice(0, 10);
    const aplica = alcance === 'toda' || fechaDocISO >= fechaISODesde;
    if (aplica) batch.delete(d.ref);
  });

  await batch.commit();
}

/**
 * Cambia la CONFIGURACIÓN de recurrencia de una serie (frecuencia, días o
 * fecha final). Esto no es un simple update: hay que borrar las fechas
 * futuras que ya no aplican (por ejemplo si se acortó la fecha final) y
 * generar las nuevas según el patrón corregido (por ejemplo si se amplió).
 * Por eso siempre se hace como borrar + crear.
 *
 * @param {'siguientes'|'toda'} alcance
 * @param {string} fechaISODesde - fecha ORIGINAL del evento que se estaba editando
 *        (se usa solo para decidir qué documentos existentes borrar)
 * @param {object} nuevaRecurrencia - { frecuencia, dias, fechaFinal }
 * @param {object} datos - resto de campos del formulario (datos.fechaISO es la
 *        fecha que quedó en el formulario, usada como nueva fecha ancla)
 */
export async function regenerarSerie(serieId, fechaISODesde, nuevaRecurrencia, datos, alcance) {
  const q = query(eventosRef, where('serieId', '==', serieId));
  const snapshot = await getDocs(q);

  const nuevaFechaAncla = datos.fechaISO;
  const nuevasFechas = generarOcurrenciasEnRango(nuevaRecurrencia, nuevaFechaAncla, nuevaFechaAncla, nuevaRecurrencia.fechaFinal);
  const duracionDias = datos.fechaFinRangoISO ? diferenciaDiasISO(datos.fechaISO, datos.fechaFinRangoISO) : 0;

  // Borrar las ocurrencias que ya no corresponden (o toda la serie).
  const refsABorrar = snapshot.docs
    .filter((d) => {
      const fechaDocISO = d.data().fecha.toDate().toISOString().slice(0, 10);
      return alcance === 'toda' || fechaDocISO >= fechaISODesde;
    })
    .map((d) => d.ref);

  await borrarDocumentosEnLotes(refsABorrar);

  // Crear las nuevas ocurrencias con la recurrencia corregida.
  // Si el alcance es "siguientes", se conserva el mismo serieId para que
  // las ocurrencias pasadas (que no se tocaron) sigan agrupadas con las nuevas.
  const serieIdFinal = alcance === 'toda' ? crypto.randomUUID() : serieId;
  const documentos = nuevasFechas.map((fechaISO, index) => {
    const fechaFinISO = duracionDias > 0 ? sumarDiasISO(fechaISO, duracionDias) : null;
    return {
      ...construirPayloadBase(datos, fechaISO, fechaFinISO),
      serieId: serieIdFinal,
      indiceSerie: index,
      recurrencia: nuevaRecurrencia,
      fechaAncla: nuevaFechaAncla,
      fechaCreacion: serverTimestamp()
    };
  });

  await crearDocumentosEnLotes(documentos);
}
