/**
 * ============================================================
 * InventorySystem.js — نقطة الدخول الوحيدة للمخزن
 * ============================================================
 * Every mutation of `inventory.items` goes through here so that
 * capacity rules, Silo/Barn split (Hay Day), `inventory:full`
 * and the `crop:sold` quest signal stay consistent across
 * farming / production / market.
 *
 * Hay Day Storage Doctrine:
 *   - Silo: raw crops only ('crop'). Full silo blocks harvest.
 *   - Barn: animal goods ('animal'), processed products ('milled', 'baked', 'dairy'),
 *           tools ('tool'), seeds ('seed'), supplies ('supply', 'fertilizer', 'misc').
 *           Full barn blocks machine collect.
 *   - Upgrades: both upgraded with supplies (nail, wood_plank, duct_tape).
 *
 * Shape (unchanged for backward compatibility):
 *   inventory.items[itemId] = { count, quality }
 *
 * Consumed by: FarmingSystem (harvest/plant/sell), HUD,
 * ProductionSystem, AnimalSystem, MarketSystem.
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { ITEMS } from '../data/GameData.js';

/** Categories whose sale counts toward the "sell crops" quest line. */
const CROP_LIKE = new Set(['crop', 'milled', 'baked', 'animal', 'dairy']);

function itemDef(itemId) {
    return ITEMS[itemId] || null;
}

class InventorySystemService {
    constructor() {
        // Safe constructor, no Safari-breaking class fields
    }

    /** Determine whether item belongs to Silo or Barn */
    getStorageType(itemId) {
        const def = itemDef(itemId);
        if (!def) return 'barn';
        return def.category === 'crop' ? 'silo' : 'barn';
    }

    /** Total count of items currently stored in Silo (raw crops only) */
    siloCount() {
        const items = GameState.get('inventory.items') || {};
        let total = 0;
        for (const [id, entry] of Object.entries(items)) {
            if (this.getStorageType(id) === 'silo') {
                total += (entry?.count || 0);
            }
        }
        return total;
    }

    /** Max capacity of Silo */
    siloCapacity() {
        const storage = GameState.get('storage') || {};
        return storage.silo?.capacity || 50;
    }

    /** Free capacity in Silo */
    siloFreeSpace() {
        return Math.max(0, this.siloCapacity() - this.siloCount());
    }

    /** Total count of items currently stored in Barn */
    barnCount() {
        const items = GameState.get('inventory.items') || {};
        let total = 0;
        for (const [id, entry] of Object.entries(items)) {
            if (this.getStorageType(id) === 'barn') {
                total += (entry?.count || 0);
            }
        }
        return total;
    }

    /** Max capacity of Barn */
    barnCapacity() {
        const storage = GameState.get('storage') || {};
        const inv = GameState.get('inventory') || {};
        return storage.barn?.capacity || inv.maxCapacity || 50;
    }

    /** Free capacity in Barn */
    barnFreeSpace() {
        return Math.max(0, this.barnCapacity() - this.barnCount());
    }

    /** Current count of an item (0 when absent). */
    count(itemId) {
        const items = GameState.get('inventory.items') || {};
        return items[itemId]?.count || 0;
    }

    has(itemId, amount = 1) {
        return this.count(itemId) >= amount;
    }

    /** Free slots left for a specific item (or overall minimum) */
    freeSpace(itemId = null) {
        if (!itemId) {
            // General free space: return sum or specific target
            return this.siloFreeSpace() + this.barnFreeSpace();
        }
        return this.getStorageType(itemId) === 'silo' ? this.siloFreeSpace() : this.barnFreeSpace();
    }

    /**
     * Add items, clamped to remaining capacity in respective silo/barn.
     * @returns {{success:boolean, added:number, rejected:number, error?:string, storageType:string}}
     */
    add(itemId, amount = 1, quality = 1) {
        const want = Math.max(0, Math.floor(amount) || 0);
        if (!itemId || want <= 0) return { success: false, added: 0, rejected: 0, error: 'bad_request', storageType: 'barn' };

        const targetStorage = this.getStorageType(itemId);
        const room = targetStorage === 'silo' ? this.siloFreeSpace() : this.barnFreeSpace();
        const added = Math.min(want, room);
        const rejected = want - added;

        if (added > 0) {
            const items = GameState.get('inventory.items') || {};
            const entry = items[itemId] || { count: 0, quality: quality || 1 };
            items[itemId] = {
                count: (entry.count || 0) + added,
                quality: quality > 1 ? quality : (entry.quality || 1)
            };
            GameState.set('inventory.items', { ...items });
            Events.emit('inventory:changed', { itemId, added, storageType: targetStorage });
            Events.emit('storage:updated', this.getStorageStats());
        }

        if (rejected > 0) {
            Events.emit(targetStorage === 'silo' ? 'silo:full' : 'barn:full');
            Events.emit('inventory:full', { target: targetStorage });
        }

        return {
            success: added > 0,
            added,
            rejected,
            storageType: targetStorage,
            error: added > 0 ? null : (targetStorage === 'silo' ? 'silo_full' : 'barn_full')
        };
    }

    /** Remove items (used by planting + feeding + production + building upgrades). */
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

        const targetStorage = this.getStorageType(itemId);
        Events.emit('inventory:changed', { itemId, removed: want, storageType: targetStorage });
        Events.emit('storage:updated', this.getStorageStats());

