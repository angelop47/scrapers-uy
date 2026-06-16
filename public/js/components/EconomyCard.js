import { copyTextToClipboard } from '../utils.js';

const labels = {
    "inflation_annual_pct": { title: "Inflación Anual", unit: "%" },
    "unemployment_pct": { title: "Desempleo", unit: "%" },
    "country_risk_points": { title: "Riesgo País (UBI)", unit: "pts" },
    "gdp_usd_billions": { title: "PBI", unit: "MM USD" },
    "external_debt_pct_gdp": { title: "Deuda Externa", unit: "% PBI" },
    "bcu_reserves_usd_millions": { title: "Reservas BCU", unit: "M USD" },
    "minimum_wage_uyu": { title: "Salario Mínimo", unit: "UYU" },
    "poverty_rate_pct": { title: "Pobreza", unit: "%" },
    "fiscal_deficit_pct_gdp": { title: "Déficit Fiscal", unit: "% PBI" }
};

export function copyEconomySql(ecoBase64, btn) {
    try {
        const statStr = decodeURIComponent(escape(atob(ecoBase64)));
        const data = JSON.parse(statStr);

        const escapeNum = (num) => (num === null || num === undefined) ? 'NULL' : num;

        const sql = `INSERT INTO public.economic_indicators (date, inflation_annual_pct, unemployment_pct, country_risk_points, gdp_usd_billions, external_debt_pct_gdp, bcu_reserves_usd_millions, minimum_wage_uyu, poverty_rate_pct, fiscal_deficit_pct_gdp) VALUES ('${data.date}', ${escapeNum(data.inflation_annual_pct)}, ${escapeNum(data.unemployment_pct)}, ${escapeNum(data.country_risk_points)}, ${escapeNum(data.gdp_usd_billions)}, ${escapeNum(data.external_debt_pct_gdp)}, ${escapeNum(data.bcu_reserves_usd_millions)}, ${escapeNum(data.minimum_wage_uyu)}, ${escapeNum(data.poverty_rate_pct)}, ${escapeNum(data.fiscal_deficit_pct_gdp)}) ON CONFLICT (date) DO UPDATE SET inflation_annual_pct = EXCLUDED.inflation_annual_pct, unemployment_pct = EXCLUDED.unemployment_pct, country_risk_points = EXCLUDED.country_risk_points, gdp_usd_billions = EXCLUDED.gdp_usd_billions, external_debt_pct_gdp = EXCLUDED.external_debt_pct_gdp, bcu_reserves_usd_millions = EXCLUDED.bcu_reserves_usd_millions, minimum_wage_uyu = EXCLUDED.minimum_wage_uyu, poverty_rate_pct = EXCLUDED.poverty_rate_pct, fiscal_deficit_pct_gdp = EXCLUDED.fiscal_deficit_pct_gdp;`;

        copyTextToClipboard(sql).then(() => {
            const originalText = btn.innerHTML;
            btn.classList.add('copied');
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copiado';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = originalText;
            }, 2000);
        }).catch(err => console.error('Error copiando al portapapeles:', err));
    } catch (err) {
        console.error('Error parseando economy data:', err);
    }
}
window.copyEconomySql = copyEconomySql;

export function createEconomyCard(record) {
    const recordDiv = document.createElement('div');
    recordDiv.style.marginBottom = '3rem';
    recordDiv.style.padding = '1rem';
    recordDiv.style.background = '#ffffff';
    recordDiv.style.border = '1px solid #e5e7eb';
    recordDiv.style.borderRadius = '12px';

    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.marginBottom = '1rem';
    headerDiv.style.borderBottom = '1px solid #f3f4f6';
    headerDiv.style.paddingBottom = '0.5rem';

    const dateHeading = document.createElement('h3');
    dateHeading.style.margin = '0';
    dateHeading.style.fontSize = '1.1rem';
    dateHeading.style.color = '#374151';
    dateHeading.innerText = `Reporte: ${record.date}`;

    const ecoBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(record))));
    const copySqlBtnHtml = `
        <button class="copy-sql-btn" style="padding: 4px 10px;" onclick="copyEconomySql('${ecoBase64}', this)" title="Copiar SQL para Supabase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copiar SQL
        </button>
    `;

    headerDiv.innerHTML = dateHeading.outerHTML + copySqlBtnHtml;
    recordDiv.appendChild(headerDiv);

    const innerGrid = document.createElement('div');
    innerGrid.style.display = 'grid';
    innerGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    innerGrid.style.gap = '1rem';

    for (const [key, conf] of Object.entries(labels)) {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.background = '#f0f9ff';
        card.style.borderColor = '#bae6fd';

        const rawVal = record[key];
        const valHtml = (rawVal === null || rawVal === undefined)
            ? '<span style="color:#9ca3af; font-size:1.2rem;">Sin datos</span>'
            : `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(rawVal)} <span class="stat-unit">${conf.unit}</span>`;

        card.innerHTML = `
            <div class="stat-header">
                <span class="stat-title">${conf.title}</span>
            </div>
            <div class="stat-value">${valHtml}</div>
        `;
        innerGrid.appendChild(card);
    }

    recordDiv.appendChild(innerGrid);
    return recordDiv;
}
