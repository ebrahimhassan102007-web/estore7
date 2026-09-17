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
    autoSaveInterval: 15000 // 15 ثانية
});

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
        this._isClosing = false;
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
    async save() {
        if (this._saveInProgress) {
            this._pendingSave = true;
            return false;
        }

        this._saveInProgress = true;

        try {
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

            // محاولة الحفظ في IndexedDB أولاً
            let idbSuccess = false;
            await this.init();

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
            this._pendingSave = false;

            GameState.set('stats.lastSave', meta.timestamp);
            Events.emit('save:success', meta);
            console.log(`[SaveManager] Save successful via ${idbSuccess ? 'IndexedDB' : 'localStorage fallback'}.`);
            return true;
        } catch (error) {
            const msg = error?.message || error?.name || String(error);
            console.error(`[SaveManager] Save completely failed: ${msg}`);
            this._pendingSave = true;
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

            // 1. محاولة القراءة من IndexedDB
            if (this._useIndexedDB && this._db && !this._isClosing) {
                try {
                    jsonString = await this._loadFromIndexedDB();
                    if (jsonString) {
                        console.log('[SaveManager] Save data loaded from IndexedDB.');
                    }
                } catch (idbLoadErr) {
                    console.warn('[SaveManager] IndexedDB load failed, trying localStorage fallback...', idbLoadErr);
                }
            }

            // 2. Fallback إلى localStorage إذا لم توجد بيانات في IndexedDB
            if (!jsonString) {
                try {
                    jsonString = localStorage.getItem(SAVE_CONFIG.key);
                    if (jsonString) {
                        console.log('[SaveManager] Save data loaded from localStorage.');
                    }
                } catch (lsErr) {
                    console.warn('[SaveManager] localStorage read failed:', lsErr);
                }
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
    }

    _installLifecycleHandlers() {
        if (this._lifecycleHandlersInstalled) return;
        this._lifecycleHandlersInstalled = true;

        window.addEventListener('beforeunload', () => {
            this._saveToLocalStorageSync();
        });

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

    _migrate(data, fromVersion) {
        return data && typeof data === 'object' ? data : {};
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
