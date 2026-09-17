/**
 * ============================================================
 * CollisionEngine.js — AABB collision for the farm world
 * ============================================================
 * Axis-aligned boxes in XZ (with optional height). The player is
 * resolved as a circle against every solid box. Doors, walls,
 * trees, animals and production buildings all register here.
 * ============================================================
 */

export class AABB {
    constructor({
        id = null,
        minX = 0,
        maxX = 0,
        minZ = 0,
        maxZ = 0,
        minY = 0,
        maxY = 3,
        solid = true,
        tag = 'static',
        userData = null
    } = {}) {
        this.id = id;
        this.minX = minX;
        this.maxX = maxX;
        this.minZ = minZ;
        this.maxZ = maxZ;
        this.minY = minY;
        this.maxY = maxY;
        this.solid = solid;
        this.tag = tag;
        this.userData = userData;
    }

    get centerX() {
        return (this.minX + this.maxX) * 0.5;
    }

    get centerZ() {
        return (this.minZ + this.maxZ) * 0.5;
    }

    get width() {
        return this.maxX - this.minX;
    }

    get depth() {
        return this.maxZ - this.minZ;
    }

    setFromCenter(x, z, width, depth, y = 0, height = 3) {
        const hx = width * 0.5;
        const hz = depth * 0.5;
        this.minX = x - hx;
        this.maxX = x + hx;
        this.minZ = z - hz;
        this.maxZ = z + hz;
        this.minY = y;
        this.maxY = y + height;
        return this;
    }

    contains(x, z) {
        return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
    }

    distanceToPoint(x, z) {
        const cx = Math.max(this.minX, Math.min(x, this.maxX));
        const cz = Math.max(this.minZ, Math.min(z, this.maxZ));
        return Math.hypot(x - cx, z - cz);
    }
}

export class CollisionEngine {
    constructor() {
        this.boxes = [];
        this._byId = new Map();
        this._scratch = { x: 0, z: 0, hit: false, tag: null };
    }

    add(box) {
        this.boxes.push(box);
        if (box.id) this._byId.set(box.id, box);
        return box;
    }

    addBox({
        id = null,
        x = 0,
        z = 0,
        width = 1,
        depth = 1,
        y = 0,
        height = 3,
        solid = true,
        tag = 'static',
        userData = null
    } = {}) {
        const box = new AABB({ id, solid, tag, userData });
        box.setFromCenter(x, z, width, depth, y, height);
        return this.add(box);
    }

    /**
     * Register four walls of a building, leaving a doorway gap on one side.
     * `door.side` is 'north' (-Z), 'south' (+Z), 'west' (-X) or 'east' (+X).
     */
    addBuildingWalls({
        id,
        x,
        z,
        width,
        depth,
        thickness = 0.38,
        height = 3.4,
        door = null
    } = {}) {
        const minX = x - width * 0.5;
        const maxX = x + width * 0.5;
        const minZ = z - depth * 0.5;
        const maxZ = z + depth * 0.5;
        const dw = door ? door.width * 0.5 : 0;
        const side = door?.side || null;
        const walls = [];

        const wallX = (suffix, zPos, xA, xB) => {
            const w = xB - xA;
            if (w < 0.12) return null;
            return this.addBox({
                id: `${id}-${suffix}`,
                x: (xA + xB) * 0.5,
                z: zPos,
                width: w,
                depth: thickness,
                height,
                tag: 'wall'
            });
        };

        const wallZ = (suffix, xPos, zA, zB) => {
            const d = zB - zA;
            if (d < 0.12) return null;
            return this.addBox({
                id: `${id}-${suffix}`,
                x: xPos,
                z: (zA + zB) * 0.5,
                width: thickness,
                depth: d,
                height,
                tag: 'wall'
            });
        };

        if (side === 'south') {
            walls.push(wallX('s-l', maxZ, minX, x - dw));
            walls.push(wallX('s-r', maxZ, x + dw, maxX));
        } else {
            walls.push(wallX('s', maxZ, minX, maxX));
        }

        if (side === 'north') {
            walls.push(wallX('n-l', minZ, minX, x - dw));
            walls.push(wallX('n-r', minZ, x + dw, maxX));
        } else {
            walls.push(wallX('n', minZ, minX, maxX));
        }

        if (side === 'east') {
            walls.push(wallZ('e-l', maxX, minZ, z - dw));
            walls.push(wallZ('e-r', maxX, z + dw, maxZ));
        } else {
            walls.push(wallZ('e', maxX, minZ, maxZ));
        }

        if (side === 'west') {
            walls.push(wallZ('w-l', minX, minZ, z - dw));
            walls.push(wallZ('w-r', minX, z + dw, maxZ));
        } else {
            walls.push(wallZ('w', minX, minZ, maxZ));
        }

        let doorBox = null;
        if (door) {
            const doorDepth = thickness + 0.18;
            const doorWidth = door.width;
            let dx = x;
            let dz = z;
            let w = doorWidth;
            let d = doorDepth;
            if (side === 'south') dz = maxZ;
            else if (side === 'north') dz = minZ;
            else if (side === 'east') {
                dx = maxX;
                w = doorDepth;
                d = doorWidth;
            } else if (side === 'west') {
                dx = minX;
                w = doorDepth;
                d = doorWidth;
            }
            doorBox = this.addBox({
                id: `${id}-door`,
                x: dx,
                z: dz,
                width: w,
                depth: d,
                height,
                tag: 'door',
                solid: true,
                userData: { buildingId: id }
            });
        }

        return { walls: walls.filter(Boolean), door: doorBox };
    }

