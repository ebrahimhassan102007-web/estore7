/**
 * ============================================================
 * MY FARM 3D - DEDICATED MOBILE HUD CONTROLLER
 * ============================================================
 * الطبقة المرئية فقط: تقرأ GameState وتكتب الأفعال عبر الأنظمة
 * (InventorySystem للبيع/البذور). لا THREE ولا منطق مزرعة هنا.
 * ============================================================
 */
import { InventorySystem } from '../systems/InventorySystem.js';
const PRESENTATION_DEFAULTS = {
  player: {
    coins: 15230,
    gems: 245,
    level: 12,
    xp: 620,
    xpToNext: 1500
  },
  time: {
    clock: '08:00 AM',
    season: 'الربيع',
    day: 5
  },
  hotbar: [
    { id: 'axe', name: 'فأس', icon: '🪓', type: 'tool', count: null },
    { id: 'pickaxe', name: 'معول', icon: '⛏️', type: 'tool', count: null },
    { id: 'water_can', name: 'مرشة مياه', icon: '💧', type: 'tool', count: null },
    { id: 'wheat_seed', name: 'بذور قمح', icon: '🌾', type: 'seed', cropType: 'wheat', count: 12 },
    { id: 'corn_seed', name: 'بذور ذرة', icon: '🌽', type: 'seed', cropType: 'corn', count: 8 },
    { id: 'carrot_seed', name: 'بذور جزر', icon: '🥕', type: 'seed', cropType: 'carrot', count: 5 },
    { id: 'tomato_seed', name: 'بذور طماطم', icon: '🍅', type: 'seed', cropType: 'tomato', count: 4 }
  ]
};

export class HUD {
  constructor({ gameState, eventBus, callbacks = {}, enableJoystick = true } = {}) {
    this.gameState = gameState;
    this.eventBus = eventBus;
    this.callbacks = callbacks;
    this.enableJoystick = enableJoystick;
    this.container = null;
    this.selectedHotbarIndex = 0;

    this.currentHotbar = [...PRESENTATION_DEFAULTS.hotbar];
    this.currentTime = { ...PRESENTATION_DEFAULTS.time };

    this.joystickActive = false;
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.maxJoystickRadius = 38;
    this.missionsOpen = false;
    this.bagOpen = false;
  }

  getState(path, fallback = null) {
    if (this.gameState && typeof this.gameState.get === 'function') {
      const val = this.gameState.get(path);
      return val !== undefined ? val : fallback;
    }
    return fallback;
  }

  mount(target = document.body) {
    const parent = typeof target === 'string' ? document.querySelector(target) : target;
    if (!parent) return;
    this.unmount();
    this.container = this.buildDom();
    parent.appendChild(this.container);
    this.bindEvents();
    this.refreshAll();
  }

