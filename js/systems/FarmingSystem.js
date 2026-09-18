/**
 * ============================================================
 * MY FARM 3D - REAL FARMING SYSTEM & GROWTH ENGINE
 * ============================================================
 * Slot lifecycle (per spec P1):
 *   empty → growing (3 visual stages) → ready → empty
 *                                      ↘ withered (unwatered past 2× growTime)
 *
 * Persistence: every field's 4 slots live INSIDE `farm.tiles[i].slots`
 * (GameState → SaveManager), so a page refresh restores the crops.
 * `plotSlots` is only a live view of that same array.
 *
 * Harvest no longer pays coins — it puts the crop in the inventory.
 * Coins come from InventorySystem.sell / orders / market.
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';
import { InventorySystem } from './InventorySystem.js';
import { XPSystem } from './XPSystem.js';
import { ITEMS } from '../data/GameData.js';

export const CROPS_DEFINITIONS = Object.freeze({
    wheat: {
        id: 'wheat',
        name: 'قمح',
        icon: '🌾',
        seedId: 'wheat_seed',
        growTime: 10,
        xpReward: 15,
        sellPrice: 25,
        colors: { sprout: 0x86d942, growing: 0x57b327, ready: 0xffd54f }
    },
    corn: {
        id: 'corn',
        name: 'ذرة',
        icon: '🌽',
        seedId: 'corn_seed',
        growTime: 16,
        xpReward: 25,
        sellPrice: 45,
        colors: { sprout: 0x9be046, growing: 0x68c728, ready: 0xf5a623 }
    },
    carrot: {
        id: 'carrot',
        name: 'جزر',
        icon: '🥕',
        seedId: 'carrot_seed',
        growTime: 22,
        xpReward: 35,
        sellPrice: 65,
        colors: { sprout: 0x72c738, growing: 0x4aa625, ready: 0xff7043 }
    },
    tomato: {
        id: 'tomato',
        name: 'طماطم',
        icon: '🍅',
        seedId: 'tomato_seed',
        growTime: 28,
        xpReward: 45,
        sellPrice: 85,
        colors: { sprout: 0x76cc3f, growing: 0x4caf50, ready: 0xe53935 }
    }
});

/** Debug aid: `MY_FARM.app.autoSellOnHarvest = true` pays coins instantly. */
const DEBUG_AUTO_SELL_ON_HARVEST = false;

const SLOT_OFFSETS = [-1.2, 1.2];

function freshSlots() {
    let i = 0;
    const slots = [];
    for (const oz of SLOT_OFFSETS) {
        for (const ox of SLOT_OFFSETS) {
            slots.push({
                slotIndex: i++,
                ox,
                oz,
                state: 'empty',
                cropType: null,
                plantedAt: 0,
                readyAt: 0,
                witherAt: 0,
                watered: false,
                fertilizerTier: 'normal',
                cropQuality: 1
            });
        }
    }
    return slots;
}

class FarmingSystemService {
    constructor() {
        this.plotSlots = new Map();
        this.autoSellOnHarvest = DEBUG_AUTO_SELL_ON_HARVEST;
        this._lastGrowthCheck = 0;
        this._dirtyFields = new Set();
    }

    /* ========================================================
       PERSISTENCE — slots live in farm.tiles[i].slots
       ======================================================== */

    _tiles() {
        const tiles = GameState.get('farm.tiles');
        return Array.isArray(tiles) ? tiles : [];
    }

    /** Rebuild the live view from a loaded save (called once at boot). */
    hydrate() {
        this.plotSlots.clear();
        for (const tile of this._tiles()) {
            if (!tile?.id) continue;
            this.plotSlots.set(tile.id, this._normalizeSlots(tile.slots));
        }
        return this;
    }

    /** Coerce arbitrary saved data into 4 valid slots. */
    _normalizeSlots(raw) {
        const base = freshSlots();
        if (!Array.isArray(raw)) return base;
        for (let i = 0; i < 4; i++) {
            const s = raw[i];
            if (!s || typeof s !== 'object') continue;
            const cropType = CROPS_DEFINITIONS[s.cropType] ? s.cropType : null;
            base[i] = {
                ...base[i],
                cropType,
                watered: !!s.watered,
                fertilizerTier: s.fertilizerTier || 'normal',
                cropQuality: Number(s.cropQuality) || 1,
                plantedAt: Number(s.plantedAt) || 0,
                readyAt: Number(s.readyAt) || 0,
                witherAt: Number(s.witherAt) || 0,
                state: cropType
                    ? (['growing', 'ready', 'withered'].includes(s.state) ? s.state : 'growing')
                    : 'empty'
            };
        }
        return base;
    }

