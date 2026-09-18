/**
 * ============================================================
 * InventorySystem.js — نقطة الدخول الوحيدة للمخزن
 * ============================================================
 * Every mutation of `inventory.items` goes through here so that
 * capacity rules, `storage:full` and the `crop:sold` quest signal
 * stay consistent across farming / production / market / orders.
 *
 * الشكل المحفوظ (متوافق مع الحفظ القديم + مراتب الجودة الجديدة):
 *   inventory.items[itemId] = {
 *       count,                       // الإجمالي
 *       quality,                     // أفضل مرتبة مخزّنة (عرض)
 *       tiers: { normal, silver, gold, platinum }   // تفصيل المراتب
 *   }
 *
 * السعة لم تعد رقمًا واحدًا: كل عنصر يُوجَّه إلى الصوامع أو المخزن
 * عبر StorageSystem (Brief §1 «Storage») — الصوامع للمحاصيل الخام
 * والبذور، والمخزن لكل ما هو مصنع/حيواني/عدد/مواد ترقية.
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { ITEMS, CROP_QUALITIES, getStorageOf } from '../data/GameData.js';
import { StorageSystem } from './StorageSystem.js';

/** Categories whose sale counts toward the "sell crops" quest line. */
const CROP_LIKE = new Set(['crop', 'milled', 'baked', 'animal', 'feed', 'dairy']);

/** مراتب الجودة من الأدنى للأعلى (البيع يبدأ من الأعلى). */
const TIER_ORDER = Object.freeze(['normal', 'silver', 'gold', 'platinum']);

/** مواد الترقية لا تُباع — تُستهلك في ترقية الصوامع/المخزن فقط. */
const NOT_FOR_SALE = new Set(['supply']);

function itemDef(itemId) {
    return ITEMS[itemId] || null;
}

/** يقبل مرتبة نصية أو رقمًا قديمًا (1) ويرجّع مرتبة صالحة. */
function normalizeTier(quality) {
    if (typeof quality === 'string' && CROP_QUALITIES[quality]) return quality;
    if (typeof quality === 'number' && quality >= 2) return 'silver';
    return 'normal';
}

function emptyTiers() {
    return { normal: 0, silver: 0, gold: 0, platinum: 0 };
}

/** يضمن شكل العنصر: count + tiers متسقان دائمًا. */
function normalizeEntry(entry, fallbackTier = 'normal') {
    const tiers = emptyTiers();
    const rawTiers = entry && typeof entry.tiers === 'object' && entry.tiers ? entry.tiers : null;

    if (rawTiers) {
        for (const tier of TIER_ORDER) {
            tiers[tier] = Math.max(0, Math.floor(Number(rawTiers[tier]) || 0));
        }
    }

    const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
    let total = TIER_ORDER.reduce((sum, tier) => sum + tiers[tier], 0);

    if (total !== count) {
        // حفظ قديم بلا tiers: كل الكمية تُنسب لمرتبة العنصر المحفوظة.
        const legacyTier = normalizeTier(entry?.quality ?? fallbackTier);
        for (const tier of TIER_ORDER) tiers[tier] = 0;
        tiers[legacyTier] = count;
        total = count;
    }

    const best = [...TIER_ORDER].reverse().find((tier) => tiers[tier] > 0) || 'normal';
    return { count, quality: best, tiers };
}

class InventorySystemService {
    /** Current count of an item (0 when absent). */
    count(itemId) {
        const items = GameState.get('inventory.items') || {};
        return items[itemId]?.count || 0;
    }

    has(itemId, amount = 1) {
        return this.count(itemId) >= amount;
    }

    /** تفصيل المراتب لعنصر. */
    tiers(itemId) {
        const items = GameState.get('inventory.items') || {};
        return normalizeEntry(items[itemId]).tiers;
    }

    /** أفضل مرتبة مخزّنة من عنصر (للواجهة). */
    bestTier(itemId) {
        const items = GameState.get('inventory.items') || {};
        return normalizeEntry(items[itemId]).quality;
    }

