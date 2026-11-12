(() => {
  'use strict';

  const { desktop } = window;
  const pin = document.getElementById('desktop-pin');
  const mini = document.getElementById('desktop-mini');

  function renderWindowState(state) {
    document.body.classList.toggle('compact', state.compact);
    pin.setAttribute('aria-pressed', String(state.pinned));
    mini.setAttribute('aria-pressed', String(state.compact));
    mini.textContent = state.compact ? '展开' : '迷你';
  }

  pin.addEventListener('click', () => desktop.command('pin'));
  mini.addEventListener('click', () => desktop.command('compact'));
  document.getElementById('desktop-hide').addEventListener('click', () => desktop.command('hide'));
  desktop.onState(renderWindowState);
  desktop.command('state').then(renderWindowState);
})();
