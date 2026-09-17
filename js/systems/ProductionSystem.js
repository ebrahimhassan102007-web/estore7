/**
 * ProductionSystem.js
 * Handles factories, recipes, production queues,
 * processing time, collecting finished products.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import {
    RECIPES,
    BUILDINGS,
    getRecipe,
    getBuilding
} from '../data/GameData.js';
import { uuid } from '../utils/Utils.js';

class ProductionSystem {

    constructor() {
        this._initListeners();
    }

    // =========================================================
    // EVENTS
    // =========================================================

    _initListeners() {
        Events.on('game:tick', (dt) => {
            this._tick(dt);
        });

        Events.on('time:offline', (seconds) => {
            this._processOffline(seconds);
        });
    }

    // =========================================================
    // START PRODUCTION
    // =========================================================

    startProduction(buildingId, recipeId, amount = 1) {

        const buildings =
            GameState.get('farm.buildings');

        const building =
            buildings.find(
                b => b.id === buildingId
            );

        if (!building) {
            return {
                success: false,
                error: 'Building not found'
            };
        }

        const recipe =
            getRecipe(recipeId);

        if (!recipe) {
            return {
                success: false,
                error: 'Recipe not found'
            };
        }

        if (amount <= 0) {
            return {
                success: false,
                error: 'Invalid amount'
            };
        }

        // -----------------------------------------------------
        // Check building type
        // -----------------------------------------------------

        if (
            recipe.building &&
            recipe.building !== building.typeId
        ) {
            return {
                success: false,
                error: 'Wrong building'
            };
        }

        // -----------------------------------------------------
        // Check recipe unlock
        // -----------------------------------------------------

        const playerLevel =
            GameState.get('player.level');

        if (
            recipe.unlockLevel &&
            recipe.unlockLevel > playerLevel
        ) {
            return {
                success: false,
                error:
                    `Need level ${recipe.unlockLevel}`
            };
        }

        // -----------------------------------------------------
        // Get production queue
        // -----------------------------------------------------

        if (!building.productionQueue) {
            building.productionQueue = [];
        }

        const queueLimit =
            recipe.queueLimit ||
            building.queueLimit ||
            3;

        if (
            building.productionQueue.length >=
            queueLimit
        ) {
            return {
                success: false,
                error: 'Production queue full'
            };
        }

        // -----------------------------------------------------
        // Check ingredients
        // -----------------------------------------------------

        const ingredients =
            recipe.ingredients ||
            recipe.inputs ||
            [];

        const items =
            GameState.get(
                'inventory.items'
            );

        for (const ingredient of ingredients) {

            const itemId =
                ingredient.item ||
                ingredient.itemId;

            const required =
                (ingredient.amount || 1) *
                amount;

            if (
                !items[itemId] ||
                items[itemId].count < required
            ) {
                return {
                    success: false,
                    error:
                        `Need ${required} ${itemId}`
                };
            }
        }

        // -----------------------------------------------------
        // Remove ingredients
        // -----------------------------------------------------

        for (const ingredient of ingredients) {

            const itemId =
                ingredient.item ||
                ingredient.itemId;

            const required =
                (ingredient.amount || 1) *
                amount;

            items[itemId].count -=
                required;

            if (
                items[itemId].count <= 0
            ) {
                delete items[itemId];
            }
        }

        GameState.set(
            'inventory.items',
            { ...items }
        );

        // -----------------------------------------------------
        // Production time
        // -----------------------------------------------------

        const productionTime =
            recipe.productionTime ||
            recipe.time ||
            recipe.duration ||
            60;

        const outputAmount =
            (recipe.output?.amount ||
             recipe.amount ||
             1) *
            amount;

        const outputItem =
            recipe.output?.item ||
            recipe.output?.itemId ||
            recipe.outputItem ||
            recipe.result;

        if (!outputItem) {

            // Restore ingredients if recipe
            // has no valid output.

            const restored =
                GameState.get(
                    'inventory.items'
                );

            for (const ingredient of ingredients) {

                const itemId =
                    ingredient.item ||
                    ingredient.itemId;

                const required =
                    (ingredient.amount || 1) *
                    amount;

                if (!restored[itemId]) {
                    restored[itemId] = {
                        count: 0,
                        quality: 1
                    };
                }

                restored[itemId].count +=
                    required;
            }

            GameState.set(
                'inventory.items',
                { ...restored }
            );

            return {
                success: false,
                error: 'Recipe has no output'
            };
        }

        // -----------------------------------------------------
        // Create production job
        // -----------------------------------------------------

        const now = Date.now();

        const job = {

            id: uuid(),

            recipeId,

            amount,

            outputItem,

            outputAmount,

            startedAt: now,

            duration:
                productionTime * 1000,

            readyAt:
                now +
                productionTime * 1000,

            state: 'producing'
        };

        building.productionQueue.push(
            job
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'production:started',
            buildingId,
            recipeId,
            job
        );

        return {
            success: true,
            job
        };
    }

    // =========================================================
    // COLLECT PRODUCT
    // =========================================================

    collectProduction(
        buildingId,
        jobId
    ) {

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        const building =
            buildings.find(
                b => b.id === buildingId
            );

        if (!building) {
            return {
                success: false,
                error: 'Building not found'
            };
        }

        if (!building.productionQueue) {
            return {
                success: false,
                error: 'No production'
            };
        }

        const index =
            building.productionQueue.findIndex(
                job => job.id === jobId
            );

        if (index === -1) {
            return {
                success: false,
                error: 'Production not found'
            };
        }

        const job =
            building.productionQueue[index];

        if (
            Date.now() <
            job.readyAt
        ) {
            return {
                success: false,
                error: 'Production not ready'
            };
        }

        // -----------------------------------------------------
        // Check inventory capacity
        // -----------------------------------------------------

        const inventory =
            GameState.get(
                'inventory'
            );

        const currentCount =
            Object.values(
                inventory.items
            ).reduce(
                (sum, item) =>
                    sum + item.count,
                0
            );

        if (
            currentCount +
            job.outputAmount >
            inventory.maxCapacity
        ) {

            Events.emit(
                'inventory:full'
            );

            return {
                success: false,
                error: 'Inventory full'
            };
        }

        // -----------------------------------------------------
        // Add output
        // -----------------------------------------------------

        const items =
            GameState.get(
                'inventory.items'
            );

        if (
            !items[job.outputItem]
        ) {
            items[job.outputItem] = {
                count: 0,
                quality: 1
            };
        }

        items[job.outputItem].count +=
            job.outputAmount;

        GameState.set(
            'inventory.items',
            { ...items }
        );

        // -----------------------------------------------------
        // Remove job
        // -----------------------------------------------------

        building.productionQueue.splice(
            index,
            1
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        const output = {
            item: job.outputItem,
            amount: job.outputAmount
        };

        Events.emit(
            'production:completed',
            buildingId,
            job.recipeId,
            output
        );

        return {
            success: true,
            output
        };
    }

    // =========================================================
    // CANCEL PRODUCTION
    // =========================================================

    cancelProduction(
        buildingId,
        jobId
    ) {

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        const building =
            buildings.find(
                b => b.id === buildingId
            );

        if (!building) {
            return {
                success: false,
                error: 'Building not found'
            };
        }

        if (!building.productionQueue) {
            return {
                success: false,
                error: 'No production'
            };
        }

        const index =
            building.productionQueue.findIndex(
                job => job.id === jobId
            );

        if (index === -1) {
            return {
                success: false,
                error: 'Production not found'
            };
        }

        const job =
            building.productionQueue[index];

        const recipe =
            getRecipe(job.recipeId);

        // -----------------------------------------------------
        // Refund ingredients
        // -----------------------------------------------------

        if (recipe) {

            const ingredients =
                recipe.ingredients ||
                recipe.inputs ||
                [];

            const items =
                GameState.get(
                    'inventory.items'
                );

            for (
                const ingredient
                of ingredients
            ) {

                const itemId =
                    ingredient.item ||
                    ingredient.itemId;

                const amount =
                    (ingredient.amount || 1) *
                    job.amount;

                if (!items[itemId]) {
                    items[itemId] = {
                        count: 0,
                        quality: 1
                    };
                }

                items[itemId].count +=
                    amount;
            }

            GameState.set(
                'inventory.items',
                { ...items }
            );
        }

        building.productionQueue.splice(
            index,
            1
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'production:cancelled',
            buildingId,
            jobId
        );

        return {
            success: true
        };
    }

    // =========================================================
    // TICK
    // =========================================================

    _tick(dt) {

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        if (!buildings) {
            return;
        }

        let changed = false;

        const now =
            Date.now();

        for (
            const building
            of buildings
        ) {

            if (
                !building.productionQueue ||
                building.productionQueue.length === 0
            ) {
                continue;
            }

            for (
                const job
                of building.productionQueue
            ) {

                if (
                    job.state === 'producing' &&
                    now >= job.readyAt
                ) {

                    job.state = 'ready';

                    changed = true;

                    Events.emit(
                        'production:ready',
                        building.id,
                        job.recipeId,
                        job
                    );
                }
            }
        }

        if (changed) {

            GameState.set(
                'farm.buildings',
                [...buildings]
            );
        }
    }

    // =========================================================
    // OFFLINE PROGRESS
    // =========================================================

    _processOffline(seconds) {

        if (
            !seconds ||
            seconds <= 0
        ) {
            return;
        }

        const buildings =
            GameState.get(
                'farm.buildings'
            );

        if (!buildings) {
            return;
        }

        const now =
            Date.now();

        let changed = false;

        for (
            const building
            of buildings
        ) {

            if (
                !building.productionQueue
            ) {
                continue;
            }

            for (
                const job
                of building.productionQueue
            ) {

                if (
                    job.state === 'producing' &&
                    now >= job.readyAt
                ) {

                    job.state = 'ready';

                    changed = true;

                    Events.emit(
                        'production:ready',
                        building.id,
                        job.recipeId,
                        job
                    );
                }
            }
        }

        if (changed) {

            GameState.set(
                'farm.buildings',
                [...buildings]
            );
        }
    }

    // =========================================================
    // HELPERS
    // =========================================================

    getProductions(
        buildingId
    ) {

        const building =
            this.getBuilding(
                buildingId
            );

        return (
            building?.productionQueue ||
            []
        );
    }

    getBuilding(
        buildingId
    ) {

        return GameState.get(
            'farm.buildings'
        ).find(
            b => b.id === buildingId
        );
    }

    getProduction(
        buildingId,
        jobId
    ) {

        return this.getProductions(
            buildingId
        ).find(
            job => job.id === jobId
        );
    }

    isProducing(
        buildingId
    ) {

        return this.getProductions(
            buildingId
        ).length > 0;
    }

    getReadyProductions(
        buildingId
    ) {

        return this.getProductions(
            buildingId
        ).filter(
            job =>
                job.state === 'ready' ||
                Date.now() >= job.readyAt
        );
    }

    getAvailableRecipes(
        buildingType
    ) {

        const level =
            GameState.get(
                'player.level'
            );

        return Object.values(
            RECIPES
        ).filter(
            recipe => {

                const correctBuilding =
                    !recipe.building ||
                    recipe.building ===
                    buildingType;

                const unlocked =
                    !recipe.unlockLevel ||
                    recipe.unlockLevel <= level;

                return (
                    correctBuilding &&
                    unlocked
                );
            }
        );
    }
}

export const ProductionSystem =
    new ProductionSystem();