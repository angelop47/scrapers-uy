import { fetchStats } from '../api.js';
import { createStatCard } from '../components/StatCard.js';

async function init() {
  const gridContainer = document.getElementById('stats-grid');
  if (!gridContainer) return;

  gridContainer.innerHTML =
    '<div class="loading">Cargando estadísticas...</div>';

  const stats = await fetchStats();
  if (!stats || stats.length === 0) {
    gridContainer.innerHTML =
      '<div class="loading">No hay estadísticas registradas.</div>';
    return;
  }

  gridContainer.innerHTML = '';
  gridContainer.style.display = 'block';

  const groups = {};
  stats.forEach((stat) => {
    const day = stat.sourceFile
      ? stat.sourceFile.replace('.json', '')
      : 'Desconocido';
    if (!groups[day]) groups[day] = [];
    groups[day].push(stat);
  });

  Object.keys(groups).forEach((day) => {
    const dayDiv = document.createElement('div');
    dayDiv.style.marginBottom = '2.5rem';

    const dateHeading = document.createElement('h3');
    dateHeading.style.margin = '0 0 1rem 0';
    dateHeading.style.fontSize = '1.1rem';
    dateHeading.style.color = '#374151';
    dateHeading.style.borderBottom = '1px solid #f3f4f6';
    dateHeading.style.paddingBottom = '0.5rem';
    dateHeading.innerText = `Obtenido el: ${day}`;
    dayDiv.appendChild(dateHeading);

    const innerGrid = document.createElement('div');
    innerGrid.style.display = 'grid';
    innerGrid.style.gridTemplateColumns =
      'repeat(auto-fill, minmax(220px, 1fr))';
    innerGrid.style.gap = '1rem';

    groups[day].forEach((stat) => {
      const card = createStatCard(stat);
      innerGrid.appendChild(card);
    });

    dayDiv.appendChild(innerGrid);
    gridContainer.appendChild(dayDiv);
  });
}

init();
