/* ============================================================
   مشروع العمر — MY FARM 3D
   PHASE 1 — WORLD FOUNDATION
   World / Ground / Terrain / Water / Sky / Environment
   ============================================================ */

import * as THREE from 'three';

/* ============================================================
   WORLD CONFIGURATION
   ============================================================ */

const WORLD_CONFIG = {
    size: 120,
    farmSize: 30,

    groundY: 0,

    terrainSegments: 80,

    waterLevel: -0.08,

    treeCount: 55,
    rockCount: 35,
    grassCount: 900,

    fenceSpacing: 2,

    dayLength: 600,

    cloudCount: 14
};

/* ============================================================
   WORLD CLASS
   ============================================================ */

export class FarmWorld {

    constructor(scene, renderer, camera) {

        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;

        this.root = new THREE.Group();
        this.root.name = 'FarmWorld';

        this.scene.add(this.root);

        this.clock = new THREE.Clock();

        this.objects = {
            terrain: null,
            grass: [],
            trees: [],
            rocks: [],
            flowers: [],
            clouds: [],
            fences: [],
            paths: [],
            water: null,
            decorations: []
        };

        this.time = 0;

        this.init();
    }

    /* ========================================================
       INITIALIZATION
       ======================================================== */

    init() {

        this.setupRenderer();

        this.createSky();

        this.createTerrain();

        this.createFarmArea();

        this.createPaths();

        this.createWater();

        this.createGrass();

        this.createTrees();

        this.createRocks();

        this.createFlowers();

        this.createFences();

        this.createClouds();

        this.createLighting();

    }

    /* ========================================================
       RENDERER
       ======================================================== */

    setupRenderer() {

        if (!this.renderer) return;

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.renderer.toneMappingExposure = 1.15;

        this.renderer.shadowMap.enabled = true;

        this.renderer.shadowMap.type =
            THREE.PCFSoftShadowMap;

    }

    /* ========================================================
       SKY
       ======================================================== */

    createSky() {

        const skyGeometry =
            new THREE.SphereGeometry(
                110,
                32,
                32
            );

        const skyMaterial =
            new THREE.MeshBasicMaterial({
                color: 0x8fd3ff,
                side: THREE.BackSide
            });

        const sky =
            new THREE.Mesh(
                skyGeometry,
                skyMaterial
            );

        sky.name = 'Sky';

        this.root.add(sky);

        this.objects.sky = sky;

        /*
         * Soft atmospheric gradient approximation.
         */

        const horizonGeometry =
            new THREE.PlaneGeometry(
                180,
                80
            );

        const horizonMaterial =
            new THREE.MeshBasicMaterial({
                color: 0xb9e7ff,
                transparent: true,
                opacity: 0.32,
                depthWrite: false
            });

        const horizon =
            new THREE.Mesh(
                horizonGeometry,
                horizonMaterial
            );

        horizon.position.set(
            0,
            25,
            -65
        );

        this.root.add(horizon);

    }

    /* ========================================================
       TERRAIN
       ======================================================== */

    createTerrain() {

        const size =
            WORLD_CONFIG.size;

        const segments =
            WORLD_CONFIG.terrainSegments;

        const geometry =
            new THREE.PlaneGeometry(
                size,
                size,
                segments,
                segments
            );

        const position =
            geometry.attributes.position;

        /*
         * Natural terrain deformation.
         */

        for (
            let i = 0;
            i < position.count;
            i++
        ) {

            const x =
                position.getX(i);

            const z =
                position.getY(i);

            const distance =
                Math.sqrt(
                    x * x +
                    z * z
                );

            let height = 0;

            /*
             * Gentle hills outside the farm.
             */

            if (distance > 18) {

                height +=
                    Math.sin(x * 0.12) *
                    0.25;

                height +=
                    Math.cos(z * 0.15) *
                    0.22;

                height +=
                    Math.sin(
                        (x + z) * 0.08
                    ) *
                    0.18;

            }

            /*
             * Keep farm center mostly flat.
             */

            if (distance < 17) {

                height *=
                    distance / 17;

            }

            position.setZ(
                i,
                height
            );

        }

        geometry.computeVertexNormals();

        const material =
            new THREE.MeshStandardMaterial({

                color: 0x679c45,

                roughness: 0.95,

                metalness: 0.0,

                side: THREE.DoubleSide

            });

        const terrain =
            new THREE.Mesh(
                geometry,
                material
            );

        terrain.rotation.x =
            -Math.PI / 2;

        terrain.position.y =
            WORLD_CONFIG.groundY;

        terrain.receiveShadow = true;

        terrain.name =
            'MainTerrain';

        this.root.add(terrain);

        this.objects.terrain =
            terrain;

    }

