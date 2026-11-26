export function createWorkspaceSwitcher(React) {
  const h = React.createElement;
  return function WorkspaceSwitcher() {
    const [catalog, setCatalog] = React.useState(null);
    const [open, setOpen] = React.useState(false);
    const [form, setForm] = React.useState(null);
    const [name, setName] = React.useState('');
    const [error, setError] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const host = React.useRef(null);
    const trigger = React.useRef(null);
    const request = window.inkbridge?.workspaces;
    React.useEffect(() => {
      let mounted = true;
      request?.({method: 'list'}).then(result => { if (mounted) setCatalog(result); }).catch(reason => {
        if (mounted) setError(reason.message);
      });
      return () => { mounted = false; };
    }, [request]);
    React.useEffect(() => {
      if (!open || busy) return;
      const onPointer = event => { if (!host.current?.contains(event.target)) close(); };
      const onKey = event => {
        if (event.key !== 'Escape' || !host.current?.contains(document.activeElement)) return;
        event.stopPropagation();
        close();
        trigger.current?.focus();
      };
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('keydown', onKey, true);
      return () => {
        document.removeEventListener('pointerdown', onPointer);
        document.removeEventListener('keydown', onKey, true);
      };
    }, [open, busy]);

    function close() {
      setOpen(false);
      setForm(null);
    }
    function edit(row) {
      setForm(row ? {method: 'rename', id: row.id} : {method: 'create'});
      setName(row?.name || '');
      setError('');
    }
    async function act(action) {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        const result = await request(action);
        if (result) setCatalog(result);
        setForm(null);
      } catch (reason) {
        setError(reason.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''));
      } finally {
        setBusy(false);
      }
    }
    if (!request || (!catalog && !error)) return null;
    const active = catalog?.workspaces.find(row => row.id === catalog.activeId);
    const button = (props, label) => h('button', {type: 'button', ...props}, label);
    return h('div', {ref: host, className: 'workspace-switcher'},
      button({ref: trigger, className: 'workspace-trigger', 'aria-expanded': open, 'aria-controls': 'workspace-picker',
        onClick: () => open ? close() : setOpen(true), disabled: busy},
      [h('span', {key: 'caption'}, '工作空間'), h('strong', {key: 'name'}, active?.name || '無法讀取'), h('span', {key: 'arrow', 'aria-hidden': true}, '⌄')]),
      open && h('section', {id: 'workspace-picker', 'aria-label': '工作空間清單', 'aria-busy': busy},
        catalog && h('ul', null, ...catalog.workspaces.map((row, index) => h('li', {key: row.id},
          button({className: 'workspace-choice', 'aria-current': row.id === catalog.activeId ? 'true' : undefined,
            disabled: busy, title: row.name, onClick: () => row.id === catalog.activeId ? close() : act({method: 'select', id: row.id})}, row.name),
          button({className: 'workspace-action', disabled: busy, 'aria-label': `重新命名 ${row.name}`, onClick: () => edit(row)}, '✎'),
          ...[-1, 1].map(direction => button({key: direction, className: 'workspace-action',
            disabled: busy || index + direction < 0 || index + direction >= catalog.workspaces.length,
            'aria-label': `${direction < 0 ? '上移' : '下移'} ${row.name}`, onClick: () => act({method: 'move', id: row.id, direction})}, direction < 0 ? '↑' : '↓'))))),
        catalog && (form ? h('form', {onSubmit: event => { event.preventDefault(); act({...form, name}); }},
          h('input', {autoFocus: true, maxLength: 80, required: true, 'aria-label': '工作空間名稱', value: name, disabled: busy, onChange: event => setName(event.target.value)}),
          h('button', {type: 'submit', disabled: busy || !name.trim()}, form.method === 'create' ? '建立' : '儲存'),
          button({onClick: () => setForm(null), disabled: busy}, '取消')) :
          button({className: 'workspace-add', disabled: busy, onClick: () => edit(null)}, '＋ 新建工作空間')),
        busy && h('small', {role: 'status'}, '正在保存設定或切換工作空間…'),
        error && h('small', {role: 'alert'}, error)));
  };
}
