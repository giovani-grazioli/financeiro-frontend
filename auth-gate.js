(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function getApi() {
    return window.GippoAPI;
  }

  function hasToken() {
    const api = getApi();
    return Boolean(api?.readAuth?.().access_token);
  }

  function setError(msg) {
    const el = $('authError');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function injectModalIfMissing() {
    if ($('authModal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal" id="authModal" hidden>
        <div class="modal__backdrop" id="authBackdrop" aria-hidden="true"></div>
        <div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
          <div class="modal__header">
            <div>
              <div class="modal__kicker">AUTENTICAÇÃO</div>
              <div class="modal__title" id="authTitle">Entrar</div>
            </div>
            <button class="iconBtn" type="button" id="authClose" aria-label="Fechar">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>

          <form class="modal__body" id="authForm">
            <div id="authError" class="authError" hidden></div>

            <div class="field">
              <label class="field__label" for="authEmail">Email</label>
              <div class="field__control">
                <input class="input" id="authEmail" name="email" type="email" autocomplete="username" required />
              </div>
            </div>

            <div class="field" style="margin-top: 14px">
              <label class="field__label" for="authPass">Senha</label>
              <div class="field__control">
                <input class="input" id="authPass" name="password" type="password" autocomplete="current-password" required />
              </div>
            </div>

            <div class="modal__footer" style="margin-top: 16px">
              <button class="btn btn--soft" type="button" id="authCancel">Cancelar</button>
              <button class="btn btn--primary" type="submit" id="authSubmit">
                <i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>
                <span>Entrar</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(wrap.firstElementChild);
  }

  function openModal() {
    const modal = $('authModal');
    if (!modal) return;
    setError('');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('authEmail')?.focus(), 0);
  }

  function closeModal() {
    const modal = $('authModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    setError('');
  }

  function updateAuthButtons() {
    // Optional: pages may include an auth button
    const api = getApi();
    const isAuthed = Boolean(api?.readAuth?.().access_token);

    const label = $('btnAuthLabel');
    if (label) label.textContent = isAuthed ? 'Sair' : 'Entrar';
  }

  function isUnauthorizedError(err) {
    const status = Number(err?.status);
    return status === 401 || status === 403;
  }

  function bindOptionalAuthButton() {
    const btn = $('btnAuth');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const api = getApi();
      if (!api) return;

      if (hasToken()) {
        btn.disabled = true;
        try {
          await api.logout();
          updateAuthButtons();
          window.dispatchEvent(new CustomEvent('gippo:auth', { detail: { authed: false } }));
        } finally {
          btn.disabled = false;
        }
        return;
      }

      openModal();
    });
  }

  function wireModal({ allowCancel } = {}) {
    const api = getApi();
    const form = $('authForm');
    const closeBtn = $('authClose');
    const cancelBtn = $('authCancel');
    const backdrop = $('authBackdrop');
    const submitBtn = $('authSubmit');

    const canClose = () => Boolean(allowCancel);

    const close = () => {
      if (!canClose()) return;
      closeModal();
    };

    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') close();
    });

    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!api) {
        setError('API não carregada.');
        return;
      }

      const email = String($('authEmail')?.value || '').trim();
      const password = String($('authPass')?.value || '');
      if (!email || !password) {
        setError('Informe email e senha.');
        return;
      }

      try {
        setError('');
        if (submitBtn) submitBtn.disabled = true;
        await api.login(email, password);
        updateAuthButtons();
        closeModal();
        window.dispatchEvent(new CustomEvent('gippo:auth', { detail: { authed: true } }));
      } catch (e) {
        setError(e?.message || 'Falha no login.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  let ensurePromise = null;

  async function ensure({ allowCancel = true } = {}) {
    const api = getApi();
    if (!api) return false;

    injectModalIfMissing();

    // Wire once
    if (!ensurePromise) {
      wireModal({ allowCancel });
      bindOptionalAuthButton();
      updateAuthButtons();
    }

    // If we have a token, validate it
    if (hasToken()) {
      try {
        await api.me();
        updateAuthButtons();
        return true;
      } catch (e) {
        // Only force logout + prompt login if we're actually unauthorized.
        // For network/timeout/5xx errors, keep the session and don't spam the login modal.
        if (isUnauthorizedError(e)) {
          api.clearAuth?.();
          updateAuthButtons();
        } else {
          updateAuthButtons();
          return false;
        }
      }
    }

    // No token or invalid token => show modal
    openModal();

    if (allowCancel) {
      return false;
    }

    // Block until login happens
    if (!ensurePromise) {
      ensurePromise = new Promise((resolve) => {
        const handler = (ev) => {
          if (ev?.detail?.authed) {
            window.removeEventListener('gippo:auth', handler);
            ensurePromise = null;
            resolve(true);
          }
        };
        window.addEventListener('gippo:auth', handler);
      });
    }

    return await ensurePromise;
  }

  function initAutoPrompt() {
    const api = getApi();
    if (!api) return;

    injectModalIfMissing();
    wireModal({ allowCancel: true });
    bindOptionalAuthButton();
    updateAuthButtons();

    // Auto-open only when needed
    if (!hasToken()) {
      openModal();
      return;
    }

    // Validate token in background; if invalid, prompt login
    api
      .me()
      .then(() => updateAuthButtons())
      .catch((e) => {
        if (isUnauthorizedError(e)) {
          api.clearAuth?.();
          updateAuthButtons();
          openModal();
        } else {
          // Keep tokens; API may be temporarily unavailable.
          updateAuthButtons();
        }
      });
  }

  window.GippoAuthGate = {
    ensure,
    open: openModal,
    close: closeModal
  };

  document.addEventListener('DOMContentLoaded', initAutoPrompt);
})();