        return { success: true };
    }

    /** Unit sell price from ITEMS, falling back to the raw crop table. */
    unitPrice(itemId, quality = 1) {
        const base = itemDef(itemId)?.sellPrice ?? 0;
        // Quality multiplier (Stardew-inspired): Normal = 1x, Silver (2) = 1.25x, Gold (3) = 1.5x, Deluxe (4) = 2.0x
        if (quality === 2) return Math.round(base * 1.25);
        if (quality === 3) return Math.round(base * 1.5);
        if (quality >= 4) return Math.round(base * 2.0);
        return base;
    }

    /**
     * Sell items for coins. Emits `crop:sold` for trade goods so the
     * market/inventory sell paths both drive the "sell" quest line.
     */
    sell(itemId, amount = 1) {
        const items = GameState.get('inventory.items') || {};
        const entry = items[itemId];
        const have = entry?.count || 0;
        const quality = entry?.quality || 1;
        const qty = Math.max(0, Math.floor(amount) || 0);

        if (have <= 0 || qty <= 0) {
            const def = itemDef(itemId);
            return { success: false, coins: 0, error: `لا يوجد ${def?.name || itemId} لبيعه` };
        }

        const sold = Math.min(qty, have);
        const removed = this.remove(itemId, sold);
        if (!removed.success) return { success: false, coins: 0, error: removed.error };

        const coins = this.unitPrice(itemId, quality) * sold;
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

    /** Upgrade Silo using nails and planks */
    upgradeSilo() {
        const storage = GameState.get('storage') || {};
        const silo = storage.silo || { capacity: 50, level: 1, upgradeSupplies: { nail: 1, wood_plank: 1 } };
        const req = silo.upgradeSupplies || { nail: silo.level || 1, wood_plank: silo.level || 1 };

        for (const [item, count] of Object.entries(req)) {
            if (this.count(item) < count) {
                const def = itemDef(item);
                return { success: false, error: `ينقصك ${count} من ${def?.name || item} للترقية` };
            }
        }

        // Consume supplies
        for (const [item, count] of Object.entries(req)) {
            this.remove(item, count);
        }

        const newLevel = (silo.level || 1) + 1;
        const newCapacity = (silo.capacity || 50) + 25;
        const nextReq = {
            nail: newLevel,
            wood_plank: newLevel
        };

        storage.silo = {
            capacity: newCapacity,
            level: newLevel,
            upgradeSupplies: nextReq
        };
        GameState.set('storage', { ...storage });
        Events.emit('storage:upgraded', { type: 'silo', newLevel, newCapacity });
        Events.emit('storage:updated', this.getStorageStats());

        return { success: true, type: 'silo', newLevel, newCapacity };
    }

    /** Upgrade Barn using nails, planks, and duct tape */
    upgradeBarn() {
        const storage = GameState.get('storage') || {};
        const barn = storage.barn || { capacity: 50, level: 1, upgradeSupplies: { nail: 1, wood_plank: 1, duct_tape: 1 } };
        const req = barn.upgradeSupplies || { nail: barn.level || 1, wood_plank: barn.level || 1, duct_tape: barn.level || 1 };

        for (const [item, count] of Object.entries(req)) {
            if (this.count(item) < count) {
                const def = itemDef(item);
                return { success: false, error: `ينقصك ${count} من ${def?.name || item} للترقية` };
            }
        }

        // Consume supplies
        for (const [item, count] of Object.entries(req)) {
            this.remove(item, count);
        }

        const newLevel = (barn.level || 1) + 1;
        const newCapacity = (barn.capacity || 50) + 25;
        const nextReq = {
            nail: newLevel,
            wood_plank: newLevel,
            duct_tape: newLevel
        };

        storage.barn = {
            capacity: newCapacity,
            level: newLevel,
            upgradeSupplies: nextReq
        };
        GameState.set('storage', { ...storage });
        // Keep legacy maxCapacity in sync
        const inv = GameState.get('inventory') || {};
        GameState.set('inventory', { ...inv, capacity: newCapacity, maxCapacity: newCapacity });

        Events.emit('storage:upgraded', { type: 'barn', newLevel, newCapacity });
        Events.emit('storage:updated', this.getStorageStats());

        return { success: true, type: 'barn', newLevel, newCapacity };
    }

    /** Comprehensive snapshot of both storage facilities for HUD & UI */
    getStorageStats() {
        return {
            silo: {
                count: this.siloCount(),
                capacity: this.siloCapacity(),
                free: this.siloFreeSpace(),
                level: GameState.get('storage.silo.level') || 1,
                req: GameState.get('storage.silo.upgradeSupplies') || { nail: 1, wood_plank: 1 }
            },
            barn: {
                count: this.barnCount(),
                capacity: this.barnCapacity(),
                free: this.barnFreeSpace(),
                level: GameState.get('storage.barn.level') || 1,
                req: GameState.get('storage.barn.upgradeSupplies') || { nail: 1, wood_plank: 1, duct_tape: 1 }
            }
        };
    }

    /** Snapshot for UI rendering: [{id,name,icon,count,sellPrice,category,storageType,quality}] */
    list(filterStorage = null) {
        const items = GameState.get('inventory.items') || {};
        return Object.entries(items)
            .filter(([, entry]) => (entry?.count || 0) > 0)
            .map(([id, entry]) => {
                const def = itemDef(id) || {};
                const storageType = this.getStorageType(id);
                const quality = entry.quality ?? 1;
                return {
                    id,
                    name: def.name || id,
                    icon: def.icon || '📦',
                    category: def.category || 'misc',
                    storageType,
                    count: entry.count,
                    quality,
                    qualityLabel: quality === 4 ? 'فاخر 🌟' : quality === 3 ? 'ذهبي ⭐' : quality === 2 ? 'فضي ✨' : 'عادي',
                    sellPrice: this.unitPrice(id, quality)
                };
            })
            .filter(item => !filterStorage || item.storageType === filterStorage)
            .sort((a, b) => (a.category === b.category ? b.sellPrice - a.sellPrice : a.category.localeCompare(b.category)));
    }
}

export const InventorySystem = new InventorySystemService();
export default InventorySystem;
