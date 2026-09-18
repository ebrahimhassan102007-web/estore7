/**
 * ============================================================
 * SaveManager.js — MY FARM 3D
 * Reliable Persistent Save System (IndexedDB Primary + LocalStorage Fallback)
 * ============================================================
 */
import { Events } from './EventBus.js';
import { GameState } from './GameState.js';

const SAVE_CONFIG = Object.freeze({
    key: 'myfarm_save_v2',
    metaKey: 'myfarm_meta_v2',
    dbName: 'MyFarmDB_v2',
    dbVersion: 1,
    storeName: 'saves',
    saveId: 'main_save',
    version: 2,
    autoSaveInterval: 20000 // ~20 ثانية (المطلوب في المواصفات)
});

/*
 * خطوات ترقية اختيارية: MIGRATIONS[إصدار الهدف]
 * كل خطوة تستقبل كائن الحفظ وترجّله.
 */
const MIGRATIONS = {
    2: (data) => {
        // مزارع قديمة: الحقول تحتاج posX/posZ لعرضها في العالم
        const fields = LAND_FIELDS_FALLBACK;
        if (data && Array.isArray(data.farm?.tiles) === false && data.farm) {
            data.farm.tiles = fields;
        }
        return data;
    }
};

/** 2 حقلان مجانيان في المنتصف — نفس LAND_CONFIG.fieldsLayout (base: true). */
const LAND_FIELDS_FALLBACK = [
    { id: 'field_center_left', posX: -3.8, posZ: -3.5, price: 100, purchased: true, prepared: true, prepProgress: 100, state: 'empty' },
    { id: 'field_center_right', posX: 3.8, posZ: -3.5, price: 100, purchased: true, prepared: true, prepProgress: 100, state: 'empty' }
];

class SaveManagerService {
    constructor() {
        this._db = null;
        this._initPromise = null;
        this._useIndexedDB = false;
        this._autoSaveTimer = null;
        this._pendingSave = false;
        this._autoSaveStarted = false;
        this._eventUnsubscribers = [];
        this._lifecycleHandlersInstalled = false;
        this._lastSaveTime = 0;
        this._saveInProgress = false;
        this._trailingTimer = null;
        this._rev = 0;
        this._isClosing = false;
    }

    /**
     * إعادة محاولة الحفظ بعد انتهاء الحفظ الجاري — تمنع ضياع آخر
     * ثوانٍ من التقدّم (حصاد ثم تحديث الصفحة فورًا).
     */
    _scheduleTrailingSave() {
        this._pendingSave = true;
        this._trailingSaves = (this._trailingSaves || 0);
        if (this._trailingTimer) return;
        this._trailingTimer = setTimeout(() => {
            this._trailingTimer = null;
            if (this._pendingSave) {
                this._pendingSave = false;
                this.save();
            }
        }, 120);
    }

    /* ========================================================
       DATABASE INITIALIZATION
       ======================================================== */
    async init() {
        if (this._useIndexedDB && this._db) {
            return true;
        }

        if (this._initPromise) {
            return this._initPromise;
        }

        this._initPromise = this._initIndexedDB();
        const success = await this._initPromise;
        this._initPromise = null;
        return success;
    }