    /**
     * المساحة الحرة المتبقية.
     * السعة الآن مخزنان؛ القيمة المرجعة هي مجموع الفراغ (مرآة
     * `inventory.maxCapacity` التي يقرؤها كود قديم).
     */
    freeSpace() {
        return StorageSystem.free('silo') + StorageSystem.free('barn');
    }

    /** المساحة الحرة في مخزن عنصر معيّن. */
    freeSpaceFor(itemId) {
        return StorageSystem.free(getStorageOf(itemId));
    }

    /**
     * Add items, clamped to the capacity of the item's own store
     * (silo for raw crops/seeds, barn for everything else).
     * @param {string} itemId
     * @param {number} amount
     * @param {string|number} [quality] مرتبة الجودة ('normal'|'silver'|'gold'|'platinum')
     * @returns {{success:boolean, added:number, rejected:number, store:string, tier:string, error?:string}}
     */
    add(itemId, amount = 1, quality = 'normal') {
        const want = Math.max(0, Math.floor(amount) || 0);
        if (!itemId || want <= 0) {
            return { success: false, added: 0, rejected: 0, store: 'barn', tier: 'normal', error: 'bad_request' };
        }

        const tier = normalizeTier(quality);
        const check = StorageSystem.checkAdd(itemId, want);
        const added = check.allowed;
        const rejected = check.rejected;

        if (added > 0) {
            const items = GameState.get('inventory.items') || {};
            const entry = normalizeEntry(items[itemId], tier);
            entry.tiers[tier] += added;
            entry.count += added;
            entry.quality = [...TIER_ORDER].reverse().find((t) => entry.tiers[t] > 0) || 'normal';
            items[itemId] = entry;
            GameState.set('inventory.items', { ...items });
            Events.emit('storage:changed', StorageSystem.snapshot());
        }

        if (rejected > 0) {
            StorageSystem.reportFull(check.store);
        }

        return {
            success: added > 0,
            added,
            rejected,
            store: check.store,
            tier,
            error: added > 0 ? null : `${check.store}_full`
        };
    }

    /**
     * Remove items (used by planting + production + upgrades).
     * يسحب من المرتبة الأدنى أولًا حتى يحتفظ اللاعب بالجيد.
     */
    remove(itemId, amount = 1) {
        const want = Math.max(0, Math.floor(amount) || 0);
        const items = GameState.get('inventory.items') || {};
        const have = items[itemId]?.count || 0;

        if (!itemId || want <= 0 || have < want) {
            const def = itemDef(itemId);
            return { success: false, error: `لا يوجد ${def?.name || itemId} كافٍ في المخزن` };
        }

        const entry = normalizeEntry(items[itemId]);
        let remaining = want;
        for (const tier of TIER_ORDER) {
            if (remaining <= 0) break;
            const take = Math.min(entry.tiers[tier], remaining);
            entry.tiers[tier] -= take;
            remaining -= take;
        }
        entry.count -= want;
        entry.quality = [...TIER_ORDER].reverse().find((t) => entry.tiers[t] > 0) || 'normal';

        if (entry.count <= 0) {
            delete items[itemId];
        } else {
            items[itemId] = entry;
        }

        GameState.set('inventory.items', { ...items });
        Events.emit('storage:changed', StorageSystem.snapshot());

        return { success: true };
    }

    /** سعر الوحدة لمرتبة معيّنة. */
    unitPrice(itemId, tier = 'normal') {
        const base = itemDef(itemId)?.sellPrice ?? 0;
        const mult = CROP_QUALITIES[normalizeTier(tier)]?.priceMultiplier ?? 1;
        return Math.round(base * mult);
    }

