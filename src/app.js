import { Api } from './api.js';
const $ = (selector) => document.querySelector(selector);
let api = null,
  readOnly = true,
  busy = false;
const labels = {
  home: 'Entrada',
  empresa: 'Empresa',
  oportunidades: 'Oportunidades',
  ajuda: 'Ajuda',
  preferencias: 'Preferências',
  explorar: 'Explorar oportunidades',
  page_view: 'Acesso',
  click: 'Clique',
  preference: 'Interesse',
  journey_completed: 'Conclusão',
  open: 'Aberta',
  planned: 'Planejada',
  done: 'Concluída',
  dismissed: 'Descartada',
};
const label = (value) => labels[value] ?? value;
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function query() {
  const values = new URLSearchParams({ from: $('#from').value, to: $('#to').value });
  if ($('#segment').value) values.set('segment', $('#segment').value);
  return values.toString();
}
function clearData() {
  $('#data').hidden = true;
  $('#export').disabled = true;
}
function bars(selector, rows) {
  const root = $(selector);
  root.replaceChildren();
  const max = Math.max(1, ...rows.map((row) => row.value));
  for (const row of rows) {
    const entry = el('div', undefined, 'bar-row');
    entry.append(el('span', label(row.label)), el('strong', row.value));
    const track = el('div', undefined, 'bar-track');
    const bar = el('div', undefined, 'bar');
    bar.style.width = `${(row.value / max) * 100}%`;
    track.append(bar);
    entry.append(track);
    root.append(entry);
  }
  if (!rows.length) root.append(el('p', 'Nenhum evento neste período.', 'muted'));
}
async function refresh() {
  if (busy) return;
  if (!api) {
    $('#status').textContent = 'Conecte a API antes de atualizar.';
    return;
  }
  busy = true;
  clearData();
  $('#status').textContent = 'Carregando análise…';
  try {
    const q = query();
    const [summary, journeys, signals, audit] = await Promise.all([
      api.json(`/api/v1/admin/summary?${q}`),
      api.json(`/api/v1/admin/journeys?${q}`),
      api.json(`/api/v1/admin/signals?${q}`),
      api.json('/api/v1/admin/audit?limit=20'),
    ]);
    $('#metrics').replaceChildren();
    for (const [title, value, description] of [
      ['Perfis observados', summary.profiles, 'Empresas fictícias com eventos'],
      ['Sessões', summary.sessions, 'Visitas distintas no recorte'],
      ['Interações', summary.events, 'Eventos aceitos pela API'],
      ['Perfis que retornaram', summary.returningProfiles, 'Mais de uma sessão no recorte'],
    ]) {
      const card = el('article');
      card.append(el('p', title), el('strong', value, 'metric'), el('small', description));
      $('#metrics').append(card);
    }
    bars('#pages', summary.pages);
    bars('#clicks', summary.firstClicks);
    bars('#daily', summary.daily);
    $('#period').textContent = `${summary.filter.from} a ${summary.filter.to} · UTC`;
    $('#journey-list').replaceChildren();
    for (const journey of journeys.items) {
      const detail = el('details', undefined, 'journey');
      const title = el(
        'summary',
        `${journey.label} · ${journey.segment} · ${journey.sessions} sessão(ões) · ${journey.completed ? 'conclusão observada' : 'em percurso'}`,
      );
      detail.append(title);
      detail.append(
        el('p', `Primeiro clique no recorte: ${label(journey.firstClick ?? 'sem clique')}`),
      );
      const list = el('ol', undefined, 'timeline');
      for (const event of journey.timeline)
        list.append(
          el(
            'li',
            `${new Date(event.occurredAt).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC · ${label(event.type)} · ${label(event.page)} · ${label(event.target)}`,
          ),
        );
      detail.append(list);
      $('#journey-list').append(detail);
    }
    if (!journeys.items.length)
      $('#journey-list').append(el('p', 'Nenhuma jornada neste período.'));
    $('#signal-list').replaceChildren();
    for (const signal of signals.items) {
      const card = el('article');
      card.append(
        el('span', `Prioridade ${signal.priority}`, 'badge'),
        el('h3', signal.title),
        el('strong', signal.label),
        el('p', signal.reason),
        el('p', signal.recommendation, 'recommendation'),
      );
      const control = el('label', 'Estado da ação');
      const select = el('select');
      select.setAttribute('aria-label', `Estado da ação: ${signal.title} · ${signal.label}`);
      for (const value of ['open', 'planned', 'done', 'dismissed']) {
        const option = el('option', label(value));
        option.value = value;
        select.append(option);
      }
      select.value = signal.status;
      select.disabled = readOnly;
      select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          await api.json(`/api/v1/admin/signals/${encodeURIComponent(signal.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: select.value }),
          });
          await refresh();
          $('#status').textContent = 'Estado salvo. Nenhuma comunicação foi enviada.';
        } catch (error) {
          select.value = signal.status;
          $('#status').textContent = `Não foi possível salvar: ${error.message}`;
        } finally {
          select.disabled = readOnly;
        }
      });
      control.append(select);
      card.append(control);
      $('#signal-list').append(card);
    }
    if (!signals.items.length)
      $('#signal-list').append(el('p', 'Nenhum sinal pelas regras atuais neste período.'));
    $('#audit').replaceChildren(
      ...audit.items.map((item) =>
        el(
          'li',
          `${item.signal_id} · ${label(item.previous_status)} → ${label(item.status)} · ${new Date(item.created_at).toLocaleString('pt-BR')}`,
        ),
      ),
    );
    if (!audit.items.length) $('#audit').append(el('li', 'Nenhuma alteração registrada.'));
    $('#mode').textContent = readOnly
      ? 'Modo público: leitura de dados fictícios; gestão desativada.'
      : 'Modo local: gestão habilitada com token administrativo.';
    $('#data').hidden = false;
    $('#export').disabled = false;
    $('#status').textContent =
      `Análise atualizada · ${summary.events} eventos simulados · ${summary.completedProfiles} perfil(is) com conclusão observada.`;
  } catch (error) {
    clearData();
    $('#status').textContent = `Dados indisponíveis: ${error.message}`;
  } finally {
    busy = false;
  }
}
$('#from').value = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
$('#to').value = new Date().toISOString().slice(0, 10);
$('#connect').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  clearData();
  api = new Api($('#base-url').value, $('#token').value);
  $('#token').value = '';
  try {
    const health = await api.json('/health');
    readOnly = health.readOnly;
    await refresh();
    if (!$('#data').hidden) $('#connection').open = false;
  } catch (error) {
    api = null;
    $('#status').textContent = `API indisponível: ${error.message}`;
  }
});
$('#disconnect').addEventListener('click', () => {
  if (busy) return;
  api = null;
  $('#token').value = '';
  clearData();
  $('#status').textContent = 'Desconectado. Token removido da memória.';
});
$('#filters').addEventListener('submit', (event) => {
  event.preventDefault();
  refresh();
});
$('#export').addEventListener('click', async () => {
  if (!api || busy) return;
  try {
    const response = await api.get(`/api/v1/admin/events.csv?${query()}`);
    const url = URL.createObjectURL(await response.blob());
    const anchor = el('a');
    anchor.href = url;
    anchor.download = 'conecta-eventos-simulados.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#status').textContent = 'CSV exportado com os filtros atuais.';
  } catch (error) {
    $('#status').textContent = `Exportação não concluída: ${error.message}`;
  }
});
