/**
 * ============================================================
 * MY FARM 3D - LAND & EXPANSION SYSTEM
 * Handles 10 Locked Lands, 100 Coins Purchase, Axe Preparation & Farming Ready State
 * ============================================================
 */
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { SaveManager } from '../core/SaveManager.js';

export const LAND_CONFIG = Object.freeze({
    fieldPrice: 100,
    hitsRequired: 4, // 4 ضربات فأس لتجهيز الأرض بالكامل
    baseUnlocked: ['field_center_left', 'field_center_right'],
    
    // منطقة الحقول المخصصة شرق المزرعة (3 أعمدة × 4 صفوف)، بعيدًا عن
    // البيت/الحظيرة/الطاحونة/السوق. الممرات تصلها (انظر Environment).
    // المعرّفات القديمة محفوظة عمدًا حتى لا تنكسر الحفوظات والخانات.
    fieldsLayout: [
        // الحقول الأساسية المجانية (أول صف في منطقة الحقول)
        { id: 'field_center_left',  x: 10.5, z: 2.0, base: true },
        { id: 'field_center_right', x: 16.5, z: 2.0, base: true },

        // الـ 10 أراضٍ المقفولة داخل منطقة الحقول فقط
        { id: 'land_north_1',  x: 22.5, z: 2.0 },
        { id: 'land_north_2',  x: 10.5, z: 8.2 },
        { id: 'land_north_3',  x: 16.5, z: 8.2 },
        { id: 'land_west_1',   x: 22.5, z: 8.2 },
        { id: 'land_west_2',   x: 10.5, z: 14.4 },
        { id: 'land_east_1',   x: 16.5, z: 14.4 },
        { id: 'land_east_2',   x: 22.5, z: 14.4 },
        { id: 'land_south_1',  x: 10.5, z: 20.6 },
        { id: 'land_south_2',  x: 16.5, z: 20.6 },
        { id: 'land_south_3',  x: 22.5, z: 20.6 }
    ]
});

class LandSystemService {
    constructor() {
        this.fields = [];
        this.initialized = false;
    }

    init() {
        let stateTiles = [];
        try {
            stateTiles = GameState.get('farm.tiles');
        } catch (e) {
            stateTiles = [];
        }

        if (!Array.isArray(stateTiles) || stateTiles.length === 0) {
            stateTiles = LAND_CONFIG.fieldsLayout.map(cfg => ({
                id: cfg.id,
                posX: cfg.x,
                posZ: cfg.z,
                price: LAND_CONFIG.fieldPrice,
                purchased: !!cfg.base,
                prepared: !!cfg.base,
                prepProgress: cfg.base ? 100 : 0,
                state: cfg.base ? 'empty' : 'locked',
                cropId: null,
                plantedAt: 0,
                readyAt: 0,
                watered: false
            }));

            try {
                GameState.set('farm.tiles', stateTiles);
                SaveManager.save();
            } catch (err) {
                console.warn('[LandSystem] Save Init notice:', err);
            }
        }

        // ترحيل لمرة واحدة: الحفوظات القديمة تحمل مواقع الحقول المبعثرة
        // (بعضها تحت المباني) — ننقلها لمنطقة الحقول مع بقاء كل شيء آخر
        // (شراء/تجهيز/خانات/محاصيل) كما هو تمامًا.
        try {
            const layoutById = {};
            for (const cfg of LAND_CONFIG.fieldsLayout) layoutById[cfg.id] = cfg;
            let migrated = false;
            for (const tile of stateTiles) {
                const cfg = tile && layoutById[tile.id];
                if (cfg && (tile.posX !== cfg.x || tile.posZ !== cfg.z)) {
                    tile.posX = cfg.x;
                    tile.posZ = cfg.z;
                    migrated = true;
                }
            }
            if (migrated) {
                GameState.set('farm.tiles', stateTiles);
                SaveManager.save();
                console.log('[LandSystem] Migrated plots to the dedicated field zone.');
            }
        } catch (err) {
            console.warn('[LandSystem] Migration notice:', err);
        }

        this.fields = stateTiles;
        this.initialized = true;
        console.log('[LandSystem] Loaded with', this.fields.length, 'total plots.');
    }

    getAllFields() {
        try {
            const tiles = GameState.get('farm.tiles');
            if (Array.isArray(tiles) && tiles.length > 0) return tiles;
        } catch (e) {}
        return this.fields;
    }

    getField(id) {
        return this.getAllFields().find(f => f.id === id) || null;
    }

    /**
     * شراء الأرض بـ 100 كوينز
     */
    purchaseField(fieldId) {
        const fields = this.getAllFields();
        const index = fields.findIndex(f => f.id === fieldId);

        if (index === -1) {
            Events.emit('land:purchase-failed', { fieldId, reason: 'not-found' });
            return { success: false, reason: 'not-found' };
        }

        const field = fields[index];
        if (field.purchased) {
            Events.emit('land:purchase-failed', { field, reason: 'already-purchased' });
            return { success: false, reason: 'already-purchased' };
        }

        let currentCoins = 350;
        try {
            currentCoins = GameState.get('player.coins') ?? 350;
        } catch (e) {}

        const price = field.price || LAND_CONFIG.fieldPrice;

        if (currentCoins < price) {
            Events.emit('land:purchase-failed', { field, price, currentCoins, reason: 'insufficient-funds' });
            return { success: false, reason: 'insufficient-funds', required: price, current: currentCoins };
        }

        // خصم الكوينز من GameState
        const remainingCoins = currentCoins - price;
        try {
            GameState.set('player.coins', remainingCoins);
        } catch (e) {}

        // تحديث حالة الأرض: تم الشراء ولكنها غير مجهزة بعد!
        field.purchased = true;
        field.prepared = false;
        field.prepProgress = 0;
        field.state = 'unprepared';
        fields[index] = field;

        try {
            GameState.set('farm.tiles', [...fields]);
            SaveManager.save();
        } catch (e) {}

        Events.emit('land:purchased', {
            field,
            cost: price,
            remainingCoins
        });

        return { success: true, field, cost: price };
    }

    /**
     * تجهيز الأرض بالفأس ضربة بضربة
     */
    strikeFieldWithAxe(fieldId) {
        const fields = this.getAllFields();
        const index = fields.findIndex(f => f.id === fieldId);
        if (index === -1) return { success: false };

        const field = fields[index];
        if (!field.purchased || field.prepared) return { success: false };

        const hitStep = Math.round(100 / LAND_CONFIG.hitsRequired);
        field.prepProgress = Math.min(100, (field.prepProgress || 0) + hitStep);

        const isFinished = field.prepProgress >= 100;
        if (isFinished) {
            field.prepared = true;
            field.state = 'empty'; // أصبحت الآن حقل خصب فارغ جاهز للزراعة
        }

        fields[index] = field;
        try {
            GameState.set('farm.tiles', [...fields]);
            SaveManager.save();
        } catch (e) {}

        Events.emit('land:axe-hit', {
            field,
            progress: field.prepProgress,
            isFinished
        });

        if (isFinished) {
            Events.emit('land:prepared', { field });
        }

        return { success: true, progress: field.prepProgress, isFinished };
    }
}

export const LandSystem = new LandSystemService();
