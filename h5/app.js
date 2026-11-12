(function () {
  'use strict';

  const clock = window.NiumaClock;
  const byId = id => document.getElementById(id);
  const weekdays = '日一二三四五六';
  const quotes = [
    '活可以慢慢干，水记得趁热喝。', '工位暂时属于公司，午饭永远属于你。',
    '把下一件事做完，给自己放三分钟假。', '咖啡还没凉，先别急着给今天下结论。',
    '今天也在给周末攒路费。', '工资按秒涨，心情按需刷新。',
    '消息可以晚点回，肩膀现在就能放松。', '有些问题留给明天，今晚留给自己。',
    '如果脑子在转圈，就起来走个直线。', '撑到下班已经很厉害了。'
  ];
  const characters = { cow: './cow.webp', horse: './horse.webp', sprout: './sprout.webp', erqiu: './erqiu.webp' };
  const sharedMotions = { breathe: '安静陪伴（轻微呼吸）', still: '静止' };
  const characterMotions = {
    cow: { coin: '举金币', nod: '点头打气' },
    horse: { sip: '抿咖啡', stretch: '伸懒腰' },
    sprout: { star: '举星星', nap: '抱星打盹' },
    erqiu: { patrol: '工位巡游', groom: '舔爪子', wave: '单爪打招呼' },
    custom: {}
  };
  const maxImageBytes = 700 * 1024;
  const maxImageDataLength = 4 * Math.ceil(maxImageBytes / 3) + 32;
  const imageData = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;
  const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const rate = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const api = window.xhs && window.xhs.miniTool;
  const demoStarted = Date.now();
  const demoTime = new Date(2026, 1, 2, 10, 42, 18).getTime();
  const prefix = 'niuma.v1.';
  const days = [1, 2, 3, 4, 5, 6, 0].map(day => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const caption = document.createElement('span');
    input.type = 'checkbox';
    input.value = String(day);
    input.setAttribute('aria-label', '星期' + weekdays[day]);
    caption.textContent = weekdays[day];
    label.append(input, caption);
    byId('days').appendChild(label);
    return input;
  });

  const productTemplates = [
    { id: 'coffee', name: '咖啡', price: 15, unit: '杯', icon: '☕' },
    { id: 'lunch', name: '午饭', price: 35, unit: '份', icon: '🍔' },
    { id: 'tea', name: '奶茶', price: 18, unit: '杯', icon: '🧋' },
    { id: 'cola', name: '可乐', price: 4, unit: '罐', icon: '🥤' }
  ];
  let followSupported = false;
  let followStatus = -1;
  let followBusy = false;
  const minProducts = 1;
  const maxProducts = 4;
  const legacyMaxProducts = 8;
  let products = [];
  let productDraft = [];
  let pendingPhotos = 0;
  let soundEnabled = false;
  let audio;
  let coinStep = 10;
  let coinSample;
  let lastCoin = 0;
  let coinTimer;
  let config = clock.defaults;
  let isDemo = true;
  let hideMoney = false;
  let mascot = { character: 'cow', motion: 'breathe' };
  let customImage = '';
  let draftImage = '';
  let uploadRevision = 0;
  let activeDialog = '';
  let dialogTrigger;
  let taskDay = '';
  let tasks = [];
  let taskRevision = Promise.resolve();
  let quoteIndex = 0;
  let lastTick = 0;
  let activeShift = 0;
  let seated = 0;
  let interval;
  let feedbackTimer;

  function setText(id, value) {
    const node = byId(id);
    if (node.textContent !== value) node.textContent = value;
  }

  async function clientVersion() {
    let launch = window.xhs && window.xhs.launchOptions;
    if ((!launch || !launch.miniToolEnv || !launch.miniToolEnv.buildVersion) &&
        api && typeof api.getLaunchOptions === 'function') {
      try { launch = await api.getLaunchOptions(); } catch (error) { return 0; }
    }
    const build = launch && launch.miniToolEnv && launch.miniToolEnv.buildVersion;
    return Math.floor((Number(build) || 0) / 1000);
  }

  const versionReady = clientVersion();

  async function hasNativeStorage() {
    return await versionReady >= 9460 && api &&
      typeof api.getStorage === 'function' && typeof api.setStorage === 'function';
  }

  async function load(key) {
    try {
      const result = await hasNativeStorage()
        ? (await api.getStorage({ key: prefix + key, encrypt: true })).data
        : window.localStorage.getItem(prefix + key);
      return result == null ? null : JSON.parse(result);
    } catch (error) {
      return null;
    }
  }

  async function save(key, value) {
    try {
      const data = JSON.stringify(value);
      if (await hasNativeStorage()) {
        await api.setStorage({ key: prefix + key, data, encrypt: true });
      } else {
        window.localStorage.setItem(prefix + key, data);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async function adjustForHost() {
    if (await versionReady < 9490 || !api || typeof api.getWindowInfo !== 'function') return;
    try {
      const info = await api.getWindowInfo();
      const menu = info.menuButtons || {};
      const insets = [info.safeArea && info.safeArea.top, ...['back', 'me', 'share'].map(key => menu[key] && menu[key].bottom)];
      const top = Math.max(0, ...insets.filter(value => Number.isFinite(value) && value <= 200));
      const shell = document.querySelector('.shell');
      shell.style.setProperty('--host-top', top + 'px');
      shell.classList.toggle('host-inset', top > 0);
    } catch (error) {
      // The CSS safe-area fallback also covers older clients and desktop layouts.
    }
  }

  function feedback(message) {
    setText('feedback', message);
    byId('feedback').hidden = false;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { byId('feedback').hidden = true; }, 2800);
  }

  function dayKey(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
  }

  function shortTime(timestamp) {
    const date = new Date(timestamp);
    return [date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
  }

  function refreshTasksForToday() {
    const today = dayKey(new Date());
    if (taskDay !== today) {
      taskDay = today;
      tasks = [];
      renderTasks();
    }
  }

  function refreshReminder(state, now) {
    const shift = state.shift && state.shift.start;
    if (activeShift !== shift || state.phase === 'rest' || state.phase === 'done') seated = 0;
    if (state.phase === 'work' && activeShift === shift && lastTick && now >= lastTick) {
      seated += Math.min(now - lastTick, 2000);
    }
    activeShift = shift;
    lastTick = now;
    const enabled = config.reminder > 0;
    const limit = config.reminder * clock.minute;
    const due = enabled && state.phase === 'work' && seated >= limit;
    byId('reset-break').disabled = !enabled || state.phase !== 'work';
    const alert = byId('reminder-alert');
    if (due && alert.hidden) playTone('reminder');
    alert.hidden = !due;
    const status = !enabled ? '已关闭，可在设置里开启'
      : due ? '到点了，活动后可重新计时'
      : state.phase === 'work' ? '距活动提醒 ' + clock.duration(limit - seated)
      : '仅在上班时段且页面打开时计时';
    setText('reminder-detail', status);
  }

  function render() {
    const realNow = Date.now();
    const date = new Date(isDemo ? demoTime + realNow - demoStarted : realNow);
    const now = date.getTime();
    const state = clock.getState(date, config);
    const shift = state.shift;
    byId('demo').hidden = !isDemo;
    setText('date', date.getMonth() + 1 + '月' + date.getDate() + '日 · 星期' + weekdays[date.getDay()]);
    setText('phase', { before: '待上班', work: '上班中', rest: '休息中', done: '已下班', off: '休息日' }[state.phase]);
    const mainLabel = { before: '距离上班', work: '距离下班', rest: '距离下班', done: '今日已下班', off: '距离下次上班' };
    setText('count-label', mainLabel[state.phase]);
    const target = shift ? (state.phase === 'before' ? shift.start : shift.end) : state.next;
    const count = state.phase === 'done' ? '00:00:00' : clock.duration(target - now);
    setText('count', count);
    byId('count').classList.toggle('long', count.length > 8);

    const earning = hideMoney ? '¥ ••••' : '¥' + money.format(state.earned);
    setText('earn', earning);
    byId('earn').classList.toggle('large-amount', earning.length > 12);
    setText('visibility', hideMoney ? '显示' : '隐藏');
    byId('visibility').setAttribute('aria-pressed', String(hideMoney));
    setText('hour-rate', hideMoney ? '••••' : shift ? '¥' + rate.format(state.rate * 3600) : '—');
    setText('second-rate', shift && !hideMoney ? '¥' + state.rate.toFixed(4) + ' / 秒' : '每小时');
    byId('rates-label').textContent = '估算时薪';

    let restLabel = '距离午休';
    let restValue = '—';
    let restNote = !shift ? '今日未排班' : '未设置休息';
    if (state.hasRest) {
      restNote = shortTime(shift.restStart) + '–' + shortTime(shift.restEnd) + ' · 不计薪';
      if (now < shift.restStart) {
        restValue = clock.duration(shift.restStart - now);
      } else if (now < shift.restEnd) {
        restLabel = '距离休息结束';
        restValue = clock.duration(shift.restEnd - now);
      } else {
        restLabel = '午休已结束';
        restValue = '已结束';
      }
    }
    setText('break-label', restLabel);
    setText('break-time', restValue);
    setText('break-note', restNote);

    const progress = Math.max(0, Math.min(100, Math.floor(state.progress * 100)));
    setText('percent', progress + '%');
    byId('meter').setAttribute('aria-valuenow', String(progress));
    byId('meter-fill').style.width = state.progress * 100 + '%';
    setText('start-time', shift ? shortTime(shift.start) : '—');
    setText('end-time', shift ? shortTime(shift.end) : '—');
    const totalMinutes = Math.floor(state.worked / clock.minute);
    setText('worked', shift ? '已计薪 ' + Math.floor(totalMinutes / 60) + ' 小时 ' + totalMinutes % 60 + ' 分钟' : '今日未排班');
    products.slice(0, maxProducts).forEach((item, index) => {
      const value = hideMoney ? '••••' : (state.earned / item.price).toFixed(1) + ' ' + item.unit;
      const quantity = byId('purchase-grid').children[index].querySelector('strong');
      if (quantity.textContent !== value) quantity.textContent = value;
    });
    refreshCoins(state, realNow);
    refreshReminder(state, realNow);
    refreshTasksForToday();
  }

  function renderTasks() {
    const list = byId('task-list');
    list.textContent = '';
    tasks.forEach((task, index) => {
      const item = document.createElement('li');
      const label = document.createElement('label');
      const check = document.createElement('input');
      const name = document.createElement('span');
      const remove = document.createElement('button');
      check.type = 'checkbox';
      check.checked = task.done;
      name.textContent = task.text;
      label.append(check, name);
      remove.type = 'button';
      remove.textContent = '×';
      remove.className = 'link-button';
      remove.setAttribute('aria-label', '移除' + task.text);
      check.addEventListener('change', () => {
        task.done = check.checked;
        updateTaskCount();
        persistTasks();
      });
      remove.addEventListener('click', () => {
        tasks.splice(index, 1);
        renderTasks();
        const next = list.children[index] || list.lastElementChild;
        (next ? next.querySelector('button') : byId('task-input')).focus();
        persistTasks();
      });
      item.append(label, remove);
      list.appendChild(item);
    });
    updateTaskCount();
  }

  function updateTaskCount() {
    setText('task-count', tasks.filter(task => task.done).length + '/' + tasks.length);
  }

  function persistTasks() {
    const data = { day: taskDay, items: tasks.map(task => ({ text: task.text, done: task.done })) };
    taskRevision = taskRevision.then(async () => {
      if (!await save('tasks', data)) feedback('待办保留在本次打开期间');
    });
  }

  const configFields = {
    salary: 'salary', payDays: 'pay-days', start: 'shift-start', end: 'shift-end',
    breakStart: 'break-start', breakEnd: 'break-end', reminder: 'reminder-minutes'
  };

  function updateBreakFields() {
    const on = byId('break-enabled').checked;
    byId('break-fields').hidden = !on;
    ['break-start', 'break-end'].forEach(id => { byId(id).required = on; });
  }

  function showError(panel, message) {
    setText(panel + '-error', message);
    byId(panel + '-error').hidden = !message;
  }

  function showDialog(panel, trigger) {
    activeDialog = panel;
    dialogTrigger = trigger;
    document.body.classList.add('modal-open');
    byId(panel).hidden = false;
    byId(panel).scrollTop = 0;
    showError(panel, '');
    byId('close-' + panel).focus();
  }

  function closeDialog() {
    if (!activeDialog || byId('save-' + activeDialog).disabled) return;
    if (activeDialog === 'mascots') uploadRevision += 1;
    const dialog = byId(activeDialog);
    const keyboard = !document.body.classList.contains('pointer-input');
    if (!keyboard && dialog.contains(document.activeElement)) document.activeElement.blur();
    dialog.hidden = true;
    activeDialog = '';
    document.body.classList.remove('modal-open');
    if (keyboard) dialogTrigger.focus({ preventScroll: true });
  }

  function openSettings(trigger) {
    Object.keys(configFields).forEach(key => { byId(configFields[key]).value = config[key]; });
    days.forEach(day => { day.checked = config.days.includes(Number(day.value)); });
    byId('break-enabled').checked = config.breakEnabled;
    updateBreakFields();
    showDialog('settings', trigger);
    byId('coin-step').value = String(coinStep);
    byId('sound-enabled').checked = soundEnabled;
  }

  function drawMascot() {
    const image = byId('mascot-image');
    const custom = mascot.character === 'custom';
    image.src = custom ? customImage : characters[mascot.character];
    const patrol = mascot.character === 'erqiu' && mascot.motion === 'patrol';
    const action = mascot.motion;
    const pose = byId('mascot-pose');
    const gesture = byId('cat-gesture');
    const animatedPose = ['coin', 'nod', 'sip', 'stretch', 'star', 'nap'].includes(action);
    const catGesture = mascot.character === 'erqiu' && ['groom', 'wave'].includes(action);
    image.hidden = patrol;
    byId('patrol-track').hidden = !patrol;
    const stage = image.parentElement;
    stage.classList.toggle('pose-active', animatedPose);
    stage.classList.toggle('pose-slow', action === 'nap');
    stage.classList.toggle('pose-nodding', action === 'nod');
    stage.classList.toggle('gesture-active', catGesture);
    stage.classList.toggle('gesture-waving', action === 'wave');
    pose.hidden = !animatedPose;
    if (animatedPose) {
      pose.src = './pose-' + action + '.webp';
      pose.className = 'mascot-pose pose-' + action;
    }
    gesture.hidden = !catGesture;
    if (catGesture) gesture.className = 'cat-gesture gesture-' + action;
    image.className = custom && customImage.startsWith('data:image/gif;') ? '' : 'motion-' + mascot.motion;
  }

  function currentCharacter() {
    return byId('mascots').querySelector('input[name="character"]:checked').value;
  }

  function updateMascotForm() {
    const custom = byId('custom-choice');
    custom.disabled = !draftImage;
    byId('custom-thumb').hidden = !draftImage;
    byId('custom-placeholder').hidden = !!draftImage;
    if (draftImage) byId('custom-thumb').src = draftImage;
    const character = currentCharacter();
    const motion = byId('motion');
    const options = Object.assign({}, characterMotions[character], sharedMotions);
    const selected = motion.value;
    motion.textContent = '';
    Object.keys(options).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = options[value];
      motion.appendChild(option);
    });
    motion.value = Object.prototype.hasOwnProperty.call(options, selected) ? selected : 'breathe';
    motion.disabled = character === 'custom' && draftImage.startsWith('data:image/gif;');
  }

  function openMascots(trigger) {
    draftImage = customImage;
    byId('custom-image').value = '';
    byId('mascots').querySelector('input[value="' + mascot.character + '"]').checked = true;
    updateMascotForm();
    byId('motion').value = mascot.motion;
    showDialog('mascots', trigger);
    refreshFollow();
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const data = reader.result;
        if (!imageData.test(data)) return reject(new Error('图片格式不可用。'));
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          if (image.naturalWidth * image.naturalHeight > 4000000) return reject(new Error('图片尺寸太大。'));
          resolve(data);
        };
        image.src = data;
      };
      reader.readAsDataURL(file);
    });
  }

  function bindInteractions() {
    const pointerInput = () => document.body.classList.add('pointer-input');
    document.addEventListener('mousedown', pointerInput, true);
    document.addEventListener('touchstart', pointerInput, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
      if (['Tab', 'Enter', ' ', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        document.body.classList.remove('pointer-input');
      }
    }, true);
    byId('open-settings').addEventListener('click', event => openSettings(event.currentTarget));
    byId('open-products').addEventListener('click', event => showProducts(event.currentTarget));
    byId('add-product').addEventListener('click', () => {
      if (productDraft.length >= maxProducts) return;
      productDraft.push({ id: 'custom-' + Date.now(), name: '', unit: '份', price: '', icon: '🛍' });
      drawProductEditor();
      byId('product-fields').lastElementChild.querySelector('input').focus();
    });
    byId('restore-products').addEventListener('click', () => {
      const missing = defaultProducts().filter(template => !productDraft.some(item => item.id === template.id));
      productDraft.push(...missing.slice(0, Math.max(0, maxProducts - productDraft.length)));
      drawProductEditor();
      byId('save-products').focus();
    });
    byId('products-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = byId('save-products');
      if (button.disabled || !canCustomize()) return;
      if (productDraft.length < minProducts || productDraft.length > maxProducts) {
        return showError('products', '请保留 1–4 个商品');
      }
      if (!productDraft.every(validProduct)) return showError('products', '请填好商品名称、价格和单位');
      button.disabled = true;
      products = productDraft.map(item => Object.assign({}, item, { name: item.name.trim(), unit: item.unit.trim() }));
      const saved = await save('products', products);
      button.disabled = false;
      closeDialog();
      drawProducts();
      render();
      feedback(saved ? '购买力商品已保存' : '商品仅在本次打开期间生效');
    });
    byId('sound-enabled').addEventListener('change', async event => {
      if (!event.target.checked) return;
      const ready = await enableSound();
      if (!event.target.checked) return;
      if (!ready) {
        event.target.checked = false;
        feedback('当前环境无法播放音效');
        return;
      }
      const previous = soundEnabled;
      soundEnabled = true;
      playTone('coin');
      soundEnabled = previous;
    });
    byId('open-mascots').addEventListener('click', event => openMascots(event.currentTarget));
    byId('break-enabled').addEventListener('change', updateBreakFields);
    byId('mascots-form').addEventListener('change', event => {
      if (event.target.name !== 'character') return;
      updateMascotForm();
      if (currentCharacter() === 'erqiu' && mascot.character !== 'erqiu') byId('motion').value = 'patrol';
    });
    ['settings', 'mascots', 'products'].forEach(panel => {
      byId('close-' + panel).addEventListener('click', closeDialog);
      byId(panel).addEventListener('click', event => {
        if (event.target === byId(panel)) closeDialog();
      });
    });
    document.addEventListener('keydown', event => {
      if (!activeDialog) return;
      if (event.key === 'Escape') closeDialog();
      if (event.key !== 'Tab') return;
      const focusable = Array.from(byId(activeDialog).querySelectorAll('button, input, select'))
        .filter(node => !node.disabled && node.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    byId('settings-form').addEventListener('submit', async event => {
      event.preventDefault();
      const next = { coffee: config.coffee, lunch: config.lunch, days: days.filter(day => day.checked).map(day => Number(day.value)), breakEnabled: byId('break-enabled').checked };
      Object.keys(configFields).forEach(key => {
        const value = byId(configFields[key]).value;
        next[key] = ['salary', 'payDays', 'coffee', 'lunch', 'reminder'].includes(key) ? Number(value) : value;
      });
      const error = clock.validate(next);
      showError('settings', error);
      if (error) return;
      if (byId('save-settings').disabled) return;
      byId('save-settings').disabled = true;
      coinStep = Number(byId('coin-step').value);
      soundEnabled = byId('sound-enabled').checked;
      coinSample = null;
      clearCoins();
      const savedResults = await Promise.all([save('config', next), save('effects', { coinStep, soundEnabled })]);
      const saved = savedResults.every(Boolean);
      byId('save-settings').disabled = false;
      config = next;
      isDemo = false;
      seated = 0;
      lastTick = 0;
      closeDialog();
      render();
      feedback(saved ? '设置已保存' : '本次设置已生效，未能保存到本机');
    });
    byId('custom-image').addEventListener('change', async event => {
      if (!canCustomize()) { event.target.value = ''; return; }
      const revision = ++uploadRevision;
      const file = event.target.files[0];
      if (!file) {
        byId('save-mascots').disabled = false;
        return;
      }
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > maxImageBytes) {
        event.target.value = '';
        byId('save-mascots').disabled = false;
        showError('mascots', '请选择不超过 700 KB 的 JPG、PNG、WebP 或 GIF。');
        return;
      }
      byId('save-mascots').disabled = true;
      showError('mascots', '');
      try {
        const data = await loadImage(file);
        if (revision !== uploadRevision) return;
        draftImage = data;
        byId('custom-choice').checked = true;
        updateMascotForm();
      } catch (error) {
        if (revision === uploadRevision) showError('mascots', '无法读取这张图片，请换一张。');
      } finally {
        if (revision === uploadRevision) byId('save-mascots').disabled = false;
      }
    });
    byId('mascots-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (byId('save-mascots').disabled) return;
      byId('save-mascots').disabled = true;
      const character = currentCharacter();
      const imageChanged = customImage !== draftImage && character === 'custom';
      if (imageChanged && !canCustomize()) {
        byId('save-mascots').disabled = false;
        return showError('mascots', '确认关注状态后才能保存新素材。');
      }
      mascot = { character, motion: byId('motion').value };
      const imageSaved = !imageChanged || await save('image', draftImage);
      if (imageChanged) customImage = draftImage;
      const saved = imageSaved && await save('mascot', mascot);
      byId('save-mascots').disabled = false;
      closeDialog();
      drawMascot();
      feedback(saved ? '搭子已更换' : '搭子仅在本次打开期间生效');
    });
    byId('visibility').addEventListener('click', async () => {
      hideMoney = !hideMoney;
      if (hideMoney) clearCoins();
      render();
      byId('visibility').disabled = true;
      if (!await save('hide', hideMoney)) feedback('隐藏设置仅在本次打开期间生效');
      byId('visibility').disabled = false;
    });
    byId('next-quote').addEventListener('click', () => {
      quoteIndex = (quoteIndex + 1) % quotes.length;
      setText('quote', quotes[quoteIndex]);
    });
    byId('reset-break').addEventListener('click', () => {
      seated = 0;
      lastTick = 0;
      render();
      feedback('已重新计时');
    });
    byId('task-form').addEventListener('submit', event => {
      event.preventDefault();
      refreshTasksForToday();
      const input = byId('task-input');
      const text = input.value.trim();
      if (!text) return;
      if (tasks.length >= 30) return feedback('今天最多记录 30 件事');
      tasks.push({ text, done: false });
      input.value = '';
      renderTasks();
      persistTasks();
    });
    document.addEventListener('visibilitychange', () => {
      document.body.classList.toggle('page-hidden', document.hidden);
      coinSample = null;
      if (document.hidden) clearCoins();
      clearInterval(interval);
      lastTick = 0;
      if (!document.hidden) {
        render();
        interval = setInterval(render, 250);
      }
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(adjustForHost, 180);
    });
  }

  function playTone(kind) {
    if (!soundEnabled || !audio || audio.state !== 'running' || document.hidden) return;
    const tones = kind === 'reminder' ? [523, 659, 784] : [1047, 1568, 2093];
    tones.forEach((frequency, index) => {
      const start = audio.currentTime + index * .075;
      const note = audio.createOscillator();
      const volume = audio.createGain();
      note.type = 'sine';
      note.frequency.value = frequency;
      volume.gain.setValueAtTime(.001, start);
      volume.gain.exponentialRampToValueAtTime(.11, start + .018);
      volume.gain.exponentialRampToValueAtTime(.001, start + .18);
      note.connect(volume);
      volume.connect(audio.destination);
      note.onended = () => { note.disconnect(); volume.disconnect(); };
      note.start(start);
      note.stop(start + .19);
    });
  }

  async function enableSound() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      if (!audio) audio = new Context();
      await audio.resume();
      return audio.state === 'running';
    } catch (error) {
      return false;
    }
  }

  function refreshCoins(state, now) {
    const current = { shift: state.shift && state.shift.start, amount: state.earned, time: now };
    const previous = coinSample;
    coinSample = current;
    if (!coinStep || hideMoney || document.hidden || !previous || previous.shift !== current.shift ||
        now - previous.time > 2000 || state.phase !== 'work') return;
    const bucket = Math.floor(current.amount / coinStep);
    if (bucket <= Math.floor(previous.amount / coinStep) || now - lastCoin < 2800) return;
    lastCoin = now;
    byId('coin-rain').classList.add('falling');
    playTone('coin');
    clearTimeout(coinTimer);
    coinTimer = setTimeout(clearCoins, 2600);
  }

  function clearCoins() {
    clearTimeout(coinTimer);
    byId('coin-rain').classList.remove('falling');
  }

  function defaultProducts() {
    return productTemplates.map(item => Object.assign({}, item, {
      price: item.id === 'coffee' ? config.coffee : item.id === 'lunch' ? config.lunch : item.price
    }));
  }

  function validProduct(item) {
    return item && typeof item.name === 'string' && item.name.trim() && item.name.length <= 18 &&
      typeof item.unit === 'string' && item.unit.trim() && item.unit.length <= 4 &&
      Number.isFinite(item.price) && item.price >= .01 && item.price <= 100000 &&
      typeof item.id === 'string' && typeof item.icon === 'string' &&
      (!item.image || (typeof item.image === 'string' && item.image.length <= 88000 && imageData.test(item.image)));
  }

  function drawProducts() {
    const grid = byId('purchase-grid');
    grid.textContent = '';
    products.slice(0, maxProducts).forEach(item => {
      const card = document.createElement('div');
      const icon = document.createElement(item.image ? 'img' : 'span');
      icon.className = 'purchase-icon';
      if (item.image) { icon.src = item.image; icon.alt = ''; }
      else { icon.textContent = item.icon; icon.setAttribute('aria-hidden', 'true'); }
      const text = document.createElement('div');
      const quantity = document.createElement('strong');
      quantity.className = 'number';
      const caption = document.createElement('p');
      caption.textContent = item.name + ' · ¥' + item.price + '/' + item.unit;
      text.append(quantity, caption);
      card.append(icon, text);
      grid.appendChild(card);
    });
  }

  function showProducts(trigger) {
    productDraft = products.map(item => Object.assign({}, item));
    drawProductEditor();
    showDialog('products', trigger);
    refreshFollow();
  }

  function drawProductEditor() {
    const editor = byId('product-fields');
    editor.textContent = '';
    productDraft.forEach((item, index) => {
      const row = document.createElement('section');
      row.className = 'product-editor';
      const heading = document.createElement('div');
      heading.className = 'row';
      const label = document.createElement('strong');
      label.textContent = item.name || '自定义商品';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link-button';
      remove.textContent = '移除';
      remove.setAttribute('aria-label', '移除' + label.textContent);
      remove.disabled = productDraft.length <= minProducts;
      remove.addEventListener('click', () => {
        if (productDraft.length <= minProducts) return;
        productDraft.splice(index, 1);
        drawProductEditor();
        const remaining = Array.from(editor.querySelectorAll('button')).filter(button => !button.disabled);
        (remaining[Math.min(index, remaining.length - 1)] || byId('add-product')).focus();
      });
      heading.append(label, remove);
      const fields = document.createElement('div');
      fields.className = 'fields';
      [['名称', 'name', 18], ['价格（元）', 'price', 0], ['单位', 'unit', 4]].forEach(([title, key, length]) => {
        const wrapper = document.createElement('label');
        wrapper.textContent = title;
        const input = document.createElement('input');
        input.required = true;
        input.value = item[key];
        if (length) input.maxLength = length;
        else { input.type = 'number'; input.min = '.01'; input.max = '100000'; input.step = '.01'; }
        input.addEventListener('input', () => { item[key] = length ? input.value : Number(input.value); });
        wrapper.appendChild(input);
        fields.appendChild(wrapper);
      });
      const image = document.createElement('img');
      image.className = 'product-thumbnail';
      image.alt = '';
      image.hidden = !item.image;
      if (item.image) image.src = item.image;
      const fileLabel = document.createElement('label');
      fileLabel.textContent = '商品图（可选）';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const saveButton = byId('save-products');
        pendingPhotos += 1;
        saveButton.disabled = true;
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的图片');
          item.image = await productPhoto(file);
          image.src = item.image;
          image.hidden = false;
          showError('products', '');
        } catch (error) {
          showError('products', error.message || '无法读取商品图片');
        } finally {
          pendingPhotos -= 1;
          saveButton.disabled = pendingPhotos > 0;
        }
      });
      fileLabel.appendChild(fileInput);
      row.append(heading, fields, image, fileLabel);
      editor.appendChild(row);
    });
    setText('product-count', productDraft.length > maxProducts
      ? '已保存 ' + productDraft.length + ' 个商品，请移除多余商品后保存（保留 1–4 个）。'
      : '已选 ' + productDraft.length + ' / ' + maxProducts + ' 个，至少保留 1 个。');
    byId('add-product').disabled = productDraft.length >= maxProducts;
    byId('restore-products').disabled = productDraft.length >= maxProducts ||
      productTemplates.every(template => productDraft.some(item => item.id === template.id));
  }

  function productPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('请选择 JPG、PNG、WebP 或 GIF'));
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法解码')); };
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 160;
          const ctx = canvas.getContext('2d');
          const size = Math.min(image.naturalWidth, image.naturalHeight);
          ctx.fillStyle = '#f6f3ec';
          ctx.fillRect(0, 0, 160, 160);
          ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 160, 160);
          const result = canvas.toDataURL('image/jpeg', .82);
          if (!imageData.test(result) || result.length > 88000) throw new Error('无法生成商品缩略图');
          resolve(result);
        } catch (error) { reject(error); }
        finally { URL.revokeObjectURL(url); }
      };
      image.src = url;
    });
  }

  function canCustomize() {
    return followStatus === 1 || followStatus === 2;
  }

  function drawFollow() {
    const allowed = canCustomize();
    const pending = followBusy;
    const message = !followSupported ? '自定义功能需要支持关注接口的小红书客户端（9.51+）。'
      : pending ? '正在确认关注状态…'
      : followStatus === -1 ? '暂时无法确认关注状态，请稍后重试。'
      : '关注作者后可使用自定义功能。';
    const button = byId('follow-author');
    button.hidden = !followSupported || followStatus === 2;
    button.disabled = pending || followStatus === 1;
    button.textContent = followStatus === 1 ? '已关注作者' : '关注作者';
    byId('custom-image').disabled = !allowed || pending;
    byId('mascot-follow-hint').hidden = allowed && !pending;
    setText('mascot-follow-hint', message);
    byId('products-form').hidden = !allowed || pending;
    byId('product-follow-gate').hidden = allowed && !pending;
    setText('product-follow-hint', message);
    ['follow-for-mascot', 'follow-for-product'].forEach(id => {
      byId(id).hidden = !followSupported || allowed || pending;
      setText(id, followStatus === -1 ? '重试关注状态' : '关注作者以启用自定义');
    });
  }

  async function refreshFollow() {
    if (followBusy) return;
    if (!followSupported) return drawFollow();
    followBusy = true;
    drawFollow();
    try {
      const result = await api.getFollowStatus();
      followStatus = result.follow_status;
    } catch (error) {
      followStatus = -1;
    } finally {
      followBusy = false;
      drawFollow();
    }
  }

  async function requestFollow(event) {
    if (!followSupported || followBusy || canCustomize()) return;
    if (followStatus === -1 && event.currentTarget.id !== 'follow-author') return refreshFollow();
    followBusy = true;
    drawFollow();
    try {
      const result = await api.followAuthor();
      followStatus = result.follow_status;
      if (followStatus === -1) feedback('暂时无法关注，请稍后再试');
    } catch (error) {
      if (error.errCode === 15404) feedback('今日关注提示已达上限');
      else if (error.errCode !== 20002 && error.errCode !== 10003) feedback('暂时无法关注，请稍后再试');
    } finally {
      followBusy = false;
      drawFollow();
      if (canCustomize() && activeDialog === 'mascots') byId('custom-image').focus();
      if (canCustomize() && activeDialog === 'products') byId('add-product').focus();
    }
  }

  async function initFollow() {
    followSupported = await versionReady >= 9510 && !!api &&
      typeof api.getFollowStatus === 'function' && typeof api.followAuthor === 'function';
    ['follow-author', 'follow-for-mascot', 'follow-for-product'].forEach(id => {
      byId(id).addEventListener('click', requestFollow);
    });
    refreshFollow();
  }

  async function init() {
    render();
    const [stored, hide, storedMascot, storedImage, storedTasks, savedProducts, effects] = await Promise.all(
      ['config', 'hide', 'mascot', 'image', 'tasks', 'products', 'effects'].map(load)
    );
    if (stored && !clock.validate(stored)) {
      config = stored;
      isDemo = false;
    }
    products = Array.isArray(savedProducts) && savedProducts.length <= legacyMaxProducts && savedProducts.every(validProduct)
      ? (savedProducts.length ? savedProducts : defaultProducts().slice(0, minProducts)) : defaultProducts();
    drawProducts();
    if (effects) {
      coinStep = [0, 1, 10].includes(effects.coinStep) ? effects.coinStep : 10;
      soundEnabled = effects.soundEnabled === true;
      if (soundEnabled) document.addEventListener('click', enableSound, { once: true });
    }
    hideMoney = hide === true;
    if (typeof storedImage === 'string' && storedImage.length <= maxImageDataLength && imageData.test(storedImage)) customImage = storedImage;
    if (storedMascot &&
        (Object.prototype.hasOwnProperty.call(characters, storedMascot.character) ||
         (storedMascot.character === 'custom' && customImage))) {
      const options = Object.assign({}, characterMotions[storedMascot.character], sharedMotions);
      const motion = Object.prototype.hasOwnProperty.call(options, storedMascot.motion) ? storedMascot.motion : 'breathe';
      mascot = { character: storedMascot.character, motion };
    }
    if (storedTasks && storedTasks.day === taskDay && Array.isArray(storedTasks.items)) {
      tasks = storedTasks.items.filter(item => item && typeof item.text === 'string' && item.text.length <= 60).slice(0, 30);
    }
    seated = 0;
    lastTick = 0;
    bindInteractions();
    drawMascot();
    renderTasks();
    render();
    adjustForHost();
    initFollow();
    if (!document.hidden) interval = setInterval(render, 250);
  }

  init();
}());