    /* ========================================================
       FARM CENTER
       ======================================================== */

    createFarmArea() {

        const geometry =
            new THREE.PlaneGeometry(
                WORLD_CONFIG.farmSize,
                WORLD_CONFIG.farmSize,
                30,
                30
            );

        const position =
            geometry.attributes.position;

        for (
            let i = 0;
            i < position.count;
            i++
        ) {

            const x =
                position.getX(i);

            const y =
                position.getY(i);

            const smallNoise =
                Math.sin(x * 1.7) *
                Math.cos(y * 1.4) *
                0.015;

            position.setZ(
                i,
                smallNoise
            );

        }

        geometry.computeVertexNormals();

        const material =
            new THREE.MeshStandardMaterial({

                color: 0x73a94c,

                roughness: 1,

                metalness: 0

            });

        const farm =
            new THREE.Mesh(
                geometry,
                material
            );

        farm.rotation.x =
            -Math.PI / 2;

        farm.position.y =
            0.015;

        farm.receiveShadow = true;

        farm.name =
            'FarmGround';

        this.root.add(farm);

        this.objects.farm =
            farm;

    }

    /* ========================================================
       PATHS
       ======================================================== */

    createPaths() {

        /*
         * Main entrance path.
         */

        this.createPath(
            0,
            18,
            4.5,
            18
        );

        /*
         * Horizontal farm path.
         */

        this.createPath(
            0,
            0,
            28,
            3.0
        );

        /*
         * Vertical central path.
         */

        this.createPath(
            0,
            0,
            3.2,
            25
        );

    }

    createPath(
        x,
        z,
        width,
        length
    ) {

        const geometry =
            new THREE.PlaneGeometry(
                width,
                length
            );

        const material =
            new THREE.MeshStandardMaterial({

                color: 0xb89a68,

                roughness: 1

            });

        const path =
            new THREE.Mesh(
                geometry,
                material
            );

        path.rotation.x =
            -Math.PI / 2;

        path.position.set(
            x,
            0.035,
            z
        );

        path.receiveShadow = true;

        path.name =
            'FarmPath';

        this.root.add(path);

        this.objects.paths.push(
            path
        );

    }

    /* ========================================================
       WATER
       ======================================================== */

    createWater() {

        const geometry =
            new THREE.PlaneGeometry(
                34,
                16,
                30,
                15
            );

        const position =
            geometry.attributes.position;

        for (
            let i = 0;
            i < position.count;
            i++
        ) {

            const x =
                position.getX(i);

            const z =
                position.getY(i);

            const wave =
                Math.sin(
                    x * 0.7
                ) * 0.03 +

                Math.cos(
                    z * 0.8
                ) * 0.025;

            position.setZ(
                i,
                wave
            );

        }

        geometry.computeVertexNormals();

        const material =
            new THREE.MeshPhysicalMaterial({

                color: 0x4fa7c8,

                roughness: 0.18,

                metalness: 0.05,

                transparent: true,

                opacity: 0.78,

                transmission: 0.05

            });

        const water =
            new THREE.Mesh(
                geometry,
                material
            );

        water.rotation.x =
            -Math.PI / 2;

        water.position.set(
            -25,
            WORLD_CONFIG.waterLevel,
            -12
        );

        water.receiveShadow = true;

        water.name =
            'FarmWater';

        this.root.add(water);

        this.objects.water =
            water;

    }

    /* ========================================================
       GRASS
       ======================================================== */

