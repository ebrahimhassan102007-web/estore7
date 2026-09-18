/**
 * OrderSystem.js — Order Board & Customer Requests
 * Generates, accepts, completes, and rewards orders.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import {
    ORDER_TEMPLATES,
    NPCS,
    ECONOMY,
    getItem
} from '../data/GameData.js';

import {
    uuid,
    randPick,
    randInt
} from '../utils/Utils.js';


class OrderSystemService {

    constructor() {
        this._initialized = false;
        this._refreshTimer = null;
        this._initListeners();
    }


    // =========================================================
    // BOOT — أول تعبئة للوحة + تحديث دوري حسب الاقتصاد
    // =========================================================

    /**
     * @param {{immediate?:boolean}} opts
     * interval من ECONOMY.orderRefreshInterval (ثواني).
     */
    init(opts = {}) {
        if (this._initialized) return this;
        this._initialized = true;

        const first = () => {
            try { this.refreshOrders(); } catch (err) {
                console.warn('[OrderSystem] refresh notice:', err);
            }
        };

        if (opts.immediate === false) {
            setTimeout(first, 5000);
        } else {
            first();
        }

        const intervalSec = ECONOMY?.orderRefreshInterval || 300;

        this._refreshTimer = setInterval(
            () => {
                this._checkExpiredOrders();
                first();
            },
            Math.max(30, intervalSec) * 1000
        );

        return this;
    }

    stop() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }


    // =========================================================
    // EVENT LISTENERS
    // =========================================================

    _initListeners() {

        Events.on(
            'game:tick',
            () => this._checkExpiredOrders()
        );

    }


    // =========================================================
    // GENERATE / REFRESH ORDERS
    // =========================================================

    /**
     * توليد طلبات جديدة من ORDER_TEMPLATES.
     * شكل القالب (GameData):
     *   { id, minLevel, items: [{ item, min, max }],
     *     reward: { coins: {min,max}, xp: {min,max} } }
     * والناتج الذي يستهلكه accept/complete:
     *   { items: [{ item, amount }], rewardCoins, rewardXp, expiresAt }
     */
    refreshOrders() {

        const orders =
            GameState.get('orders.active') || [];

        const level =
            GameState.get('player.level') || 1;

        const maxOrders = Math.min(
            ECONOMY?.maxActiveOrders || 6,
            3 + Math.floor(level / 5)
        );

        if (orders.length >= maxOrders) {
            return;
        }

        const needed =
            maxOrders - orders.length;

        // القوالب المتاحة لمستوى اللاعب
        const pool =
            (ORDER_TEMPLATES || []).filter(
                tpl => !tpl.minLevel || tpl.minLevel <= level
            );

        const npcList = Array.isArray(NPCS)
            ? NPCS
            : Object.values(NPCS || {});

        if (pool.length === 0 || npcList.length === 0) {
            return;
        }

        // عدم تكرار نفس القالب أثناء وجوده على اللوحة
        const taken = new Set(
            orders.map(o => o?.templateId).filter(Boolean)
        );

        const now =
            Date.now();

        const multiplier =
            ECONOMY?.orderRewardMultiplier || 1;

        const newOrders = [];

        for (
            let i = 0;
            i < needed;
            i++
        ) {

            const available =
                pool.filter(t => !taken.has(t.id));

            const template =
                randPick(available.length ? available : pool);

            if (!template) break;

            const npc =
                randPick(npcList);

            // ---- كميات محددة لكل عنصر في الطلب ----
            const items =
                (template.items || [])
                    .map(req => {
                        const min =
                            Number(req.min) || 1;
                        const max =
                            Math.max(min, Number(req.max) || min);

                        return {
                            item:
                                req.item || req.itemId,
                            amount:
                                randInt(min, max)
                        };
                    })
                    .filter(entry => !!entry.item);

            if (items.length === 0) continue;

            // ---- مكافآت محددة من المدى ----
            const reward =
                template.reward || {};

            const coinRange =
                reward.coins || {};

            const xpRange =
                reward.xp || {};

            const rewardCoins = Math.round(
                randInt(
                    Number(coinRange.min) || 50,
                    Math.max(
                        Number(coinRange.min) || 50,
                        Number(coinRange.max) || (Number(coinRange.min) || 50)
                    )
                ) * multiplier
            );

            const rewardXp =
                randInt(
                    Number(xpRange.min) || 10,
                    Math.max(
                        Number(xpRange.min) || 10,
                        Number(xpRange.max) || (Number(xpRange.min) || 10)
                    )
                );

            // القوالب لا تحمل timeLimit — مدة افتراضية 15 دقيقة
            const timeLimit =
                template.timeLimit ||
                ECONOMY?.orderDuration ||
                900;

            taken.add(template.id);

            newOrders.push({
                id:
                    uuid(),

                templateId:
                    template.id,

                customer:
                    npc.name,

                customerId:
                    npc.id,

                // NPCS تستعمل `avatar` (وليس `icon`)
                customerIcon:
                    npc.avatar || '🧑‍🌾',

                personality:
                    npc.personality || '',

                items,

                rewardCoins,

                rewardXp,

                timeLimit,

                createdAt:
                    now,

                expiresAt:
                    now + (timeLimit * 1000),

                state:
                    'pending',

                acceptedAt:
                    null
            });
        }

        if (newOrders.length === 0) {
            return;
        }

        GameState.set(
            'orders.active',
            [
                ...orders,
                ...newOrders
            ]
        );

        Events.emit(
            'orders:refreshed',
            newOrders
        );
    }


    // =========================================================
    // ACCEPT ORDER
    // =========================================================

    accept(orderId) {

        const orders =
            GameState.get(
                'orders.active'
            ) || [];

        const order =
            orders.find(
                order =>
                    order.id === orderId
            );

        if (!order) {

            return {
                success: false,
                error: 'الطلب غير موجود'
            };
        }

        if (
            order.state !== 'pending'
        ) {

            return {
                success: false,
                error: 'هذا الطلب تمّت معالجته'
            };
        }

        if (
            Date.now() >
            order.expiresAt
        ) {

            order.state =
                'expired';

            GameState.set(
                'orders.active',
                orders.filter(
                    o => o.id !== orderId
                )
            );

            Events.emit(
                'order:expired',
                orderId
            );

            return {
                success: false,
                error: 'انتهت مدة الطلب'
            };
        }

        order.state =
            'accepted';

        order.acceptedAt =
            Date.now();

        GameState.set(
            'orders.active',
            [...orders]
        );

        Events.emit(
            'order:accepted',
            orderId
        );

        return {
            success: true
        };
    }


    // =========================================================
    // REJECT ORDER
    // =========================================================

    reject(orderId) {

        const orders =
            GameState.get(
                'orders.active'
            ) || [];

        const index =
            orders.findIndex(
                order =>
                    order.id === orderId
            );

        if (index === -1) {

            return {
                success: false,
                error: 'الطلب غير موجود'
            };
        }

        const removed =
            orders[index];

        orders.splice(
            index,
            1
        );

        GameState.set(
            'orders.active',
            [...orders]
        );

        Events.emit(
            'order:rejected',
            orderId,
            removed
        );

        setTimeout(
            () => this.refreshOrders(),
            5000
        );

        return {
            success: true
        };
    }


    // =========================================================
    // COMPLETE ORDER
    // =========================================================

    complete(orderId) {

        const orders =
            GameState.get(
                'orders.active'
            ) || [];

        const order =
            orders.find(
                order =>
                    order.id === orderId
            );

        if (!order) {

            return {
                success: false,
                error: 'الطلب غير موجود'
            };
        }

        if (
            order.state !== 'accepted'
        ) {

            return {
                success: false,
                error: 'اقبل الطلب أولًا قبل التسليم'
            };
        }

        // -----------------------------------------------------
        // Check expiration
        // -----------------------------------------------------

        if (
            Date.now() >
            order.expiresAt
        ) {

            order.state =
                'expired';

            GameState.set(
                'orders.active',
                orders.filter(
                    o => o.id !== orderId
                )
            );

            Events.emit(
                'order:expired',
                orderId
            );

            return {
                success: false,
                error: 'انتهت مدة الطلب'
            };
        }


        // -----------------------------------------------------
        // Inventory
        // -----------------------------------------------------

        const inventory =
            GameState.get(
                'inventory.items'
            ) || {};


        // -----------------------------------------------------
        // Verify all required items
        // -----------------------------------------------------

        for (
            const requirement
            of order.items
        ) {

            const itemId =
                requirement.item ||
                requirement.itemId;

            const amount =
                requirement.amount || 1;

            if (
                !inventory[itemId] ||
                inventory[itemId].count < amount
            ) {

                return {
                    success: false,
                    error:
                        `ينقصك ${amount} × ${getItem(itemId)?.name || itemId}`
                };
            }
        }


        // -----------------------------------------------------
        // Remove required items
        // -----------------------------------------------------

        for (
            const requirement
            of order.items
        ) {

            const itemId =
                requirement.item ||
                requirement.itemId;

            const amount =
                requirement.amount || 1;

            inventory[itemId].count -=
                amount;

            if (
                inventory[itemId].count <= 0
            ) {
                delete inventory[itemId];
            }
        }

        GameState.set(
            'inventory.items',
            {
                ...inventory
            }
        );


        // -----------------------------------------------------
        // Give rewards
        // -----------------------------------------------------

        const currentCoins =
            GameState.get(
                'player.coins'
            ) || 0;

        GameState.set(
            'player.coins',
            currentCoins +
            order.rewardCoins
        );


        // -----------------------------------------------------
        // Remove completed order
        // -----------------------------------------------------

        const index =
            orders.findIndex(
                order =>
                    order.id === orderId
            );

        if (index !== -1) {
            orders.splice(
                index,
                1
            );
        }

        GameState.set(
            'orders.active',
            [...orders]
        );


        // -----------------------------------------------------
        // Statistics
        // -----------------------------------------------------

        const completed =
            GameState.get(
                'orders.completed'
            ) || 0;

        const dailyCompleted =
            GameState.get(
                'orders.dailyCompleted'
            ) || 0;

        GameState.set(
            'orders.completed',
            completed + 1
        );

        GameState.set(
            'orders.dailyCompleted',
            dailyCompleted + 1
        );


        // -----------------------------------------------------
        // Events
        // -----------------------------------------------------

        Events.emit(
            'order:completed',
            orderId,
            order.rewardCoins,
            order.rewardXp
        );

        Events.emit(
            'xp:gain',
            order.rewardXp,
            'order'
        );


        // -----------------------------------------------------
        // Replacement order
        // -----------------------------------------------------

        setTimeout(
            () => this.refreshOrders(),
            3000
        );


        return {
            success: true,

            rewards: {
                coins:
                    order.rewardCoins,

                xp:
                    order.rewardXp
            }
        };
    }


    // =========================================================
    // CAN COMPLETE
    // =========================================================

    canComplete(orderId) {

        const orders =
            GameState.get(
                'orders.active'
            ) || [];

        const order =
            orders.find(
                o =>
                    o.id === orderId
            );

        if (
            !order ||
            order.state !== 'accepted'
        ) {
            return false;
        }

        if (
            Date.now() >
            order.expiresAt
        ) {
            return false;
        }

        const inventory =
            GameState.get(
                'inventory.items'
            ) || {};

        return order.items.every(
            requirement => {

                const itemId =
                    requirement.item ||
                    requirement.itemId;

                const amount =
                    requirement.amount || 1;

                return (
                    inventory[itemId] &&
                    inventory[itemId].count >=
                    amount
                );
            }
        );
    }


    // =========================================================
    // EXPIRED ORDERS
    // =========================================================

    _checkExpiredOrders() {

        const now =
            Date.now();

        const orders =
            GameState.get(
                'orders.active'
            ) || [];

        if (orders.length === 0) {
            return;
        }

        const before =
            orders.length;

        const valid =
            orders.filter(
                order => {

                    if (
                        order.state ===
                            'pending' &&
                        now >
                            order.expiresAt
                    ) {

                        Events.emit(
                            'order:expired',
                            order.id
                        );

                        return false;
                    }

                    return true;
                }
            );


        if (
            valid.length !== before
        ) {

            GameState.set(
                'orders.active',
                valid
            );

            setTimeout(
                () => this.refreshOrders(),
                2000
            );
        }
    }


    // =========================================================
    // GET ORDERS
    // =========================================================

    getOrders() {

        return (
            GameState.get(
                'orders.active'
            ) || []
        );
    }


    // =========================================================
    // GET COUNTS
    // =========================================================

    getCounts() {

        const orders =
            this.getOrders();

        return {

            pending:
                orders.filter(
                    order =>
                        order.state ===
                        'pending'
                ).length,

            accepted:
                orders.filter(
                    order =>
                        order.state ===
                        'accepted'
                ).length,

            total:
                orders.length
        };
    }


    // =========================================================
    // GET ORDER
    // =========================================================

    getOrder(orderId) {

        return this.getOrders()
            .find(
                order =>
                    order.id === orderId
            );
    }


    // =========================================================
    // GET PENDING ORDERS
    // =========================================================

    getPendingOrders() {

        return this.getOrders()
            .filter(
                order =>
                    order.state ===
                    'pending'
            );
    }


    // =========================================================
    // GET ACCEPTED ORDERS
    // =========================================================

    getAcceptedOrders() {

        return this.getOrders()
            .filter(
                order =>
                    order.state ===
                    'accepted'
            );
    }


    // =========================================================
    // TIME LEFT
    // =========================================================

    getTimeLeft(orderId) {

        const order =
            this.getOrder(orderId);

        if (!order) {
            return 0;
        }

        return Math.max(
            0,
            Math.floor(
                (
                    order.expiresAt -
                    Date.now()
                ) / 1000
            )
        );
    }
}


export const OrderSystem =
    new OrderSystemService();