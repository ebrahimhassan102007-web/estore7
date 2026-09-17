/**
 * TimeManager.js — Real-time & Offline Progression Engine
 * Handles game ticks, timers, offline calculation, day/night cycle.
 */

import { Events } from './EventBus.js';
import { GameState } from './GameState.js';

const TICK_RATE = 1000;
const ENERGY_REFILL_MINUTES = 5;

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

            // Day/night cycle
            this._advanceDayCycle(
                elapsedMs
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

    _advanceDayCycle(elapsedMs) {
        // One complete game day = 24 real minutes
        const dayLength =
            24 *
            60 *
            60 *
            1000;

        const current =
            GameState.get(
                'time.dayCycle'
            ) || 0;

        const advance =
            (elapsedMs % dayLength) /
            dayLength;

        const newCycle =
            (current + advance) % 1;

        GameState.set(
            'time.dayCycle',
            newCycle
        );

        // Four seasons, each lasting 7 days
        const seasons = [
            'spring',
            'summer',
            'autumn',
            'winter'
        ];

        const dayOfYear =
            Math.floor(
                Date.now() /
                (
                    1000 *
                    60 *
                    60 *
                    24
                )
            );

        const seasonIndex =
            Math.floor(
                (dayOfYear % 28) / 7
            );

        GameState.set(
            'time.season',
            seasons[seasonIndex]
        );
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

        // Day/night
        this._tickDayCycle(dt);

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
                // Keep timestamp fresh when energy is full
                GameState.set(
                    'player.energyLastRefill',
                    now
                );
            }
        }
    }

    _tickDayCycle(dt) {
        // One game day = 24 real minutes
        const dayLength =
            24 *
            60 *
            60 *
            1000;

        const advance =
            (dt * 1000) /
            dayLength;

        const current =
            GameState.get(
                'time.dayCycle'
            ) || 0;

        const newCycle =
            (current + advance) % 1;

        GameState.set(
            'time.dayCycle',
            newCycle
        );

        const oldHour =
            Math.floor(
                current * 24
            );

        const newHour =
            Math.floor(
                newCycle * 24
            );

        if (oldHour !== newHour) {
            Events.emit(
                'time:hour',
                newHour
            );
        }
    }

    /**
     * Create a timer that fires after duration
     */
    setTimer(
        durationMs,
        callback,
        data = {}
    ) {
        const id =
            this._nextId++;

        this._callbacks.set(
            id,
            {
                endTime:
                    Date.now() +
                    durationMs,

                callback,

                data: {
                    ...data,
                    timerId: id,
                    duration: durationMs
                }
            }
        );

        Events.emit(
            'timer:created',
            id,
            durationMs
        );

        return id;
    }

    /**
     * Cancel a timer
     */
    clearTimer(id) {
        const existed =
            this._callbacks.delete(id);

        if (existed) {
            Events.emit(
                'timer:cancelled',
                id
            );
        }
    }

    /**
     * Get remaining time
     */
    getRemaining(id) {
        const timer =
            this._callbacks.get(id);

        if (!timer) {
            return 0;
        }

        return Math.max(
            0,
            timer.endTime -
            Date.now()
        );
    }

    /**
     * Format milliseconds
     */
    static formatDuration(ms) {
        const sec =
            Math.floor(ms / 1000);

        const min =
            Math.floor(sec / 60);

        const hr =
            Math.floor(min / 60);

        if (hr > 0) {
            return `${hr}h ${min % 60}m`;
        }

        if (min > 0) {
            return `${min}m ${sec % 60}s`;
        }

        return `${sec}s`;
    }

    /**
     * Format seconds
     */
    static formatSeconds(totalSec) {
        return TimeManager.formatDuration(
            totalSec * 1000
        );
    }
}

export const Time =
    new TimeManager();