    getOrCreateSlots(fieldId) {
        let slots = this.plotSlots.get(fieldId);
        if (!slots) {
            const tile = this._tiles().find(t => t.id === fieldId);
            slots = this._normalizeSlots(tile?.slots);
            this.plotSlots.set(fieldId, slots);
        }
        return slots;
    }

    /** Write the live slots back into GameState + disk. */
    _persist(fieldId) {
        const tiles = this._tiles();
        const index = tiles.findIndex(t => t.id === fieldId);
        const slots = this.getOrCreateSlots(fieldId);

        if (index === -1) return;

        tiles[index] = { ...tiles[index], slots: slots.map(s => ({ ...s })) };
        GameState.set('farm.tiles', tiles);
        SaveManager.save();
    }

    /* ========================================================
       FIELD HELPERS
       ======================================================== */

    isFieldFarmable(fieldId) {
        const tile = this._tiles().find(t => t.id === fieldId);
        return !!(tile && tile.purchased && tile.prepared);
    }

    /** First farmable slot of a field that is ready to harvest / needs water. */
    findActionableSlot(fieldId, wantedState) {
        return this.getOrCreateSlots(fieldId).find(s => s.state === wantedState) || null;
    }

    /**
     * Determine harvest crop quality tier based on applied fertilizer (Stardew-inspired).
     * Quality tiers: 1 (normal), 2 (silver ✨), 3 (gold ⭐), 4 (deluxe 🌟).
     */
    _rollQuality(fertilizerTier = 'normal') {
        const r = Math.random();
        switch (fertilizerTier) {
            case 'deluxe':
                // Deluxe unlocks top tier (4) and gives highest chances
                if (r < 0.25) return 4; // Deluxe quality
                if (r < 0.65) return 3; // Gold quality
                if (r < 0.90) return 2; // Silver quality
                return 1;
            case 'quality':
                if (r < 0.35) return 3; // Gold quality
                if (r < 0.75) return 2; // Silver quality
                return 1;
            case 'basic':
                if (r < 0.15) return 3; // Gold quality
                if (r < 0.50) return 2; // Silver quality
                return 1;
            case 'normal':
            default:
                if (r < 0.05) return 3;
                if (r < 0.20) return 2;
                return 1;
        }
    }

    /**
     * Apply fertilizer to a tilled slot before sprout.
     */
    applyFertilizer(fieldId, slotIndex, fertilizerId = 'fertilizer_basic') {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot) return { success: false, error: 'خانة غير موجودة' };
        if (slot.state !== 'empty' && slot.state !== 'growing') {
            return { success: false, error: 'يمكن وضع السماد فقط على التربة الفارغة أو قبل الإنبات' };
        }

        // Map item ID to tier
        const tierMap = {
            fertilizer_normal: 'normal',
            fertilizer_basic: 'basic',
            fertilizer_quality: 'quality',
            fertilizer_deluxe: 'deluxe'
        };
        const tier = tierMap[fertilizerId] || 'basic';

        const removed = InventorySystem.remove(fertilizerId, 1);
        if (!removed.success) {
            return { success: false, error: `لا يوجد ${ITEMS[fertilizerId]?.name || 'سماد'} في المخزن` };
        }