    _initIndexedDB() {
        return new Promise((resolve) => {
            if (typeof window === 'undefined' || !window.indexedDB) {
                console.warn('[SaveManager] IndexedDB is not supported in this environment. Falling back to localStorage.');
                this._useIndexedDB = false;
                resolve(false);
                return;
            }

            let request;
            try {
                request = window.indexedDB.open(SAVE_CONFIG.dbName, SAVE_CONFIG.dbVersion);
            } catch (err) {
                const msg = err?.message || err?.name || String(err);
                console.warn(`[SaveManager] IndexedDB open failed directly (${msg}). Falling back to localStorage.`);
                this._useIndexedDB = false;
                resolve(false);
                return;
            }

            request.onupgradeneeded = (event) => {
                try {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(SAVE_CONFIG.storeName)) {
                        db.createObjectStore(SAVE_CONFIG.storeName, { keyPath: 'id' });
                        console.log(`[SaveManager] Object store '${SAVE_CONFIG.storeName}' created successfully.`);
                    }
                } catch (upgradeErr) {
                    console.error('[SaveManager] Error during IndexedDB upgrade:', upgradeErr);
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;

                // التحقق من وجود الـ Object Store المطلوب
                if (!db.objectStoreNames.contains(SAVE_CONFIG.storeName)) {
                    console.warn(`[SaveManager] Database opened but store '${SAVE_CONFIG.storeName}' is missing. Resetting version...`);
                    db.close();
                    this._useIndexedDB = false;
                    resolve(false);
                    return;
                }

                this._db = db;
                this._useIndexedDB = true;
                this._isClosing = false;

                db.onversionchange = () => {
                    console.warn('[SaveManager] IndexedDB version changed from another tab. Closing connection.');
                    this._isClosing = true;
                    db.close();
                    this._db = null;
                    this._useIndexedDB = false;
                };

                db.onerror = (dbEvent) => {
                    const error = dbEvent.target?.error;
                    console.error('[SaveManager] Internal IndexedDB error:', error?.message || error?.name || error);
                };

                console.log('[SaveManager] IndexedDB initialized and ready.');
                resolve(true);
            };

            request.onerror = (event) => {
                const error = event.target?.error;
                const errorName = error?.name || 'UnknownError';
                const errorMsg = error?.message || 'Permission denied or quota exceeded';
                console.warn(`[SaveManager] IndexedDB unavailable: [${errorName}] ${errorMsg}. Falling back to localStorage.`);
                this._db = null;
                this._useIndexedDB = false;
                resolve(false);
            };

            request.onblocked = () => {
                console.warn('[SaveManager] IndexedDB open request blocked by another tab.');
                resolve(false);
            };
        });
    }

    /* ========================================================
       SAVE IMPLEMENTATION
       ======================================================== */
    /**
     * الحفظ المطلوب أثناء وجود حفظٍ جارٍ كان يُسقط اللقطة الأحدث
     * (الحفظ القديم يصفّر _pendingSave عند انتهائه) — لذلك نتتبّع
     * رقمًا تسلسليًا للتغييرات ونعيد المحاولة إذا تغيّرت الحالة أثناء
     * الكتابة. ونلتقط اللقطة بعد تجهيز القاعدة لنكتب أدقّ حالة ممكنة.
     */
    async save() {
        const revAtEntry = ++this._rev;

        if (this._saveInProgress) {
            this._scheduleTrailingSave();
            return false;
        }

        this._saveInProgress = true;

        try {
            // محاولة الحفظ في IndexedDB أولاً — التجهيز قبل الالتقاط
            let idbSuccess = false;
            await this.init();

            const snapshot = GameState.snapshot();
            const jsonData = JSON.stringify(snapshot);
            const meta = {
                version: SAVE_CONFIG.version,
                timestamp: Date.now(),
                checksum: this._checksum(jsonData)
            };

            const payload = {
                meta,
                data: snapshot
            };
            const jsonPayload = JSON.stringify(payload);

            if (this._useIndexedDB && this._db && !this._isClosing) {
                try {
                    await this._saveToIndexedDB(jsonPayload);
                    idbSuccess = true;
                } catch (idbErr) {
                    const errDetail = idbErr?.message || idbErr?.name || String(idbErr);
                    console.warn(`[SaveManager] IndexedDB save failed (${errDetail}), using localStorage.`);
                    this._useIndexedDB = false;
                }
            }

            // Fallback دائم أو أساسي في localStorage
            try {
                localStorage.setItem(SAVE_CONFIG.key, jsonPayload);
                localStorage.setItem(SAVE_CONFIG.metaKey, JSON.stringify(meta));
            } catch (storageErr) {
                if (!idbSuccess) {
                    throw storageErr; // إذا فشل الاثنان نُطلق الخطأ
                }
            }

            this._lastSaveTime = meta.timestamp;

            // تغيّرت الحالة أثناء الكتابة؟ نحفظ مجددًا حتى لا يضيع شيء
            if (this._rev !== revAtEntry) {
                this._scheduleTrailingSave();
            } else {
                this._pendingSave = false;
            }

            GameState.set('stats.lastSave', meta.timestamp);
            Events.emit('save:success', meta);
            console.log(`[SaveManager] Save successful via ${idbSuccess ? 'IndexedDB' : 'localStorage fallback'}.`);
            return true;
        } catch (error) {
            const msg = error?.message || error?.name || String(error);
            console.error(`[SaveManager] Save completely failed: ${msg}`);
            this._pendingSave = true;
            this._scheduleTrailingSave();
            Events.emit('save:error', error);
            return false;
        } finally {
            this._saveInProgress = false;
        }
    }

