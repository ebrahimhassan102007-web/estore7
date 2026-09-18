/**
 * BuildingSystem.js
 * Construction, placement, upgrades and farm expansion.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';

import {
    BUILDINGS,
    EXPANSIONS,
    getBuilding
} from '../data/GameData.js';

import { uuid } from '../utils/Utils.js';

/**
 * BUILDINGS / EXPANSIONS / upgrades store price as { coins, gems }.
 * Older records used a bare number — accept both shapes here so no
 * call site pays `coins < {coins:500}` (which is always false).
 */
function costOf(entry) {
    const c = entry?.cost ?? entry;
    if (typeof c === 'number') {
        return { coins: c, gems: Number(entry?.gems) || 0 };
    }
    return {
        coins: Number(c?.coins) || 0,
        gems: Number(c?.gems) || 0
    };
}

/** Arabic, user-facing reason for a failed payment. */
function insufficientMessage(coinsNeeded, gemsNeeded) {
    if (gemsNeeded > 0 && coinsNeeded > 0) {
        return `تحتاج إلى ${coinsNeeded} عملة و${gemsNeeded} جوهرة`;
    }
    if (gemsNeeded > 0) {
        return `تحتاج إلى ${gemsNeeded} جوهرة`;
    }
    return `تحتاج إلى ${coinsNeeded} عملة`;
}


class BuildingSystemService {

    // =========================================================
    // PURCHASE BUILDING
    // =========================================================

    purchase(buildingId, tileId = null) {

        const buildingData =
            getBuilding(buildingId);

        if (!buildingData) {
            return {
                success: false,
                error: 'مبنى غير معروف'
            };
        }

        const level =
            GameState.get('player.level') || 1;

        if (
            buildingData.unlockLevel &&
            buildingData.unlockLevel > level
        ) {
            return {
                success: false,
                error:
                    `مطلوب مستوى ${buildingData.unlockLevel}`
            };
        }

        const coins =
            GameState.get('player.coins') || 0;

        const gems =
            GameState.get('player.gems') || 0;

        const cost =
            costOf(buildingData);

        if (
            coins < cost.coins ||
            gems < cost.gems
        ) {
            return {
                success: false,
                error: insufficientMessage(cost.coins, cost.gems)
            };
        }

        // -----------------------------------------------------
        // Validate tile
        // -----------------------------------------------------

        if (tileId) {

            const tiles =
                GameState.get(
                    'farm.tiles'
                ) || [];

            const tile =
                tiles.find(
                    tile =>
                        tile.id === tileId
                );

            if (!tile) {
                return {
                    success: false,
                    error: 'Tile not found'
                };
            }

            if (
                tile.state === 'occupied' ||
                tile.buildingId
            ) {
                return {
                    success: false,
                    error: 'Tile occupied'
                };
            }

            if (
                tile.state === 'locked'
            ) {
                return {
                    success: false,
                    error: 'Tile locked'
                };
            }
        }

        // -----------------------------------------------------
        // Deduct resources
        // -----------------------------------------------------

        GameState.set(
            'player.coins',
            coins - cost.coins
        );

        if (cost.gems > 0) {
            GameState.set(
                'player.gems',
                gems - cost.gems
            );
        }

        // -----------------------------------------------------
        // Create building
        // -----------------------------------------------------

        const building = {

            id:
                uuid(),

            typeId:
                buildingId,

            level:
                1,

            placedAt:
                Date.now(),

            tileId:
                tileId,

            position:
                null,

            productionQueue:
                [],

            workers:
                [],

            enabled:
                true
        };

        GameState.push(
            'farm.buildings',
            building
        );

        // -----------------------------------------------------
        // Occupy tile
        // -----------------------------------------------------

        if (tileId) {

            const tiles =
                GameState.get(
                    'farm.tiles'
                ) || [];

            const tile =
                tiles.find(
                    t =>
                        t.id === tileId
                );

            if (tile) {

                tile.buildingId =
                    building.id;

                tile.state =
                    'occupied';

                GameState.set(
                    'farm.tiles',
                    [...tiles]
                );
            }
        }

        Events.emit(
            'building:purchased',
            building
        );

        return {
            success: true,
            building
        };
    }


    // =========================================================
    // UPGRADE BUILDING
    // =========================================================

