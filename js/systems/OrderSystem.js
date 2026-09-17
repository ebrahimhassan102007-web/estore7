/**
 * OrderSystem.js — Order Board & Customer Requests
 * Generates, accepts, completes, and rewards orders.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import {
    ORDER_TEMPLATES,
    NPCS,
    ECONOMY
} from '../data/GameData.js';

import {
    uuid,
    randPick,
    randInt
} from '../utils/Utils.js';


class OrderSystem {

    constructor() {
        this._initListeners();
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

    refreshOrders() {

        const orders =
            GameState.get('orders.active') || [];

        const level =
            GameState.get('player.level') || 1;

        const maxOrders =
            3 + Math.floor(level / 5);

        if (orders.length >= maxOrders) {
            return;
        }

        const needed =
            maxOrders - orders.length;

        const newOrders = [];

        for (
            let i = 0;
            i < needed;
            i++
        ) {

            if (
                !ORDER_TEMPLATES ||
                ORDER_TEMPLATES.length === 0
            ) {
                break;
            }

            const template =
                randPick(ORDER_TEMPLATES);

            const npcList =
                Object.values(NPCS || {});

            if (npcList.length === 0) {
                break;
            }

            const npc =
                randPick(npcList);

            const now =
                Date.now();

            const timeLimit =
                template.timeLimit || 300;

            const rewardCoins =
                Math.max(
                    0,
                    (template.rewardCoins || 0) +
                    randInt(-5, 10)
                );

            const order = {

                id: uuid(),

                customer:
                    npc.name,

                customerIcon:
                    npc.icon,

                items:
                    (template.items || []).map(
                        item => ({
                            ...item
                        })
                    ),

                rewardCoins,

                rewardXp:
                    template.rewardXp || 0,

                timeLimit,

                createdAt:
                    now,

                expiresAt:
                    now +
                    (timeLimit * 1000),

                state:
                    'pending',

                acceptedAt:
                    null
            };

            newOrders.push(order);
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
                error: 'Order not found'
            };
        }

        if (
            order.state !== 'pending'
        ) {

            return {
                success: false,
                error: 'Already processed'
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
                error: 'Order expired'
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
                error: 'Order not found'
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
                error: 'Order not found'
            };
        }

        if (
            order.state !== 'accepted'
        ) {

            return {
                success: false,
                error: 'Not accepted'
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
                error: 'Order expired'
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
                        `Missing ${amount} ${itemId}`
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
    new OrderSystem();