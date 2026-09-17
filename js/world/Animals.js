/**
 * ============================================================
 * Animals.js — Detailed procedural animal rigs
 * ============================================================
 * Each animal is a small hierarchy (body, neck/head, legs, tail)
 * with idle / walk cycles driven by sine IK-style poses.
 * ============================================================
 */

import * as THREE from 'three';

const M = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

function mesh(geo, material, pos = [0, 0, 0], parent) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
}

class AnimalRig {
    constructor({ type, x, z, scale = 1, collision = null, homeRadius = 3.2 }) {
        this.type = type;
        this.root = new THREE.Group();
        this.root.name = type;
        this.root.position.set(x, 0, z);
        this.root.scale.setScalar(scale);

        this.home = new THREE.Vector2(x, z);
        this.target = new THREE.Vector2(x, z);
        this.homeRadius = homeRadius;
        this.state = 'idle';
        this.walkSpeed = 0.55 + Math.random() * 0.4;
        this.phase = Math.random() * Math.PI * 2;
        this.pauseUntil = Math.random() * 2;
        this.clock = 0;
        this.radius = type === 'cow' ? 0.7 : type === 'chicken' || type === 'rooster' ? 0.28 : 0.5;

        this.parts = { legs: [], extras: [] };
        this.build(type);

        this.collider = null;
        if (collision) {
            this.collider = collision.addBox({
                id: `animal-${type}-${x.toFixed(1)}-${z.toFixed(1)}`,
                x,
                z,
                width: this.radius * 1.8,
                depth: this.radius * 1.8,
                height: 1.6,
                tag: 'animal'
            });
        }
    }

    part(geo, material, pos, parent = this.root) {
        return mesh(geo, material, pos, parent);
    }

    build(type) {
        if (type === 'cow') this.buildCow();
        else if (type === 'pig') this.buildPig();
        else if (type === 'sheep') this.buildSheep();
        else if (type === 'rooster') this.buildBird(true);
        else this.buildBird(false);
    }

    addLeg(parent, x, z, length, radius, color, hoofColor) {
        const hip = new THREE.Group();
        hip.position.set(x, length, z);
        parent.add(hip);

        const upper = mesh(
            new THREE.CylinderGeometry(radius * 0.85, radius, length * 0.55, 6),
            M(color),
            [0, -length * 0.28, 0],
            hip
        );
        const knee = new THREE.Group();
        knee.position.set(0, -length * 0.55, 0);
        hip.add(knee);
        mesh(
            new THREE.CylinderGeometry(radius * 0.7, radius * 0.8, length * 0.45, 6),
            M(color),
            [0, -length * 0.22, 0],
            knee
        );
        mesh(
            new THREE.BoxGeometry(radius * 2.1, radius * 0.7, radius * 2.6),
            M(hoofColor),
            [0, -length * 0.48, 0.04],
            knee
        );

        this.parts.legs.push({ hip, knee, length });
        return hip;
    }

