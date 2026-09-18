/**
 * ============================================================
 * UI.js — لوحات الواجهة (شيت واحد بتبويبات)
 * ============================================================
 * 🏪 المتجر   : بذور + أراضٍ قابلة للشراء (أنظمة حقيقية)
 * 🎒 المخزن   : عرض + بيع (InventorySystem)
 * 📦 الطلبات  : قبول/تسليم/رفض (OrderSystem + Components.orderCard)
 * 🛒 السوق    : عرض/شراء/إلغاء (MarketSystem + Components.marketListing)
 * 🗺️ الخريطة : مواضع الحقول والمباني والحيوانات
 * ☰ القائمة  : إعدادات + حفظ فوري + إحصاءات
 *
 * لا THREE هنا ولا منطق مزرعة — قراءة GameState وكتابة عبر الأنظمة.
 * كل فشل يُعرض كـ Toast عربي (انظر AR_ERRORS).
 * ============================================================
 */
import { Components } from './Components.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { MarketSystem } from '../systems/MarketSystem.js';
import { OrderSystem } from '../systems/OrderSystem.js';
import { LandSystem, LAND_CONFIG } from '../systems/LandSystem.js';
import { BuildingSystem } from '../systems/BuildingSystem.js';
import { SaveManager } from '../core/SaveManager.js';
import { GameState } from '../core/GameState.js';
import { CROPS, ITEMS, ECONOMY } from '../data/GameData.js';
import { formatNumber } from '../utils/Utils.js';

/** الأنظمة ترجّع أخطاء إنجليزية في بعض المسارات — نترجمها للعرض فقط. */
const AR_ERRORS = {
    'Not enough coins': 'لا تملك عملات كافية 💰',
    'Not enough items': 'لا تملك الكمية المطلوبة في المخزن',
    'Max listings reached': `وصلت للحد الأقصى من العروض (${ECONOMY.maxMarketListings})`,
    'Invalid item': 'عنصر غير معروف',
    'Invalid amount/price': 'الكمية أو السعر غير صالح',
    'Listing not found': 'العرض غير موجود',
    'Listing expired': 'انتهت مدة العرض',
    'Inventory full': 'المخزن ممتلئ!',
    'Tile not found': 'الموقع غير موجود',
    'Tile occupied': 'الموقع مشغول',
    'Tile locked': 'هذه الأرض مقفلة'
};

const PANELS = {
    shop: { title: '🏪 المتجر', tabs: ['seeds', 'land', 'buildings', 'orders', 'market'] },
    bag: { title: '🎒 المخزن ومستودعات المزرعة', tabs: ['silo', 'barn', 'bag'] },
    map: { title: '🗺️ خريطة المزرعة', tabs: ['map'] },
    menu: { title: '☰ القائمة', tabs: ['menu'] }
};

const TAB_LABELS = {
    seeds: 'البذور',
    land: 'الأراضي',
    orders: 'الطلبات',
    market: 'السوق',
    buildings: 'المباني',
    silo: '🌾 الصومعة',
    barn: '🛖 الحظيرة',
    bag: 'الكل',
    map: 'الخريطة',
    menu: 'الإعدادات'
};

/**
 * سعر شراء البذرة مشتق من سعر بيع المحصول (40%) حتى لا نخترع
 * أرقامًا ثابتة خارج GameData: القمح 25 ← البذرة 10.
 */
function seedPrice(crop) {
    return Math.max(1, Math.round((crop.sellPrice || 10) * 0.4));
}

function arError(err, fallback = 'تعذّر تنفيذ الطلب') {
    if (!err) return fallback;
    return AR_ERRORS[err] || err;
}

export class GameUI {
    /**
     * @param {object} deps
     * @param {object} deps.eventBus  ناقل الأحداث (Events)
     * @param {object} deps.toast     Toast لعرض النتائج بالعربية
     * @param {Function} [deps.getPlayerPos] () => {x,z} لعلامة اللاعب على الخريطة
     */
    constructor({ eventBus = null, toast = null, getPlayerPos = null } = {}) {
        this.events = eventBus;
        this.toast = toast;
        this.getPlayerPos = getPlayerPos;

        this.sheet = null;
        this.openPanel = null;
        this.openTab = null;
        this._unsubscribers = [];
        this._refreshTimer = 0;
    }

