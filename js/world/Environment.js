/**
 * ============================================================
 * Environment.js — Ground, sky, foliage, buildings, animals
 * ============================================================
 */

import * as THREE from 'three';
import { FoliageManager } from './FoliageManager.js';
import { BuildingManager } from './BuildingManager.js';
import { Animals } from './Animals.js';
import { CollisionEngine } from '../core/CollisionEngine.js';

export class Environment {
    constructor(scene, { collision } = {}) {
        this.scene = scene;
        this.collision = collision || new CollisionEngine();
        this.group = new THREE.Group();
        this.group.name = 'Environment';
        scene.add(this.group);
        this.clouds = [];

        this.buildGround();
        this.buildSky();

        this.foliage = new FoliageManager(scene, { collision: this.collision });
        this.buildings = new BuildingManager(scene, { collision: this.collision });
        this.animals = new Animals(scene, { collision: this.collision });
    }

    buildGround() {
        const grass = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 120),
            new THREE.MeshStandardMaterial({ color: 0x579c32, roughness: 1 })
        );
        grass.rotation.x = -Math.PI / 2;
        grass.receiveShadow = true;
        this.group.add(grass);

        const pathMat = new THREE.MeshStandardMaterial({ color: 0xc49355, roughness: 1 });
        const path = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 70), pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.y = 0.015;
        path.receiveShadow = true;
        this.group.add(path);

        for (const x of [-1.25, 1.25]) {
            const rut = new THREE.Mesh(
                new THREE.PlaneGeometry(0.2, 70),
                new THREE.MeshStandardMaterial({ color: 0x986d3e, roughness: 1 })
            );
            rut.rotation.x = -Math.PI / 2;
            rut.position.set(x, 0.025, 0);
            this.group.add(rut);
        }

        const peb = new THREE.IcosahedronGeometry(0.07, 0);
        const pebbles = new THREE.InstancedMesh(
            peb,
            new THREE.MeshStandardMaterial({ color: 0x80694e }),
            100
        );
        const mt = new THREE.Matrix4();
        for (let i = 0; i < 100; i++) {
            mt.makeTranslation((Math.random() - 0.5) * 4, Math.random() * 0.08, (Math.random() - 0.5) * 65);
            pebbles.setMatrixAt(i, mt);
        }
        this.group.add(pebbles);
    }

    buildSky() {
        const sun = new THREE.Mesh(
            new THREE.SphereGeometry(2, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xffd27a })
        );
        sun.position.set(-30, 24, -55);
        this.group.add(sun);

        const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
        for (let i = 0; i < 8; i++) {
            const g = new THREE.Group();
            for (let p = 0; p < 5; p++) {
                const m = new THREE.Mesh(
                    new THREE.SphereGeometry(1.5 + Math.random() * 1.4, 9, 7),
                    cloudMat
                );
                m.position.set(p * 1.8, (p % 2) * 0.7, Math.random());
                g.add(m);
            }
            g.position.set(-38 + i * 11, 18 + Math.random() * 10, -42 - Math.random() * 18);
            this.clouds.push(g);
            this.group.add(g);
        }
    }

    getNearestDoor(position, maxDist = 2.6) {
        return this.buildings?.getNearestDoor(position, maxDist) || null;
    }

    update(delta, t) {
        this.clouds.forEach((c) => {
            c.position.x += delta * 0.35;
            if (c.position.x > 50) c.position.x = -50;
        });
        this.foliage.update(t);
        this.buildings.update(delta);
        this.animals.update(t, delta);
    }
}

export default Environment;
