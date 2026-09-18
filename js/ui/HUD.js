/**
 * ============================================================
 * MY FARM 3D - DEDICATED MOBILE HUD CONTROLLER
 * ============================================================
 * الطبقة المرئية فقط: تقرأ GameState وتكتب الأفعال عبر الأنظمة
 * (InventorySystem للبذور/البيع). لا THREE ولا منطق مزرعة هنا.
 *
 * تخطيط مطابق للموك:
 *   أعلى اليسار  : نجمة المستوى + شريط الخبرة + «المستوى»
 *   أعلى الوسط   : الكوينز (+) والجواهر (+)
 *   أعلى اليمين  : شمس/قمر + ساعة + موسم + رقم اليوم
 *   اليسار       : لوحة المهام الخشبية (ازرع / اسقِ / اجمع حليب)
 *   اليمين       : قائمة / حقيبة / متجر / خريطة (أزرار خشبية مربعة)
 *   الأسفل       : شريط الأدوات الخشبي + عدّادات البذور
 *   أسفل اليسار  : عصا التحكم (فيزيائيًا — لا يعكسها dir=rtl)
 *   أسفل اليمين  : تفاعل + قفز
 *
 * الأزرار الجانبية تُصدر `hud:panel` على ناقل الأحداث؛ اللوحات نفسها
 * في js/ui/UI.js (متجر/مخزن/طلبات/سوق/خريطة/قائمة).
 * ============================================================
 */
import { InventorySystem } from '../systems/InventorySystem.js';

const SEASONS_AR = {
  spring: 'الربيع',
  summer: 'الصيف',
  autumn: 'الخريف',
  winter: 'الشتاء'
};

/** ترتيب شريط الأدوات كما في الموك: أدوات ← بذور ← حقيبة. */
const HOTBAR_LAYOUT = [
  { id: 'axe',           name: 'فأس',          icon: '🪓', type: 'tool' },
  { id: 'watering_can',  name: 'إبريق الري',   icon: '💧', type: 'tool' },
  { id: 'hoe',           name: 'مِحراث',       icon: '⛏️', type: 'tool' },
  { id: 'pickaxe',       name: 'معول',         icon: '⚒️', type: 'tool' },
  { id: 'wheat_seed',    name: 'بذور القمح',   icon: '🌾', type: 'seed', cropType: 'wheat',  count: 0 },
  { id: 'corn_seed',     name: 'بذور الذرة',   icon: '🌽', type: 'seed', cropType: 'corn',   count: 0 },
  { id: 'carrot_seed',   name: 'بذور الجزر',   icon: '🥕', type: 'seed', cropType: 'carrot', count: 0 },
  { id: 'tomato_seed',   name: 'بذور الطماطم', icon: '🍅', type: 'seed', cropType: 'tomato', count: 0 },
  { id: 'bag',           name: 'المخزن',       icon: '🎒', type: 'panel', panel: 'bag' }
];

export class HUD {
  constructor({ gameState, eventBus, callbacks = {}, enableJoystick = true } = {}) {
    this.gameState = gameState;
    this.eventBus = eventBus;
    this.callbacks = callbacks;
    this.enableJoystick = enableJoystick;
    this.container = null;
    this.selectedHotbarIndex = 0;

    this.currentHotbar = HOTBAR_LAYOUT.map(item => ({ ...item }));

    this.joystickActive = false;
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.maxJoystickRadius = 38;
    this.missionsOpen = false;
  }

