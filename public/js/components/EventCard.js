import { categoryLabels, copyTextToClipboard } from '../utils.js';

export function copyEventSql(eventBase64, btn) {
  try {
    const eventStr = decodeURIComponent(escape(atob(eventBase64)));
    const event = JSON.parse(eventStr);

    const escapeSql = (str) => {
      if (str === null || str === undefined) return 'NULL';
      return "'" + String(str).replace(/'/g, "''") + "'";
    };

    const tagsSql =
      event.tags && event.tags.length > 0
        ? 'ARRAY[' + event.tags.map((t) => escapeSql(t)).join(', ') + ']'
        : 'NULL';

    const sourcesSql =
      event.sources && event.sources.length > 0
        ? 'ARRAY[' + event.sources.map((s) => escapeSql(s)).join(', ') + ']'
        : 'NULL';

    const sql = `INSERT INTO public.timeline_events (title, description, date, category_id, content, tags, sources) VALUES (${escapeSql(event.title)}, ${escapeSql(event.description)}, ${escapeSql(event.date)}, ${escapeSql(event.category_id)}, ${escapeSql(event.content || '')}, ${tagsSql}, ${sourcesSql});`;

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
    console.error('Error parseando evento:', err);
  }
}
window.copyEventSql = copyEventSql;

export function createEventCard(event) {
  const card = document.createElement('div');
  card.className = 'event-card';
  card.setAttribute('data-category', event.category_id);

  const label = categoryLabels[event.category_id] || event.category_id;

  let tagsHtml = '';
  if (event.tags && event.tags.length > 0) {
    tagsHtml = `<div class="tags">${event.tags.map((t) => `<span class="tag">#${t}</span>`).join('')}</div>`;
  }

  let sourcesHtml = '';
  if (event.sources && event.sources.length > 0) {
    sourcesHtml = `<div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 1rem;"><strong>Fuentes:</strong> ${event.sources.join(', ')}</div>`;
  }

  const rawMarkdown = event.content || '';
  const isContentEmpty = rawMarkdown.trim().length === 0;
  const htmlContent =
    !isContentEmpty && typeof marked !== 'undefined'
      ? marked.parse(rawMarkdown)
      : '';

  let extraContentHtml = '';
  if (!isContentEmpty) {
    extraContentHtml = `
            <button class="read-more-btn" onclick="toggleContent(this)">Leer desarrollo completo</button>
            <div class="event-content">${htmlContent}</div>
        `;
  }

  const eventBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(event))));
  const copySqlBtnHtml = `
        <button class="copy-sql-btn" onclick="copyEventSql('${eventBase64}', this)" title="Copiar SQL para Supabase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            SQL
        </button>
    `;

  card.innerHTML = `
        <div class="event-header">
            <span class="event-category">${label}</span>
            <span class="event-date">${event.date}</span>
            ${copySqlBtnHtml}
        </div>
        <h3 class="event-title">${event.title}</h3>
        <p class="event-description">${event.description}</p>
        ${sourcesHtml}
        ${tagsHtml}
        ${extraContentHtml}
    `;

  return card;
}
