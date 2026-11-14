// Keep navigation independent of data fetching: changing sections must not
// recreate form controls, discard edits or make additional API requests.
export function createAdminWorkspace(root, onNavigate = () => {}) {
  const panels = [...root.querySelectorAll('.admin-grid > section[id]')];
  const links = [...root.querySelectorAll('.admin-nav a')];
  const select = root.querySelector('#admin-section-select');
  let activeId = panels[0]?.id;
  function selectSection(id, { focus = false, scroll = false } = {}) {
    const panel = panels.find(item => item.id === id);
    if (!panel) return false;
    activeId = id;
    panels.forEach(item => { item.hidden = item !== panel; });
    links.forEach(link => {
      if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (select) select.value = id;
    const heading = panel.querySelector('h2');
    const title = root.querySelector('#admin-page-title');
    const description = root.querySelector('#admin-page-description');
    if (title) title.textContent = heading?.textContent || '運用管理';
    if (description) description.textContent = panel.querySelector('.admin-section-title p')?.textContent || '';
    if (focus) title?.focus({ preventScroll: true });
    if (focus || scroll) {
      const workspace = root.querySelector('#admin-workspace');
      workspace?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    onNavigate(id);
    return true;
  }
  root.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
    const id = link.getAttribute('href').slice(1);
    if (!panels.some(panel => panel.id === id)) return;
    event.preventDefault();
    selectSection(id, { focus: true });
  });
  select?.addEventListener('change', () => selectSection(select.value, { scroll: true }));
  selectSection(activeId);
  return { selectSection, get activeId() { return activeId; } };
}

export function filterAdminAccounts(accounts, query = '', access = 'all') {
  const terms = String(query).normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return accounts.filter(account => {
    if (access === 'allowed' && !account.earlyAccessAllowed) return false;
    if (access === 'not-allowed' && account.earlyAccessAllowed) return false;
    const text = [account.displayName, account.username, account.id].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

// Each successful resource can render immediately; failure in Analytics must
// not prevent accounts, maintenance settings or notices from loading.
export async function loadAdminResources(resources) {
  const results = await Promise.allSettled(resources.map(async resource => {
    const payload = await resource.load();
    resource.render(payload);
  }));
  return resources.filter((_, index) => results[index].status === 'rejected');
}

export function setAdminMessage(element, text, type = '') {
  element.textContent = text;
  element.classList.add('admin-message');
  element.classList.toggle('error', type === 'error');
  element.classList.toggle('success', type === 'success');
}
