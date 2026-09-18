/**
 * ============================================================
 * InventorySystem.js — نقطة الدخول الوحيدة للمخزن
 * ============================================================
 * Every mutation of `inventory.items` goes through here so that
 * capacity rules, `inventory:full` and the `crop:sold` quest
 * signal stay consistent across farming / production / market.
 *
 * Shape (unchanged, matches ProductionSystem + GameState default):
 *   inventory.items[itemId] = { count, quality }
 *
 * Consumed by: FarmingSystem (harvest/plant/sell), HUD bag panel,
 * MarketSystem (listing fees + sale reporting).
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { ITEMS } from '../data/GameData.js';

/** Categories whose sale counts toward the "sell crops" quest line. */
const CROP_LIKE = new Set(['crop', 'milled', 'baked', 'animal']);

function itemDef(itemId) {
    return ITEMS[itemId] || null;
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

    /** Free slots left, using total item count vs maxCapacity. */
    freeSpace() {
        const inv = GameState.get('inventory') || {};
        const max = inv.maxCapacity ?? inv.capacity ?? 50;
        const items = inv.items || {};
        const used = Object.values(items).reduce((sum, it) => sum + (it?.count || 0), 0);
        return Math.max(0, max - used);
    }

    /**
     * Add items, clamped to remaining capacity.
     * @returns {{success:boolean, added:number, rejected:number, error?:string}}
     */
    add(itemId, amount = 1, quality = 1) {
        const want = Math.max(0, Math.floor(amount) || 0);
        if (!itemId || want <= 0) return { success: false, added: 0, rejected: 0, error: 'bad_request' };

        const items = GameState.get('inventory.items') || {};
        const room = this.freeSpace();
        const added = Math.min(want, room);
        const rejected = want - added;

        if (added > 0) {
            const entry = items[itemId] || { count: 0, quality: quality || 1 };
            items[itemId] = { count: (entry.count || 0) + added, quality: entry.quality || quality || 1 };
            GameState.set('inventory.items', { ...items });
        }

        if (rejected > 0) Events.emit('inventory:full');

        return { success: added > 0, added, rejected, error: added > 0 ? null : 'inventory_full' };
    }

    /** Remove items (used by planting + production). */
    remove(itemId, amount = 1) {
        const want = Math.max(0, Math.floor(amount) || 0);
        const items = GameState.get('inventory.items') || {};
        const have = items[itemId]?.count || 0;

        if (!itemId || want <= 0 || have < want) {
            const def = itemDef(itemId);
            return { success: false, error: `لا يوجد ${def?.name || itemId} كافٍ في المخزن` };
        }

        items[itemId] = { ...items[itemId], count: have - want };
        if (items[itemId].count <= 0) delete items[itemId];
        GameState.set('inventory.items', { ...items });

        return { success: true };
    }

    /** Unit sell price from ITEMS, falling back to the raw crop table. */
    unitPrice(itemId) {
        return itemDef(itemId)?.sellPrice ?? 0;
    }

    /**
     * Sell items for coins. Emits `crop:sold` for trade goods so the
     * market/inventory sell paths both drive the "sell" quest line.
     */
    sell(itemId, amount = 1) {
        const items = GameState.get('inventory.items') || {};
        const have = items[itemId]?.count || 0;
        const qty = Math.max(0, Math.floor(amount) || 0);

        if (have <= 0 || qty <= 0) {
            const def = itemDef(itemId);
            return { success: false, coins: 0, error: `لا يوجد ${def?.name || itemId} لبيعه` };
        }

        const sold = Math.min(qty, have);
        const removed = this.remove(itemId, sold);
        if (!removed.success) return { success: false, coins: 0, error: removed.error };

        const coins = this.unitPrice(itemId) * sold;
        if (coins > 0) {
            GameState.set('player.coins', (GameState.get('player.coins') || 0) + coins);
        }

        const def = itemDef(itemId);
        if (def && CROP_LIKE.has(def.category)) {
            Events.emit('crop:sold', sold, { itemId, coins });
        }
        Events.emit('item:sold', { itemId, amount: sold, coins });

        return { success: true, itemId, amount: sold, coins, name: def?.name || itemId, icon: def?.icon || '📦' };
    }

    /** Sell every unit of an item. */
    sellAll(itemId) {
        return this.sell(itemId, this.count(itemId));
    }

    /** Snapshot for UI rendering: [{id,name,icon,count,sellPrice,category}] */
    list() {
        const items = GameState.get('inventory.items') || {};
        return Object.entries(items)
            .filter(([, entry]) => (entry?.count || 0) > 0)
            .map(([id, entry]) => {
                const def = itemDef(id) || {};
                return {
                    id,
                    name: def.name || id,
                    icon: def.icon || '📦',
                    category: def.category || 'misc',
                    count: entry.count,
                    quality: entry.quality ?? 1,
                    sellPrice: def.sellPrice ?? 0
                };
            })
            .sort((a, b) => (a.category === b.category ? b.sellPrice - a.sellPrice : a.category.localeCompare(b.category)));
    }
}

export const InventorySystem = new InventorySystemService();
export default InventorySystem;
