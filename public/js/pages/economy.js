import { fetchEconomy } from '../api.js';
import { createEconomyCard } from '../components/EconomyCard.js';

async function init() {
    const gridContainer = document.getElementById('economy-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '<div class="loading">Cargando indicadores...</div>';

    const economies = await fetchEconomy();
    if (!economies || economies.length === 0) {
        gridContainer.innerHTML = '<div class="loading">No hay indicadores registrados.</div>';
        return;
    }

    gridContainer.innerHTML = '';
    gridContainer.style.display = 'block'; 

    economies.forEach(record => {
        const recordDiv = createEconomyCard(record);
        gridContainer.appendChild(recordDiv);
    });
}

init();
