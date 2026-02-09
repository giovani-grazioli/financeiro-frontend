const fmtBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const parseBRL = (raw) => {
  if (typeof raw !== 'string') return NaN;
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

function computeSaldoCents(accounts) {
  return accounts.reduce((acc, it) => acc + (Number(it.balance_cents ?? it.initial_balance_cents) || 0), 0);
}

function renderSaldoFromAccounts(accounts) {
  const cents = computeSaldoCents(accounts);
  const brl = window.GippoAPI?.centsToBRL ? window.GippoAPI.centsToBRL(cents) : fmtBRL(cents / 100);
  document.getElementById('saldoHeader').textContent = brl;
  document.getElementById('saldoTotal').textContent = brl;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupSidebarToggle() {
  const btn = document.getElementById('btnSidebar');
  const btnBrand = document.getElementById('btnBrand');
  const root = document.getElementById('appRoot');
  if (!root) return;

  const toggle = () => root.classList.toggle('is-collapsed');
  btn?.addEventListener('click', toggle);
  btnBrand?.addEventListener('click', toggle);
}

function setupAnimations() {
  const els = [...document.querySelectorAll('[data-anim]')];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add('in');
      }
    },
    { threshold: 0.12 }
  );

  els.forEach((el, i) => {
    el.style.transitionDelay = `${i * 45}ms`;
    io.observe(el);
  });
}

function injectToastStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .toast{
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%) translateY(10px);
      opacity: 0;
      background: rgba(15,23,42,.92);
      color:#fff;
      padding: 10px 12px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 12px;
      box-shadow: 0 18px 36px rgba(15,23,42,.22);
      transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s cubic-bezier(.2,.8,.2,1);
      z-index: 50;
    }
    .toast--in{opacity: 1; transform: translateX(-50%) translateY(0px)}
  `;
  document.head.appendChild(style);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => el.classList.remove('toast--in'), 1800);
  setTimeout(() => el.remove(), 2300);
}

function setupRipple() {
  const rippleTargets = [document.getElementById('btnExport'), document.getElementById('btnAdicionarConta')].filter(Boolean);

  rippleTargets.forEach((el) => {
    el.classList.add('ripple');

    el.addEventListener('pointerdown', (ev) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.classList.remove('rippling');
      void el.offsetWidth;
      el.classList.add('rippling');
      window.setTimeout(() => el.classList.remove('rippling'), 680);
    });
  });
}

function renderList(items) {
  const empty = document.getElementById('contasEmpty');
  const list = document.getElementById('contasList');
  const body = document.getElementById('contasListBody');

  if (!list || !body || !empty) return;

  if (!items.length) {
    empty.style.display = 'grid';
    list.hidden = true;
    body.innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  list.hidden = false;
  body.innerHTML = '';

  const frag = document.createDocumentFragment();

  items
    .slice()
    .reverse()
    .forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'acct';
      row.style.animationDelay = `${idx * 45}ms`;

      const saldoCents = Number(it.balance_cents ?? it.initial_balance_cents) || 0;
      const saldoText = window.GippoAPI?.centsToBRL ? window.GippoAPI.centsToBRL(saldoCents) : fmtBRL(saldoCents / 100);

      row.innerHTML = `
        <div class="acct__left">
          <div class="acct__name">${escapeHtml(it.name)}</div>
          <div class="acct__meta">Conta bancária</div>
        </div>
        <div class="acct__right">
          <div class="acct__saldo money">${saldoText}</div>
          <button class="acct__del" type="button" aria-label="Remover conta">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      `;

      row.querySelector('.acct__del')?.addEventListener('click', async () => {
        const api = window.GippoAPI;
        if (!api) return toast('API não carregada');

        try {
          await api.deleteAccount(it.id);
          const next = items.filter((x) => x.id !== it.id);
          items.length = 0;
          items.push(...next);
          renderSaldoFromAccounts(items);
          renderList(items);
          toast('Conta removida');
        } catch (e) {
          toast(e?.message || 'Erro ao remover conta');
        }
      });

      frag.appendChild(row);
    });

  body.appendChild(frag);
}

function exportData(items) {
  const payload = {
    generatedAt: new Date().toISOString(),
    contas: items
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'contas.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setUiEnabled(enabled) {
  const form = document.getElementById('formConta');
  const nome = document.getElementById('nomeBanco');
  const saldo = document.getElementById('saldoInicial');
  const btn = document.getElementById('btnAdicionarConta');
  if (form) form.style.opacity = enabled ? '1' : '.65';
  if (nome) nome.disabled = !enabled;
  if (saldo) saldo.disabled = !enabled;
  if (btn) btn.disabled = !enabled;
}

function setupForm(items, onCreated) {
  const form = document.getElementById('formConta');
  const nome = document.getElementById('nomeBanco');
  const saldo = document.getElementById('saldoInicial');
  if (!form || !nome || !saldo) return;

  saldo.addEventListener('blur', () => {
    const n = parseBRL(saldo.value);
    if (!Number.isFinite(n)) return;
    saldo.value = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();

    const nomeBanco = String(nome.value || '').trim();
    const saldoInicial = parseBRL(String(saldo.value || ''));

    if (!nomeBanco) return toast('Informe o nome do banco');
    if (!Number.isFinite(saldoInicial)) return toast('Informe um saldo válido');

    onCreated?.({ name: nomeBanco, initial_balance_reais: saldoInicial, reset: () => {
      form.reset();
      nome.focus();
    }});
  });
}

async function fetchAndRender(items) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');
  const accounts = await api.listAccounts();
  items.length = 0;
  items.push(...(Array.isArray(accounts) ? accounts : []));
  renderSaldoFromAccounts(items);
  renderList(items);
}

async function main() {
  injectToastStyles();
  setupAnimations();
  setupRipple();
  setupSidebarToggle();

  const api = window.GippoAPI;
  const items = [];

  setUiEnabled(false);

  // React to global login/logout from auth-gate.js (no reload needed)
  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    if (authed) {
      setUiEnabled(true);
      try {
        await fetchAndRender(items);
      } catch (e) {
        toast(e?.message || 'Erro ao carregar contas');
      }
    } else {
      setUiEnabled(false);
      items.length = 0;
      renderSaldoFromAccounts(items);
      renderList(items);
    }
  });

  setupForm(items, async ({ name, initial_balance_reais, reset }) => {
    if (!api) return toast('API não carregada');

    const cents = api.brlToCentsFromNumber(initial_balance_reais);
    if (!Number.isFinite(cents)) return toast('Informe um saldo válido');

    try {
      const created = await api.createAccount({ name, initial_balance_cents: cents });
      items.push(created);
      renderSaldoFromAccounts(items);
      renderList(items);
      reset?.();
      toast('Conta adicionada');
    } catch (e) {
      toast(e?.message || 'Erro ao criar conta');
    }
  });

  document.getElementById('btnExport')?.addEventListener('click', () => exportData(items));

  try {
    if (!api) throw new Error('API não carregada');
    await api.me();
    setUiEnabled(true);
    await fetchAndRender(items);
  } catch {
    setUiEnabled(false);
  }
}

main();
