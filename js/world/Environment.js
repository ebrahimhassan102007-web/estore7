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
import { mergeGroupChildren, mergeMeshes, mergeSubtree } from './MergeUtils.js';

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
        // تُحفظ المادة للصبغة الموسمية (انظر setSeason).
        this.groundMat = new THREE.MeshStandardMaterial({ color: 0x579c32, roughness: 1 });
        const grass = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 120),
            this.groundMat
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

        // ممرات المناطق: لا تصادم عليها (ديكور مسطّح)، وارتفاعات متدرجة
        // قليلًا حتى لا يتصارع z-fighting عند التقاطعات.
        this._spurPath(14.5, -7.5, 21, 3, 0.02);   // شرق ↔ غرب شمال الحقول
        this._spurPath(6.5, 7, 3, 30, 0.025);      // غرب منطقة الحقول طوليًا
        this._spurPath(-10, 2, 2.5, 22, 0.02);     // أمام حظائر الحيوانات غربًا

        this.buildEdge();
    }

    /**
     * حواف العالم: تلال + صف أشجار بعيد + بركة + صخور — حتى لا يسقط
     * البصر في فراغ، وحتى يكون للحائط غير المرئي سبب بصري.
     */
    buildEdge() {
        // --- تلال ناعمة في الأفق (mesh واحد مدموج) ---
        const hillMat = new THREE.MeshStandardMaterial({ color: 0x4c8a2e, roughness: 1 });
        const hills = [];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + 0.22;
            const r = 44 + (i % 3) * 4;
            const hill = new THREE.Mesh(
                new THREE.SphereGeometry(7 + (i % 4) * 1.6, 10, 7),
                hillMat
            );
            hill.position.set(Math.cos(a) * r, -2.4, Math.sin(a) * r);
            hill.scale.y = 0.45;
            this.group.add(hill);
            hills.push(hill);
        }
        mergeMeshes(hills, { name: 'Edge-hills' });

        // --- صف أشجار بعيد خارج متناول اللاعب (mesh واحد مدموج) ---
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x68401f, roughness: 1 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f792e, roughness: 1 });
        const treeLine = new THREE.Group();
        treeLine.name = 'TreeLine';
        this.group.add(treeLine);
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + 0.1;
            const r = 34 + (i % 2) * 3;
            const t = new THREE.Group();
            t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.42, 2.8, 6), trunkMat);
            trunk.position.y = 1.4;
            t.add(trunk);
            const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), leafMat);
            c1.position.y = 3.6;
            t.add(c1);
            const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), leafMat);
            c2.position.set(0.35, 4.6, 0.2);
            t.add(c2);
            treeLine.add(t);
        }
        mergeSubtree(treeLine, { name: 'TreeLine-merged' });

        // --- بركة غرب-جنوب: رمل + ماء + تصادم ---
        const sand = new THREE.Mesh(
            new THREE.CircleGeometry(5.8, 24),
            new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 1 })
        );
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(-25, 0.012, 20);
        sand.receiveShadow = true;
        this.group.add(sand);

        this.pondWater = new THREE.Mesh(
            new THREE.CircleGeometry(4.7, 24),
            new THREE.MeshStandardMaterial({
                color: 0x3f9fd0, roughness: 0.25, metalness: 0.1,
                transparent: true, opacity: 0.85
            })
        );
        this.pondWater.rotation.x = -Math.PI / 2;
        this.pondWater.position.set(-25, 0.035, 20);
        this.group.add(this.pondWater);

        if (this.collision) {
            this.collision.addBox({
                id: 'pond', x: -25, z: 20,
                width: 9.4, depth: 9.4, height: 1,
                tag: 'water'
            });
        }

        // --- صخور متناثرة قرب الحواف (mesh واحد + تصادم لكل صخرة) ---
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 1 });
        const rockSpots = [[27, -20, 1.2], [-27, -14, 1.0], [27, 4, 0.8], [-21, 27.5, 1.1]];
        const rocks = [];
        rockSpots.forEach(([x, z, s], i) => {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
            rock.position.set(x, s * 0.42, z);
            rock.rotation.set(i * 1.3, i * 2.1, i * 0.7);
            rock.scale.y = 0.75;
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.group.add(rock);
            rocks.push(rock);
            if (this.collision) {
                this.collision.addBox({
                    id: 'rock-' + i, x, z,
                    width: s * 1.5, depth: s * 1.5, height: 1.6,
                    tag: 'rock'
                });
            }
        });
        mergeMeshes(rocks, { name: 'Edge-rocks' });
    }

    /** صبغة موسمية خفيفة: الشتاء أبرد وأقل تشبعًا. تُستدعى عند تغيّر الموسم فقط. */
    setSeason(season) {
        if (!season || season === this._season) return;
        this._season = season;
        const tints = {
            spring: { ground: 0x579c32, grass: 0x4d9a2c },
            summer: { ground: 0x5da437, grass: 0x55a32e },
            autumn: { ground: 0x7d9a3a, grass: 0x8a9a2f },
            winter: { ground: 0x527d52, grass: 0x4a7a5e }
        };
        const t = tints[season] || tints.spring;
        if (this.groundMat) this.groundMat.color.setHex(t.ground);
        if (this.foliage && typeof this.foliage.setSeasonTint === 'function') {
            this.foliage.setSeasonTint(t.grass);
        }
    }

    _spurPath(x, z, width, length, y) {
        const spur = new THREE.Mesh(
            new THREE.PlaneGeometry(width, length),
            new THREE.MeshStandardMaterial({ color: 0xc49355, roughness: 1 })
        );
        spur.rotation.x = -Math.PI / 2;
        spur.position.set(x, y, z);
        spur.receiveShadow = true;
        this.group.add(spur);
        return spur;
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
            // 5 كرات لكل غيمة كانت 5 نداءات رسم — تُدمج في واحدة
            mergeGroupChildren(g, { name: 'Cloud' });
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
        if (this.pondWater) {
            this.pondWater.material.opacity = 0.8 + Math.sin(t * 0.9) * 0.06;
        }
        this.foliage.update(t);
        this.buildings.update(delta);
        this.animals.update(t, delta);
    }
}

export default Environment;