  getState(path, fallback = null) {
    if (this.gameState && typeof this.gameState.get === 'function') {
      const val = this.gameState.get(path);
      return val !== undefined && val !== null ? val : fallback;
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
      <!-- ======================= TOP BAR ======================= -->
      <header class="hud-top-bar">
        <!-- المستوى + الخبرة (يسار) -->
        <div class="hud-level-card">
          <div class="hud-level-badge">
            <span class="hud-level-star" aria-hidden="true">★</span>
            <span id="mf-level-num">1</span>
          </div>
          <div class="hud-xp-box">
            <span class="hud-xp-label">المستوى</span>
            <div class="hud-xp-track">
              <div class="hud-xp-fill" id="mf-xp-fill"></div>
            </div>
            <span class="hud-xp-text" id="mf-xp-text">0 / 100</span>
          </div>
        </div>

        <!-- العملات (وسط) -->
        <div class="hud-currencies">
          <div class="hud-currency-item coins">
            <span class="icon" aria-hidden="true">💰</span>
            <span id="mf-coins">0</span>
            <button type="button" class="hud-plus" id="hud-btn-add-coins" aria-label="شراء عملات">+</button>
          </div>
          <div class="hud-currency-item gems">
            <span class="icon" aria-hidden="true">💎</span>
            <span id="mf-gems">0</span>
            <button type="button" class="hud-plus" id="hud-btn-add-gems" aria-label="شراء جواهر">+</button>
          </div>
        </div>

        <!-- الوقت (يمين) -->
        <div class="hud-time-pill">
          <span class="clock">
            <span class="phase" id="mf-phase" aria-hidden="true">☀️</span>
            <span id="mf-clock">08:00 ص</span>
          </span>
          <span class="season">
            <span id="mf-season">الربيع</span>
            <span class="dot" aria-hidden="true">·</span>
            <span id="mf-day">يوم 1</span>
          </span>
        </div>
      </header>

      <!-- ===================== MISSIONS (يسار) ===================== -->
      <button type="button" class="hud-missions-toggle" id="hud-missions-toggle" aria-label="المهام" aria-expanded="false">📋</button>
      <div class="hud-missions-panel is-collapsed" id="hud-missions-panel" aria-label="لوحة المهام">
        <div class="missions-header">📋 المهام</div>
        <div class="missions-list" id="hud-missions-list"></div>
      </div>

      <!-- ================== UTILITY STACK (يمين) ================== -->
      <aside class="hud-utility-stack" aria-label="أدوات المزرعة">
        <button type="button" class="hud-icon-btn" id="hud-btn-menu" aria-label="القائمة">☰</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-bag" aria-label="الحقيبة">🎒</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-shop" aria-label="المتجر">🏪</button>
        <button type="button" class="hud-icon-btn" id="hud-btn-map" aria-label="الخريطة">🗺️</button>
      </aside>

      <!-- ============ JOYSTICK (أسفل اليسار — فيزيائي) ============ -->
      ${this.enableJoystick ? `
      <div class="hud-joystick-zone" id="hud-joystick-zone">
        <div class="joystick-base" id="hud-joystick-base">
          <div class="joystick-thumb" id="hud-joystick-thumb"></div>
        </div>
      </div>
      ` : ''}

      <!-- ========== ACTIONS (أسفل اليمين — فيزيائي) ========== -->
      <div class="hud-action-stack">
        <button type="button" class="jump-button" id="hud-btn-jump" aria-label="قفز">⤴️</button>
        <button type="button" class="harvest-button" id="hud-btn-interact" aria-label="تفاعل">🤚</button>
      </div>

      <!-- ================== BOTTOM HOTBAR ================== -->
      <nav class="hud-bottom-hotbar" id="hud-hotbar" aria-label="شريط الأدوات"></nav>
    `;
    return root;
  }

  bindEvents() {
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this.eventBus.on('state:changed', (path, value) => this.onStateChanged(path, value));
      this.eventBus.on('quest:progress-updated', () => this.renderMissions());
      this.eventBus.on('quest:completed', () => this.renderMissions());
      this.eventBus.on('quest:claimed', () => this.renderMissions());
      this.eventBus.on('crop:harvested', () => this.syncSeedCounts());
      this.eventBus.on('time:hour', () => this.pullClock());
      this.eventBus.on('time:day', () => this.pullClock());
      this.eventBus.on('game:tick', () => this.pullClock());
      this.eventBus.on('inventory:changed', () => this.syncSeedCounts());
      // أي تغيير في المخزن يحدّث عدّادات البذور
      this.eventBus.on('state:changed', (path) => {
        if (path === 'inventory.items' || path === 'inventory') this.syncSeedCounts();
      });
    }

    if (this.enableJoystick) this.setupJoystick();

    this.renderHotbar();
    this.renderMissions();

    const on = (selector, handler) => {
      this.container?.querySelector(selector)?.addEventListener('click', (e) => {
        e.stopPropagation();
        handler(e);
      });
    };

    on('#hud-btn-menu', () => this.openPanel('menu'));
    on('#hud-btn-bag', () => this.openPanel('bag'));
    on('#hud-btn-shop', () => this.openPanel('shop'));
    on('#hud-btn-map', () => this.openPanel('map'));
    on('#hud-btn-add-coins', () => this.openPanel('shop', 'coins'));
    on('#hud-btn-add-gems', () => this.openPanel('shop', 'gems'));

    on('#hud-btn-interact', () => {
      if (typeof this.callbacks.onInteract === 'function') this.callbacks.onInteract();
    });
    on('#hud-btn-jump', () => {
      if (typeof this.callbacks.onJump === 'function') this.callbacks.onJump();
    });

    const missionsToggle = this.container?.querySelector('#hud-missions-toggle');
    const missionsPanel = this.container?.querySelector('#hud-missions-panel');
    missionsToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setMissionsOpen(!this.missionsOpen);
    });
    missionsPanel?.addEventListener('click', (e) => e.stopPropagation());
  }

  setMissionsOpen(open) {
    this.missionsOpen = !!open;
    const toggle = this.container?.querySelector('#hud-missions-toggle');
    const panel = this.container?.querySelector('#hud-missions-panel');
    panel?.classList.toggle('is-collapsed', !this.missionsOpen);
    toggle?.classList.toggle('is-open', this.missionsOpen);
    toggle?.setAttribute('aria-expanded', this.missionsOpen ? 'true' : 'false');
  }

  /** يفتح إحدى لوحات UI.js (متجر/مخزن/طلبات/سوق/خريطة/قائمة). */
  openPanel(name, arg) {
    if (typeof this.callbacks.onOpenPanel === 'function') {
      this.callbacks.onOpenPanel(name, arg);
      return;
    }
    this._emit('hud:panel', { name, arg });
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
    this.updateCoins(this.getState('player.coins', 0));
    this.updateGems(this.getState('player.gems', 0));
    this.updateLevel(this.getState('player.level', 1));
    this.updateXP(this.getState('player.xp', 0), this.getState('player.xpToNext', 100));
    this.renderMissions();
    this.syncSeedCounts();
    this.pullClock();
  }

  updateCoins(val) {
    const el = this.container?.querySelector('#mf-coins');
    if (el) el.textContent = Number(val ?? 0).toLocaleString('en-US');
  }

  updateGems(val) {
    const el = this.container?.querySelector('#mf-gems');
    if (el) el.textContent = Number(val ?? 0).toLocaleString('en-US');
  }

  updateLevel(val) {
    const el = this.container?.querySelector('#mf-level-num');
    if (el) el.textContent = val ?? 1;
  }

  updateXP(curr, max) {
    const fill = this.container?.querySelector('#mf-xp-fill');
    const txt = this.container?.querySelector('#mf-xp-text');
    const c = Number(curr ?? 0);
    const m = Number(max ?? 100);
    if (txt) txt.textContent = `${c} / ${m}`;
    if (fill && m > 0) {
      fill.style.width = `${Math.min(100, Math.max(0, (c / m) * 100))}%`;
    }
  }

  /* ==========================================================
     شريط الأدوات — الأدوات ثابتة والبذور تتبع المخزن
     ========================================================== */
  renderHotbar() {
    const bar = this.container?.querySelector('#hud-hotbar');
    if (!bar) return;
    bar.innerHTML = '';

    this.currentHotbar.forEach((item, idx) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = `hotbar-slot ${idx === this.selectedHotbarIndex ? 'selected' : ''}`;
      if (item.type === 'panel') slot.classList.add('is-panel');
      slot.setAttribute('aria-label', item.name);
      slot.dataset.hotbarId = item.id;

      const icon = document.createElement('span');
      icon.className = 'slot-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon;
      slot.appendChild(icon);

      if (item.count !== undefined && item.count !== null) {
        const badge = document.createElement('span');
        badge.className = 'slot-badge';
        badge.textContent = String(item.count);
        slot.appendChild(badge);
      }

      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.type === 'panel') {
          this.openPanel(item.panel || 'bag');
          return;
        }
        this.selectSlot(idx);
      });
      bar.appendChild(slot);
    });
  }

  selectSlot(index) {
    const item = this.currentHotbar[index];
    if (!item || item.type === 'panel') return;
    this.selectedHotbarIndex = index;
    const slots = this.container?.querySelectorAll('.hotbar-slot') || [];
    slots.forEach((s, idx) => s.classList.toggle('selected', idx === index));
    if (this.eventBus) this.eventBus.emit('hotbar:selected', item);
  }

  getSelectedItem() {
    const item = this.currentHotbar[this.selectedHotbarIndex];
    return item && item.type !== 'panel' ? item : this.currentHotbar[0];
  }

  /** عدد العناصر في المخزن (يظهر على خانة الحقيبة في الشريط). */
  bagTotal() {
    const inv = this.getState('inventory', {}) || {};
    return Object.values(inv.items || {}).reduce((sum, it) => sum + (it?.count || 0), 0);
  }

  /* ==========================================================
     المهام — خشبية يسار الشاشة مع شريط تقدّم
     ========================================================== */
  renderMissions() {
    const listEl = this.container?.querySelector('#hud-missions-list');
    if (!listEl) return;

    const quests = window.QuestSystem ? window.QuestSystem.getActiveQuests() : [];
    if (!quests.length) {
      listEl.innerHTML = '<div class="missions-empty">لا مهام حالياً — ازرع واسقِ واحصد 🌾</div>';
      return;
    }

    listEl.innerHTML = quests.map(q => {
      const pct = Math.min(100, Math.round(((q.progress || 0) / (q.target || 1)) * 100));
      const canClaim = q.completed && !q.claimed;

      return `
        <div class="mission-card ${q.completed ? 'completed' : ''}">
          <div class="mission-top">
            <span class="mission-title">${q.title}</span>
            <span class="mission-count">${q.progress || 0}/${q.target}</span>
          </div>
          <div class="mission-progress-bar">
            <div class="mission-progress-fill" style="width: ${pct}%"></div>
          </div>
          ${canClaim ? `<button type="button" class="mission-claim-btn" data-quest-id="${q.id}">استلام المكافأة</button>` : ''}
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

  /* ==========================================================
     🕐 الساعة — تُكتب من TimeManager عبر main.js
     ========================================================== */
  updateClock(label, icon = '☀️', day = 1, season = 'spring') {
    const clockEl = this.container?.querySelector('#mf-clock');
    const phaseEl = this.container?.querySelector('#mf-phase');
    const seasonEl = this.container?.querySelector('#mf-season');
    const dayEl = this.container?.querySelector('#mf-day');

    if (clockEl && label) clockEl.textContent = label;
    if (phaseEl) phaseEl.textContent = icon || '☀️';
    if (seasonEl) seasonEl.textContent = SEASONS_AR[season] || season;
    if (dayEl) dayEl.textContent = `يوم ${day}`;
  }

  /** قراءة الساعة من الحالة (بدون import لـ TimeManager). */
  pullClock() {
    const cycle = this.getState('time.dayCycle', 0) || 0;
    const totalMinutes = Math.floor(cycle * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const suffix = hours < 12 ? 'ص' : 'م';
    const h12 = ((hours + 11) % 12) + 1;
    const icon = hours >= 5 && hours < 8 ? '🌅'
      : hours >= 8 && hours < 17 ? '☀️'
        : hours >= 17 && hours < 20 ? '🌇'
          : '🌙';

    this.updateClock(
      `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`,
      icon,
      this.getState('time.day', 1) || 1,
      this.getState('time.season', 'spring')
    );
  }

  /* ==========================================================
     🌱 بذور الـ Hotbar تتبع المخزن الحقيقي دائمًا
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

    const bagItem = this.currentHotbar.find(h => h.id === 'bag');
    if (bagItem) {
      const total = this.bagTotal();
      if (bagItem.count !== total) {
        bagItem.count = total;
        changed = true;
      }
    }

    if (changed) this.renderHotbar();
  }

  refreshHotbarCounts() {
    this.syncSeedCounts();
  }

  /**main.js يستدعيها بعد الزراعة — العداد البصري فقط (المخزن هو المرجع). */
  consumeHotbarSeed(cropType) {
    const item = this.currentHotbar.find(h => h.cropType === cropType);
    if (item) {
      item.count = InventorySystem.count(item.id);
      this.renderHotbar();
    }
  }

  _emit(name, payload) {
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(name, payload);
    }
  }

  /* ==========================================================
     🕹️ عصا التحكم — pointer events (تعمل باللمس والفأرة)
     ========================================================== */
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
