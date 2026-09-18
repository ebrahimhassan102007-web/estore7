/**
 * ============================================================
 * FoliageManager.js — Instanced grass with a wind vertex shader,
 * wildflowers, and collidable trees.
 * ============================================================
 */

import * as THREE from 'three';
import { mergeMeshes } from './MergeUtils.js';

export class FoliageManager {
    constructor(scene, { collision } = {}) {
        this.scene = scene;
        this.collision = collision || null;
        this.group = new THREE.Group();
        this.group.name = 'foliage';
        scene.add(this.group);

        this.grass = null;
        this._grassUniforms = { uTime: { value: 0 } };
        this._windTime = 0;
        this.trees = [];

        this.build();
    }

    build() {
        this.buildGrass();
        this.buildFlowers();
        this.buildTrees();
    }

    buildGrass() {
        const bladeGeo = new THREE.ConeGeometry(0.045, 0.48, 3);
        bladeGeo.translate(0, 0.24, 0);

        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0x4d9a2c,
            roughness: 1,
            flatShading: true
        });
        bladeMat.customProgramCacheKey = () => 'wind-grass-v1';
        bladeMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = this._grassUniforms.uTime;
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>\nuniform float uTime;`
                )
                .replace(
                    '#include <begin_vertex>',
                    `
                    vec3 transformed = vec3(position);
                    float h = max(position.y, 0.0);
                    vec3 worldP = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                    float gust = sin(uTime * 1.45 + worldP.x * 0.42 + worldP.z * 0.31);
                    float ripple = cos(uTime * 0.9 + worldP.z * 0.55);
                    transformed.x += (gust * 0.55 + ripple * 0.18) * h * h;
                    transformed.z += (cos(uTime * 1.15 + worldP.x * 0.28) * 0.32) * h * h;
                    `
                );
            this._grassShader = shader;
        };

        const points = [];
        for (let i = 0; i < 1400; i++) {
            const x = (Math.random() - 0.5) * 68;
            const z = (Math.random() - 0.5) * 68;
            if (Math.abs(x) < 2.5 || (Math.abs(x) < 7 && z > -18 && z < 14)) continue;
            points.push([x, z]);
        }

        this.grass = new THREE.InstancedMesh(bladeGeo, bladeMat, points.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const p = new THREE.Vector3();

        points.forEach(([x, z], i) => {
            q.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, (Math.random() - 0.5) * 0.12));
            s.setScalar(0.7 + Math.random() * 0.85);
            m.compose(p.set(x, 0.02, z), q, s);
            this.grass.setMatrixAt(i, m);
        });

        this.grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        this.grass.receiveShadow = true;
        this.grass.castShadow = false;
        this.group.add(this.grass);
    }

    buildFlowers() {
        const flowerGeo = new THREE.SphereGeometry(0.09, 5, 4);
        const colors = [0xfff3a0, 0xffffff, 0xe96d9b, 0x8dc8ff];
        const m = new THREE.Matrix4();
        this._flowers = [];

        for (let c = 0; c < 4; c++) {
            const mesh = new THREE.InstancedMesh(
                flowerGeo,
                new THREE.MeshStandardMaterial({ color: colors[c], roughness: 0.7 }),
                30
            );
            for (let i = 0; i < 30; i++) {
                const x = (Math.random() - 0.5) * 55;
                const z = (Math.random() - 0.5) * 55;
                m.makeTranslation(x, 0.28, z);
                mesh.setMatrixAt(i, m);
            }
            this.group.add(mesh);
            this._flowers.push(mesh);
        }
    }

    buildTrees() {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x68401f, roughness: 1 });
        const leafMats = [0x2f792e, 0x438f32, 0x65a83a].map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
        );
        const coords = [
            [-23, -12], [-25, 2], [-22, 17], [22, -16],
            [25, 4], [22, 20], [-12, -27], [13, -27]
        ];

        coords.forEach(([x, z], n) => {
            const t = new THREE.Group();
            t.position.set(x, 0, z);

            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 3.4, 8), trunkMat);
            trunk.position.y = 1.7;
            trunk.castShadow = true;
            t.add(trunk);

            /*
             * 4 كتل أوراق لكل شجرة × 8 أشجار = 32 نداء رسم.
             * تُدمج في mesh واحد بألوان رؤوس (الجذع يبقى منفصلًا لأن
             * مواد الأوراق flatShading والجذع ليس كذلك).
             */
            const leaves = [];
            [[0, 4, 0, 1.7], [-1, 3.7, 0, 1.25], [1, 3.8, 0.2, 1.35], [0, 4.7, 0, 1.2]].forEach((a, j) => {
                const leaf = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(a[3], 1),
                    leafMats[(j + n) % 3]
                );
                leaf.position.set(a[0], a[1], a[2]);
                leaf.castShadow = true;
                t.add(leaf);
                leaves.push(leaf);
            });
            mergeMeshes(leaves, { name: `Tree-${n}-leaves` });

            this.group.add(t);
            this.trees.push(t);

            if (this.collision) {
                this.collision.addBox({
                    id: `tree-${n}`,
                    x,
                    z,
                    width: 1.15,
                    depth: 1.15,
                    height: 4,
                    tag: 'tree'
                });
            }
        });
    }

    update(t) {
        this._windTime = t;
        this._grassUniforms.uTime.value = t;
        this.trees.forEach((tree, i) => {
            tree.rotation.z = Math.sin(t * 0.7 + i) * 0.018;
        });
    }
}

export default FoliageManager;
