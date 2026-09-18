/**
 * ============================================================
 * BuildingManager.js — Farm structures + interactive doors
 * ============================================================
 */

import * as THREE from 'three';
import { InteractiveDoor } from './Doors.js';
import { mergeGroupChildren } from './MergeUtils.js';

const mat = (color, roughness = 0.85, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(group, size, pos, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

export class BuildingManager {
    constructor(scene, { collision } = {}) {
        this.scene = scene;
        this.collision = collision || null;
        this.group = new THREE.Group();
        this.group.name = 'Buildings';
        scene.add(this.group);
        this.rotors = [];
        this.doors = [];
        this.build();
    }

    build() {
        this.farmhouse();
        this.barn();
        this.silo();
        this.windmill();
        this.market();
        this.fences();
        this.sign();
    }

    farmhouse() {
        const g = new THREE.Group();
        g.name = 'Farmhouse';
        g.position.set(-13, 0, -13);

        const blue = mat(0x397f9f);
        const white = mat(0xf5ead7);
        const stone = mat(0x77756b);
        const roof = mat(0x354653);
        const wood = mat(0x6a3925);

        box(g, [8, 0.8, 7], [0, 0.4, 0], stone);
        box(g, [7.6, 4, 6.6], [0, 2.7, 0], blue);

        const r = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3, 4), roof);
        r.rotation.y = Math.PI / 4;
        r.position.y = 6;
        r.castShadow = true;
        g.add(r);

        box(g, [8.6, 0.3, 2.2], [0, 1.2, 4.2], mat(0x9a6a3e));
        [-3.4, 3.4].forEach((x) => box(g, [0.25, 3, 0.25], [x, 2.7, 4.2], white));

        [-2.4, 2.4].forEach((x) => {
            box(g, [1.25, 1.5, 0.15], [x, 3.15, 3.39], white);
            box(g, [0.08, 1.4, 0.2], [x, 3.15, 3.5], blue);
        });

        let doorCollider = null;
        if (this.collision) {
            const walls = this.collision.addBuildingWalls({
                id: 'farmhouse',
                x: -13,
                z: -13,
                width: 7.6,
                depth: 6.6,
                thickness: 0.42,
                height: 4.2,
                door: { side: 'south', width: 1.85 }
            });
            doorCollider = walls.door;
        }

        const door = new InteractiveDoor({
            parent: g,
            hinge: { x: -0.9, y: 0.85, z: 3.38 },
            size: { w: 1.8, h: 3.0, d: 0.14 },
            material: wood,
            openAngle: Math.PI * 0.82,
            id: 'farmhouse-door',
            label: 'باب البيت',
            collider: doorCollider,
            interactOffset: { x: 0.9, y: 0, z: 0.7 }
        });
        this.doors.push(door);

        this.group.add(g);
        // الدمج لا يلمس الـ pivot (Group) فالباب يبقى متحركًا
        mergeGroupChildren(g, { name: 'Farmhouse-body' });
    }

    barn() {
        const g = new THREE.Group();
        g.name = 'Barn';
        g.position.set(14, 0, -12);

        const red = mat(0x9f2925);
        const darkRed = mat(0x641814);
        const white = mat(0xf5eee0);
        const wood = mat(0x5c3218);

        box(g, [8, 5, 7], [0, 2.5, 0], red);
        const r = new THREE.Mesh(new THREE.ConeGeometry(5.7, 3.2, 4), mat(0x3a3430));
        r.rotation.y = Math.PI / 4;
        r.position.y = 6.4;
        r.castShadow = true;
        g.add(r);

        [-3.9, 3.9].forEach((x) => box(g, [0.25, 5.1, 0.25], [x, 2.55, 3.58], white));

        let doorCollider = null;
        if (this.collision) {
            const walls = this.collision.addBuildingWalls({
                id: 'barn',
                x: 14,
                z: -12,
                width: 8,
                depth: 7,
                thickness: 0.42,
                height: 5,
                door: { side: 'south', width: 5.8 }
            });
            doorCollider = walls.door;
        }

        const left = new InteractiveDoor({
            parent: g,
            hinge: { x: -3.0, y: 0.12, z: 3.55 },
            size: { w: 2.95, h: 4.0, d: 0.14 },
            material: darkRed,
            openAngle: Math.PI * 0.78,
            id: 'barn-door-left',
            label: 'باب الحظيرة',
            collider: doorCollider,
            interactOffset: { x: 1.5, y: 0, z: 0.7 }
        });
        const right = new InteractiveDoor({
            parent: g,
            hinge: { x: 3.0, y: 0.12, z: 3.55 },
            size: { w: 2.95, h: 4.0, d: 0.14 },
            material: red,
            openAngle: -Math.PI * 0.78,
            id: 'barn-door-right',
            label: 'باب الحظيرة',
            collider: null,
            interactOffset: { x: -1.5, y: 0, z: 0.7 }
        });
        // Flip the right door so it hangs from the right jamb.
        right.mesh.position.x = -2.95 * 0.5;
        right.handle.position.x = -0.22;
        this.doors.push(left, right);

        for (const x of [-1.7, 1.7]) {
            const a = box(g, [0.18, 4, 0.2], [x, 2.1, 3.72], white);
            a.rotation.z = 0.62;
            const b = a.clone();
            b.rotation.z = -0.62;
            g.add(b);
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Barn-body' });
        this._barnDoors = { left, right, collider: doorCollider };
    }

    silo() {
        const g = new THREE.Group();
        g.name = 'Silo';
        g.position.set(20, 0, -11);

        const metal = mat(0xabb3b0, 0.38, 0.72);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 18), metal);
        body.position.y = 3;
        body.castShadow = true;
        g.add(body);

        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(2.02, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            metal
        );
        cap.position.y = 6;
        g.add(cap);

        for (let y = 0.6; y < 6; y += 0.55) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(2.02, 0.035, 5, 24),
                mat(0x737c7d, 0.3, 0.8)
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            g.add(ring);
        }

        if (this.collision) {
            this.collision.addBox({
                id: 'silo',
                x: 20,
                z: -11,
                width: 4.1,
                depth: 4.1,
                height: 6,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Silo-body' });
    }

    windmill() {
        const g = new THREE.Group();
        g.name = 'Windmill';
        g.position.set(5, 0, -22);

        const wood = mat(0x5c432c);
        for (const x of [-1, 1]) {
            const p = box(g, [0.22, 7, 0.22], [x, 3.5, 0], wood);
            p.rotation.z = x * 0.16;
        }

        const rotor = new THREE.Group();
        rotor.position.set(0, 6.4, 0.25);
        for (let i = 0; i < 8; i++) {
            const blade = box(rotor, [0.22, 3.6, 0.12], [0, 1.8, 0], mat(0xc1b69b));
            const ang = (i * Math.PI) / 4;
            blade.rotation.z = ang;
            blade.position.set(-Math.sin(ang) * 1.8, Math.cos(ang) * 1.8, 0);
        }
        g.add(rotor);
        this.rotors.push(rotor);
        mergeGroupChildren(rotor, { name: 'Windmill-blades' });

        if (this.collision) {
            this.collision.addBox({
                id: 'windmill',
                x: 5,
                z: -22,
                width: 2.2,
                depth: 2.2,
                height: 7,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Windmill-tower' });
    }

    market() {
        const g = new THREE.Group();
        g.name = 'Market';
        g.position.set(8, 0, 11);

        const wood = mat(0x84502a);
        box(g, [5, 1.3, 2.4], [0, 0.65, 0], wood);
        [-2, 2].forEach((x) => box(g, [0.18, 4, 0.18], [x, 2, 0], wood));
        box(g, [5.5, 0.25, 3], [0, 4, 0], mat(0xf0eee3));
        for (let x = -2.25; x < 2.5; x += 1) {
            box(g, [0.5, 0.28, 3.05], [x, 4.03, 0], mat(0xe47b2f));
        }

        ['🍅', '🌽', '🥕'].forEach((emoji, i) => {
            const c = document.createElement('canvas');
            c.width = c.height = 64;
            const ctx = c.getContext('2d');
            ctx.font = '44px sans-serif';
            ctx.fillText(emoji, 8, 48);
            const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) })
            );
            sprite.position.set(i * 1.3 - 1.3, 1.6, 1.3);
            sprite.scale.set(0.8, 0.8, 1);
            g.add(sprite);
        });

        if (this.collision) {
            this.collision.addBox({
                id: 'market',
                x: 8,
                z: 11,
                width: 5.2,
                depth: 2.6,
                height: 2,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Market-body' });
    }

    fences() {
        const wood = mat(0xf2eee0);
        const gap = 3.4;

        for (const z of [-5, 18]) {
            for (let x = -27; x <= 27; x += 3) {
                if (Math.abs(x) < gap) continue;
                box(this.group, [0.16, 1.6, 0.16], [x, 0.8, z], wood);
                box(this.group, [3, 0.14, 0.14], [x + 1.5, 0.65, z], wood);
                box(this.group, [3, 0.14, 0.14], [x + 1.5, 1.25, z], wood);
            }
            box(this.group, [0.22, 2.15, 0.22], [-gap, 1.08, z], wood);
            box(this.group, [0.22, 2.15, 0.22], [gap, 1.08, z], wood);

            if (this.collision) {
                this.collision.addBox({
                    id: `fence-${z}-l`,
                    x: (-27 + -gap) * 0.5,
                    z,
                    width: 27 - gap,
                    depth: 0.32,
                    height: 1.6,
                    tag: 'fence'
                });
                this.collision.addBox({
                    id: `fence-${z}-r`,
                    x: (27 + gap) * 0.5,
                    z,
                    width: 27 - gap,
                    depth: 0.32,
                    height: 1.6,
                    tag: 'fence'
                });
            }
        }

        /*
         * ~100 صندوق سياج = ~100 نداء رسم. كلها أبناء مباشرون لـ this.group
         * وبنفس المادة، فتُدمج في mesh واحد (المباني مجموعات Groups فلا تُمس).
         */
        mergeGroupChildren(this.group, { name: 'Fences' });
    }

    sign() {
        const g = new THREE.Group();
        g.position.set(0, 0, 7);
        box(g, [0.22, 2.5, 0.22], [0, 1.25, 0], mat(0x60401f));
        box(g, [5, 1.15, 0.22], [0, 2.2, 0], mat(0x8b572c));

        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 220;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff3c9';
        ctx.font = 'bold 66px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('مزرعتك - انت تستحق الأفضل ❤️', 512, 140);
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })
        );
        sprite.position.set(0, 2.2, 0.14);
        sprite.scale.set(4.7, 1, 1);
        g.add(sprite);
        this.group.add(g);
        mergeGroupChildren(g, { name: 'Sign-body' });

        if (this.collision) {
            this.collision.addBox({
                id: 'sign',
                x: 0,
                z: 7,
                width: 0.5,
                depth: 0.5,
                height: 2.5,
                tag: 'prop'
            });
        }
    }

    getNearestDoor(position, maxDist = 2.6) {
        let best = null;
        let bestDist = maxDist;
        for (const door of this.doors) {
            const d = door.distanceTo(position);
            if (d < bestDist) {
                bestDist = d;
                best = door;
            }
        }
        return best;
    }

    update(delta) {
        this.rotors.forEach((r) => {
            r.rotation.z -= delta * 0.5;
        });
        this.doors.forEach((door) => door.update(delta));

        if (this._barnDoors?.collider) {
            const { left, right, collider } = this._barnDoors;
            collider.solid = Math.abs(left.angle) < 0.38 || Math.abs(right.angle) < 0.38;
        }
    }
}

export default BuildingManager;