    _saveToIndexedDB(jsonString) {
        return new Promise((resolve, reject) => {
            if (!this._db || this._isClosing) {
                reject(new Error('IndexedDB instance is closed or unready'));
                return;
            }

            let transaction;
            try {
                transaction = this._db.transaction([SAVE_CONFIG.storeName], 'readwrite');
            } catch (err) {
                reject(err);
                return;
            }

            const store = transaction.objectStore(SAVE_CONFIG.storeName);
            const record = {
                id: SAVE_CONFIG.saveId,
                data: jsonString,
                timestamp: Date.now()
            };

            const putRequest = store.put(record);

            putRequest.onerror = (e) => {
                reject(e.target?.error || new Error('Put request failed'));
            };

            transaction.oncomplete = () => {
                resolve(true);
            };

            transaction.onerror = (e) => {
                reject(e.target?.error || new Error('Transaction error'));
            };

            transaction.onabort = (e) => {
                reject(e.target?.error || new Error('Transaction aborted'));
            };
        });
    }

    /* ========================================================
       LOAD IMPLEMENTATION
       ======================================================== */
    async load() {
        try {
            await this.init();
            let jsonString = null;

            // 1. IndexedDB
            let fromIdb = null;
            if (this._useIndexedDB && this._db && !this._isClosing) {
                try {
                    fromIdb = await this._loadFromIndexedDB();
                } catch (idbLoadErr) {
                    console.warn('[SaveManager] IndexedDB load failed, trying localStorage fallback...', idbLoadErr);
                }
            }

            // 2. localStorage — على iOS قد يكون الأحدث لأن الحفظ المتزامن
            //    عند قبل unload يكتب هنا فقط (IndexedDB لا يكمل أثناء الإغلاق).
            let fromLs = null;
            try {
                fromLs = localStorage.getItem(SAVE_CONFIG.key);
            } catch (lsErr) {
                console.warn('[SaveManager] localStorage read failed:', lsErr);
            }

            jsonString = this._newestPayload(fromIdb, fromLs);

            if (jsonString) {
                console.log('[SaveManager] Save data loaded.');
            }

            if (!jsonString) {
                console.log('[SaveManager] No previous save found. Starting fresh game.');
                Events.emit('save:notfound');
                return false;
            }

            const payload = JSON.parse(jsonString);
            if (!this._validatePayload(payload)) {
                console.warn('[SaveManager] Save payload format invalid.');
                Events.emit('save:invalid');
                return false;
            }

            const validation = this._validateChecksum(payload);
            if (!validation.valid) {
                console.warn('[SaveManager] Checksum mismatch detected, attempting data recovery.');
                Events.emit('save:corrupted', payload.meta);
            }

            // التحقق من إصدار الحفظ
            if (payload.meta.version > SAVE_CONFIG.version) {
                console.error('[SaveManager] Save belongs to a newer game version.');
                Events.emit('save:futureVersion', payload.meta);
                return false;
            }

            if (payload.meta.version < SAVE_CONFIG.version) {
                console.log('[SaveManager] Migrating older save format...');
                payload.data = this._migrate(payload.data, payload.meta.version);
                Events.emit('save:migrated');
            }

            /*
             * حتى مع تطابق الإصدار قد تضيف نسخة جديدة مفاتيح غير موجودة
             * في الحفظ (مثل time.day أو farm.maxAnimals). نملأ الناقص من
             * الحالة الافتراضية دون أي مساس بتقدّم اللاعب.
             */
            payload.data = this._migrate(payload.data, payload.meta.version);

            GameState.restore(payload.data);
            this._lastSaveTime = payload.meta.timestamp;
            Events.emit('save:loaded', payload.meta);
            console.log('[SaveManager] GameState successfully restored.');
            return true;
        } catch (error) {
            console.error('[SaveManager] Load failed with exception:', error?.message || error);
            Events.emit('save:error', error);
            return false;
        }
    }