    createGrass() {

        const bladeGeometry =
            new THREE.ConeGeometry(
                0.035,
                0.32,
                3
            );

        bladeGeometry.translate(
            0,
            0.16,
            0
        );

        const bladeMaterial =
            new THREE.MeshStandardMaterial({

                color: 0x4f8c35,

                roughness: 1

            });

        const grass =
            new THREE.InstancedMesh(
                bladeGeometry,
                bladeMaterial,
                WORLD_CONFIG.grassCount
            );

        const dummy =
            new THREE.Object3D();

        let index = 0;

        while (
            index <
            WORLD_CONFIG.grassCount
        ) {

            const x =
                (Math.random() - 0.5) *
                100;

            const z =
                (Math.random() - 0.5) *
                100;

            /*
             * Keep central farm clearer.
             */

            if (
                Math.abs(x) < 15 &&
                Math.abs(z) < 15
            ) {

                continue;

            }

            dummy.position.set(
                x,
                0,
                z
            );

            dummy.rotation.y =
                Math.random() *
                Math.PI *
                2;

            dummy.rotation.z =
                (Math.random() - 0.5) *
                0.25;

            const scale =
                0.65 +
                Math.random() *
                0.75;

            dummy.scale.set(
                scale,
                scale,
                scale
            );

            dummy.updateMatrix();

            grass.setMatrixAt(
                index,
                dummy.matrix
            );

            index++;

        }

        grass.instanceMatrix.needsUpdate =
            true;

        grass.castShadow =
            false;

        grass.receiveShadow =
            true;

        grass.name =
            'GrassField';

        this.root.add(grass);

        this.objects.grass.push(
            grass
        );

    }

    /* ========================================================
       TREES
       ======================================================== */

    createTrees() {

        for (
            let i = 0;
            i < WORLD_CONFIG.treeCount;
            i++
        ) {

            const angle =
                Math.random() *
                Math.PI *
                2;

            const distance =
                21 +
                Math.random() *
                30;

            const x =
                Math.cos(angle) *
                distance;

            const z =
                Math.sin(angle) *
                distance;

            this.createTree(
                x,
                z,
                0.75 +
                Math.random() *
                0.65
            );

        }

    }

    createTree(
        x,
        z,
        scale = 1
    ) {

        const tree =
            new THREE.Group();

        tree.name =
            'EnvironmentTree';

        /*
         * Trunk.
         */

        const trunkGeometry =
            new THREE.CylinderGeometry(
                0.18 * scale,
                0.28 * scale,
                2.1 * scale,
                8
            );

        const trunkMaterial =
            new THREE.MeshStandardMaterial({

                color: 0x6d4328,

                roughness: 1

            });

        const trunk =
            new THREE.Mesh(
                trunkGeometry,
                trunkMaterial
            );

        trunk.position.y =
            1.05 * scale;

        trunk.castShadow = true;

        tree.add(trunk);

        /*
         * Branches.
         */

        for (
            let i = 0;
            i < 4;
            i++
        ) {

            const branch =
                new THREE.Mesh(

                    new THREE.CylinderGeometry(
                        0.06 * scale,
                        0.09 * scale,
                        0.75 * scale,
                        6
                    ),

                    trunkMaterial

                );

            const angle =
                (i / 4) *
                Math.PI *
                2;

            branch.position.set(
                Math.cos(angle) *
                    0.25 *
                    scale,

                1.55 *
                    scale,

                Math.sin(angle) *
                    0.25 *
                    scale
            );

            branch.rotation.z =
                Math.cos(angle) *
                0.55;

            branch.rotation.x =
                Math.sin(angle) *
                0.55;

            branch.castShadow =
                true;

            tree.add(branch);

        }

        /*
         * Foliage.
         */

        const leafMaterial =
            new THREE.MeshStandardMaterial({

                color:
                    0x3f7f2f,

                roughness:
                    0.9

            });

        const foliagePositions = [

            [0, 2.45, 0, 1.0],

            [0.55, 2.25, 0.1, 0.75],

            [-0.55, 2.25, -0.1, 0.78],

            [0.1, 2.75, 0.1, 0.82],

            [0, 2.15, 0.55, 0.72],

            [0, 2.15, -0.55, 0.72]

        ];

        foliagePositions.forEach(
            data => {

                const leaf =
                    new THREE.Mesh(

                        new THREE.SphereGeometry(
                            data[3] * scale,
                            10,
                            8
                        ),

                        leafMaterial

                    );

                leaf.position.set(
                    data[0] * scale,
                    data[1] * scale,
                    data[2] * scale
                );

                leaf.castShadow =
                    true;

                leaf.receiveShadow =
                    true;

                tree.add(leaf);

            }
        );

        tree.position.set(
            x,
            0,
            z
        );

        this.root.add(tree);

        this.objects.trees.push(
            tree
        );

    }