    get(id) {
        return this._byId.get(id) || null;
    }

    remove(id) {
        const box = this._byId.get(id);
        if (!box) return;
        this._byId.delete(id);
        const idx = this.boxes.indexOf(box);
        if (idx !== -1) this.boxes.splice(idx, 1);
    }

    /**
     * Resolve a circle (player) moving from (fromX, fromZ) to (toX, toZ).
     * Two passes keep corners from catching the player.
     */
    resolveCircle(fromX, fromZ, toX, toZ, radius = 0.42) {
        let x = toX;
        let z = toZ;
        let hit = false;
        let tag = null;

        for (let pass = 0; pass < 3; pass++) {
            let collided = false;
            for (let i = 0; i < this.boxes.length; i++) {
                const box = this.boxes[i];
                if (!box.solid) continue;

                const closestX = Math.max(box.minX, Math.min(x, box.maxX));
                const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
                let dx = x - closestX;
                let dz = z - closestZ;
                const distSq = dx * dx + dz * dz;

                if (distSq >= radius * radius) continue;

                hit = true;
                collided = true;
                tag = box.tag;

                if (distSq < 1e-8) {
                    const penLeft = x - box.minX + radius;
                    const penRight = box.maxX - x + radius;
                    const penNorth = z - box.minZ + radius;
                    const penSouth = box.maxZ - z + radius;
                    const minPen = Math.min(penLeft, penRight, penNorth, penSouth);
                    if (minPen === penLeft) x = box.minX - radius;
                    else if (minPen === penRight) x = box.maxX + radius;
                    else if (minPen === penNorth) z = box.minZ - radius;
                    else z = box.maxZ + radius;
                } else {
                    const dist = Math.sqrt(distSq);
                    const push = (radius - dist) / dist;
                    x += dx * push;
                    z += dz * push;
                }
            }
            if (!collided) break;
        }

        this._scratch.x = x;
        this._scratch.z = z;
        this._scratch.hit = hit;
        this._scratch.tag = tag;
        return this._scratch;
    }

    queryPoint(x, z) {
        const hits = [];
        for (let i = 0; i < this.boxes.length; i++) {
            if (this.boxes[i].contains(x, z)) hits.push(this.boxes[i]);
        }
        return hits;
    }

    queryNearby(x, z, radius = 2.5, tag = null) {
        const hits = [];
        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];
            if (tag && box.tag !== tag) continue;
            if (box.distanceToPoint(x, z) <= radius) hits.push(box);
        }
        return hits;
    }
}

export default CollisionEngine;