    /* ==========================================================
       البناء / التركيب
       ========================================================== */
    mount(parent = null) {
        if (this.sheet) return this;

        const host =
            parent ||
            document.getElementById('game-hud-overlay') ||
            document.body;

        const sheet = document.createElement('section');
        sheet.className = 'hud-sheet';
        sheet.id = 'hud-panel-sheet';
        sheet.setAttribute('aria-hidden', 'true');
        sheet.innerHTML = `
            <header class="hud-sheet-head">
                <span class="hud-sheet-title" id="hud-panel-title">🏪 المتجر</span>
                <span class="hud-sheet-sub" id="hud-panel-sub"></span>
                <button type="button" class="hud-sheet-close" id="hud-panel-close" aria-label="إغلاق">✕</button>
            </header>
            <div class="hud-sheet-tabs" id="hud-panel-tabs"></div>
            <div class="hud-sheet-body" id="hud-panel-body"></div>
            <footer class="hud-sheet-foot" id="hud-panel-foot"></footer>
        `;

        host.appendChild(sheet);
        this.sheet = sheet;

        sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
        sheet.addEventListener('touchstart', (e) => e.stopPropagation());
        sheet.querySelector('#hud-panel-close').addEventListener('click', () => this.close());

        this._bindStateRefresh();
        return this;
    }

    /** أي تغيير مهم في الحالة ونحن مفتوحون → إعادة رسم التبويب الحالي. */
    _bindStateRefresh() {
        if (!this.events || typeof this.events.on !== 'function') return;

        const rerender = () => {
            if (this.isOpen()) this.render();
        };

        const names = [
            'state:changed',
            'crop:harvested',
            'crop:planted',
            'orders:refreshed',
            'order:accepted',
            'order:completed',
            'order:expired',
            'market:listed',
            'market:sold',
            'market:cancelled',
            'land:purchased',
            'land:prepared'
        ];

        names.forEach((name) => this.events.on(name, rerender));

        // الطلبات/السوق فيها مؤقّتات — تحديث دوري خفيف أثناء الفتح
        this._refreshTimer = setInterval(() => {
            if (this.isOpen() && (this.openTab === 'orders' || this.openTab === 'market')) {
                this.render();
            }
        }, 15000);
    }

    /* ==========================================================
       الفتح / الإغلاق
       ========================================================== */
    isOpen() {
        return !!this.sheet && this.sheet.classList.contains('is-open');
    }

    open(panel = 'shop', tab = null) {
        if (!this.sheet) this.mount();
        if (!PANELS[panel]) panel = 'shop';

        const same = this.openPanel === panel && this.isOpen();
        this.openPanel = panel;
        this.openTab = tab && PANELS[panel].tabs.includes(tab) ? tab : PANELS[panel].tabs[0];

        this.sheet.classList.add('is-open');
        this.sheet.setAttribute('aria-hidden', 'false');
        this.render();

        if (!same) this.events?.emit?.('hud:panel-opened', { panel, tab: this.openTab });
    }

    close() {
        if (!this.sheet) return;
        this.sheet.classList.remove('is-open');
        this.sheet.setAttribute('aria-hidden', 'true');
        this.openPanel = null;
        this.events?.emit?.('hud:panel-closed');
    }

    toggle(panel, tab) {
        if (this.isOpen() && this.openPanel === panel && (!tab || this.openTab === tab)) {
            this.close();
        } else {
            this.open(panel, tab);
        }
    }

    /* ==========================================================
       الرسم
       ========================================================== */
    render() {
        if (!this.sheet || !this.openPanel) return;

        const panel = PANELS[this.openPanel];
        this.sheet.querySelector('#hud-panel-title').textContent = panel.title;
        this.sheet.querySelector('#hud-panel-sub').textContent = this._subtitle();

        this._renderTabs(panel.tabs);
        this._renderBody();
        this._renderFoot();
    }

    _subtitle() {
        const coins = GameState.get('player.coins') || 0;
        const gems = GameState.get('player.gems') || 0;
        return `💰 ${formatNumber(coins)}   💎 ${formatNumber(gems)}`;
    }