    /* ========================================================
       ROCKS
       ======================================================== */

    createRocks() {

        for (
            let i = 0;
            i < WORLD_CONFIG.rockCount;
            i++
        ) {

            const angle =
                Math.random() *
                Math.PI *
                2;

            const distance =
                17 +
                Math.random() *
                40;

            const x =
                Math.cos(angle) *
                distance;

            const z =
                Math.sin(angle) *
                distance;

            this.createRock(
                x,
                z,
                0.4 +
                Math.random() *
                0.9
            );

        }

    }

    createRock(
        x,
        z,
        scale
    ) {

        const geometry =
            new THREE.DodecahedronGeometry(
                scale,
                1
            );

        const material =
            new THREE.MeshStandardMaterial({

                color:
                    0x77766f,

                roughness:
                    1

            });

        const rock =
            new THREE.Mesh(
                geometry,
                material
            );

        rock.position.set(
            x,
            scale * 0.45,
            z
        );

        rock.rotation.set(
            Math.random(),
            Math.random(),
            Math.random()
        );

        rock.scale.y =
            0.65 +
            Math.random() *
            0.35;

        rock.castShadow =
            true;

        rock.receiveShadow =
            true;

        rock.name =
            'FarmRock';

        this.root.add(rock);

        this.objects.rocks.push(
            rock
        );

    }

    /* ========================================================
       FLOWERS
       ======================================================== */

    createFlowers() {

        const colors = [

            0xffd54f,
            0xff8a80,
            0xce93d8,
            0xffffff,
            0xffab40

        ];

        for (
            let i = 0;
            i < 180;
            i++
        ) {

            const x =
                (Math.random() - 0.5) *
                70;

            const z =
                (Math.random() - 0.5) *
                70;

            if (
                Math.abs(x) < 15 &&
                Math.abs(z) < 15
            ) {

                continue;

            }

            this.createFlower(
                x,
                z,
                colors[
                    Math.floor(
                        Math.random() *
                        colors.length
                    )
                ]
            );

        }

    }

    createFlower(
        x,
        z,
        color
    ) {

        const flower =
            new THREE.Group();

        const stem =
            new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.012,
                    0.018,
                    0.22,
                    5
                ),