  unmount() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }

  buildDom() {
    const root = document.createElement('div');
    root.id = 'game-hud-overlay';
    root.innerHTML = `
      <!-- TOP BAR -->
      <header class="hud-top-bar">
        <!-- Level & XP Card -->
        <div class="hud-level-card">
          <div class="hud-level-badge" id="hud-level-num">1</div>
          <div class="hud-xp-box">
            <div class="hud-xp-track">
              <div class="hud-xp-fill" id="hud-xp-fill" style="width: 25%;"></div>
            </div>
            <span class="hud-xp-text" id="hud-xp-text">25 / 100</span>
          </div>
        </div>

        <!-- Currencies (Coins & Gems Separated) -->
        <div class="hud-currencies">
          <div class="hud-currency-item coins">
            <span class="icon">💰</span>
            <span id="hud-coins">350</span>
          </div>
          <div class="hud-currency-item gems">
            <span class="icon">💎</span>
            <span id="hud-gems">10</span>
          </div>
        </div>

        <!-- Clock & Season Pill -->
        <div class="hud-time-pill">
          <span class="clock" id="hud-time">08:00 AM</span>
          <span class="season" id="hud-season">الربيع - يوم 1</span>
        </div>
      </header>

      <aside class="hud-utility-stack" aria-label="أدوات المزرعة">
        <button type="button" class="hud-icon-btn" id="hud-btn-menu" aria-label="القائمة">☰</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-bag" aria-label="الحقيبة">🎒</button>
      </aside>
      <div class="hud-action-stack">
        <button type="button" class="harvest-button" id="hud-btn-interact" aria-label="تفاعل">🤚</button>
      </div>
      <button type="button" class="hud-missions-toggle" id="hud-missions-toggle" aria-label="المهام">📋</button>
      <div class="hud-missions-panel is-collapsed" id="hud-missions-panel">
        <div class="missions-header">📋 المهام</div>
        <div class="missions-list" id="hud-missions-list"></div>
      </div>

      <!-- VIRTUAL JOYSTICK -->
      ${this.enableJoystick ? `
      <div class="hud-joystick-zone" id="hud-joystick-zone">
        <div class="joystick-base" id="hud-joystick-base">
          <div class="joystick-thumb" id="hud-joystick-thumb"></div>
        </div>
      </div>
      ` : ''}

      <!-- BOTTOM CENTER HOTBAR -->
      <nav class="hud-bottom-hotbar" id="hud-hotbar"></nav>

      <!-- 🎒 الحقيبة: عرض + بيع (المسار: حصاد ← مخزن ← كوينز) -->
      <section class="hud-sheet" id="hud-bag-sheet" aria-hidden="true">
        <header class="hud-sheet-head">
          <span class="hud-sheet-title">🎒 المخزن</span>
          <span class="hud-sheet-sub" id="hud-bag-capacity">0 / 50</span>
          <button type="button" class="hud-sheet-close" id="hud-bag-close" aria-label="إغلاق">✕</button>
        </header>
        <div class="hud-sheet-body" id="hud-bag-list"></div>
        <footer class="hud-sheet-foot">
          <button type="button" class="hud-sheet-wide" id="hud-bag-sell-crops">بيع كل المحاصيل 💰</button>
        </footer>
      </section>
    `;
    return root;
  }

  bindEvents() {
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this.eventBus.on('state:changed', (path, value) => {
        this.onStateChanged(path, value);
      });
      this.eventBus.on('quest:progress-updated', () => this.renderMissions());
      this.eventBus.on('quest:completed', () => this.renderMissions());
      this.eventBus.on('quest:claimed', () => this.renderMissions());
    }

    if (this.enableJoystick) {
      this.setupJoystick();
    }

    this.renderHotbar();
    this.renderMissions();

    const bagBtn = this.container?.querySelector('#hud-btn-bag');
    bagBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleBag();
    });

    this.container?.querySelector('#hud-bag-close')?.addEventListener('click', () => this.toggleBag(false));
    this.container?.querySelector('#hud-bag-sell-crops')?.addEventListener('click', () => this.sellAllCrops());

    if (this.eventBus && typeof this.eventBus.on === 'function') {
      // تحديث عدّادات البذور + الحقيبة عند أي تغيير في المخزن
      this.eventBus.on('state:changed', (path) => {
        if (path === 'inventory.items') {
          this.syncSeedCounts();
          if (this.bagOpen) this.renderBag();
        }
      });
      this.eventBus.on('crop:harvested', () => this.syncSeedCounts());
      this.eventBus.on('time:hour', () => this.pullClock());
      this.eventBus.on('game:tick', () => this.pullClock());
    }

    const interactBtn = this.container?.querySelector('#hud-btn-interact');
    interactBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.callbacks.onInteract === 'function') this.callbacks.onInteract();
    });

    const missionsToggle = this.container?.querySelector('#hud-missions-toggle');
    const missionsPanel = this.container?.querySelector('#hud-missions-panel');
    missionsToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.missionsOpen = !this.missionsOpen;
      missionsPanel?.classList.toggle('is-collapsed', !this.missionsOpen);
      missionsToggle.classList.toggle('is-open', this.missionsOpen);
    });
  }

  onStateChanged(path, value) {
    switch (path) {
      case 'player.coins':
        this.updateCoins(value);
        break;
      case 'player.gems':
        this.updateGems(value);
        break;
      case 'player.level':
        this.updateLevel(value);
        break;
      case 'player.xp':
        this.updateXP(value, this.getState('player.xpToNext', 100));
        break;
      case 'player.xpToNext':
        this.updateXP(this.getState('player.xp', 0), value);
        break;
      default:
        break;
    }
  }

  refreshAll() {
    this.updateCoins(this.getState('player.coins', PRESENTATION_DEFAULTS.player.coins));
    this.updateGems(this.getState('player.gems', PRESENTATION_DEFAULTS.player.gems));
    this.updateLevel(this.getState('player.level', PRESENTATION_DEFAULTS.player.level));
    this.updateXP(
      this.getState('player.xp', PRESENTATION_DEFAULTS.player.xp),
      this.getState('player.xpToNext', PRESENTATION_DEFAULTS.player.xpToNext)
    );
    this.renderMissions();
    this.syncSeedCounts();
    this.pullClock();
    this.updateCapacityPill();
  }

  updateCoins(val) {
    const el = this.container?.querySelector('#hud-coins');
    if (el) el.textContent = Number(val ?? 0).toLocaleString();
  }

  updateGems(val) {
    const el = this.container?.querySelector('#hud-gems');
    if (el) el.textContent = Number(val ?? 0).toLocaleString();
  }

  updateLevel(val) {
    const el = this.container?.querySelector('#hud-level-num');
    if (el) el.textContent = val ?? 1;
  }

  updateXP(curr, max) {
    const fill = this.container?.querySelector('#hud-xp-fill');
    const txt = this.container?.querySelector('#hud-xp-text');
    const c = Number(curr ?? 0);
    const m = Number(max ?? 100);
    if (txt) txt.textContent = `${c} / ${m}`;
    if (fill && m > 0) {
      fill.style.width = `${Math.min(100, Math.max(0, (c / m) * 100))}%`;
    }
  }

  renderHotbar() {
    const bar = this.container?.querySelector('#hud-hotbar');
    if (!bar) return;
    bar.innerHTML = '';

    this.currentHotbar.forEach((item, idx) => {
      const slot = document.createElement('div');
      slot.className = `hotbar-slot ${idx === this.selectedHotbarIndex ? 'selected' : ''}`;
      slot.innerHTML = `
        <span class="slot-icon">${item.icon}</span>
        ${item.count !== null ? `<span class="slot-badge">${item.count}</span>` : ''}
      `;
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectSlot(idx);
      });
      bar.appendChild(slot);
    });
  }

  renderMissions() {
    const listEl = this.container?.querySelector('#hud-missions-list');
    if (!listEl) return;

    const quests = window.QuestSystem ? window.QuestSystem.getActiveQuests() : [];

    if (quests.length === 0) {
      listEl.innerHTML = `<div style="font-size:11px; text-align:center; color:#6a3e1b; padding:4px;">لا توجد مهام</div>`;
      return;
    }

    listEl.innerHTML = quests.map(q => {
      const pct = Math.min(100, Math.round(((q.progress || 0) / (q.target || 1)) * 100));
      const canClaim = q.completed && !q.claimed;

      return `
        <div class="mission-card ${q.completed ? 'completed' : ''}" style="background:rgba(255,255,255,0.85); border:1.5px solid #a3703c; border-radius:10px; padding:6px; margin-bottom:6px; font-size:11px;">
          <div class="mission-top" style="display:flex; justify-content:space-between; font-weight:800; color:#4a280c; margin-bottom:3px;">
            <span>${q.title}</span>
            <span style="direction:ltr;">${q.progress || 0}/${q.target}</span>
          </div>
          <div class="mission-progress-bar" style="width:100%; height:5px; background:rgba(70,35,15,0.2); border-radius:999px; overflow:hidden;">
            <div class="mission-progress-fill" style="height:100%; background:#5db836; width: ${pct}%"></div>
          </div>
          ${canClaim ? `<button type="button" class="mission-claim-btn" data-quest-id="${q.id}" style="margin-top:4px; width:100%; background:#46961a; color:#fff; border:none; border-radius:6px; padding:2px; font-size:10px; font-weight:900; cursor:pointer;">استلام المكافأة</button>` : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.mission-claim-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qId = btn.dataset.questId;
        if (window.QuestSystem) {
          window.QuestSystem.claimReward(qId);
          this.renderMissions();
        }
      });
    });
  }

  selectSlot(index) {
    this.selectedHotbarIndex = index;
    const slots = this.container?.querySelectorAll('.hotbar-slot') || [];
    slots.forEach((s, idx) => s.classList.toggle('selected', idx === index));
    const activeItem = this.currentHotbar[index];
    if (this.eventBus) {
      this.eventBus.emit('hotbar:selected', activeItem);
    }
  }

  getSelectedItem() {
    return this.currentHotbar[this.selectedHotbarIndex] || this.currentHotbar[0];
  }

  consumeSelectedItemCount() {
    const item = this.getSelectedItem();
    if (item && item.count !== null && item.count > 0) {
      item.count -= 1;
      this.renderHotbar();
      return true;
    }
    return false;
  }

  /* ==========================================================
     🕐 الساعة (P2) — تُكتب من TimeManager عبر main.js
     ========================================================== */
  updateClock(label, icon = '☀️', day = 1, season = 'spring') {
    const clockEl = this.container?.querySelector('#hud-time');
    const seasonEl = this.container?.querySelector('#hud-season');
    if (clockEl && label) clockEl.textContent = `${icon} ${label}`;

    const SEASONS_AR = { spring: 'الربيع', summer: 'الصيف', autumn: 'الخريف', winter: 'الشتاء' };
    if (seasonEl) seasonEl.textContent = `${SEASONS_AR[season] || season} - يوم ${day}`;
  }

  /** قراءة الساعة من الوقت الحالي للحالة (بدون import لـ TimeManager). */
  pullClock() {
    const cycle = this.getState('time.dayCycle', 0) || 0;
    const totalMinutes = Math.floor(cycle * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const suffix = hours < 12 ? 'ص' : 'م';
    const h12 = ((hours + 11) % 12) + 1;
    const icon = hours >= 5 && hours < 8 ? '🌅' : hours >= 8 && hours < 17 ? '☀️' : hours >= 17 && hours < 20 ? '🌇' : '🌙';
    this.updateClock(
      `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`,
      icon,
      this.getState('time.day', 1) || 1,
      this.getState('time.season', 'spring')
    );
  }

  /* ==========================================================
     🌱 بذور الـ Hotbar تتبع المخزن الحقيقي
     ========================================================== */
  syncSeedCounts() {
    let changed = false;
    for (const item of this.currentHotbar) {
      if (item.type !== 'seed') continue;
      const count = InventorySystem.count(item.id);
      if (item.count !== count) {
        item.count = count;
        changed = true;
      }
    }
    if (changed) this.renderHotbar();
    else this.updateCapacityPill();
  }

  refreshHotbarCounts() {
    this.syncSeedCounts();
  }

  /**main.js يستدعيها بعد الزراعة — العداد البصري فقط (المخزن هو المرجع). */
  consumeHotbarSeed(cropType) {
    const item = this.currentHotbar.find(h => h.cropType === cropType);
    if (item && item.count !== null) {
      item.count = Math.max(0, InventorySystem.count(item.id));
      this.renderHotbar();
    }
  }

  /* ==========================================================
     🎒 الحقيبة — عرض وبيع
     ========================================================== */
  toggleBag(force) {
    const sheet = this.container?.querySelector('#hud-bag-sheet');
    if (!sheet) return;
    this.bagOpen = typeof force === 'boolean' ? force : !this.bagOpen;
    sheet.classList.toggle('is-open', this.bagOpen);
    sheet.setAttribute('aria-hidden', this.bagOpen ? 'false' : 'true');
    if (this.bagOpen) this.renderBag();
  }

  updateCapacityPill() {
    const el = this.container?.querySelector('#hud-bag-capacity');
    if (!el) return;
    const inv = this.getState('inventory', {}) || {};
    const max = inv.maxCapacity ?? inv.capacity ?? 50;
    const used = Object.values(inv.items || {}).reduce((sum, it) => sum + (it?.count || 0), 0);
    el.textContent = `${used} / ${max}`;
  }

  renderBag() {
    const list = this.container?.querySelector('#hud-bag-list');
    if (!list) return;
    this.updateCapacityPill();

    const rows = InventorySystem.list();
    if (rows.length === 0) {
      list.innerHTML = `<div class="hud-bag-empty">المخزن فارغ — احصد محصولًا 🌾</div>`;
      return;
    }

    list.innerHTML = rows.map(r => `
      <div class="hud-bag-row" data-item="${r.id}">
        <span class="hud-bag-icon">${r.icon}</span>
        <span class="hud-bag-name">${r.name}</span>
        <span class="hud-bag-count">×${r.count}</span>
        <span class="hud-bag-price">${r.sellPrice} 💰</span>
        <button type="button" class="hud-bag-sell" data-sell="${r.id}">بيع</button>
        <button type="button" class="hud-bag-sell all" data-sell-all="${r.id}">الكل</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-sell]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sellItem(btn.dataset.sell, 1);
      });
    });
    list.querySelectorAll('[data-sell-all]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sellItem(btn.dataset.sellAll, null);
      });
    });
  }

  sellItem(itemId, amount) {
    const res = amount === null
      ? InventorySystem.sellAll(itemId)
      : InventorySystem.sell(itemId, amount);

    if (!res.success) {
      this._emit('toast:error', res.error || 'تعذّر البيع');
      return;
    }
    this._emit('toast:success', `💰 بعت ${res.amount} × ${res.name} مقابل ${res.coins}`);
    this._emit('item:sold', { itemId, amount: res.amount, coins: res.coins });
    this.renderBag();
    this.syncSeedCounts();
  }

  sellAllCrops() {
    let coins = 0;
    let units = 0;
    for (const row of InventorySystem.list()) {
      if (row.category !== 'crop') continue;
      const res = InventorySystem.sellAll(row.id);
      if (res.success) {
        coins += res.coins;
        units += res.amount;
      }
    }
    if (units === 0) {
      this._emit('toast:error', 'لا توجد محاصيل للبيع');
      return;
    }
    this._emit('toast:success', `💰 بعت ${units} محصول مقابل ${coins} عملة`);
    this.renderBag();
    this.syncSeedCounts();
  }

  _emit(name, payload) {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(name, payload);
    }
  }

  setupJoystick() {
    const zone = this.container?.querySelector('#hud-joystick-zone');
    const thumb = this.container?.querySelector('#hud-joystick-thumb');
    const base = this.container?.querySelector('#hud-joystick-base');
    if (!zone || !thumb || !base) return;

    const onStart = (clientX, clientY, identifier) => {
      this.joystickActive = true;
      this.joystickTouchId = identifier;
      const rect = base.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      onMove(clientX, clientY);
    };

    const onMove = (clientX, clientY) => {
      if (!this.joystickActive) return;
      const dx = clientX - this.joystickCenter.x;
      const dy = clientY - this.joystickCenter.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const clampedDist = Math.min(distance, this.maxJoystickRadius);
      const thumbX = Math.cos(angle) * clampedDist;
      const thumbY = Math.sin(angle) * clampedDist;

      thumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;
      if (typeof this.callbacks.onMove === 'function') {
        this.callbacks.onMove({
          x: thumbX / this.maxJoystickRadius,
          y: -(thumbY / this.maxJoystickRadius)
        });
      }
    };

    const onEnd = () => {
      if (!this.joystickActive) return;
      this.joystickActive = false;
      this.joystickTouchId = null;
      thumb.style.transform = 'translate(-50%, -50%)';
      if (typeof this.callbacks.onMove === 'function') {
        this.callbacks.onMove({ x: 0, y: 0 });
      }
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      zone.setPointerCapture?.(e.pointerId);
      onStart(e.clientX, e.clientY, e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.joystickActive) return;
      onMove(e.clientX, e.clientY);
    });
    const stop = () => onEnd();
    zone.addEventListener('pointerup', stop);
    zone.addEventListener('pointercancel', stop);
  }
}

export default HUD;
