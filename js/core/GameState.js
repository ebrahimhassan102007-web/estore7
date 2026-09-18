/**
 * GameState.js — Single Source of Truth
 * Immutable state updates via structured clone.
 * Notifies subscribers on changes.
 */

import { Events } from './EventBus.js';

class GameStateManager {
    constructor() {
        this._state = this.getDefaultState();
        this._subscribers = new Map();
        this._history = [];
        this._maxHistory = 20;
        this._batching = false;
        this._pendingChanges = new Set();
    }

    getDefaultState() {
        return {
            player: {
                name: 'مزارع',
                level: 1,
                xp: 0,
                xpToNext: 100,
                coins: 350,
                gems: 10,
                energy: 50,
                maxEnergy: 50,
                energyLastRefill: Date.now(),
                createdAt: Date.now(),
                lastLogin: Date.now(),
                totalPlayTime: 0,
                language: 'ar'
            },

            farm: {
                name: 'مزرعة العمر',
                maxAnimals: 20,
                gridSize: {
                    rows: 4,
                    cols: 6
                },
                maxGridSize: {
                    rows: 12,
                    cols: 10
                },
                tiles: [],
                buildings: [],
                animals: [],
                decorations: [],
                expansions: 0,
                houseLevel: 1
            },

            inventory: {
                items: {},
                capacity: 50,
                maxCapacity: 50,
                upgrades: 0
            },

            // Hay Day Storage Separation: Silo (crops only) & Barn (goods, animal products, tools, supplies)
            storage: {
                silo: {
                    capacity: 50,
                    level: 1,
                    upgradeSupplies: { nail: 1, wood_plank: 1 }
                },
                barn: {
                    capacity: 50,
                    level: 1,
                    upgradeSupplies: { nail: 1, wood_plank: 1, duct_tape: 1 }
                }
            },

            crops: {
                active: [],
                harvested: 0
            },

            production: {
                queues: {},
                completed: 0
            },

            // مهام اللاعب — QuestSystem يملؤها من INITIAL_QUESTS عند أول تشغيل
            quests: {
                items: []
            },

            orders: {
                active: [],
                completed: 0,
                dailyCompleted: 0,
                lastRefresh: 0
            },

            market: {
                listings: [],
                myListings: [],
                lastUpdate: 0
            },

            social: {
                friends: [],
                friendRequests: [],
                giftsSentToday: 0,
                giftsReceivedToday: 0,
                lastGiftReset: Date.now()
            },

            events: {
                active: null,
                history: [],
                participated: []
            },

            missions: {
                daily: [],
                weekly: [],
                achievements: [],
                lastDailyReset: 0,
                lastWeeklyReset: 0
            },

            settings: {
                sfx: true,
                music: true,
                notifications: true,
                graphics: 'high',
                debug: false
            },

            stats: {
                totalHarvests: 0,
                totalSales: 0,
                totalSpent: 0,
                totalOrders: 0,
                maxLevelReached: 1,
                playSessions: 0,
                lastSave: 0
            },

            unlocked: {
                crops: ['wheat'],
                animals: [],
                buildings: ['barn'],
                areas: ['main_farm'],
                recipes: []
            },

            time: {
                gameTime: 0,
                lastTick: Date.now(),
                dayCycle: 0,
                // ساعة اللعبة داخل الحالة (1 يوم = 12 دقيقة حقيقية)
                hours: 8,
                minutes: 0,
                day: 1,
                season: 'spring'
            }
        };
    }

    get(path = null) {
        if (!path) {
            return this._clone(this._state);
        }

        const keys = path.split('.');
        let val = this._state;

        for (const key of keys) {
            if (val === undefined || val === null) {
                return undefined;
            }

            val = val[key];
        }

        return this._clone(val);
    }

    _getRaw(path = null) {
        if (!path) {
            return this._state;
        }

        const keys = path.split('.');
        let val = this._state;

        for (const key of keys) {
            if (val === undefined || val === null) {
                return undefined;
            }

            val = val[key];
        }

        return val;
    }

    set(path, value) {
        const keys = path.split('.');
        let target = this._state;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in target)) {
                target[keys[i]] = {};
            }

            target = target[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        const oldValue = target[lastKey];

        target[lastKey] = value;

        if (!this._batching) {
            this._notify(path, value, oldValue);
            Events.emit(
                'state:changed',
                path,
                value,
                oldValue
            );
        } else {
            this._pendingChanges.add(path);
        }

        return this;
    }

    merge(path, obj) {
        const current = this._getRaw(path) || {};
        const merged = {
            ...current,
            ...obj
        };

        this.set(path, merged);

        return this;
    }

    push(path, item) {
        const arr = this._getRaw(path) || [];

        arr.push(item);

        this.set(path, arr);

        return this;
    }

    remove(path, predicate) {
        const arr = this._getRaw(path) || [];

        const filtered = arr.filter(
            item => !predicate(item)
        );

        this.set(path, filtered);

        return this;
    }

    updateInArray(path, key, keyValue, updates) {
        const arr = this._getRaw(path) || [];

        const index = arr.findIndex(
            item => item[key] === keyValue
        );

        if (index !== -1) {
            arr[index] = {
                ...arr[index],
                ...updates
            };

            this.set(path, [...arr]);
        }

        return this;
    }

    batch(fn) {
        this._batching = true;

        try {
            fn(this);
        } finally {
            this._batching = false;

            for (const path of this._pendingChanges) {
                const value = this._getRaw(path);

                this._notify(
                    path,
                    value,
                    undefined
                );
            }

            Events.emit(
                'state:batch',
                Array.from(this._pendingChanges)
            );

            this._pendingChanges.clear();
        }

        return this;
    }

    subscribe(path, callback) {
        if (!this._subscribers.has(path)) {
            this._subscribers.set(
                path,
                new Set()
            );
        }

        this._subscribers
            .get(path)
            .add(callback);

        return () =>
            this._subscribers
                .get(path)
                ?.delete(callback);
    }

    _notify(path, newValue, oldValue) {
        if (this._subscribers.has(path)) {
            for (
                const callback
                of this._subscribers.get(path)
            ) {
                callback(
                    newValue,
                    oldValue,
                    path
                );
            }
        }

        const parts = path.split('.');
        let checkPath = '';

        for (
            let i = 0;
            i < parts.length - 1;
            i++
        ) {
            checkPath +=
                (i > 0 ? '.' : '') +
                parts[i];

            const wildcard =
                checkPath + '.*';

            if (
                this._subscribers.has(wildcard)
            ) {
                for (
                    const callback
                    of this._subscribers.get(wildcard)
                ) {
                    callback(
                        newValue,
                        oldValue,
                        path
                    );
                }
            }
        }
    }

    _clone(obj) {
        if (
            obj === null ||
            typeof obj !== 'object'
        ) {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(
                obj.getTime()
            );
        }

        if (Array.isArray(obj)) {
            return obj.map(
                item => this._clone(item)
            );
        }

        const cloned = {};

        for (const key in obj) {
            if (
                Object.prototype.hasOwnProperty.call(
                    obj,
                    key
                )
            ) {
                cloned[key] =
                    this._clone(obj[key]);
            }
        }

        return cloned;
    }

    snapshot() {
        return this._clone(
            this._state
        );
    }

    restore(snapshot) {
        this._state =
            this._clone(snapshot);

        Events.emit(
            'state:restored',
            this._state
        );
    }

    reset() {
        this._state =
            this.getDefaultState();

        Events.emit(
            'state:reset'
        );
    }
}

export const GameState =
    new GameStateManager();