    /** يقارن meta.timestamp بين مخزنين ويرجع الأحدث (أو أيهما صالح). */
    _newestPayload(a, b) {
        const stamp = (raw) => {
            if (!raw) return -1;
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return Number(parsed?.meta?.timestamp) || -1;
            } catch (e) {
                return -1;
            }
        };

        const ta = stamp(a);
        const tb = stamp(b);

        if (ta < 0 && tb < 0) return a || b || null;
        return tb > ta ? b : a;
    }

    _loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!this._db || this._isClosing) {
                resolve(null);
                return;
            }

            let transaction;
            try {
                transaction = this._db.transaction([SAVE_CONFIG.storeName], 'readonly');
            } catch (err) {
                reject(err);
                return;
            }

            const store = transaction.objectStore(SAVE_CONFIG.storeName);
            const request = store.get(SAVE_CONFIG.saveId);

            request.onsuccess = () => {
                resolve(request.result ? request.result.data : null);
            };

            request.onerror = (e) => {
                reject(e.target?.error || new Error('Get request failed'));
            };
        });
    }

    /* ========================================================
       AUTO SAVE & LIFECYCLE
       ======================================================== */
    startAutoSave() {
        if (this._autoSaveStarted) return;
        this._autoSaveStarted = true;

        this.init();

        this._autoSaveTimer = setInterval(() => {
            if (this._pendingSave) {
                this._pendingSave = false;
                this.save();
            }
        }, SAVE_CONFIG.autoSaveInterval);

        this._eventUnsubscribers.push(
            Events.on('state:changed', () => this.markDirty()),
            Events.on('state:batch', () => this.markDirty()),
            Events.on('player:levelup', () => this.save()),
            Events.on('order:completed', () => this.markDirty()),
            Events.on('crop:planted', () => this.markDirty()),
            Events.on('crop:harvested', () => this.save()),
            Events.on('land:purchased', () => this.save()),
            Events.on('land:prepared', () => this.save()),
            // حفظ فوري لقائمة الإنتاج (بدء/استلام/إلغاء)
            Events.on('production:started', () => this.save()),
            Events.on('production:completed', () => this.save()),
            Events.on('production:cancelled', () => this.save())
        );

        this._installLifecycleHandlers();
        console.log('[SaveManager] Auto-save service started.');
    }

    stopAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
        this._eventUnsubscribers.forEach((fn) => {
            try { fn(); } catch {}
        });
        this._eventUnsubscribers = [];
        this._autoSaveStarted = false;
    }

    markDirty() {
        this._pendingSave = true;
        this._rev = (this._rev || 0) + 1;
    }

    _installLifecycleHandlers() {
        if (this._lifecycleHandlersInstalled) return;
        this._lifecycleHandlersInstalled = true;

        const flush = () => this._saveToLocalStorageSync();

        window.addEventListener('beforeunload', flush);
        // iOS Safari لا يضمن beforeunload — pagehide هو الموثوق على الجوال
        window.addEventListener('pagehide', flush);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.save();
            }
        });
    }

    _saveToLocalStorageSync() {
        try {
            const snapshot = GameState.snapshot();
            const jsonData = JSON.stringify(snapshot);
            const meta = {
                version: SAVE_CONFIG.version,
                timestamp: Date.now(),
                checksum: this._checksum(jsonData)
            };
            const payload = { meta, data: snapshot };
            localStorage.setItem(SAVE_CONFIG.key, JSON.stringify(payload));
            localStorage.setItem(SAVE_CONFIG.metaKey, JSON.stringify(meta));
        } catch (e) {
            console.warn('[SaveManager] Emergency sync save failed:', e);
        }
    }

    /* ========================================================
       VALIDATION & UTILITIES
       ======================================================== */
    _validatePayload(payload) {
        return !!(
            payload &&
            typeof payload === 'object' &&
            payload.meta &&
            payload.data &&
            typeof payload.meta.version === 'number' &&
            typeof payload.meta.timestamp === 'number' &&
            typeof payload.meta.checksum === 'string'
        );
    }

    _validateChecksum(payload) {
        const jsonData = JSON.stringify(payload.data);
        const checksum = this._checksum(jsonData);
        return {
            valid: checksum === payload.meta.checksum,
            expected: payload.meta.checksum,
            actual: checksum
        };
    }

    /**
     * ترقية الحفظ القديم إلى الشكل الحالي:
     *  1) خطوات ترقية مخصّصة لكل إصدار (حاليًا: ملء الحقول للمزارع القديمة).
     *  2) دمج عميق مع الحالة الافتراضية — المفاتيح الناقصة تُضاف،
     *     وقيم اللاعب المحفوظة تنتصر دائمًا (لا نعيد ضبط تقدّم أحد).
     */
    _migrate(data, fromVersion = 0) {
        let source = (data && typeof data === 'object') ? data : {};

        try {
            for (let v = fromVersion; v < SAVE_CONFIG.version; v++) {
                const step = MIGRATIONS[v + 1];
                if (typeof step === 'function') {
                    source = step(source) || source;
                }
            }
        } catch (err) {
            console.warn('[SaveManager] Migration step failed, keeping saved data as-is:', err);
        }

        return this._fillDefaults(GameState.getDefaultState(), source);
    }

    /**
     * Merge defaults <- saved.  Objects recurse, arrays & scalars come
     * from the save (an empty saved array is still a valid player choice).
     */
    _fillDefaults(defaults, saved) {
        if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
            return saved === undefined ? defaults : saved;
        }
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
            return saved === undefined ? defaults : { ...defaults, ...(saved || {}) };
        }

        const out = { ...saved };

        for (const key of Object.keys(defaults)) {
            const defVal = defaults[key];
            const curVal = out[key];

            if (curVal === undefined) {
                out[key] = defVal;
                continue;
            }

            if (
                defVal && typeof defVal === 'object' && !Array.isArray(defVal) &&
                curVal && typeof curVal === 'object' && !Array.isArray(curVal)
            ) {
                out[key] = this._fillDefaults(defVal, curVal);
            }
        }

        return out;
    }

    _checksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(16);
    }

    async reset() {
        try {
            localStorage.removeItem(SAVE_CONFIG.key);
            localStorage.removeItem(SAVE_CONFIG.metaKey);

            await this.init();
            if (this._useIndexedDB && this._db) {
                await new Promise((resolve, reject) => {
                    const tx = this._db.transaction([SAVE_CONFIG.storeName], 'readwrite');
                    tx.objectStore(SAVE_CONFIG.storeName).delete(SAVE_CONFIG.saveId);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                });
            }

            GameState.reset();
            this._pendingSave = false;
            this._lastSaveTime = 0;
            Events.emit('save:reset');
            return true;
        } catch (error) {
            console.error('[SaveManager] Reset failed:', error);
            Events.emit('save:resetError', error);
            return false;
        }
    }
}

export const SaveManager = new SaveManagerService();