    upgrade(buildingId) {

        const buildings =
            GameState.get(
                'farm.buildings'
            ) || [];

        const building =
            buildings.find(
                b =>
                    b.id === buildingId
            );

        if (!building) {

            return {
                success: false,
                error: 'Building not found'
            };
        }

        const buildingData =
            getBuilding(
                building.typeId
            );

        if (!buildingData) {

            return {
                success: false,
                error: 'Building data not found'
            };
        }

        const currentLevel =
            building.level || 1;

        const upgrades =
            buildingData.upgrades || [];

        const upgradeData =
            upgrades[currentLevel - 1];

        if (!upgradeData) {

            return {
                success: false,
                error: 'Max level reached'
            };
        }

        const coins =
            GameState.get(
                'player.coins'
            ) || 0;

        const cost =
            costOf(upgradeData);

        if (coins < cost.coins) {

            return {
                success: false,
                error: insufficientMessage(cost.coins, 0)
            };
        }

        // -----------------------------------------------------
        // Pay
        // -----------------------------------------------------

        GameState.set(
            'player.coins',
            coins - cost.coins
        );

        // -----------------------------------------------------
        // Upgrade
        // -----------------------------------------------------

        building.level =
            currentLevel + 1;

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'building:upgraded',
            buildingId,
            building.level
        );