                new THREE.MeshStandardMaterial({
                    color: 0x37852d
                })

            );

        stem.position.y =
            0.11;

        flower.add(stem);

        const center =
            new THREE.Mesh(

                new THREE.SphereGeometry(
                    0.045,
                    6,
                    6
                ),

                new THREE.MeshStandardMaterial({
                    color
                })

            );

        center.position.y =
            0.24;

        flower.add(center);

        flower.position.set(
            x,
            0,
            z
        );

        this.root.add(
            flower
        );

        this.objects.flowers.push(
            flower
        );

    }

    /* ========================================================
       FENCES
       ======================================================== */

    createFences() {

        const min =
            -16;

        const max =
            16;

        for (
            let x = min;
            x <= max;
            x += WORLD_CONFIG.fenceSpacing
        ) {

            this.createFencePost(
                x,
                min
            );

            this.createFencePost(
                x,
                max
            );

        }

        for (
            let z = min;
            z <= max;
            z += WORLD_CONFIG.fenceSpacing
        ) {

            this.createFencePost(
                min,
                z
            );

            this.createFencePost(
                max,
                z
            );

        }

    }

    createFencePost(
        x,
        z
    ) {

        const post =
            new THREE.Group();

        const woodMaterial =
            new THREE.MeshStandardMaterial({

                color:
                    0x9a683e,

                roughness:
                    0.95

            });

        const postMesh =
            new THREE.Mesh(

                new THREE.BoxGeometry(
                    0.16,
                    0.9,
                    0.16
                ),

                woodMaterial

            );

        postMesh.position.y =
            0.45;

        postMesh.castShadow =
            true;

        post.add(
            postMesh
        );

        /*
         * Wooden horizontal rail.
         */

        const rail =
            new THREE.Mesh(

                new THREE.BoxGeometry(
                    1.95,
                    0.12,
                    0.12
                ),

                woodMaterial

            );

        rail.position.set(
            0,
            0.62,
            0
        );

        post.add(
            rail
        );

        const rail2 =
            rail.clone();

        rail2.position.y =
            0.34;

        post.add(
            rail2
        );

        post.position.set(
            x,
            0,
            z
        );

        this.root.add(
            post
        );

        this.objects.fences.push(
            post
        );

    }

    /* ========================================================
       CLOUDS
       ======================================================== */

    createClouds() {

        const cloudMaterial =
            new THREE.MeshStandardMaterial({

                color:
                    0xffffff,

                roughness:
                    1,

                transparent:
                    true,

                opacity:
                    0.88

            });

        for (
            let i = 0;
            i < WORLD_CONFIG.cloudCount;
            i++
        ) {

            const cloud =
                new THREE.Group();

            const pieces =
                4 +
                Math.floor(
                    Math.random() *
                    5
                );

            for (
                let j = 0;
                j < pieces;
                j++
            ) {

                const blob =
                    new THREE.Mesh(

                        new THREE.SphereGeometry(
                            1.2 +
                            Math.random() *
                            1.2,

                            10,
                            8
                        ),

                        cloudMaterial

                    );

                blob.position.set(
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 0.7,
                    (Math.random() - 0.5) * 2
                );

                cloud.add(
                    blob
                );

            }

            cloud.position.set(
                (Math.random() - 0.5) * 90,
                18 +
                    Math.random() *
                    12,
                -10 -
                    Math.random() *
                    30
            );

            cloud.userData.speed =
                0.4 +
                Math.random() *
                0.7;

            this.root.add(
                cloud
            );

            this.objects.clouds.push(
                cloud
            );

        }

    }

    /* ========================================================
       LIGHTING
       ======================================================== */

    createLighting() {

        /*
         * Ambient light.
         */

        const ambient =
            new THREE.AmbientLight(
                0xffffff,
                0.45
            );

        ambient.name =
            'FarmAmbientLight';

        this.root.add(
            ambient
        );

        /*
         * Hemisphere light.
         */

        const hemisphere =
            new THREE.HemisphereLight(
                0x9bd8ff,
                0x49652d,
                0.65
            );

        hemisphere.name =
            'FarmSkyLight';

        this.root.add(
            hemisphere
        );

        /*
         * Main sun.
         */

        const sun =
            new THREE.DirectionalLight(
                0xfff0c2,
                2.0
            );

        sun.position.set(
            30,
            45,
            25
        );

        sun.castShadow =
            true;

        const shadowSize =
            35;

        sun.shadow.camera.left =
            -shadowSize;

        sun.shadow.camera.right =
            shadowSize;

        sun.shadow.camera.top =
            shadowSize;

        sun.shadow.camera.bottom =
            -shadowSize;

        sun.shadow.camera.near =
            1;

        sun.shadow.camera.far =
            100;

        sun.shadow.mapSize.width =
            2048;

        sun.shadow.mapSize.height =
            2048;

        sun.shadow.bias =
            -0.0005;

        sun.name =
            'FarmSun';

        this.root.add(
            sun
        );

        this.objects.sun =
            sun;

    }

    /* ========================================================
       ANIMATION
       ======================================================== */

    update(
        delta
    ) {

        this.time +=
            delta;

        /*
         * Clouds.
         */

        this.objects.clouds.forEach(
            cloud => {

                cloud.position.x +=
                    cloud.userData.speed *
                    delta;

                if (
                    cloud.position.x >
                    55
                ) {

                    cloud.position.x =
                        -55;

                }

            }
        );

        /*
         * Water movement.
         */

        if (
            this.objects.water
        ) {

            const water =
                this.objects.water;

            water.material.opacity =
                0.72 +
                Math.sin(
                    this.time * 0.8
                ) *
                0.05;

        }

        /*
         * Small foliage movement.
         */

        this.objects.trees.forEach(
            (tree, index) => {

                const wave =
                    Math.sin(
                        this.time * 0.7 +
                        index
                    ) *
                    0.015;

                tree.rotation.z =
                    wave;

            }
        );

    }

}

/* ============================================================
   DEFAULT EXPORT
   ============================================================ */

export default FarmWorld;