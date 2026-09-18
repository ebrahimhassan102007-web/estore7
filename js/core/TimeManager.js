/**
 * TimeManager.js — Real-time & Offline Progression Engine
 * Handles game ticks, timers, offline calculation, day/night cycle.
 *
 * Locked Product Requirements:
 *   - Clock = device real time. 1 second = 1 second. 1 minute = 1 minute.
 *     1 day = 1 calendar day.
 *   - Anchor date: Friday 18 September 2026.
 *   - Seasons follow Northern Hemisphere / Egypt astronomy:
 *       • Summer until 23 September 2026 (autumn equinox)
 *       • Autumn: 23 September 2026 to 21 December 2026 (winter solstice)
 *       • Winter: 21 December 2026 to 20 March 2027 (spring equinox)
 *       • Spring: 20 March to 21 June (summer solstice)
 *   - Day/night lighting follows real clock hour (noon bright, dusk warm, night dark with lamps).
 */

import { Events } from './EventBus.js';
import { GameState } from './GameState.js';

const TICK_RATE = 1000;
const ENERGY_REFILL_MINUTES = 5;

/**
 * 1 day in game = 1 real calendar day (24 hours).
 */
export const DAY_LENGTH_MS = 24 * 60 * 60 * 1000;

/** Anchor calendar epoch: Friday 18 September 2026 */
export const ANCHOR_DATE = Object.freeze({
    year: 2026,
    month: 9, // September
    day: 18,
    dayNameAr: 'الجمعة',
    dayNameEn: 'Friday'
});

/**
 * Astronomical season calculation (Egypt / Northern Hemisphere).
 */
export function getAstronomicalSeason(d = new Date()) {
    const month = d.getMonth() + 1; // 1-12
    const day = d.getDate();

    // Summer: June 21 to September 22 (Autumn equinox is September 23)
    // Autumn: September 23 to December 20 (Winter solstice is December 21)
    // Winter: December 21 to March 19 (Spring equinox is March 20)
    // Spring: March 20 to June 20 (Summer solstice is June 21)
    if ((month === 3 && day >= 20) || (month > 3 && month < 6) || (month === 6 && day < 21)) {
        return 'spring';
    } else if ((month === 6 && day >= 21) || (month > 6 && month < 9) || (month === 9 && day < 23)) {
        return 'summer';
    } else if ((month === 9 && day >= 23) || (month > 9 && month < 12) || (month === 12 && day < 21)) {
        return 'autumn';
    } else {
        return 'winter';
    }
}

class TimeManager {
    constructor() {
        this._interval = null;
        this._lastTick = Date.now();
        this._running = false;
        this._callbacks = new Map();
        this._nextId = 1;
    }

    start() {
        if (this._running) return;

        this._running = true;
        this._lastTick = Date.now();

        // Process offline time immediately
        this._processOfflineTime();

        // Immediate first sync with real clock
        this._syncRealTimeClock();

        this._interval = setInterval(
            () => this._tick(),
            TICK_RATE
        );

        Events.emit('time:started');
    }

    stop() {
        this._running = false;

        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }

        Events.emit('time:stopped');
    }

    isRunning() {
        return this._running;
    }

    /**
     * Process time elapsed while game was closed
     */
    _processOfflineTime() {
        const lastTick =
            GameState.get('time.lastTick') ||
            Date.now();

        const now = Date.now();
        const elapsedMs = now - lastTick;

        if (elapsedMs > 5000) {
            const elapsedSec =
                Math.floor(elapsedMs / 1000);

            console.log(
                `[TimeManager] Offline time: ${elapsedSec}s`
            );

            // Notify crop systems
            Events.emit(
                'time:offline',
                elapsedSec
            );

            // Refill energy
            this._refillEnergyOffline(
                elapsedMs
            );

            // Animal production
            Events.emit(
                'animals:offline',
                elapsedSec
            );

            // Production queues
            Events.emit(
                'production:offline',
                elapsedSec
            );
        }

        GameState.set(
            'time.lastTick',
            now
        );
    }

    _refillEnergyOffline(elapsedMs) {
        const energyPerMs =
            1 /
            (
                ENERGY_REFILL_MINUTES *
                60 *
                1000
            );

        const energyToAdd =
            Math.floor(
                elapsedMs *
                energyPerMs
            );

        if (energyToAdd > 0) {
            const current =
                GameState.get(
                    'player.energy'
                );

            const max =
                GameState.get(
                    'player.maxEnergy'
                );

            const newEnergy =
                Math.min(
                    max,
                    current + energyToAdd
                );

            GameState.set(
                'player.energy',
                newEnergy
            );

            if (newEnergy > current) {
                Events.emit(
                    'energy:refilled',
                    newEnergy - current
                );
            }
        }
    }

    /**
     * Synchronize with device real-time clock & astronomical seasons.
     */
    _syncRealTimeClock() {
        const d = new Date();
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const seconds = d.getSeconds();

        // 0..1 progression through the 24h real day
        const dayProgress = (hours * 3600 + minutes * 60 + seconds) / 86400;

        // Anchor date calculation: Day 1 = Friday 18 September 2026
        const anchorMs = new Date(2026, 8, 18, 0, 0, 0).getTime(); // Note month 8 is September (0-indexed)
        const todayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
        const calendarDaysPassed = Math.max(0, Math.floor((todayStartMs - anchorMs) / (86400 * 1000)));
        const gameDay = 1 + calendarDaysPassed;

        const season = getAstronomicalSeason(d);

        GameState.set('time.dayCycle', dayProgress);
        GameState.set('time.hours', hours);
        GameState.set('time.minutes', minutes);
        GameState.set('time.seconds', seconds);
        GameState.set('time.day', gameDay);
        GameState.set('time.season', season);
    }

    _tick() {
        const now = Date.now();

        const dt =
            (now - this._lastTick) /
            1000;

        this._lastTick = now;

        const currentGameTime =
            GameState.get(
                'time.gameTime'
            ) || 0;

        GameState.set(
            'time.gameTime',
            currentGameTime + dt
        );

        GameState.set(
            'time.lastTick',
            now
        );

        // Active timers
        this._processTimers(now);

        // Energy
        this._tickEnergy(now);

        // Real-time Day/Night Sync
        this._syncRealTimeClock();

        // Global game tick
        Events.emit(
            'game:tick',
            dt,
            now
        );
    }

    _processTimers(now) {
        for (
            const [id, timer]
            of this._callbacks
        ) {
            if (now >= timer.endTime) {
                try {
                    timer.callback(
                        timer.data
                    );
                } catch (err) {
                    console.error(
                        `[TimeManager] Timer ${id} error:`,
                        err
                    );
                }

                this._callbacks.delete(id);

                Events.emit(
                    'timer:completed',
                    id,
                    timer.data
                );
            }
        }
    }

    _tickEnergy(now) {
        const lastRefill =
            GameState.get(
                'player.energyLastRefill'
            );

        const refillInterval =
            ENERGY_REFILL_MINUTES *
            60 *
            1000;

        if (
            now - lastRefill >=
            refillInterval
        ) {
            const current =
                GameState.get(
                    'player.energy'
                );

            const max =
                GameState.get(
                    'player.maxEnergy'
                );

            if (current < max) {
                GameState.set(
                    'player.energy',
                    current + 1
                );

                GameState.set(
                    'player.energyLastRefill',
                    now
                );

                Events.emit(
                    'energy:refilled',
                    1
                );
            } else {
                GameState.set(
                    'player.energyLastRefill',
                    now
                );
            }
        }
    }

    /* ========================================================
       CLOCK API — للمهام والواجهة ودورة النهار/الليل
       ======================================================== */

    /** @returns {{hours:number,minutes:number,day:number,dayProgress:number,season:string}} */
    getClock() {
        const d = new Date();
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const seconds = d.getSeconds();
        const dayProgress = (hours * 3600 + minutes * 60 + seconds) / 86400;

        return {
            hours,
            minutes,
            seconds,
            day: GameState.get('time.day') || 1,
            dayProgress,
            season: getAstronomicalSeason(d)
        };
    }

    /** "08:05 ص" — Arabic 12-hour formatted clock for HUD */
    getClockLabel() {
        const { hours, minutes } = this.getClock();
        const suffix = hours < 12 ? 'ص' : 'م';
        const h12 = ((hours + 11) % 12) + 1;
        return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
    }

    /** Weather / phase icon for HUD */
    getPhaseIcon() {
        const { hours } = this.getClock();
        if (hours >= 5 && hours < 8) return '🌅';
        if (hours >= 8 && hours < 17) return '☀️';
        if (hours >= 17 && hours < 20) return '🌇';
        return '🌙';
    }

    setTimer(durationMs, callback, data = {}) {
        const id = this._nextId++;
        this._callbacks.set(id, {
            endTime: Date.now() + durationMs,
            callback,
            data: { ...data, timerId: id, duration: durationMs }
        });
        Events.emit('timer:created', id, durationMs);
        return id;
    }

    clearTimer(id) {
        const existed = this._callbacks.delete(id);
        if (existed) Events.emit('timer:cancelled', id);
    }

    getRemaining(id) {
        const timer = this._callbacks.get(id);
        if (!timer) return 0;
        return Math.max(0, timer.endTime - Date.now());
    }

    static formatDuration(ms) {
        const sec = Math.floor(ms / 1000);
        const min = Math.floor(sec / 60);
        const hr = Math.floor(min / 60);
        if (hr > 0) return `${hr}h ${min % 60}m`;
        if (min > 0) return `${min}m ${sec % 60}s`;
        return `${sec}s`;
    }

    static formatSeconds(totalSec) {
        return TimeManager.formatDuration(totalSec * 1000);
    }
}

export const Time = new TimeManager();
export default Time;