        return {
            success: true,
            newLevel:
                building.level
        };
    }


    // =========================================================
    // EXPAND FARM
    // =========================================================

    expand() {

        const expansionIndex =
            GameState.get(
                'farm.expansions'
            ) || 0;

        const expansionData =
            EXPANSIONS[
                expansionIndex
            ];

        if (!expansionData) {

            return {
                success: false,
                error: 'لا توجد توسعات إضافية'
            };
        }

        const playerLevel =
            GameState.get(
                'player.level'
            ) || 1;

        const requiredLevel =
            expansionData.level || 1;

        if (
            requiredLevel >
            playerLevel
        ) {

            return {
                success: false,
                error:
                    `مطلوب مستوى ${requiredLevel}`
            };
        }

        const coins =
            GameState.get(
                'player.coins'
            ) || 0;

        const cost =
            costOf(expansionData);

        const gems =
            GameState.get(
                'player.gems'
            ) || 0;

        if (coins < cost.coins || gems < cost.gems) {

            return {
                success: false,
                error: insufficientMessage(cost.coins, cost.gems)
            };
        }

        // -----------------------------------------------------
        // Required expansion items
        // -----------------------------------------------------

        const inventory =
            GameState.get(
                'inventory.items'
            ) || {};

        const requirements =
            expansionData.items || [];

        for (
            const requirement
            of requirements
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
                        `Need ${amount} ${itemId}`
                };
            }
        }

        // -----------------------------------------------------
        // Pay expansion
        // -----------------------------------------------------

        GameState.set(
            'player.coins',
            coins - cost.coins
        );

        if (cost.gems > 0) {
            GameState.set(
                'player.gems',
                gems - cost.gems
            );
        }

        for (
            const requirement
            of requirements
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
        // Expand grid
        // -----------------------------------------------------

        const tiles =
            GameState.get(
                'farm.tiles'
            ) || [];

        const gridSize =
            GameState.get(
                'farm.gridSize'
            ) || {
                rows: 0,
                cols: 0
            };

        const rows =
            gridSize.rows || 0;

        const cols =
            gridSize.cols || 0;

        const addedRows =
            expansionData.rows || 0;

        const addedCols =
            expansionData.cols || 0;

        const newRows =
            rows + addedRows;

        const newCols =
            cols + addedCols;

        // -----------------------------------------------------
        // Add new rows
        // -----------------------------------------------------

        for (
            let row = rows;
            row < newRows;
            row++
        ) {

            for (
                let col = 0;
                col < newCols;
                col++
            ) {

                tiles.push({

                    id:
                        uuid(),

                    row:
                        row,

                    col:
                        col,

                    type:
                        'soil',

                    state:
                        'empty',

                    cropId:
                        null,

                    plantedAt:
                        0,

                    readyAt:
                        0,

                    growthStage:
                        0,

                    water:
                        100,

                    fertilized:
                        false,

                    buildingId:
                        null
                });
            }
        }

        GameState.set(
            'farm.tiles',
            tiles
        );

        GameState.set(
            'farm.gridSize',
            {
                rows:
                    newRows,
                cols:
                    newCols
            }
        );

        GameState.set(
            'farm.expansions',
            expansionIndex + 1
        );

        Events.emit(
            'farm:expanded',
            expansionIndex + 1,
            newRows,
            newCols
        );

        return {

            success:
                true,

            newSize: {
                rows:
                    newRows,
                cols:
                    newCols
            }
        };
    }


    // =========================================================
    // MOVE BUILDING
    // =========================================================

    move(
        buildingId,
        newTileId
    ) {

        const buildings =
            GameState.get(
                'farm.buildings'
            ) || [];

        const building =
            buildings.find(
                b =>
                    b.id === buildingId
            );

        if (!building) {

            return {
                success: false,
                error: 'Building not found'
            };
        }

        const tiles =
            GameState.get(
                'farm.tiles'
            ) || [];

        const newTile =
            tiles.find(
                tile =>
                    tile.id === newTileId
            );

        if (!newTile) {

            return {
                success: false,
                error: 'Tile not found'
            };
        }

        if (
            newTile.state === 'locked'
        ) {

            return {
                success: false,
                error: 'Tile locked'
            };
        }

        if (
            newTile.state === 'occupied' ||
            newTile.buildingId
        ) {

            return {
                success: false,
                error: 'Tile occupied'
            };
        }

        // -----------------------------------------------------
        // Free old tile
        // -----------------------------------------------------

        if (building.tileId) {

            const oldTile =
                tiles.find(
                    tile =>
                        tile.id ===
                        building.tileId
                );

            if (oldTile) {

                oldTile.buildingId =
                    null;

                oldTile.state =
                    'empty';
            }
        }

        // -----------------------------------------------------
        // Occupy new tile
        // -----------------------------------------------------

        newTile.buildingId =
            building.id;

        newTile.state =
            'occupied';

        building.tileId =
            newTileId;

        building.position =
            null;

        GameState.set(
            'farm.tiles',
            [...tiles]
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'building:moved',
            buildingId,
            newTileId
        );

        return {
            success: true
        };
    }


    // =========================================================
    // DEMOLISH BUILDING
    // =========================================================

    demolish(buildingId) {

        const buildings =
            GameState.get(
                'farm.buildings'
            ) || [];

        const index =
            buildings.findIndex(
                building =>
                    building.id ===
                    buildingId
            );

        if (index === -1) {

            return {
                success: false,
                error: 'Building not found'
            };
        }

        const building =
            buildings[index];

        const buildingData =
            getBuilding(
                building.typeId
            );

        const originalCost =
            costOf(buildingData);

        const refund =
            Math.floor(
                originalCost.coins * 0.30
            );

        // -----------------------------------------------------
        // Free tile
        // -----------------------------------------------------

        if (building.tileId) {

            const tiles =
                GameState.get(
                    'farm.tiles'
                ) || [];

            const tile =
                tiles.find(
                    t =>
                        t.id ===
                        building.tileId
                );

            if (tile) {

                tile.buildingId =
                    null;

                tile.state =
                    'empty';
            }

            GameState.set(
                'farm.tiles',
                [...tiles]
            );
        }

        // -----------------------------------------------------
        // Refund
        // -----------------------------------------------------

        const coins =
            GameState.get(
                'player.coins'
            ) || 0;

        GameState.set(
            'player.coins',
            coins + refund
        );

        buildings.splice(
            index,
            1
        );

        GameState.set(
            'farm.buildings',
            [...buildings]
        );

        Events.emit(
            'building:demolished',
            buildingId,
            refund
        );

        return {
            success: true,
            refund
        };
    }


    // =========================================================
    // GET ALL BUILDINGS
    // =========================================================

    getBuildings() {

        return (
            GameState.get(
                'farm.buildings'
            ) || []
        );
    }


    // =========================================================
    // GET BUILDING BY ID
    // =========================================================

    getBuildingById(
        buildingId
    ) {

        return this.getBuildings()
            .find(
                building =>
                    building.id ===
                    buildingId
            );
    }


    // =========================================================
    // GET BUILDINGS BY TYPE
    // =========================================================

    getBuildingsByType(
        typeId
    ) {

        return this.getBuildings()
            .filter(
                building =>
                    building.typeId ===
                    typeId
            );
    }


    // =========================================================
    // CHECK IF BUILDING EXISTS
    // =========================================================

    hasBuilding(
        typeId
    ) {

        return this.getBuildings()
            .some(
                building =>
                    building.typeId ===
                    typeId
            );
    }


    // =========================================================
    // GET BUILDING COUNT
    // =========================================================

    getBuildingCount(
        typeId = null
    ) {

        if (!typeId) {
            return this.getBuildings().length;
        }

        return this.getBuildingsByType(
            typeId
        ).length;
    }
}


export const BuildingSystem =
    new BuildingSystemService();