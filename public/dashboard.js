// Owner dashboard. Auth is the httpOnly session cookie set by /login; all text goes in via textContent.
(() => {
  const $ = (id) => document.getElementById(id);
  const list = $('leads');
  const tpl = $('lead-tpl');
  const fStatus = $('f-status');
  const fCategory = $('f-category');
  const errBox = $('err');

  // Remember filters in the URL so refresh/back keeps them.
  const params = new URLSearchParams(location.search);
  fStatus.value = params.get('status') || '';
  fCategory.value = params.get('category') || '';

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
    if (res.status === 401) { location.href = '/login.html'; throw new Error('Logged out'); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  const flash = (el, text, ok = true) => {
    el.textContent = text; el.style.color = ok ? '' : 'var(--danger)';
    clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 2500);
  };

  function badge(cls, text) {
    const b = document.createElement('span');
    b.className = `badge ${cls}`;
    b.textContent = text;
    return b;
  }

  function render(lead) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('.lead-name').textContent = lead.name;
    const email = node.querySelector('.email');
    email.textContent = lead.email; email.href = `mailto:${lead.email}`;
    if (lead.phone) {
      const phone = node.querySelector('.phone');
      phone.textContent = lead.phone; phone.href = `tel:${lead.phone.replace(/[^\d+]/g, '')}`;
    } else node.querySelector('.phone-wrap').remove();
    const time = node.querySelector('time');
    time.dateTime = lead.created_at;
    time.textContent = new Date(lead.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const badges = node.querySelector('.badges');
    const paint = () => {
      badges.replaceChildren(
        badge(`s-${lead.status}`, lead.status),
        badge(`c-${lead.category}`, lead.category),
        badge(`u-${lead.urgency}`, `${lead.urgency} urgency`),
        badge('', lead.service),
      );
    };
    paint();
    node.querySelector('.lead-msg').textContent = lead.message;

    const status = node.querySelector('.status');
    status.value = lead.status;
    status.setAttribute('aria-label', `Status for ${lead.name}`);
    status.addEventListener('change', async () => {
      const prev = lead.status;
      status.disabled = true;
      try {
        Object.assign(lead, await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ status: status.value }) }));
        paint(); flash(node.querySelector('.status-saved'), 'Saved');
      } catch (e) {
        status.value = prev; flash(node.querySelector('.status-saved'), e.message, false);
      } finally { status.disabled = false; }
    });

    const note = node.querySelector('.note');
    note.value = lead.note;
    const saveBtn = node.querySelector('.save-note');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        Object.assign(lead, await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ note: note.value }) }));
        flash(node.querySelector('.note-saved'), 'Note saved');
      } catch (e) {
        flash(node.querySelector('.note-saved'), e.message, false);
      } finally { saveBtn.disabled = false; saveBtn.textContent = 'Save note'; }
    });
    return node;
  }

  async function load() {
    errBox.hidden = true;
    const q = new URLSearchParams();
    if (fStatus.value) q.set('status', fStatus.value);
    if (fCategory.value) q.set('category', fCategory.value);
    history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
    $('summary').textContent = 'Loading…';
    try {
      const { leads } = await api(`/api/leads${q.toString() ? `?${q}` : ''}`);
      if (!leads.length) {
        const empty = document.createElement('div');
        empty.className = 'card empty muted';
        empty.textContent = q.toString() ? 'No leads match these filters.' : 'No leads yet. They will appear here as soon as someone fills in the form.';
        list.replaceChildren(empty);
      } else list.replaceChildren(...leads.map(render));
      $('summary').textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'}, newest first`;
    } catch (e) {
      $('summary').textContent = '';
      errBox.textContent = `Could not load leads: ${e.message}`; errBox.hidden = false;
    }
  }

  fStatus.addEventListener('change', load);
  fCategory.addEventListener('change', load);
  $('refresh').addEventListener('click', load);
  $('logout').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login.html';
  });
  load();
})();
