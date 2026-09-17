/**
 * SocialSystem.js — Friends, Visits, Gifts
 * Offline simulation with architecture ready for online backend.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { ECONOMY } from '../data/GameData.js';
import { uuid, randPick } from '../utils/Utils.js';

class SocialSystemService {

    constructor() {
        this._initAIPlayers();
    }

    _initAIPlayers() {
        const friends =
            GameState.get('social.friends') || [];

        if (friends.length === 0) {

            const aiPlayers = [
                {
                    id: 'ai_1',
                    name: 'أحمد المزارع',
                    level: 5,
                    farmName: 'مزرعة النخيل',
                    avatar: '👨‍🌾',
                    lastActive: Date.now(),
                    giftsReceived: 0,
                    giftsSent: 0
                },
                {
                    id: 'ai_2',
                    name: 'سارة الزاهية',
                    level: 8,
                    farmName: 'حديقة الورود',
                    avatar: '👩‍🌾',
                    lastActive: Date.now(),
                    giftsReceived: 0,
                    giftsSent: 0
                },
                {
                    id: 'ai_3',
                    name: 'خالد البناء',
                    level: 12,
                    farmName: 'مزرعة العظماء',
                    avatar: '👷‍♂️',
                    lastActive: Date.now(),
                    giftsReceived: 0,
                    giftsSent: 0
                },
                {
                    id: 'ai_4',
                    name: 'نورة الحصادة',
                    level: 3,
                    farmName: 'بساتين نورة',
                    avatar: '👩‍🌾',
                    lastActive: Date.now(),
                    giftsReceived: 0,
                    giftsSent: 0
                }
            ];

            GameState.set(
                'social.friends',
                aiPlayers
            );
        }
    }

    /**
     * Add a friend.
     */
    addFriend(playerId, name, level = 1) {

        if (!playerId || !name) {
            return {
                success: false,
                error: 'Invalid player'
            };
        }

        const friends =
            GameState.get('social.friends') || [];

        if (
            friends.length >=
            ECONOMY.maxFriends
        ) {
            return {
                success: false,
                error: 'Friends list full'
            };
        }

        if (
            friends.some(
                friend => friend.id === playerId
            )
        ) {
            return {
                success: false,
                error: 'Already friends'
            };
        }

        const friend = {
            id: playerId,
            name,
            level,
            farmName: `مزرعة ${name}`,
            avatar: '👤',
            lastActive: Date.now(),
            giftsReceived: 0,
            giftsSent: 0
        };

        friends.push(friend);

        GameState.set(
            'social.friends',
            [...friends]
        );

        Events.emit(
            'social:friendAdded',
            friend
        );

        return {
            success: true,
            friend
        };
    }

    /**
     * Remove a friend.
     */
    removeFriend(playerId) {

        const friends =
            GameState.get('social.friends') || [];

        const filtered =
            friends.filter(
                friend => friend.id !== playerId
            );

        if (
            filtered.length ===
            friends.length
        ) {
            return {
                success: false,
                error: 'Friend not found'
            };
        }

        GameState.set(
            'social.friends',
            filtered
        );

        Events.emit(
            'social:friendRemoved',
            playerId
        );

        return {
            success: true
        };
    }

    /**
     * Send a gift to a friend.
     */
    sendGift(
        friendId,
        itemId,
        amount = 1
    ) {

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return {
                success: false,
                error: 'Invalid amount'
            };
        }

        amount = Math.floor(amount);

        const friends =
            GameState.get('social.friends') || [];

        const friend =
            friends.find(
                f => f.id === friendId
            );

        if (!friend) {
            return {
                success: false,
                error: 'Friend not found'
            };
        }

        const sentToday =
            GameState.get(
                'social.giftsSentToday'
            ) || 0;

        if (
            sentToday >=
            ECONOMY.dailyGiftsLimit
        ) {
            return {
                success: false,
                error: 'Daily gift limit reached'
            };
        }

        const inventory =
            GameState.get(
                'inventory.items'
            ) || {};

        if (
            !inventory[itemId] ||
            inventory[itemId].count < amount
        ) {
            return {
                success: false,
                error: 'Not enough items'
            };
        }

        /*
         * Remove gift from player's inventory.
         */
        inventory[itemId].count -= amount;

        if (
            inventory[itemId].count <= 0
        ) {
            delete inventory[itemId];
        }

        GameState.set(
            'inventory.items',
            { ...inventory }
        );

        GameState.set(
            'social.giftsSentToday',
            sentToday + 1
        );

        friend.giftsSent =
            (friend.giftsSent || 0) + 1;

        GameState.set(
            'social.friends',
            [...friends]
        );

        Events.emit(
            'social:giftSent',
            friendId,
            itemId,
            amount
        );

        /*
         * Simulate AI receiving the gift.
         */
        setTimeout(() => {

            Events.emit(
                'social:giftReceived',
                friendId,
                itemId,
                amount
            );

        }, 2000);

        return {
            success: true
        };
    }

    /**
     * Receive a gift.
     */
    receiveGift(
        fromId,
        itemId,
        amount = 1
    ) {

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return {
                success: false,
                error: 'Invalid amount'
            };
        }

        amount = Math.floor(amount);

        const receivedToday =
            GameState.get(
                'social.giftsReceivedToday'
            ) || 0;

        if (
            receivedToday >=
            ECONOMY.dailyGiftsLimit * 2
        ) {
            return {
                success: false,
                error: 'Daily receive limit reached'
            };
        }

        const items =
            GameState.get(
                'inventory.items'
            ) || {};

        /*
         * Check inventory capacity.
         */
        const inventory =
            GameState.get('inventory');

        const currentCount =
            Object.values(items)
                .reduce(
                    (sum, item) =>
                        sum + (item.count || 0),
                    0
                );

        if (
            inventory &&
            currentCount + amount >
            inventory.maxCapacity
        ) {
            Events.emit('inventory:full');

            return {
                success: false,
                error: 'Inventory full'
            };
        }

        if (!items[itemId]) {
            items[itemId] = {
                count: 0,
                quality: 1
            };
        }

        items[itemId].count += amount;

        GameState.set(
            'inventory.items',
            { ...items }
        );

        GameState.set(
            'social.giftsReceivedToday',
            receivedToday + 1
        );

        Events.emit(
            'social:giftReceived',
            fromId,
            itemId,
            amount
        );

        return {
            success: true
        };
    }

    /**
     * Visit a friend's farm.
     */
    visitFriend(friendId) {

        const friends =
            GameState.get('social.friends') || [];

        const friend =
            friends.find(
                f => f.id === friendId
            );

        if (!friend) {
            return {
                success: false,
                error: 'Friend not found'
            };
        }

        const simulatedFarm =
            this._generateSimulatedFarm(
                friend
            );

        Events.emit(
            'social:visit',
            friendId,
            simulatedFarm
        );

        return {
            success: true,
            farm: simulatedFarm
        };
    }

    /**
     * Generate a simulated farm
     * based on friend's level.
     */
    _generateSimulatedFarm(friend) {

        const level =
            Math.max(1, friend.level || 1);

        const gridSize =
            Math.min(
                6 + Math.floor(level / 3),
                12
            );

        const cropTypes = [
            'wheat',
            'corn',
            'carrot',
            'tomato'
        ];

        const animalTypes = [
            'chicken',
            'cow'
        ];

        const cropIcons = {
            wheat: '🌾',
            corn: '🌽',
            carrot: '🥕',
            tomato: '🍅'
        };

        const tiles = [];

        for (
            let i = 0;
            i < gridSize;
            i++
        ) {

            const hasCrop =
                Math.random() > 0.3;

            if (hasCrop) {

                const cropId =
                    randPick(cropTypes);

                const ready =
                    Math.random() > 0.5;

                tiles.push({
                    id: `sim_${friend.id}_${i}`,
                    state:
                        ready
                            ? 'ready'
                            : 'growing',
                    cropId,
                    icon:
                        cropIcons[cropId] ||
                        '🌱'
                });

            } else {

                tiles.push({
                    id: `sim_${friend.id}_${i}`,
                    state: 'empty',
                    cropId: null,
                    icon: null
                });
            }
        }

        const animals = [];

        if (level > 3) {
            animals.push({
                type: animalTypes[0],
                icon: '🐔'
            });
        }

        if (level > 7) {
            animals.push({
                type: animalTypes[1],
                icon: '🐄'
            });
        }

        return {
            id: `farm_${friend.id}`,
            name: friend.farmName,
            owner: friend.name,
            level: friend.level,
            tiles,
            animals,
            decorations:
                level > 5
                    ? ['🌳', '🌻']
                    : []
        };
    }

    /**
     * Get all friends.
     */
    getFriends() {
        return (
            GameState.get(
                'social.friends'
            ) || []
        );
    }

    /**
     * Get a friend by ID.
     */
    getFriend(friendId) {

        return this.getFriends().find(
            friend => friend.id === friendId
        ) || null;
    }

    /**
     * Reset daily gift counters.
     */
    resetDaily() {

        GameState.set(
            'social.giftsSentToday',
            0
        );

        GameState.set(
            'social.giftsReceivedToday',
            0
        );

        GameState.set(
            'social.lastGiftReset',
            Date.now()
        );

        Events.emit(
            'social:dailyReset'
        );
    }
}

export const SocialSystem =
    new SocialSystemService();