    _renderTabs(tabs) {
        const bar = this.sheet.querySelector('#hud-panel-tabs');
        bar.innerHTML = '';
        if (tabs.length <= 1) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = 'flex';

        tabs.forEach((tab) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `hud-tab ${tab === this.openTab ? 'is-active' : ''}`;
            btn.textContent = TAB_LABELS[tab] || tab;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openTab = tab;
                this.render();
            });
            bar.appendChild(btn);
        });
    }

    _renderBody() {
        const body = this.sheet.querySelector('#hud-panel-body');
        body.innerHTML = '';

        switch (this.openTab) {
            case 'seeds': return this._renderSeeds(body);
            case 'land': return this._renderLand(body);
            case 'buildings': return this._renderBuildings(body);
            case 'orders': return this._renderOrders(body);
            case 'market': return this._renderMarket(body);
            case 'silo': return this._renderStorageSilo(body);
            case 'barn': return this._renderStorageBarn(body);
            case 'bag': return this._renderBag(body);
            case 'map': return this._renderMap(body);
            case 'menu': return this._renderMenu(body);
            default: return this._renderSeeds(body);
        }
    }

    _renderFoot() {
        const foot = this.sheet.querySelector('#hud-panel-foot');
        foot.innerHTML = '';

        if (this.openTab === 'bag') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hud-sheet-wide';
            btn.textContent = 'بيع كل المحاصيل 💰';
            btn.addEventListener('click', () => this.sellAllCrops());
            foot.appendChild(btn);
            return;
        }

        if (this.openTab === 'market') {
            const stats = MarketSystem.getStats();
            const note = document.createElement('div');
            note.className = 'hud-menu-note';
            note.textContent =
                `عروضك ${stats.myListings} / ${stats.maxListings} — عمولة السوق ${Math.round(ECONOMY.marketFee * 100)}%`;
            foot.appendChild(note);
        }
    }

    /* ------------------------------ البذور ------------------------------ */
    _renderSeeds(body) {
        const coins = GameState.get('player.coins') || 0;

        Object.values(CROPS).forEach((crop) => {
            const seed = ITEMS[crop.seedId] || {};
            const price = seedPrice(crop);
            const owned = InventorySystem.count(crop.seedId);
            const affordable = coins >= price;

            const card = document.createElement('div');
            card.className = `shop-item ${affordable ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="shop-icon">${crop.icon || seed.icon || '🌱'}</div>
                <div>
                    <div class="shop-name">${seed.name || `بذور ${crop.name}`}</div>
                    <div class="shop-desc">
                        تنمو في ${crop.growTime} ثانية · تُباع بـ 🪙 ${crop.sellPrice}
                        · لديك ${owned}
                    </div>
                    <div class="shop-cost"><span class="coin-cost">🪙 ${price}</span></div>
                </div>
                <div class="order-actions"></div>
            `;

            const actions = card.querySelector('.order-actions');
            actions.appendChild(this._button('شراء', () => this.buySeed(crop, 1), !affordable));
            actions.appendChild(
                this._button(`×5 (${formatNumber(price * 5)})`, () => this.buySeed(crop, 5), coins < price * 5)
            );

            body.appendChild(card);
        });
    }

    buySeed(crop, amount) {
        const price = seedPrice(crop) * amount;
        const coins = GameState.get('player.coins') || 0;
        const seed = ITEMS[crop.seedId] || {};

        if (coins < price) {
            this._error(`لا تملك عملات كافية — تحتاج 🪙 ${formatNumber(price)}`);
            return;
        }

        const free = InventorySystem.freeSpace();
        if (free < amount) {
            this._error(free <= 0 ? 'المخزن ممتلئ! بِع بعض المحاصيل أولًا' : `المخزن يتسع لـ ${free} فقط`);
            return;
        }

        GameState.set('player.coins', coins - price);
        const added = InventorySystem.add(crop.seedId, amount);

        if (!added.success) {
            // نُرجع العملات لأن الإضافة فشلت (لا نفقد مال اللاعب)
            GameState.set('player.coins', (GameState.get('player.coins') || 0) + price);
            this._error(arError(added.error, 'تعذّر شراء البذور'));
            return;
        }

        this._success(`🌱 اشتريت ${added.added} × ${seed.name || crop.name} مقابل 🪙 ${formatNumber(price)}`);
        this.events?.emit?.('shop:purchased', { itemId: crop.seedId, amount: added.added, coins: price });
        this.render();
    }

    /* ------------------------------ الأراضي ------------------------------ */
    _renderLand(body) {
        const fields = LandSystem.getAllFields() || [];
        const locked = fields.filter((f) => !f.purchased);
        const unprepared = fields.filter((f) => f.purchased && !f.prepared);
        const coins = GameState.get('player.coins') || 0;

        if (locked.length === 0 && unprepared.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">كل الأراضي مفتوحة ومجهّزة 🎉</div>';
            return;
        }

        locked.forEach((field) => {
            const price = field.price || LAND_CONFIG.fieldPrice;
            const card = document.createElement('div');
            card.className = `shop-item ${coins >= price ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="shop-icon">🌾</div>
                <div>
                    <div class="shop-name">${this._fieldName(field)}</div>
                    <div class="shop-desc">بعد الشراء جهّزها بـ 4 ضربات فأس 🪓</div>
                    <div class="shop-cost"><span class="coin-cost">🪙 ${formatNumber(price)}</span></div>
                </div>
                <div class="order-actions"></div>
            `;
            card.querySelector('.order-actions').appendChild(
                this._button('شراء', () => this.buyLand(field.id), coins < price)
            );
            body.appendChild(card);
        });

        unprepared.forEach((field) => {
            const card = document.createElement('div');
            card.className = 'shop-item';
            card.innerHTML = `
                <div class="shop-icon">🪓</div>
                <div>
                    <div class="shop-name">${this._fieldName(field)}</div>
                    <div class="shop-desc">مشتراة — تحتاج تجهيزًا بالفأس (${field.prepProgress || 0}%)</div>
                </div>
            `;
            body.appendChild(card);
        });
    }

    _fieldName(field) {
        return field.name || `أرض ${field.id.replace(/_/g, ' ')}`;
    }

    buyLand(fieldId) {
        const res = LandSystem.purchaseField(fieldId);
        if (!res.success) {
            const msg = res.reason === 'insufficient-funds'
                ? `تحتاج 🪙 ${formatNumber(res.required || LAND_CONFIG.fieldPrice)} لشراء هذه الأرض`
                : (res.reason === 'already-purchased' ? 'هذه الأرض مفتوحة بالفعل' : 'تعذّر شراء الأرض');
            this._error(msg);
            return;
        }
        this._success(`🌾 اشتريت الأرض مقابل 🪙 ${formatNumber(res.cost || LAND_CONFIG.fieldPrice)} — جهّزها بالفأس`);
        this.render();
    }

    /* ------------------------------ المباني ------------------------------ */
    /**
     * مباني الإنتاج المملوكة — قراءة من BuildingSystem (لا شراء وهمي:
     * الطاحونة والمخبز يأتيان مع المزرعة، وأي مبنى آخر لا نموذج له بعد).
     */
    _renderBuildings(body) {
        const buildings = BuildingSystem.getBuildings() || [];

        if (buildings.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">لا مباني إنتاج بعد</div>';
            return;
        }

        buildings.forEach((b) => {
            const card = document.createElement('div');
            card.className = 'shop-item';
            card.innerHTML = `
                <div class="shop-icon">${b.icon || '🏭'}</div>
                <div>
                    <div class="shop-name">${b.name || b.typeId} · مستوى ${b.level || 1}</div>
                    <div class="shop-desc">
                        قائمة الإنتاج: ${(b.productionQueue || []).length} / ${b.queueLimit || 3}
                    </div>
                </div>
            `;
            body.appendChild(card);
        });

        const hint = document.createElement('div');
        hint.className = 'hud-menu-note';
        hint.textContent = 'افتح المبنى من العالم لبدء الإنتاج: قمح ← دقيق ← خبز 🍞';
        body.appendChild(hint);
    }

    /* ------------------------------ الطلبات ------------------------------ */
    _renderOrders(body) {
        const orders = OrderSystem.getOrders() || [];
        if (orders.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">لا توجد طلبات الآن — ستصل طلبات جديدة قريبًا 📦</div>';
            return;
        }

        orders.forEach((order) => {
            const wrap = document.createElement('div');
            wrap.innerHTML = Components.orderCard(order);
            const card = wrap.firstElementChild;
            if (!card) return;

            card.querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._orderAction(order.id, btn.dataset.action);
                });
            });

            body.appendChild(card);
        });
    }

    _orderAction(orderId, action) {
        const res =
            action === 'accept' ? OrderSystem.accept(orderId)
                : action === 'reject' ? OrderSystem.reject(orderId)
                    : action === 'complete' ? OrderSystem.complete(orderId)
                        : { success: false, error: 'إجراء غير معروف' };

        if (!res.success) {
            this._error(arError(res.error, 'تعذّر تنفيذ الطلب'));
            return;
        }

        if (action === 'complete') {
            const rewards = res.rewards || {};
            this._success(`📦 تم تسليم الطلب — +🪙 ${formatNumber(rewards.coins || 0)} +⭐ ${formatNumber(rewards.xp || 0)}`);
        } else if (action === 'accept') {
            this._success('✅ تم قبول الطلب — جهّز المحاصيل المطلوبة');
        } else {
            this._success('🗑️ تم رفض الطلب');
        }
        this.render();
    }

    /* ------------------------------ السوق ------------------------------ */
    _renderMarket(body) {
        // 1) اعرض محصولًا للبيع
        const rows = InventorySystem.list().filter((r) => r.category !== 'seed');
        if (rows.length > 0) {
            const title = document.createElement('div');
            title.className = 'hud-menu-note';
            title.textContent = 'اعرض من مخزنك للبيع:';
            body.appendChild(title);

            rows.forEach((row) => {
                const line = document.createElement('div');
                line.className = 'hud-market-sell';
                line.innerHTML = `
                    <span>${row.icon} ${row.name} <small>(×${row.count})</small></span>
                `;

                const qty = document.createElement('input');
                qty.type = 'number';
                qty.min = '1';
                qty.max = String(row.count);
                qty.value = '1';
                qty.setAttribute('aria-label', `الكمية من ${row.name}`);

                const price = document.createElement('input');
                price.type = 'number';
                price.min = '1';
                price.value = String(Math.max(1, Math.round(row.sellPrice * 1.15)));
                price.setAttribute('aria-label', `سعر الوحدة من ${row.name}`);

                const btn = this._button('اعرض', () => {
                    this.listItem(row, Number(qty.value), Number(price.value));
                });

                line.appendChild(qty);
                line.appendChild(price);
                line.appendChild(btn);
                body.appendChild(line);
            });
        }

        // 2) عروضي
        const mine = MarketSystem.getMyListings() || [];
        if (mine.length) {
            const t1 = document.createElement('div');
            t1.className = 'hud-menu-note';
            t1.textContent = 'عروضك الحالية:';
            body.appendChild(t1);

            mine.forEach((listing) => {
                const wrap = document.createElement('div');
                wrap.innerHTML = Components.marketListing(listing);
                const card = wrap.firstElementChild;
                if (!card) return;
                const buy = card.querySelector('.m-buy');
                if (buy) {
                    buy.textContent = 'إلغاء';
                    buy.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.cancelListing(listing.id);
                    });
                }
                body.appendChild(card);
            });
        }

        // 3) سوق اللاعبين الآخرين (AI)
        const theirs = (MarketSystem.getListings() || []).filter((l) => l.sellerId !== 'player');
        const t2 = document.createElement('div');
        t2.className = 'hud-menu-note';
        t2.textContent = theirs.length ? 'معروض في السوق:' : 'لا معروضات في السوق الآن — عُد بعد قليل';
        body.appendChild(t2);

        theirs.forEach((listing) => {
            const wrap = document.createElement('div');
            wrap.innerHTML = Components.marketListing(listing);
            const card = wrap.firstElementChild;
            if (!card) return;
            const coins = GameState.get('player.coins') || 0;
            const fee = Math.floor((listing.totalPrice || 0) * ECONOMY.marketFee);
            const buy = card.querySelector('.m-buy');
            if (buy) {
                buy.disabled = coins < (listing.totalPrice || 0) + fee;
                buy.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.buyListing(listing.id);
                });
            }
            body.appendChild(card);
        });
    }

    listItem(row, amount, pricePerUnit) {
        const res = MarketSystem.listItem(row.id, amount, pricePerUnit);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر عرض المنتج'));
            return;
        }
        this._success(`🛒 عرضت ${amount} × ${row.name} في السوق`);
        this.render();
    }

    cancelListing(listingId) {
        const res = MarketSystem.cancelListing(listingId);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر إلغاء العرض'));
            return;
        }
        this._success('↩️ عاد المنتج إلى مخزنك');
        this.render();
    }

    buyListing(listingId) {
        const res = MarketSystem.buyFromMarket(listingId);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر الشراء من السوق'));
            return;
        }
        this._success('🛍️ تم الشراء من السوق');
        this.render();
    }

    /* ------------------------------ صومعة الغلال (Silo) ------------------------------ */
    _renderStorageSilo(body) {
        const stats = InventorySystem.getStorageStats().silo;
        const header = document.createElement('div');
        header.className = 'hud-storage-header-card';
        header.innerHTML = `
            <div class="storage-card-info">
                <h3>🌾 صومعة الغلال (المستوى ${stats.level})</h3>
                <p>مخصصة للمحاصيل الخام فقط (قمح، ذرة، جزر، طماطم). امتلاء الصومعة يمنع الحصاد.</p>
                <div class="storage-bar-track">
                    <div class="storage-bar-fill" style="width: ${Math.min(100, Math.round((stats.count / stats.capacity) * 100))}%;"></div>
                </div>
                <div class="storage-count-badge">${stats.count} / ${stats.capacity} وحدة (${stats.free} شاغر)</div>
            </div>
            <div class="storage-upgrade-box">
                <div class="upgrade-title">🛠️ ترقية الصومعة (+25 سعة)</div>
                <div class="upgrade-reqs">
                    <span>🔩 مسامير: ${InventorySystem.count('nail')}/${stats.req.nail}</span>
                    <span>🪵 ألواح خشب: ${InventorySystem.count('wood_plank')}/${stats.req.wood_plank}</span>
                </div>
                <button type="button" class="btn-upgrade-storage" id="btn-upgrade-silo">ترقية الصومعة</button>
            </div>
        `;
        header.querySelector('#btn-upgrade-silo').addEventListener('click', () => {
            const res = InventorySystem.upgradeSilo();
            if (!res.success) {
                this._error(res.error || 'تعذّرت الترقية');
                return;
            }
            this._success(`✨ تم ترقية صومعة الغلال إلى المستوى ${res.newLevel} (السعة: ${res.newCapacity})`);
            this.render();
        });
        body.appendChild(header);

        // List silo crops only
        const rows = InventorySystem.list('silo');
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'hud-sheet-empty';
            empty.textContent = 'الصومعة فارغة — احصد بعض المحاصيل من الحقول 🌾';
            body.appendChild(empty);
            return;
        }

        rows.forEach((row) => {
            const line = document.createElement('div');
            line.className = 'hud-bag-row';
            line.innerHTML = `
                <span class="hud-bag-icon">${row.icon}</span>
                <span class="hud-bag-name">${row.name} <small>(${row.qualityLabel})</small></span>
                <span class="hud-bag-count">×${row.count}</span>
                <span class="hud-bag-price">🪙 ${formatNumber(row.sellPrice)}</span>
            `;

            const sellOne = this._button('بيع', () => this.sellItem(row.id, 1));
            const sellAll = this._button('الكل', () => this.sellItem(row.id, null));
            sellAll.classList.add('all');

            line.appendChild(sellOne);
            line.appendChild(sellAll);
            body.appendChild(line);
        });
    }

    /* ------------------------------ حظيرة المخزن (Barn) ------------------------------ */
    _renderStorageBarn(body) {
        const stats = InventorySystem.getStorageStats().barn;
        const header = document.createElement('div');
        header.className = 'hud-storage-header-card';
        header.innerHTML = `
            <div class="storage-card-info">
                <h3>🛖 حظيرة المخزن الرئيسي (المستوى ${stats.level})</h3>
                <p>مخصصة لمنتجات الحيوانات، السلع المصنعة، الألبان، الأعلاف، الأدوات ومواد الترقية.</p>
                <div class="storage-bar-track">
                    <div class="storage-bar-fill barn" style="width: ${Math.min(100, Math.round((stats.count / stats.capacity) * 100))}%;"></div>
                </div>
                <div class="storage-count-badge">${stats.count} / ${stats.capacity} وحدة (${stats.free} شاغر)</div>
            </div>
            <div class="storage-upgrade-box">
                <div class="upgrade-title">🛠️ ترقية الحظيرة (+25 سعة)</div>
                <div class="upgrade-reqs">
                    <span>🔩 مسامير: ${InventorySystem.count('nail')}/${stats.req.nail}</span>
                    <span>🪵 ألواح: ${InventorySystem.count('wood_plank')}/${stats.req.wood_plank}</span>
                    <span>🩹 شريط: ${InventorySystem.count('duct_tape')}/${stats.req.duct_tape}</span>
                </div>
                <button type="button" class="btn-upgrade-storage" id="btn-upgrade-barn">ترقية الحظيرة</button>
            </div>
        `;
        header.querySelector('#btn-upgrade-barn').addEventListener('click', () => {
            const res = InventorySystem.upgradeBarn();
            if (!res.success) {
                this._error(res.error || 'تعذّرت الترقية');
                return;
            }
            this._success(`✨ تم ترقية الحظيرة إلى المستوى ${res.newLevel} (السعة: ${res.newCapacity})`);
            this.render();
        });
        body.appendChild(header);

        // List barn items only
        const rows = InventorySystem.list('barn');
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'hud-sheet-empty';
            empty.textContent = 'الحظيرة فارغة — أنتج دقيقًا أو أطعم حيواناتك لتخزين منتجاتها 🛖';
            body.appendChild(empty);
            return;
        }

        rows.forEach((row) => {
            const line = document.createElement('div');
            line.className = 'hud-bag-row';
            line.innerHTML = `
                <span class="hud-bag-icon">${row.icon}</span>
                <span class="hud-bag-name">${row.name}</span>
                <span class="hud-bag-count">×${row.count}</span>
                <span class="hud-bag-price">🪙 ${formatNumber(row.sellPrice)}</span>
            `;

            const sellOne = this._button('بيع', () => this.sellItem(row.id, 1));
            const sellAll = this._button('الكل', () => this.sellItem(row.id, null));
            sellAll.classList.add('all');

            line.appendChild(sellOne);
            line.appendChild(sellAll);
            body.appendChild(line);
        });
    }

    /* ------------------------------ المخزن ------------------------------ */
    _renderBag(body) {
        const rows = InventorySystem.list();
        if (rows.length === 0) {
            body.innerHTML = '<div class="hud-sheet-empty">المخزن فارغ — احصد محصولًا 🌾</div>';
            return;
        }

        rows.forEach((row) => {
            const line = document.createElement('div');
            line.className = 'hud-bag-row';
            line.innerHTML = `
                <span class="hud-bag-icon">${row.icon}</span>
                <span class="hud-bag-name">${row.name}</span>
                <span class="hud-bag-count">×${row.count}</span>
                <span class="hud-bag-price">🪙 ${formatNumber(row.sellPrice)}</span>
            `;

            const sellOne = this._button('بيع', () => this.sellItem(row.id, 1));
            const sellAll = this._button('الكل', () => this.sellItem(row.id, null));
            sellAll.classList.add('all');

            line.appendChild(sellOne);
            line.appendChild(sellAll);
            body.appendChild(line);
        });
    }

    sellItem(itemId, amount) {
        const res = amount === null ? InventorySystem.sellAll(itemId) : InventorySystem.sell(itemId, amount);
        if (!res.success) {
            this._error(arError(res.error, 'تعذّر البيع'));
            return;
        }
        this._success(`💰 بعت ${res.amount} × ${res.name} مقابل 🪙 ${formatNumber(res.coins)}`);
        this.events?.emit?.('item:sold', { itemId, amount: res.amount, coins: res.coins });
        this.render();
    }

    sellAllCrops() {
        let coins = 0;
        let units = 0;

        for (const row of InventorySystem.list()) {
            if (row.category === 'seed') continue;
            const res = InventorySystem.sellAll(row.id);
            if (res.success) {
                coins += res.coins;
                units += res.amount;
            }
        }

        if (units === 0) {
            this._error('لا توجد محاصيل للبيع');
            return;
        }
        this._success(`💰 بعت ${units} منتج مقابل 🪙 ${formatNumber(coins)}`);
        this.render();
    }

    /* ------------------------------ الخريطة ------------------------------ */
    _renderMap(body) {
        // العالم يمتد تقريبًا ±30 وحدة — نحوّله إلى نسبة من الخريطة
        const WORLD = 34;
        const toPct = (v) => `${Math.max(2, Math.min(98, ((v + WORLD) / (WORLD * 2)) * 100))}%`;

        const map = document.createElement('div');
        map.className = 'hud-map';

        const put = (icon, x, z, cls = '', label = '') => {
            const el = document.createElement('span');
            el.className = `hud-map-marker ${cls}`.trim();
            el.textContent = icon;
            el.style.left = toPct(x);
            el.style.top = toPct(z);
            map.appendChild(el);

            if (label) {
                const lb = document.createElement('span');
                lb.className = 'hud-map-label';
                lb.textContent = label;
                lb.style.left = toPct(x);
                lb.style.top = toPct(z);
                map.appendChild(lb);
            }
        };

        (LandSystem.getAllFields() || []).forEach((f) => {
            put(f.purchased ? (f.prepared ? '🟫' : '🌾') : '🔒', f.posX, f.posZ, f.purchased ? '' : 'locked');
        });

        (GameState.get('farm.buildings') || []).forEach((b) => {
            put(b.icon || '🏭', b.position?.x ?? 0, b.position?.z ?? 0);
        });

        put('🏠', -13, -13);
        put('🛖', 14, -12);
        put('🪧', 0, 7);

        const pos = typeof this.getPlayerPos === 'function' ? this.getPlayerPos() : null;
        put('🧑‍🌾', pos?.x ?? 0, pos?.z ?? 0, 'player');

        body.appendChild(map);

        const legend = document.createElement('div');
        legend.className = 'hud-map-legend';
        legend.innerHTML = '<span>🟫 حقل جاهز</span><span>🌾 أرض مفتوحة</span><span>🔒 مقفلة</span><span>🧑‍🌾 أنت</span>';
        body.appendChild(legend);
    }

    /* ------------------------------ القائمة ------------------------------ */
    _renderMenu(body) {
        const sfx = GameState.get('settings.sfx') !== false;

        const stats = GameState.get('stats') || {};
        const note = document.createElement('div');
        note.className = 'hud-menu-note';
        note.textContent =
            `مستوى ${GameState.get('player.level') || 1} · يوم ${GameState.get('time.day') || 1} · ` +
            `حصاد ${stats.totalHarvests || 0} · مبيعات ${stats.totalSales || 0}`;
        body.appendChild(note);

        const soundRow = this._menuRow('🔊 المؤثرات الصوتية', sfx ? 'مفعّلة' : 'متوقفة', sfx, () => {
            GameState.set('settings.sfx', !sfx);
            this.render();
        });
        body.appendChild(soundRow);

        const saveRow = this._menuRow('💾 حفظ الآن', 'حفظ', true, () => {
            try {
                SaveManager.save();
                this._success('💾 تم حفظ المزرعة');
            } catch (err) {
                this._error('تعذّر الحفظ الآن — سنحاول تلقائيًا');
            }
        });
        body.appendChild(saveRow);

        const bagRow = this._menuRow('🎒 المخزن', 'فتح', true, () => this.open('bag'));
        body.appendChild(bagRow);

        const ordersRow = this._menuRow('📦 الطلبات', 'فتح', true, () => this.open('shop', 'orders'));
        body.appendChild(ordersRow);

        const marketRow = this._menuRow('🛒 السوق', 'فتح', true, () => this.open('shop', 'market'));
        body.appendChild(marketRow);

        const hint = document.createElement('div');
        hint.className = 'hud-menu-note';
        hint.textContent = 'التقدّم يُحفظ تلقائيًا في هذا الجهاز (IndexedDB + نسخة احتياطية).';
        body.appendChild(hint);
    }

    _menuRow(label, value, on, handler) {
        const row = document.createElement('div');
        row.className = 'hud-menu-row';

        const text = document.createElement('span');
        text.textContent = label;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `hud-switch ${on ? 'on' : ''}`;
        btn.textContent = value;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handler();
        });

        row.appendChild(text);
        row.appendChild(btn);
        return row;
    }

    /* ------------------------------ أدوات ------------------------------ */
    _button(text, handler, disabled = false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.disabled = !!disabled;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            handler();
        });
        return btn;
    }

    _error(msg) {
        if (this.toast?.error) this.toast.error(msg);
        else this.events?.emit?.('toast:error', msg);
    }

    _success(msg) {
        if (this.toast?.success) this.toast.success(msg);
        else this.events?.emit?.('toast:success', msg);
    }

    destroy() {
        if (this._refreshTimer) clearInterval(this._refreshTimer);
        if (this.sheet && this.sheet.parentNode) this.sheet.parentNode.removeChild(this.sheet);
        this.sheet = null;
    }
}

export default GameUI;
