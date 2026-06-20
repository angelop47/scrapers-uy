import { fetchEvents } from '../api.js';
import { createEventCard } from '../components/EventCard.js';

async function init() {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;

  timeline.innerHTML = '<div class="loading">Cargando eventos...</div>';

  const events = await fetchEvents();
  if (!events) {
    timeline.innerHTML =
      '<div class="loading" style="color: #ef4444;">Error al conectar con el servidor.</div>';
    return;
  }

  timeline.innerHTML = '';

  if (events.length === 0) {
    timeline.innerHTML =
      '<div class="loading">Aún no hay eventos registrados en la historia.</div>';
    return;
  }

  let lastFile = null;

  events.forEach((event) => {
    if (event.sourceFile !== lastFile) {
      const separator = document.createElement('div');
      separator.className = 'date-separator';
      const displayName = event.sourceFile
        ? event.sourceFile.replace('.json', '')
        : 'Desconocido';
      separator.innerHTML = `<span>Archivo: ${displayName}</span>`;
      timeline.appendChild(separator);
      lastFile = event.sourceFile;
    }

    const card = createEventCard(event);
    timeline.appendChild(card);
  });
}

init();
