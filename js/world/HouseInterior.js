/**
 * ============================================================
 * HouseInterior.js — Full Cozy Farmhouse Interior Scene
 * ============================================================
 * Solves the broken enter-house black void flow:
 *   - Farm world hides / detaches safely
 *   - A warm, detailed interior scene loads with:
 *       • Hardwood floor & rustic textured walls
 *       • Cozy living room with brick fireplace, roaring fire glow
 *       • Bedroom area with quilt bed, side table, reading lamp
 *       • Kitchen / dining area with wooden table, chairs, teapot
 *       • Storage chest with interactive open/loot/stash flow
 *       • Exit front door that restores the farm world seamlessly
 *   - Dedicated collision bounds & soft indoor lighting
 * ============================================================
 */
import * as THREE from 'three';
import { InteractiveDoor } from './Doors.js';
import { CollisionEngine } from '../core/CollisionEngine.js';
import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { InventorySystem } from '../systems/InventorySystem.js';

const M = (color, roughness = 0.85, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(group, size, pos, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

export class HouseInterior {
    constructor({ parentScene, onExit, onOpenChest }) {
        this.parentScene = parentScene;
        this.onExit = onExit;
        this.onOpenChest = onOpenChest;

        this.group = new THREE.Group();
        this.group.name = 'HouseInterior';
        this.group.visible = false;
        this.parentScene.add(this.group);

        this.collision = new CollisionEngine();
        this.exitDoor = null;
        this.chest = null;
        this.lights = [];
        this.fireLight = null;

        this.build();
    }

    build() {
        const g = this.group;

        // Interior dimensions: 11m wide, 4.2m tall, 9m deep
        const W = 11;
        const H = 4.2;
        const D = 9;

        const floorMat = M(0x8a542e, 0.7);
        const wallMat = M(0xf2e8d5, 0.9);
        const woodMat = M(0x5c3417, 0.8);
        const brickMat = M(0x9c4832, 0.95);
        const clothMat = M(0xb83828, 0.8);
        const rugMat = M(0x2d6b4f, 0.9);
        const goldMat = M(0xffd54f, 0.3, 0.7);

        // 1. Floor
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        g.add(floor);

        // Ceiling
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), wallMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = H;
        g.add(ceiling);

        // Ceiling wooden beams
        for (let x = -W / 2 + 1.5; x < W / 2; x += 2.2) {
            box(g, [0.25, 0.3, D], [x, H - 0.15, 0], woodMat);
        }

        // 2. Walls (North, South, East, West)
        // North wall (Back with fireplace)
        box(g, [W, H, 0.4], [0, H / 2, -D / 2], wallMat);
        // East wall (Right)
        box(g, [0.4, H, D], [W / 2, H / 2, 0], wallMat);
        // West wall (Left)
        box(g, [0.4, H, D], [-W / 2, H / 2, 0], wallMat);
        // South wall (Front with doorway at center)
        const doorWidth = 2.0;
        const doorHeight = 3.0;
        const southSideW = (W - doorWidth) / 2;
        box(g, [southSideW, H, 0.4], [-W / 2 + southSideW / 2, H / 2, D / 2], wallMat);
        box(g, [southSideW, H, 0.4], [W / 2 - southSideW / 2, H / 2, D / 2], wallMat);
        box(g, [doorWidth, H - doorHeight, 0.4], [0, doorHeight + (H - doorHeight) / 2, D / 2], wallMat);

        // 3. Collision for walls
        this.collision.addBox({ id: 'in-wall-n', x: 0, z: -D / 2, width: W, depth: 0.4, height: H });
        this.collision.addBox({ id: 'in-wall-e', x: W / 2, z: 0, width: 0.4, depth: D, height: H });
        this.collision.addBox({ id: 'in-wall-w', x: -W / 2, z: 0, width: 0.4, depth: D, height: H });
        this.collision.addBox({ id: 'in-wall-s-l', x: -W / 2 + southSideW / 2, z: D / 2, width: southSideW, depth: 0.4, height: H });
        this.collision.addBox({ id: 'in-wall-s-r', x: W / 2 - southSideW / 2, z: D / 2, width: southSideW, depth: 0.4, height: H });

        // 4. Exit Door
        const exitDoorCollider = this.collision.addBox({
            id: 'in-exit-door',
            x: 0,
            z: D / 2,
            width: doorWidth,
            depth: 0.4,
            height: doorHeight,
            solid: false
        });

        this.exitDoor = new InteractiveDoor({
            parent: g,
            hinge: { x: -doorWidth / 2, y: 0, z: D / 2 - 0.05 },
            size: { w: doorWidth, h: doorHeight, d: 0.14 },
            material: woodMat,
            openAngle: -Math.PI * 0.75,
            id: 'interior-exit-door',
            label: 'خروج إلى المزرعة 🌿',
            collider: exitDoorCollider,
            interactOffset: { x: doorWidth / 2, y: 0, z: -0.8 }
        });
        this.exitDoor.isExitDoor = true;

        // 5. Fireplace (North wall center)
        const fp = new THREE.Group();
        fp.position.set(0, 0, -D / 2 + 0.5);
        box(fp, [2.4, 2.2, 0.8], [0, 1.1, 0], brickMat);
        box(fp, [1.4, 1.2, 0.6], [0, 0.6, 0.15], M(0x221815)); // Firebox cavity
        box(fp, [2.6, 0.18, 1.0], [0, 2.2, 0.05], woodMat); // Mantelpiece
        // Fire log & warm embers
        const log = box(fp, [0.8, 0.2, 0.25], [0, 0.15, 0.2], M(0x3a2010));
        const fireMesh = box(fp, [0.5, 0.35, 0.2], [0, 0.3, 0.2], M(0xff7700, 0.2));
        fireMesh.material.emissive = new THREE.Color(0xff4400);
        fireMesh.material.emissiveIntensity = 2.0;
        this.fireMesh = fireMesh;
        g.add(fp);
        this.collision.addBox({ id: 'in-fp', x: 0, z: -D / 2 + 0.5, width: 2.6, depth: 1.0, height: 2.5 });

        // 6. Cozy Carpet in front of fireplace
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), rugMat);
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(0, 0.015, -D / 2 + 2.2);
        rug.receiveShadow = true;
        g.add(rug);

        // 7. Large Master Bed (North-West corner)
        const bedGroup = new THREE.Group();
        bedGroup.position.set(-W / 2 + 2.0, 0, -D / 2 + 1.8);
        box(bedGroup, [2.2, 0.45, 2.6], [0, 0.25, 0], woodMat); // Bedframe
        box(bedGroup, [2.0, 0.3, 2.4], [0, 0.5, 0], M(0xf0ede4)); // Mattress
        box(bedGroup, [2.05, 0.1, 1.7], [0, 0.62, 0.3], clothMat); // Quilt / Blanket
        box(bedGroup, [0.8, 0.16, 0.5], [-0.5, 0.68, -0.8], M(0xffffff)); // Pillow 1
        box(bedGroup, [0.8, 0.16, 0.5], [0.5, 0.68, -0.8], M(0xffffff)); // Pillow 2
        box(bedGroup, [2.3, 1.4, 0.18], [0, 0.7, -1.25], woodMat); // Headboard
        g.add(bedGroup);
        this.collision.addBox({ id: 'in-bed', x: -W / 2 + 2.0, z: -D / 2 + 1.8, width: 2.4, depth: 2.8, height: 1.5 });

        // 8. Nightstand with Lamp
        const nightstand = new THREE.Group();
        nightstand.position.set(-W / 2 + 3.6, 0, -D / 2 + 0.7);
        box(nightstand, [0.7, 0.75, 0.6], [0, 0.38, 0], woodMat);
        box(nightstand, [0.2, 0.4, 0.2], [0, 0.95, 0], M(0xd4af37)); // Lamp base
        const lampshade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 8), M(0xfffae0));
        lampshade.position.set(0, 1.25, 0);
        nightstand.add(lampshade);
        g.add(nightstand);
        this.collision.addBox({ id: 'in-nightstand', x: -W / 2 + 3.6, z: -D / 2 + 0.7, width: 0.8, depth: 0.7, height: 1.5 });

        // 9. Dining / Work Table & Chairs (East side)
        const tableGroup = new THREE.Group();
        tableGroup.position.set(W / 2 - 2.2, 0, 0.2);
        box(tableGroup, [1.8, 0.12, 1.2], [0, 0.9, 0], woodMat); // Table top
        [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]].forEach(([lx, lz]) => {
            box(tableGroup, [0.12, 0.9, 0.12], [lx, 0.45, lz], woodMat);
        });
        // Teapot & cups on table
        const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M(0x2980b9));
        teapot.position.set(0, 1.05, 0);
        tableGroup.add(teapot);
        // Chairs
        [[-1.4, 0, 0], [1.4, 0, 0]].forEach(([cx, cy, cz]) => {
            const chair = new THREE.Group();
            chair.position.set(cx, cy, cz);
            box(chair, [0.55, 0.08, 0.55], [0, 0.5, 0], woodMat);
            box(chair, [0.55, 0.7, 0.08], [0, 0.85, 0.24], woodMat);
            [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(([lx, lz]) => {
                box(chair, [0.08, 0.5, 0.08], [lx, 0.25, lz], woodMat);
            });
            tableGroup.add(chair);
        });
        g.add(tableGroup);
        this.collision.addBox({ id: 'in-table', x: W / 2 - 2.2, z: 0.2, width: 3.0, depth: 2.0, height: 1.4 });

        // 10. Interactive Farm Storage Chest (Hay Day Style wooden chest)
        const chestGroup = new THREE.Group();
        chestGroup.name = 'StorageChest';
        chestGroup.position.set(-W / 2 + 1.2, 0, 1.6);
        box(chestGroup, [1.3, 0.7, 0.85], [0, 0.35, 0], woodMat); // Body
        box(chestGroup, [1.34, 0.25, 0.88], [0, 0.78, 0], M(0x42240e)); // Lid
        box(chestGroup, [0.18, 0.22, 0.06], [0, 0.65, 0.44], goldMat); // Clasp / lock
        box(chestGroup, [1.32, 0.06, 0.04], [0, 0.4, 0.43], M(0x222222, 0.5, 0.8)); // Iron band
        box(chestGroup, [1.32, 0.06, 0.04], [0, 0.4, -0.43], M(0x222222, 0.5, 0.8));
        g.add(chestGroup);
        this.chest = chestGroup;
        this.chestPos = new THREE.Vector3(-W / 2 + 1.2, 0, 1.6);
        this.collision.addBox({ id: 'in-chest', x: -W / 2 + 1.2, z: 1.6, width: 1.5, depth: 1.0, height: 1.2, tag: 'chest' });

        // 11. Indoor Lighting
        const amb = new THREE.AmbientLight(0xffeedd, 0.8);
        g.add(amb);
        this.lights.push(amb);

        // Warm Fireplace point light
        const fireLight = new THREE.PointLight(0xff8833, 2.8, 9, 1.2);
        fireLight.position.set(0, 1.0, -D / 2 + 1.2);
        fireLight.castShadow = true;
        g.add(fireLight);
        this.fireLight = fireLight;
        this.lights.push(fireLight);

        // Chandelier / Ceiling lamp center
        const chandelier = new THREE.PointLight(0xfff0d0, 1.8, 12, 1.4);
        chandelier.position.set(0, H - 0.6, 0);
        chandelier.castShadow = true;
        g.add(chandelier);
        this.lights.push(chandelier);

        // Bedside warm reading light
        const bedLight = new THREE.PointLight(0xffdd99, 1.2, 6, 1.5);
        bedLight.position.set(-W / 2 + 3.6, 1.5, -D / 2 + 0.7);
        g.add(bedLight);
        this.lights.push(bedLight);
    }

    update(delta, t) {
        if (!this.group.visible) return;
        if (this.fireLight) {
            this.fireLight.intensity = 2.4 + Math.sin(t * 8.0) * 0.35 + Math.cos(t * 14.0) * 0.25;
        }
        if (this.fireMesh) {
            this.fireMesh.material.emissiveIntensity = 1.6 + Math.sin(t * 9.0) * 0.5;
        }
        if (this.exitDoor) {
            this.exitDoor.update(delta);
        }
    }

    show() {
        this.group.visible = true;
    }

    hide() {
        this.group.visible = false;
    }
}

export default HouseInterior;