    /**
     * Sell items for coins — يبدأ من الأعلى جودة (أفضل سعر للاعب).
     * @param {string} itemId
     * @param {number} amount
     * @param {string} [tier] مرتبة محددة (اختياري)
     */
    sell(itemId, amount = 1, tier = null) {
        const items = GameState.get('inventory.items') || {};
        const have = items[itemId]?.count || 0;
        const qty = Math.max(0, Math.floor(amount) || 0);
        const def = itemDef(itemId);

        if (NOT_FOR_SALE.has(def?.category)) {
            return { success: false, coins: 0, error: `${def?.name || itemId} مادة ترقية — لا تُباع` };
        }

        if (have <= 0 || qty <= 0) {
            return { success: false, coins: 0, error: `لا يوجد ${def?.name || itemId} لبيعه` };
        }

        const entry = normalizeEntry(items[itemId]);
        const wantedTier = tier && CROP_QUALITIES[tier] ? tier : null;
        const order = wantedTier ? [wantedTier] : [...TIER_ORDER].reverse();

        let remaining = Math.min(qty, have);
        let coins = 0;
        let sold = 0;

        for (const t of order) {
            if (remaining <= 0) break;
            const take = Math.min(entry.tiers[t], remaining);
            if (take <= 0) continue;
            entry.tiers[t] -= take;
            coins += this.unitPrice(itemId, t) * take;
            sold += take;
            remaining -= take;
        }

        if (sold <= 0) {
            return { success: false, coins: 0, error: `لا يوجد ${def?.name || itemId} لبيعه` };
        }

        entry.count -= sold;
        entry.quality = [...TIER_ORDER].reverse().find((t) => entry.tiers[t] > 0) || 'normal';
        if (entry.count <= 0) delete items[itemId];
        else items[itemId] = entry;

        GameState.set('inventory.items', { ...items });

        if (coins > 0) {
            GameState.set('player.coins', (GameState.get('player.coins') || 0) + coins);
        }

        if (def && CROP_LIKE.has(def.category)) {
            Events.emit('crop:sold', sold, { itemId, coins });
        }
        Events.emit('item:sold', { itemId, amount: sold, coins });
        Events.emit('storage:changed', StorageSystem.snapshot());

        return { success: true, itemId, amount: sold, coins, name: def?.name || itemId, icon: def?.icon || '📦' };
    }

    /** Sell every unit of an item. */
    sellAll(itemId) {
        return this.sell(itemId, this.count(itemId));
    }

    /** Snapshot for UI rendering. */
    list() {
        const items = GameState.get('inventory.items') || {};
        return Object.entries(items)
            .filter(([, entry]) => (entry?.count || 0) > 0)
            .map(([id, entry]) => {
                const def = itemDef(id) || {};
                const normalized = normalizeEntry(entry);
                const tiers = TIER_ORDER
                    .filter((tier) => normalized.tiers[tier] > 0)
                    .map((tier) => ({
                        tier,
                        name: CROP_QUALITIES[tier].name,
                        icon: CROP_QUALITIES[tier].icon,
                        count: normalized.tiers[tier],
                        sellPrice: this.unitPrice(id, tier)
                    }));

                return {
                    id,
                    name: def.name || id,
                    nameEn: def.nameEn || id,
                    icon: def.icon || '📦',
                    category: def.category || 'misc',
                    store: getStorageOf(id),
                    count: normalized.count,
                    quality: normalized.quality,
                    qualityIcon: CROP_QUALITIES[normalized.quality]?.icon || '⚪',
                    tiers,
                    sellPrice: this.unitPrice(id, normalized.quality),
                    sellable: !NOT_FOR_SALE.has(def.category)
                };
            })
            .sort((a, b) => (a.category === b.category ? b.sellPrice - a.sellPrice : a.category.localeCompare(b.category)));
    }

    /** عناصر مخزن معيّن فقط (silo/barn) — للوحات التفصيلية. */
    listByStore(store) {
        return this.list().filter((row) => row.store === store);
    }
}

export const InventorySystem = new InventorySystemService();
export default InventorySystem;