        slot.fertilizerTier = tier;
        this._persist(fieldId);
        Events.emit('crop:fertilized', { fieldId, slotIndex, tier, slot });
        return { success: true, tier, slot };
    }

    /* ========================================================
       ACTIONS
       ======================================================== */

    plantSeed(fieldId, slotIndex, cropType = 'wheat', options = {}) {
        if (!this.isFieldFarmable(fieldId)) {
            return { success: false, error: 'هذه الأرض غير مجهزة للزراعة بعد' };
        }

        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'empty') {
            return { success: false, error: 'الخانة مشغولة' };
        }

        const cropDef = CROPS_DEFINITIONS[cropType] || CROPS_DEFINITIONS.wheat;

        // البذرة تُستهلك من المخزن إلا في وضع debug السريع
        if (!options.skipSeedCost) {
            const removed = InventorySystem.remove(cropDef.seedId, 1);
            if (!removed.success) {
                return { success: false, error: `لا توجد ${ITEMS[cropDef.seedId]?.name || 'بذور'} كافية`, needSeed: true };
            }
        }

        const now = Date.now();
        const growMs = cropDef.growTime * 1000;

        slot.state = 'growing';
        slot.cropType = cropDef.id;
        slot.plantedAt = now;
        slot.readyAt = now + growMs;
        slot.witherAt = now + growMs * 2; // ذبول إن لم تُسقَ
        slot.watered = false;
        slot.fertilizerTier = slot.fertilizerTier || 'normal';
        slot.cropQuality = this._rollQuality(slot.fertilizerTier);

        this._persist(fieldId);
        Events.emit('crop:planted', { fieldId, slotIndex, cropType, slot });
        return { success: true, slot };
    }

    waterSlot(fieldId, slotIndex) {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'growing') return { success: false, error: 'لا يوجد محصول ينمو هنا' };
        if (slot.watered) return { success: false, error: 'هذا المحصول مُروى بالفعل' };

        slot.watered = true;
        slot.readyAt -= 3500;
        slot.witherAt = 0; // الري يحمي من الذبول

        this._persist(fieldId);
        Events.emit('crop:watered', { fieldId, slotIndex, slot });
        return { success: true, slot };
    }

    /**
     * الحصاد: يدخل المحصول للمخزن (+بذرة واحدة رجوعًا) ولا يدفع كوينز.
     * العملات تأتي من البيع / الطلبات / السوق.
     */
    harvestSlot(fieldId, slotIndex) {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot) return { success: false, error: 'خانة غير موجودة' };

        if (slot.state === 'withered') {
            this._clearSlot(slot);
            this._persist(fieldId);
            Events.emit('crop:withered-cleared', { fieldId, slotIndex });
            return { success: true, cleared: true, crop: null };
        }

        if (slot.state !== 'ready') {
            return { success: false, error: 'المحصول لم ينضج بعد' };
        }

        const cropDef = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;
        const yieldAmount = 1 + (Math.random() < 0.25 ? 1 : 0); // 25% حصاد مزدوج
        const quality = slot.cropQuality || 1;

        // Hay Day Silo Check: Silo stores raw crops only. If silo is full, harvest is blocked!
        if (InventorySystem.siloFreeSpace() < yieldAmount) {
            Events.emit('silo:full');
            return { success: false, error: 'صومعة الغلال ممتلئة! فرّغ بعض المساحة أولًا', isSiloFull: true };
        }

        const added = InventorySystem.add(cropDef.id, yieldAmount, quality);
        if (!added.success) {
            return { success: false, error: added.error || 'inventory_full' };
        }
        // رجوع البذرة إلى الحظيرة (Barn) لتبقى الحلقة مستدامة
        InventorySystem.add(cropDef.seedId, added.added, 1);

        // فرصة الحصول على مواد ترقية الحظيرة/الصومعة من الحصاد (Hay Day supply drops)
        let bonusSupply = null;
        if (Math.random() < 0.20) {
            const supplies = ['nail', 'wood_plank', 'duct_tape'];
            const dropped = supplies[Math.floor(Math.random() * supplies.length)];
            InventorySystem.add(dropped, 1);
            bonusSupply = dropped;
        }

        XPSystem.addXp(cropDef.xpReward, 'harvest');
        const stats = GameState.get('stats') || {};
        GameState.set('stats.totalHarvests', (stats.totalHarvests || 0) + added.added);

        let coins = 0;
        if (this.autoSellOnHarvest) {
            coins = InventorySystem.sell(cropDef.id, added.added).coins || 0;
        }

        this._clearSlot(slot);
        this._persist(fieldId);

        Events.emit('crop:harvested', {
            fieldId,
            slotIndex,
            crop: cropDef,
            itemId: cropDef.id,
            amount: added.added,
            coins,
            xp: cropDef.xpReward
        });

        return { success: true, crop: cropDef, amount: added.added, coins, xp: cropDef.xpReward };
    }

    /** ازرع في أول خانة فارغة (مفيد للزراعة السريعة من الـ Hotbar). */
    plantSeedInField(fieldId, cropType = 'wheat', options = {}) {
        const slots = this.getOrCreateSlots(fieldId);
        const index = slots.findIndex(s => s.state === 'empty');
        if (index === -1) return { success: false, error: 'كل خانات الحقل ممتلئة' };
        return this.plantSeed(fieldId, index, cropType, options);
    }

    /** احصد كل ما نضج في الحقل. */
    harvestField(fieldId) {
        const slots = this.getOrCreateSlots(fieldId);
        let total = 0;
        let crop = null;
        slots.forEach((slot, idx) => {
            if (slot.state !== 'ready') return;
            const res = this.harvestSlot(fieldId, idx);
            if (res.success) {
                total += res.amount || 0;
                crop = res.crop;
            }
        });
        return total > 0 ? { success: true, amount: total, crop } : { success: false, error: 'لا يوجد محصول ناضج' };
    }

    _clearSlot(slot) {
        slot.state = 'empty';
        slot.cropType = null;
        slot.watered = false;
        slot.fertilizerTier = 'normal';
        slot.cropQuality = 1;
        slot.plantedAt = 0;
        slot.readyAt = 0;
        slot.witherAt = 0;
    }

    /**
     * نمو المحاصيل — يستدعى كل إطار لكنه يعمل بتردد ~4Hz.
     * يعيد قائمة الحقول التي تغيّرت حالة خاناتها ليعيد الرسم فقط لها.
     */
    updateGrowth() {
        const now = Date.now();
        if (now - this._lastGrowthCheck < 250) return null;
        this._lastGrowthCheck = now;

        this._dirtyFields.clear();

        for (const [fieldId, slots] of this.plotSlots.entries()) {
            slots.forEach(slot => {
                if (slot.state === 'growing') {
                    if (now >= slot.readyAt) {
                        slot.state = 'ready';
                        this._dirtyFields.add(fieldId);
                        Events.emit('crop:ready', { fieldId, slot });
                    }
                }

                /*
                 * الذبول: محصول لم يُروَ وتركه اللاعب حتى 2× مدة النمو
                 * يفسد — ويسري ذلك على الناضج غير المحصود كذلك
                 * (الري هو ما يحميه: watered ⇒ witherAt = 0).
                 */
                if (
                    (slot.state === 'growing' || slot.state === 'ready') &&
                    !slot.watered &&
                    slot.witherAt > 0 &&
                    now >= slot.witherAt
                ) {
                    slot.state = 'withered';
                    this._dirtyFields.add(fieldId);
                    Events.emit('crop:withered', { fieldId, slot });
                }
            });
        }

        if (this._dirtyFields.size > 0) {
            for (const fieldId of this._dirtyFields) this._persist(fieldId);
        }

        return this._dirtyFields.size ? this._dirtyFields : null;
    }

    /** نمو فوري (debug) : ينضج كل محصول نامٍ في الحقل. */
    forceReady(fieldId) {
        for (const slot of this.getOrCreateSlots(fieldId)) {
            if (slot.state === 'growing') slot.readyAt = Date.now();
        }
        this._lastGrowthCheck = 0;
        this.updateGrowth();
    }

    /**
     * بيع محصول من المخزن (الحصاد → المخزن → العملات).
     * `crop:sold` ينبعث داخل InventorySystem لتتبع المهام.
     */
    sellHarvest(itemId, amount = 1) {
        const sold = InventorySystem.sell(itemId, amount);
        if (sold.success) {
            const stats = GameState.get('stats') || {};
            GameState.set('stats.totalSales', (stats.totalSales || 0) + sold.coins);
        }
        return sold;
    }

    /** 0..1 نمو خانة + المرحلة المرئية (sprout/growing/ready). */
    growthProgress(slot) {
        if (!slot || slot.state === 'empty' || !slot.cropType) return null;
        if (slot.state === 'withered') return { progress: 1, stage: 'withered' };
        if (slot.state === 'ready') return { progress: 1, stage: 'ready' };

        const cropDef = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;
        const total = cropDef.growTime * 1000;
        const remaining = Math.max(0, slot.readyAt - Date.now());
        const progress = Math.min(1, Math.max(0, 1 - remaining / total));
        const stage = progress < 0.4 ? 'sprout' : 'growing';
        return { progress, stage };
    }
}

export const FarmingSystem = new FarmingSystemService();