    buildCow() {
        const hide = M(0xf3eee4);
        const dark = M(0x2a241f);
        const pink = M(0xe89a90);
        const horn = M(0xf0e6c8, { roughness: 0.55 });

        const body = new THREE.Group();
        body.position.y = 0.95;
        this.root.add(body);
        this.parts.body = body;

        this.part(new THREE.BoxGeometry(1.85, 1.05, 0.95), hide, [0, 0, 0], body);
        this.part(new THREE.SphereGeometry(0.28, 8, 6), dark, [-0.45, 0.22, 0.38], body);
        this.part(new THREE.SphereGeometry(0.22, 8, 6), dark, [0.55, -0.1, -0.32], body);
        this.part(new THREE.SphereGeometry(0.16, 7, 5), pink, [0, -0.52, 0.12], body);

        const neck = new THREE.Group();
        neck.position.set(0, 0.35, 0.55);
        body.add(neck);
        this.parts.neck = neck;

        const head = this.part(new THREE.BoxGeometry(0.62, 0.55, 0.7), hide, [0, 0.05, 0.42], neck);
        this.parts.head = head;
        this.part(new THREE.BoxGeometry(0.38, 0.28, 0.32), pink, [0, -0.08, 0.48], head);
        this.part(new THREE.SphereGeometry(0.055, 6, 5), dark, [-0.16, 0.12, 0.36], head);
        this.part(new THREE.SphereGeometry(0.055, 6, 5), dark, [0.16, 0.12, 0.36], head);

        const earL = this.part(new THREE.BoxGeometry(0.18, 0.28, 0.08), hide, [-0.4, 0.22, 0.05], head);
        earL.rotation.z = 0.4;
        const earR = this.part(new THREE.BoxGeometry(0.18, 0.28, 0.08), hide, [0.4, 0.22, 0.05], head);
        earR.rotation.z = -0.4;
        this.parts.ears = [earL, earR];

        const hornL = this.part(new THREE.ConeGeometry(0.06, 0.28, 6), horn, [-0.22, 0.42, 0.05], head);
        hornL.rotation.z = 0.45;
        const hornR = this.part(new THREE.ConeGeometry(0.06, 0.28, 6), horn, [0.22, 0.42, 0.05], head);
        hornR.rotation.z = -0.45;

        [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.95, 0.1, 0x2a241f, 0x1a1612);
        });

        const tail = new THREE.Group();
        tail.position.set(0, 1.25, -0.5);
        this.root.add(tail);
        this.part(new THREE.CylinderGeometry(0.035, 0.045, 0.7, 5), hide, [0, -0.25, -0.15], tail).rotation.x = 0.5;
        this.part(new THREE.SphereGeometry(0.08, 6, 5), dark, [0, -0.55, -0.32], tail);
        this.parts.tail = tail;
    }

    buildPig() {
        const pink = M(0xf09e91);
        const dark = M(0x3a221c);

        const body = new THREE.Group();
        body.position.y = 0.62;
        this.root.add(body);
        this.parts.body = body;

        const torso = this.part(new THREE.SphereGeometry(0.55, 10, 8), pink, [0, 0, 0], body);
        torso.scale.set(1.35, 0.85, 0.95);

        const neck = new THREE.Group();
        neck.position.set(0, 0.12, 0.42);
        body.add(neck);
        this.parts.neck = neck;

        const head = this.part(new THREE.SphereGeometry(0.36, 9, 7), pink, [0, 0.06, 0.28], neck);
        this.parts.head = head;
        const snout = this.part(new THREE.CylinderGeometry(0.14, 0.17, 0.16, 8), pink, [0, -0.02, 0.38], head);
        snout.rotation.x = Math.PI / 2;
        this.part(new THREE.SphereGeometry(0.03, 5, 4), dark, [-0.05, 0.02, 0.47], head);
        this.part(new THREE.SphereGeometry(0.03, 5, 4), dark, [0.05, 0.02, 0.47], head);
        this.part(new THREE.SphereGeometry(0.045, 6, 5), dark, [-0.12, 0.12, 0.28], head);
        this.part(new THREE.SphereGeometry(0.045, 6, 5), dark, [0.12, 0.12, 0.28], head);

        const earL = this.part(new THREE.ConeGeometry(0.12, 0.22, 5), pink, [-0.22, 0.28, 0.05], head);
        earL.rotation.z = 0.55;
        const earR = this.part(new THREE.ConeGeometry(0.12, 0.22, 5), pink, [0.22, 0.28, 0.05], head);
        earR.rotation.z = -0.55;
        this.parts.ears = [earL, earR];

        [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.55, 0.08, 0xf09e91, 0x4a3028);
        });

        const tail = new THREE.Group();
        tail.position.set(0, 0.85, -0.55);
        this.root.add(tail);
        const curl = this.part(new THREE.TorusGeometry(0.1, 0.028, 6, 10), pink, [0, 0.08, 0], tail);
        curl.rotation.y = Math.PI / 2;
        this.parts.tail = tail;
    }

    buildSheep() {
        const wool = M(0xf7f3ea);
        const dark = M(0x2b241c);

        const body = new THREE.Group();
        body.position.y = 0.78;
        this.root.add(body);
        this.parts.body = body;

        this.part(new THREE.DodecahedronGeometry(0.62, 1), wool, [0, 0, 0], body);
        this.part(new THREE.SphereGeometry(0.38, 8, 6), wool, [0.15, 0.18, 0.1], body);
        this.part(new THREE.SphereGeometry(0.32, 8, 6), wool, [-0.22, 0.05, -0.12], body);

        const neck = new THREE.Group();
        neck.position.set(0, 0.05, 0.5);
        body.add(neck);
        this.parts.neck = neck;

        const head = this.part(new THREE.BoxGeometry(0.38, 0.42, 0.48), dark, [0, 0.02, 0.28], neck);
        this.parts.head = head;
        this.part(new THREE.SphereGeometry(0.04, 6, 5), M(0x111111), [-0.1, 0.1, 0.25], head);
        this.part(new THREE.SphereGeometry(0.04, 6, 5), M(0x111111), [0.1, 0.1, 0.25], head);

        const earL = this.part(new THREE.BoxGeometry(0.12, 0.22, 0.06), dark, [-0.26, 0.08, 0.02], head);
        earL.rotation.z = 0.5;
        const earR = this.part(new THREE.BoxGeometry(0.12, 0.22, 0.06), dark, [0.26, 0.08, 0.02], head);
        earR.rotation.z = -0.5;
        this.parts.ears = [earL, earR];

        [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.7, 0.07, 0x2b241c, 0x1a1612);
        });

        const tail = new THREE.Group();
        tail.position.set(0, 0.95, -0.52);
        this.root.add(tail);
        this.part(new THREE.SphereGeometry(0.12, 6, 5), wool, [0, 0, 0], tail);
        this.parts.tail = tail;
    }

    buildBird(isRooster) {
        const bodyCol = isRooster ? 0x9c4823 : 0xf5eee0;
        const accent = isRooster ? 0xc45c28 : 0xf0d9b5;
        const comb = M(0xd32f2f);
        const beak = M(0xe9a020);
        const dark = M(0x222222);

        const body = new THREE.Group();
        body.position.y = 0.38;
        this.root.add(body);
        this.parts.body = body;

        const torso = this.part(new THREE.SphereGeometry(0.28, 9, 7), M(bodyCol), [0, 0, 0], body);
        torso.scale.set(1.05, 0.9, 1.25);

        const neck = new THREE.Group();
        neck.position.set(0, 0.18, 0.18);
        body.add(neck);
        this.parts.neck = neck;

        const head = this.part(new THREE.SphereGeometry(0.16, 8, 6), M(accent), [0, 0.16, 0.12], neck);
        this.parts.head = head;
        const beakMesh = this.part(new THREE.ConeGeometry(0.05, 0.16, 5), beak, [0, -0.02, 0.2], head);
        beakMesh.rotation.x = Math.PI / 2;
        this.part(new THREE.SphereGeometry(0.025, 5, 4), dark, [-0.06, 0.04, 0.12], head);
        this.part(new THREE.SphereGeometry(0.025, 5, 4), dark, [0.06, 0.04, 0.12], head);

        const crest = this.part(
            new THREE.ConeGeometry(isRooster ? 0.07 : 0.045, isRooster ? 0.18 : 0.1, 5),
            comb,
            [0, 0.18, 0],
            head
        );
        this.parts.extras.push(crest);
        if (isRooster) {
            this.part(new THREE.SphereGeometry(0.05, 5, 4), comb, [0, -0.08, 0.12], head);
        }

        const wingL = this.part(new THREE.SphereGeometry(0.14, 7, 5), M(bodyCol), [-0.26, 0.02, 0], body);
        wingL.scale.set(0.45, 0.7, 1.1);
        const wingR = this.part(new THREE.SphereGeometry(0.14, 7, 5), M(bodyCol), [0.26, 0.02, 0], body);
        wingR.scale.set(0.45, 0.7, 1.1);
        this.parts.wings = [wingL, wingR];

        [[-0.08, 0.04], [0.08, 0.04]].forEach(([lx, lz]) => {
            this.addLeg(this.root, lx, lz, 0.32, 0.035, 0xe9a020, 0xd4880f);
        });

        const tail = new THREE.Group();
        tail.position.set(0, 0.42, -0.28);
        this.root.add(tail);
        const feathers = isRooster ? 5 : 3;
        for (let i = 0; i < feathers; i++) {
            const f = this.part(
                new THREE.ConeGeometry(0.05, isRooster ? 0.42 : 0.22, 4),
                M(isRooster ? (i % 2 ? 0x3d5a80 : 0xc45c28) : bodyCol),
                [(i - feathers / 2) * 0.06, 0.1, -0.08],
                tail
            );
            f.rotation.x = 1.1 + i * 0.08;
        }
        this.parts.tail = tail;
    }

    pickTarget() {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * this.homeRadius;
        this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
    }

    animate(t) {
        const walking = this.state === 'walk';
        const gait = walking ? t * 7.2 + this.phase : t * 1.6 + this.phase;
        const amp = walking ? 0.55 : 0.08;

        this.parts.legs.forEach((leg, i) => {
            const swing = Math.sin(gait + (i % 2 === 0 ? 0 : Math.PI)) * amp;
            leg.hip.rotation.x = swing;
            if (leg.knee) leg.knee.rotation.x = Math.max(0, -swing) * 0.45;
        });

        if (this.parts.body) {
            this.parts.body.position.y =
                (this.type === 'cow' ? 0.95 : this.type === 'sheep' ? 0.78 : this.type === 'pig' ? 0.62 : 0.38) +
                (walking ? Math.abs(Math.sin(gait)) * 0.045 : Math.sin(t * 2 + this.phase) * 0.012);
        }

        if (this.parts.neck) {
            const peck =
                this.type === 'chicken' || this.type === 'rooster'
                    ? (this.state === 'idle' && Math.sin(t * 1.3 + this.phase) > 0.85 ? 0.7 : 0)
                    : 0;
            this.parts.neck.rotation.x = Math.sin(t * 1.4 + this.phase) * 0.08 + peck;
        }

        if (this.parts.tail) {
            this.parts.tail.rotation.y = Math.sin(t * (walking ? 6 : 2.2) + this.phase) * 0.35;
            this.parts.tail.rotation.x = 0.15 + Math.sin(t * 1.8) * 0.08;
        }

        if (this.parts.ears) {
            this.parts.ears.forEach((ear, i) => {
                ear.rotation.z += Math.sin(t * 3 + i) * 0.002;
            });
        }

        if (this.parts.wings) {
            const flap = walking ? Math.sin(gait) * 0.25 : Math.sin(t * 2 + this.phase) * 0.08;
            this.parts.wings[0].rotation.z = 0.2 + flap;
            this.parts.wings[1].rotation.z = -0.2 - flap;
        }
    }

    update(t, delta) {
        this.clock = t;

        if (t > this.pauseUntil) {
            if (this.state === 'idle') {
                if (Math.random() < 0.012) {
                    this.pickTarget();
                    this.state = 'walk';
                }
            } else {
                const dx = this.target.x - this.root.position.x;
                const dz = this.target.y - this.root.position.z;
                const dist = Math.hypot(dx, dz);
                if (dist < 0.18) {
                    this.state = 'idle';
                    this.pauseUntil = t + 1.2 + Math.random() * 3.5;
                } else {
                    const step = this.walkSpeed * delta;
                    this.root.position.x += (dx / dist) * step;
                    this.root.position.z += (dz / dist) * step;
                    const face = Math.atan2(dx, dz);
                    let yaw = this.root.rotation.y;
                    let diff = ((face - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                    this.root.rotation.y = yaw + diff * Math.min(1, 6 * delta);
                }
            }
        }

        this.animate(t);

        if (this.collider) {
            this.collider.setFromCenter(
                this.root.position.x,
                this.root.position.z,
                this.radius * 1.8,
                this.radius * 1.8,
                0,
                1.6
            );
        }
    }
}

export class Animals {
    constructor(scene, { collision } = {}) {
        this.group = new THREE.Group();
        this.group.name = 'Animals';
        scene.add(this.group);
        this.collision = collision || null;
        this.animals = [];
        this.build();
    }

    spawn(type, x, z, scale = 1, homeRadius = 3.2) {
        const rig = new AnimalRig({
            type,
            x,
            z,
            scale,
            collision: this.collision,
            homeRadius
        });
        this.group.add(rig.root);
        this.animals.push(rig);
        return rig;
    }

    build() {
        this.spawn('pig', -15, 7, 1.05, 2.6);
        this.spawn('pig', -18, 9, 0.9, 2.6);
        this.spawn('sheep', -8, -1, 1.0, 2.4);
        this.spawn('sheep', -11, 1, 0.85, 2.4);
        this.spawn('cow', 14, 4, 1.1, 2.8);
        this.spawn('cow', 18, 6, 0.9, 2.8);
        this.spawn('chicken', 2, 3, 0.85, 2.2);
        this.spawn('rooster', -2, 1, 0.95, 2.2);
        this.spawn('chicken', 0.6, 1.6, 0.75, 2.0);
    }

    update(t, delta = 0.016) {
        for (let i = 0; i < this.animals.length; i++) {
            this.animals[i].update(t, delta);
        }
    }
}

export default Animals;
