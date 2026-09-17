/**
 * EventSystem.js — Seasonal Events & Leaderboards
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { uuid, randPick, randInt } from '../utils/Utils.js';

const EVENT_TYPES = {
    harvest: {
        name: 'مهرجان الحصاد',
        icon: '🌾',
        duration: 86400 * 3
    },

    production: {
        name: 'سباق الإنتاج',
        icon: '🏭',
        duration: 86400 * 2
    },

    animal: {
        name: 'يوم الحيوانات',
        icon: '🐄',
        duration: 86400 * 2
    },

    delivery: {
        name: 'تحدي التوصيل',
        icon: '🚚',
        duration: 86400
    }
};

class EventSystem {

    constructor() {
        this._checkActiveEvent();
    }

    /**
     * Start a seasonal event.
     */
    startEvent(type) {

        const eventDef = EVENT_TYPES[type];

        if (!eventDef) {
            return {
                success: false,
                error: 'Invalid event type'
            };
        }

        const existing =
            GameState.get('events.active');

        if (existing) {
            return {
                success: false,
                error: 'Another event is already active'
            };
        }

        const now = Date.now();

        const event = {
            id: uuid(),
            type,
            name: eventDef.name,
            icon: eventDef.icon,

            startedAt: now,
            endsAt:
                now +
                eventDef.duration * 1000,

            missions:
                this._generateMissions(type),

            progress: {},

            rewards: [],

            completed: false
        };

        GameState.set(
            'events.active',
            event
        );

        Events.emit(
            'event:started',
            event
        );

        return {
            success: true,
            event
        };
    }

    /**
     * Generate missions for event.
     */
    _generateMissions(type) {

        switch (type) {

            case 'harvest':

                return [
                    {
                        id: 'h1',
                        description:
                            'حصاد 50 قمح',
                        target: 50,
                        type: 'harvest',
                        item: 'wheat',
                        reward: {
                            coins: 500,
                            xp: 200
                        }
                    },

                    {
                        id: 'h2',
                        description:
                            'حصاد 30 ذرة',
                        target: 30,
                        type: 'harvest',
                        item: 'corn',
                        reward: {
                            coins: 400,
                            xp: 150
                        }
                    }
                ];

            case 'production':

                return [
                    {
                        id: 'p1',
                        description:
                            'إنتاج 20 دقيق',
                        target: 20,
                        type: 'produce',
                        item: 'flour',
                        reward: {
                            coins: 600,
                            xp: 250
                        }
                    },

                    {
                        id: 'p2',
                        description:
                            'إنتاج 10 خبز',
                        target: 10,
                        type: 'produce',
                        item: 'bread',
                        reward: {
                            coins: 800,
                            xp: 300
                        }
                    }
                ];

            case 'animal':

                return [
                    {
                        id: 'a1',
                        description:
                            'جمع 20 بيض',
                        target: 20,
                        type: 'collect',
                        item: 'egg',
                        reward: {
                            coins: 300,
                            xp: 100
                        }
                    },

                    {
                        id: 'a2',
                        description:
                            'جمع 15 حليب',
                        target: 15,
                        type: 'collect',
                        item: 'milk',
                        reward: {
                            coins: 450,
                            xp: 150
                        }
                    }
                ];

            case 'delivery':

                return [
                    {
                        id: 'd1',
                        description:
                            'إكمال 5 طلبات',
                        target: 5,
                        type: 'order',
                        item: 'any',
                        reward: {
                            coins: 700,
                            xp: 250
                        }
                    }
                ];

            default:
                return [];
        }
    }

    /**
     * Report progress.
     */
    reportProgress(
        actionType,
        itemId,
        amount = 1
    ) {

        const event =
            GameState.get(
                'events.active'
            );

        if (!event) return;

        if (Date.now() >= event.endsAt) {
            this._endEvent(event);
            return;
        }

        let changed = false;

        for (const mission of event.missions) {

            const itemMatches =
                mission.item === 'any' ||
                mission.item === itemId;

            const typeMatches =
                mission.type === actionType;

            if (
                typeMatches &&
                itemMatches &&
                !mission.completed
            ) {

                if (
                    !event.progress[
                        mission.id
                    ]
                ) {
                    event.progress[
                        mission.id
                    ] = 0;
                }

                event.progress[
                    mission.id
                ] += amount;

                changed = true;

                if (
                    event.progress[
                        mission.id
                    ] >= mission.target
                ) {

                    event.progress[
                        mission.id
                    ] = mission.target;

                    mission.completed = true;

                    this._completeMission(
                        event,
                        mission
                    );
                }
            }
        }

        if (changed) {
            GameState.set(
                'events.active',
                {
                    ...event,
                    progress: {
                        ...event.progress
                    },
                    missions:
                        [...event.missions]
                }
            );

            Events.emit(
                'event:progress',
                event
            );
        }
    }

    /**
     * Complete mission and give reward.
     */
    _completeMission(
        event,
        mission
    ) {

        const reward =
            mission.reward || {};

        if (reward.coins) {

            GameState.set(
                'player.coins',
                GameState.get(
                    'player.coins'
                ) + reward.coins
            );
        }

        if (reward.xp) {

            Events.emit(
                'xp:gain',
                reward.xp,
                'event'
            );
        }

        Events.emit(
            'event:missionCompleted',
            event.id,
            mission.id,
            reward
        );
    }

    /**
     * Check active event.
     */
    _checkActiveEvent() {

        const event =
            GameState.get(
                'events.active'
            );

        if (
            event &&
            Date.now() >= event.endsAt
        ) {
            this._endEvent(event);
        }
    }

    /**
     * End event.
     */
    _endEvent(event) {

        const history =
            GameState.get(
                'events.history'
            ) || [];

        GameState.set(
            'events.history',
            [
                ...history,
                {
                    ...event,
                    endedAt: Date.now()
                }
            ]
        );

        GameState.set(
            'events.active',
            null
        );

        Events.emit(
            'event:ended',
            event
        );
    }

    /**
     * Get leaderboard.
     */
    getLeaderboard(
        type = 'level'
    ) {

        const player = {
            id: 'player',

            name:
                GameState.get(
                    'player.name'
                ),

            level:
                GameState.get(
                    'player.level'
                ),

            coins:
                GameState.get(
                    'player.coins'
                ),

            xp:
                GameState.get(
                    'player.xp'
                ),

            isPlayer: true
        };

        const names = [
            'أحمد',
            'سارة',
            'خالد',
            'نورة',
            'عمر',
            'ليلى',
            'يوسف',
            'فاطمة',
            'محمود'
        ];

        const aiEntries = [];

        for (
            let i = 0;
            i < names.length;
            i++
        ) {

            aiEntries.push({

                id:
                    `ai_lb_${i}`,

                name:
                    names[i],

                level:
                    randPick([
                        3,
                        5,
                        8,
                        12,
                        15,
                        20,
                        25,
                        30,
                        35
                    ]),

                coins:
                    randPick([
                        500,
                        1500,
                        5000,
                        12000,
                        25000
                    ]),

                xp:
                    randPick([
                        100,
                        500,
                        2000,
                        8000,
                        20000
                    ]),

                isPlayer: false
            });
        }

        const all = [
            ...aiEntries,
            player
        ];

        all.sort((a, b) => {

            if (type === 'level') {
                return b.level - a.level;
            }

            if (type === 'coins') {
                return b.coins - a.coins;
            }

            if (type === 'xp') {
                return b.xp - a.xp;
            }

            return 0;
        });

        return all.map(
            (entry, index) => ({
                ...entry,
                rank: index + 1
            })
        );
    }

    /**
     * Get active event.
     */
    getActiveEvent() {

        return GameState.get(
            'events.active'
        );
    }

    /**
     * Get event history.
     */
    getHistory() {

        return GameState.get(
            'events.history'
        ) || [];
    }

    /**
     * Get available event types.
     */
    getEventTypes() {

        return {
            ...EVENT_TYPES
        };
    }
}

export const EventSystem =
    new EventSystem();