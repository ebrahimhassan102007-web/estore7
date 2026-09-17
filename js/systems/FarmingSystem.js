/**
 * ============================================================
 * MY FARM 3D - REAL FARMING SYSTEM & GROWTH ENGINE
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';

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

class FarmingSystemService {
    constructor() {
        this.plotSlots = new Map();
    }

    getOrCreateSlots(fieldId) {
        if (this.plotSlots.has(fieldId)) {
            return this.plotSlots.get(fieldId);
        }

        const defaultSlots = [
            { slotIndex: 0, ox: -1.2, oz: -1.2, state: 'empty', cropType: null, plantedAt: 0, readyAt: 0, watered: false },
            { slotIndex: 1, ox:  1.2, oz: -1.2, state: 'empty', cropType: null, plantedAt: 0, readyAt: 0, watered: false },
            { slotIndex: 2, ox: -1.2, oz:  1.2, state: 'empty', cropType: null, plantedAt: 0, readyAt: 0, watered: false },
            { slotIndex: 3, ox:  1.2, oz:  1.2, state: 'empty', cropType: null, plantedAt: 0, readyAt: 0, watered: false }
        ];

        this.plotSlots.set(fieldId, defaultSlots);
        return defaultSlots;
    }

    plantSeed(fieldId, slotIndex, cropType = 'wheat') {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'empty') return { success: false };

        const cropDef = CROPS_DEFINITIONS[cropType] || CROPS_DEFINITIONS.wheat;
        const now = Date.now();

        slot.state = 'growing';
        slot.cropType = cropType;
        slot.plantedAt = now;
        slot.readyAt = now + (cropDef.growTime * 1000);
        slot.watered = false;

        SaveManager.save();
        Events.emit('crop:planted', { fieldId, slotIndex, cropType, slot });
        return { success: true, slot };
    }

    waterSlot(fieldId, slotIndex) {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'growing' || slot.watered) return { success: false };

        slot.watered = true;
        slot.readyAt -= 3500;

        SaveManager.save();
        Events.emit('crop:watered', { fieldId, slotIndex, slot });
        return { success: true, slot };
    }

    harvestSlot(fieldId, slotIndex) {
        const slots = this.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot || slot.state !== 'ready') return { success: false };

        const cropDef = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;

        try {
            const currentCoins = GameState.get('player.coins') || 0;
            const currentXP = GameState.get('player.xp') || 0;
            GameState.set('player.coins', currentCoins + cropDef.sellPrice);
            GameState.set('player.xp', currentXP + cropDef.xpReward);
        } catch (e) {}

        slot.state = 'empty';
        slot.cropType = null;
        slot.watered = false;
        slot.plantedAt = 0;
        slot.readyAt = 0;

        SaveManager.save();
        Events.emit('crop:harvested', {
            fieldId,
            slotIndex,
            crop: cropDef,
            coins: cropDef.sellPrice,
            xp: cropDef.xpReward
        });

        return { success: true, crop: cropDef };
    }

    updateGrowth() {
        const now = Date.now();
        for (const [fieldId, slots] of this.plotSlots.entries()) {
            slots.forEach(slot => {
                if (slot.state === 'growing' && now >= slot.readyAt) {
                    slot.state = 'ready';
                    Events.emit('crop:ready', { fieldId, slot });
                }
            });
        }
    }
}

export const FarmingSystem = new FarmingSystemService();
