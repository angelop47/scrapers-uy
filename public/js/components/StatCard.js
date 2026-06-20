import { copyTextToClipboard } from '../utils.js';

export function copyStatSql(statBase64, btn) {
  try {
    const statStr = decodeURIComponent(escape(atob(statBase64)));
    const stat = JSON.parse(statStr);

    const escapeSql = (str) => {
      if (str === null || str === undefined) return 'NULL';
      return "'" + String(str).replace(/'/g, "''") + "'";
    };

    const escapeNum = (num) => {
      if (num === null || num === undefined) return 'NULL';
      return num;
    };

    const escapeBool = (bool) => {
      if (bool === null || bool === undefined) return 'NULL';
      return bool ? 'true' : 'false';
    };

    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'id_' + Math.random().toString(36).substr(2, 9);

    const sql = `INSERT INTO public.mandate_stats (id, mandate_id, date, title, description, indicator, value, unit, trend, trend_is_good, source) VALUES (${escapeSql(newId)}, ${escapeSql(stat.mandate_id)}, ${escapeSql(stat.date)}, ${escapeSql(stat.title)}, ${escapeSql(stat.description)}, ${escapeSql(stat.indicator)}, ${escapeNum(stat.value)}, ${escapeSql(stat.unit)}, ${escapeSql(stat.trend)}, ${escapeBool(stat.trend_is_good)}, ${escapeSql(stat.source)});`;

    copyTextToClipboard(sql)
      .then(() => {
        const originalText = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copiado';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = originalText;
        }, 2000);
      })
      .catch((err) => console.error('Error copiando al portapapeles:', err));
  } catch (err) {
    console.error('Error parseando stat:', err);
  }
}
window.copyStatSql = copyStatSql;

export function createStatCard(stat) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.title = stat.description;

  let trendClass = 'neutral';
  let trendIcon = '';
  if (stat.trend === 'up') {
    trendIcon = '↗';
    trendClass = stat.trend_is_good ? 'good' : 'bad';
  } else if (stat.trend === 'down') {
    trendIcon = '↘';
    trendClass = stat.trend_is_good ? 'good' : 'bad';
  } else {
    trendIcon = '→';
  }

  const formattedValue =
    typeof stat.value === 'number'
      ? new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(
          stat.value,
        )
      : stat.value;

  const statToCopy = { ...stat };
  delete statToCopy.sourceFile;
  const statBase64 = btoa(
    unescape(encodeURIComponent(JSON.stringify(statToCopy))),
  );

  const copySqlBtnHtml = `
        <button class="copy-sql-btn" style="margin-left:0; padding:2px 6px; font-size:0.7rem;" onclick="copyStatSql('${statBase64}', this)" title="Copiar SQL para Supabase">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            SQL
        </button>
    `;

  card.innerHTML = `
        <div class="stat-header">
            <span class="stat-title">${stat.title}</span>
            <span class="stat-trend ${trendClass}">${trendIcon}</span>
        </div>
        <div class="stat-value">${formattedValue} <span class="stat-unit">${stat.unit}</span></div>
        <div class="stat-footer" style="display: flex; justify-content: space-between; align-items: center;" title="${stat.source}">
            <span style="overflow: hidden; text-overflow: ellipsis; max-width: 65%;">${stat.source} • ${stat.date}</span>
            ${copySqlBtnHtml}
        </div>
    `;

  return card;
}
