import { Api } from './api.js';
const $ = (selector) => document.querySelector(selector);
let api = null,
  readOnly = true,
  busy = false,
  connected = false,
  displayedQuery = null;
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
  draft: 'Rascunho',
  scheduled: 'Agendada',
  sent: 'Enviada',
  cancelled: 'Cancelada',
  portal: 'Portal',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
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
  displayedQuery = null;
}
function segmentFor(signal) {
  return ['energia', 'tecnologia', 'servicos'].includes(signal.segment) ? signal.segment : 'servicos';
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
function setBusy(value) {
  busy = value;
  for (const node of document.querySelectorAll(
    '#connect input, #connect button, #filters input, #filters select, #filters button',
  ))
    node.disabled = value;
  $('#export').disabled = value || !displayedQuery;
}
async function refresh() {
  if (busy) return;
  if (!api || !connected) {
    $('#status').textContent = 'Conecte a API antes de atualizar.';
    return;
  }
  setBusy(true);
  clearData();
  $('#status').textContent = 'Carregando análise…';
  try {
    const q = query();
    const [summary, journeys, signals, audit, campaigns] = await Promise.all([
      api.json(`/api/v1/admin/summary?${q}`),
      api.json(`/api/v1/admin/journeys?${q}`),
      api.json(`/api/v2/admin/signals?${q}`),
      api.json('/api/v1/admin/audit?limit=20'),
      api.json('/api/v1/admin/campaigns?limit=12'),
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
    $('#signal-reference').textContent =
      `Referência: ${new Date(signals.evaluatedAt).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC. Estado das ações e atividade atual consultados agora.`;
    $('#signal-list').replaceChildren();
    for (const signal of signals.items) {
      const card = el('article');
      card.append(
        el('span', `Prioridade ${signal.priority}`, 'badge'),
        el('h3', signal.title),
        el('strong', signal.label),
        el(
          'p',
          signal.activeNow
            ? 'Este sinal continua ativo hoje.'
            : 'Sinal histórico: já não está ativo hoje.',
          'muted',
        ),
        el('p', signal.reason),
        el('p', signal.recommendation, 'recommendation'),
      );
      const control = el('label', 'Estado atual da ação');
      const select = el('select');
      select.setAttribute('aria-label', `Estado da ação: ${signal.title} · ${signal.label}`);
      for (const value of ['open', 'planned', 'done', 'dismissed']) {
        const option = el('option', label(value));
        option.value = value;
        select.append(option);
      }
      select.value = signal.status;
      select.disabled = readOnly || !signal.activeNow;
      select.addEventListener('change', async () => {
        if (busy) {
          select.value = signal.status;
          return;
        }
        setBusy(true);
        select.disabled = true;
        try {
          await api.json(`/api/v1/admin/signals/${encodeURIComponent(signal.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: select.value }),
          });
          setBusy(false);
          await refresh();
          if (!$('#data').hidden)
            $('#status').textContent = 'Estado salvo. Nenhuma comunicação foi enviada.';
        } catch (error) {
          select.value = signal.status;
          $('#status').textContent = `Não foi possível salvar: ${error.message}`;
        } finally {
          setBusy(false);
          select.disabled = readOnly || !signal.activeNow;
        }
      });
      control.append(select);
      card.append(control);
      const campaignButton = el('button', 'Criar rascunho de campanha');
      campaignButton.type = 'button';
      campaignButton.disabled = readOnly || !signal.activeNow;
      campaignButton.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try {
          await api.json('/api/v1/admin/campaigns', {
            method: 'POST',
            body: JSON.stringify({
              name: `Reengajamento: ${signal.title}`,
              segment: segmentFor(signal),
              channel: 'portal',
              message: signal.recommendation,
              signalIds: [signal.id],
            }),
          });
          setBusy(false);
          await refresh();
          if (!$('#data').hidden) $('#status').textContent = 'Rascunho de campanha criado na API.';
        } catch (error) {
          $('#status').textContent = `Campanha não criada: ${error.message}`;
        } finally {
          setBusy(false);
        }
      });
      card.append(campaignButton);
      $('#signal-list').append(card);
    }
    if (!signals.items.length)
      $('#signal-list').append(el('p', 'Nenhum sinal pelas regras atuais neste período.'));
    $('#campaign-list').replaceChildren(
      ...campaigns.items.map((campaign) => {
        const card = el('article');
        card.append(
          el('span', label(campaign.status), 'badge'),
          el('h3', campaign.name),
          el('strong', `${label(campaign.segment)} · ${label(campaign.channel)}`),
          el('p', campaign.message, 'recommendation'),
          el(
            'p',
            `${campaign.signalIds.length} sinal(is) vinculado(s) · Atualizada em ${new Date(campaign.updatedAt).toLocaleString('pt-BR')}`,
            'muted',
          ),
        );
        return card;
      }),
    );
    if (!campaigns.items.length)
      $('#campaign-list').append(el('p', 'Nenhum rascunho de campanha criado ainda.'));
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
    displayedQuery = q;
    $('#data').hidden = false;
    $('#export').disabled = false;
    $('#status').textContent =
      `Análise atualizada · ${summary.events} eventos simulados · ${summary.completedProfiles} perfil(is) com conclusão observada.`;
  } catch (error) {
    clearData();
    $('#status').textContent = `Dados indisponíveis: ${error.message}`;
  } finally {
    setBusy(false);
  }
}
$('#from').value = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
$('#to').value = new Date().toISOString().slice(0, 10);
$('#connect').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  clearData();
  setBusy(true);
  connected = false;
  api = new Api($('#base-url').value, $('#token').value);
  const adminEmail = $('#admin-email').value.trim();
  const adminPassword = $('#admin-password').value;
  $('#admin-password').value = '';
  $('#token').value = '';
  try {
    if (adminEmail || adminPassword) {
      if (!adminEmail || !adminPassword) throw new Error('Informe e-mail e senha admin juntos.');
      await api.login(adminEmail, adminPassword);
    }
    const health = await api.json('/health');
    if (health.capabilities?.historicalSignals !== true)
      throw new Error('Atualize a API para uma versão com sinais históricos v2.');
    readOnly = health.readOnly;
    connected = true;
    setBusy(false);
    await refresh();
    if (!$('#data').hidden) $('#connection').open = false;
  } catch (error) {
    api = null;
    $('#status').textContent = `API indisponível: ${error.message}`;
  } finally {
    setBusy(false);
  }
});
$('#disconnect').addEventListener('click', () => {
  if (busy) return;
  api = null;
  connected = false;
  $('#token').value = '';
  $('#admin-password').value = '';
  clearData();
  $('#status').textContent = 'Desconectado. Token removido da memória.';
});
$('#filters').addEventListener('submit', (event) => {
  event.preventDefault();
  refresh();
});
$('#export').addEventListener('click', async () => {
  if (!api || busy || !displayedQuery) return;
  setBusy(true);
  try {
    const response = await api.get(`/api/v1/admin/events.csv?${displayedQuery}`);
    const url = URL.createObjectURL(await response.blob());
    const anchor = el('a');
    anchor.href = url;
    anchor.download = 'conecta-eventos-simulados.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#status').textContent = 'CSV exportado com os filtros da análise exibida.';
  } catch (error) {
    $('#status').textContent = `Exportação não concluída: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

// No endereço público, conecta automaticamente à API configurada no HTML.
if (location.hostname.endsWith('github.io')) $('#connect').requestSubmit();
