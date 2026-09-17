/**
 * ============================================================
 * MY FARM 3D - MASTER APPLICATION
 * Real Procedural 3D Crops + Scaled Hand Tools + Smart Camera + 10 Expansions
 * ============================================================
 */
 import { QuestSystem } from './systems/QuestSystem.js';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { Events } from './core/EventBus.js';
import { GameState } from './core/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { Time } from './core/TimeManager.js';
import { LandSystem, LAND_CONFIG } from './systems/LandSystem.js';
import { FarmingSystem, CROPS_DEFINITIONS } from './systems/FarmingSystem.js';
import { ProductionSystem } from './systems/ProductionSystem.js';
import { getBuilding, STARTER_KIT } from './data/GameData.js';
import { uuid } from './utils/Utils.js';
import HUD from './ui/HUD.js';

/* ============================================================
   CAMERA & ENGINE CONFIGURATION (Ground Focused Framing)
   ============================================================ */
const CONFIG = Object.freeze({
    renderer: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    },
    camera: {
        fov: 46,
        near: 0.1,
        far: 260,
        defaultDistance: 7.5,
        minDistance: 3.5,
        maxDistance: 13.0,
        minPitch: -0.05,
        maxPitch: 0.68,
        defaultPitch: 0.44, // زاوية تجعل المزرعة والأرض تغطي 80% من الشاشة
        targetHeight: 1.15
    },
    performance: {
        maxPixelRatio: 2
    },
    player: {
        walkSpeed: 3.4,
        runSpeed: 5.6,
        turnSpeed: 13.0,
        acceleration: 9.5,
        deceleration: 11.5,
        baseWalkAnimSpeed: 2.0,
        modelScale: 1.0,
        modelPath: './assets/models/farmer.glb'
    },
    colors: {
        sky: 0x6bbceb,
        fog: 0xa4daf7,
        grass: 0x5ea832,
        path: 0xcda266,
        soil: 0x543217,
        roughLand: 0x6e683b,
        wood: 0x8a552e
    }
});

/* ============================================================
   PLAYER CONTROLLER WITH SCALED HAND TOOL ATTACHMENT
   ============================================================ */
class PlayerController {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.position.set(0, 0, 0);
        this.scene.add(this.root);

        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.clipNames = { idle: null, walk: null, run: null };
        this.currentAction = null;
        this.currentState = 'idle';

        this.equippedToolMesh = null;
        this.currentSpeed = 0.0;
        this.targetSpeed = 0.0;
        this.moveDirection = new THREE.Vector3();
        this.isMoving = false;

        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(
            CONFIG.player.modelPath,
            (gltf) => {
                this.model = gltf.scene;
                this.model.scale.setScalar(CONFIG.player.modelScale);
                this.model.position.set(0, 0, 0);

                this.model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.root.add(this.model);
                this.attachHandTool();
                this.setupAnimations(gltf);
                console.log('[MY FARM] Character model loaded.');
            },
            undefined,
            () => {
                this.createFallbackAvatar();
                this.attachHandTool();
            }
        );
    }

    createFallbackAvatar() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x245582, roughness: 0.8 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0xd3392a, roughness: 0.75 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.65 });
        const hatMat = new THREE.MeshStandardMaterial({ color: 0xdfbe64, roughness: 0.9 });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0x422612, roughness: 0.85 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.48), shirtMat);
        body.position.y = 1.05;
        body.castShadow = true;
        group.add(body);

        const bib = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.58, 0.52), bodyMat);
        bib.position.y = 0.96;
        group.add(bib);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
        head.position.y = 1.78;
        head.castShadow = true;
        group.add(head);

        const eyeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.05);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const lEye = new THREE.Mesh(eyeGeo, eyeMat);
        lEye.position.set(-0.14, 1.80, 0.29);
        const rEye = lEye.clone();
        rEye.position.set(0.14, 1.80, 0.29);
        group.add(lEye);
        group.add(rEye);

        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 14), hatMat);
        brim.position.y = 2.10;
        brim.castShadow = true;
        group.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.38, 14), hatMat);
        crown.position.y = 2.30;
        crown.castShadow = true;
        group.add(crown);

        const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.35), bootMat);
        lBoot.position.set(-0.18, 0.12, 0.04);
        const rBoot = lBoot.clone();
        rBoot.position.set(0.18, 0.12, 0.04);
        group.add(lBoot);
        group.add(rBoot);

        this.model = group;
        this.root.add(this.model);
    }

    /**
     * فأس صغير الحجم ومتناسق بدقة داخل قبضة اليد اليمنى
     */
    attachHandTool() {
        const axeGroup = new THREE.Group();
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xa5a5a5, metalness: 0.7, roughness: 0.3 });

        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 6), handleMat);
        axeGroup.add(handle);

        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.10), bladeMat);
        blade.position.set(0, 0.15, 0.04);
        blade.castShadow = true;
        axeGroup.add(blade);

        axeGroup.position.set(0.38, 0.92, 0.18);
        axeGroup.rotation.set(Math.PI / 6, 0, -Math.PI / 12);

        this.equippedToolMesh = axeGroup;
        this.root.add(axeGroup);
    }

    playToolSwing() {
        if (!this.equippedToolMesh) return;
        const initialRotX = this.equippedToolMesh.rotation.x;
        const initialPosY = this.equippedToolMesh.position.y;

        this.equippedToolMesh.rotation.x = initialRotX - 1.1;
        this.equippedToolMesh.position.y = initialPosY + 0.12;

        setTimeout(() => {
            if (this.equippedToolMesh) {
                this.equippedToolMesh.rotation.x = initialRotX + 0.5;
                this.equippedToolMesh.position.y = initialPosY - 0.08;
            }
        }, 110);

        setTimeout(() => {
            if (this.equippedToolMesh) {
                this.equippedToolMesh.rotation.x = initialRotX;
                this.equippedToolMesh.position.y = initialPosY;
            }
        }, 240);
    }

    setupAnimations(gltf) {
        if (!gltf.animations || gltf.animations.length === 0) return;
        this.mixer = new THREE.AnimationMixer(this.model);
        gltf.animations.forEach((clip) => {
            this.actions[clip.name] = this.mixer.clipAction(clip);
        });

        const resolveClip = (keywords) => {
            for (const name of Object.keys(this.actions)) {
                const lower = name.toLowerCase();
                if (keywords.some((kw) => lower.includes(kw))) return name;
            }
            return null;
        };

        this.clipNames.idle = resolveClip(['idle', 'stand', 'wait', 'rest']) || Object.keys(this.actions)[0];
        this.clipNames.walk = resolveClip(['walk', 'walking', 'move', 'stride']) || this.clipNames.idle;
        this.clipNames.run = resolveClip(['run', 'running', 'sprint']);

        if (this.clipNames.idle && this.actions[this.clipNames.idle]) {
            const idleAction = this.actions[this.clipNames.idle];
            idleAction.setEffectiveWeight(1.0);
            idleAction.play();
            this.currentAction = idleAction;
            this.currentState = 'idle';
        }
    }

    transitionTo(nextState, duration = 0.22) {
        if (this.currentState === nextState) return;
        const clipName = this.clipNames[nextState];
        if (!clipName || !this.actions[clipName]) return;

        const nextAction = this.actions[clipName];
        const previousAction = this.currentAction;

        if (previousAction && previousAction !== nextAction) {
            previousAction.fadeOut(duration);
        }

        nextAction.reset().setEffectiveTimeScale(1.0).setEffectiveWeight(1.0).fadeIn(duration).play();
        this.currentAction = nextAction;
        this.currentState = nextState;
    }

    update(delta, inputVector) {
        const hasInput = inputVector.lengthSq() > 0.001;
        if (hasInput) {
            this.moveDirection.copy(inputVector).normalize();
            this.targetSpeed = CONFIG.player.walkSpeed;
            this.isMoving = true;
        } else {
            this.targetSpeed = 0.0;
            this.isMoving = false;
        }

        const smoothingRate = hasInput ? CONFIG.player.acceleration : CONFIG.player.deceleration;
        this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, this.targetSpeed, smoothingRate, delta);

        if (!hasInput && this.currentSpeed < 0.005) {
            this.currentSpeed = 0.0;
        }

        if (this.currentSpeed > 0.0) {
            const displacement = this.currentSpeed * delta;
            this.root.position.x += this.moveDirection.x * displacement;
            this.root.position.z += this.moveDirection.z * displacement;

            this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -30, 30);
            this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -30, 30);

            const targetAngle = Math.atan2(this.moveDirection.x, this.moveDirection.z);
            let currentAngle = this.root.rotation.y;
            let diff = (targetAngle - currentAngle) % (Math.PI * 2);
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > Math.PI) diff -= Math.PI * 2;
            this.root.rotation.y += diff * Math.min(1.0, CONFIG.player.turnSpeed * delta);
        }

        if (this.currentSpeed > 0.12) {
            this.transitionTo('walk', 0.2);
            if (this.currentAction && this.currentState === 'walk') {
                const stepFrequency = this.currentSpeed / CONFIG.player.baseWalkAnimSpeed;
                this.currentAction.setEffectiveTimeScale(
                    THREE.MathUtils.clamp(stepFrequency, 0.75, 1.35)
                );
            }
        } else {
            this.transitionTo('idle', 0.25);
        }

        if (this.mixer) {
            this.mixer.update(delta);
        }
    }
}

/* ============================================================
   APPLICATION CORE
   ============================================================ */
class MyFarmApp {
    constructor() {
        this.canvas = null;
        this.container = null;

        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.ground = null;
        this.clouds = [];
        this.animatedTrees = [];
        this.lights = { ambient: null, sun: null, fill: null };

        this.player = null;
        this.fieldMeshes = new Map();
        this.activeTarget = null; // { type: 'field' | 'slot', fieldId, slotIndex, data }

        this.cameraDistance = CONFIG.camera.defaultDistance;
        this.cameraYaw = 0.0;
        this.cameraPitch = CONFIG.camera.defaultPitch;
        this.cameraTargetPosition = new THREE.Vector3();
        this.cameraLookTarget = new THREE.Vector3();

        this.touchCameraActive = false;
        this.cameraTouchId = null;
        this.touchLastX = 0;
        this.touchLastY = 0;
        this.activeTouches = new Map();
        this.pinchStartDistance = 0;
        this.pinchStartCameraDistance = CONFIG.camera.defaultDistance;

        this.keys = { up: false, down: false, left: false, right: false };
        this.joystickVector = { x: 0, y: 0 };

        this.running = false;
        this.initialized = false;
        this.clock = new THREE.Clock();

        this._boundResize = () => this.resize();
        this._boundLoop = () => this.gameLoop();
        this._boundKeyDown = (e) => this.handleKeyDown(e);
        this._boundKeyUp = (e) => this.handleKeyUp(e);
    }

    cacheDOM() {
        this.container = document.getElementById('game-container');
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) {
            throw new Error('[MY FARM] #game-canvas not found.');
        }
    }

    async boot() {
        try {
            console.log('[MY FARM] Booting living Farm World & Real Farming System...');
            this.cacheDOM();
            this.createRenderer();
            this.createScene();
            this.createCamera();
            this.createLighting();
            this.createSky();
            this.createFarmEnvironment();

            try {
                await Promise.race([
                    (async () => {
                        await SaveManager.init();
                        await SaveManager.load();
                    })(),
                    new Promise(res => setTimeout(res, 600))
                ]);
            } catch (e) {}

            LandSystem.init();
            QuestSystem.init();

            // 🏭 سلسلة الإنتاج Hay Day: طاحونة الحبوب ← المخبز
            try {
                this.initProductionChain();
            } catch (e) {
                console.warn('[MY FARM] Production chain notice:', e);
            }


            this.createPlayer();
            this.buildFarmFields();
            this.setupCameraTouch();
            this.setupUnifiedPromptUI();

            this.resize();
            window.addEventListener('resize', this._boundResize);
            window.addEventListener('keydown', this._boundKeyDown);
            window.addEventListener('keyup', this._boundKeyUp);

            // Mount Modern Compact HUD
            try {
                this.hud = new HUD({
                    gameState: GameState,
                    eventBus: Events,
                    enableJoystick: true,
                    callbacks: {
                        onMove: (vector) => {
                            this.joystickVector.x = vector.x;
                            this.joystickVector.y = vector.y;
                        }
                    }
                });
                this.hud.mount(document.body);
            } catch (e) {
                console.warn('[MY FARM] HUD Mount Notice:', e);
            }

            try {
                SaveManager.startAutoSave();
                Time.start();
            } catch (e) {}

            // Event Listeners
            Events.on('land:purchased', (data) => this.onLandPurchased(data));
            Events.on('land:purchase-failed', (data) => this.onLandPurchaseFailed(data));
            Events.on('land:axe-hit', (data) => this.onLandAxeHit(data));
            Events.on('land:prepared', (data) => this.onLandPrepared(data));
            Events.on('crop:planted', (data) => this.renderSlotCrop(data.fieldId, data.slotIndex));
            Events.on('crop:ready', (data) => this.renderSlotCrop(data.fieldId, data.slot.slotIndex));
            Events.on('crop:harvested', (data) => this.onCropHarvested(data));

            // أحداث سلسلة الإنتاج
            Events.on('production:started', (buildingId, recipeId) =>
                console.log(`[PRODUCTION] 🏭 بدأ الإنتاج: ${recipeId} @ ${buildingId}`));
            Events.on('production:ready', (buildingId, recipeId) =>
                console.log(`[PRODUCTION] ✅ المنتج جاهز للاستلام: ${recipeId}`));
            Events.on('production:completed', (buildingId, recipeId, output) =>
                console.log(`[PRODUCTION] 📦 تم الاستلام: ${output.amount}× ${output.item}`));
            Events.on('inventory:full', () =>
                console.warn('[PRODUCTION] ⚠️ المخزن ممتلئ — قم بترقية السعة!'));

            this.initialized = true;
            this.hideLoading();
            this.start();

            // واجهة للاختبار من وحدة التحكم (Spck console)
            window.MYFARM = {
                app: this,
                GameState,
                Events,
                FarmingSystem,
                ProductionSystem
            };

            Events.emit('game:ready', this);
            console.log('[MY FARM] Farm World is ready.');
        } catch (error) {
            console.error('[MY FARM] Boot error:', error);
            this.hideLoading();
        }
    }

    /* ============================================================
       🏭 سلسلة الإنتاج — طاحونة الحبوب ← المخبز
       يزرع المبنيين + حقيبة بداية عند أول تشغيل فقط،
       ولا يلمس الحفوظات الموجودة أبدًا.
       ============================================================ */
    initProductionChain() {
        const buildings = GameState.get('farm.buildings') || [];
        const isFreshFarm = buildings.length === 0;
        let changed = false;

        for (const typeId of STARTER_KIT.buildings) {
            // لا تكرار — إن وُجد المبنى مسبقًا نتخطّاه
            if (buildings.some(b => b.typeId === typeId)) continue;

            const def = getBuilding(typeId);
            if (!def) continue;

            buildings.push({
                id: uuid(),
                typeId,
                name: def.name,
                icon: def.icon,
                level: 1,
                status: 'built',
                queueLimit: def.queueLimit || 3,
                productionQueue: [],
                placedAt: Date.now()
            });
            changed = true;
            console.log(`[PRODUCTION] مبنى جاهز: ${def.icon} ${def.name}`);
        }

        if (changed) {
            GameState.set('farm.buildings', buildings);
        }

        if (isFreshFarm) {
            // مواد خام للانطلاق الفوري في السلسلة
            const items = GameState.get('inventory.items') || {};
            for (const [itemId, count] of Object.entries(STARTER_KIT.items)) {
                if (!items[itemId]) items[itemId] = { count: 0, quality: 1 };
                items[itemId].count += count;
            }
            GameState.set('inventory.items', items);

            const unlocked = GameState.get('unlocked') || {};
            GameState.set('unlocked', {
                ...unlocked,
                buildings: [...new Set([...(unlocked.buildings || []), ...STARTER_KIT.buildings])],
                recipes: [...new Set([...(unlocked.recipes || []), ...STARTER_KIT.recipes])]
            });

            console.log('[PRODUCTION] 🎁 حقيبة البداية:', JSON.stringify(STARTER_KIT.items));
        }

        console.log(
            '[PRODUCTION] ✅ السلسلة متصلة:',
            ProductionSystem ? 'طاحونة الحبوب ← المخبز' : 'معطلة'
        );
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: CONFIG.renderer.antialias,
            alpha: CONFIG.renderer.alpha,
            powerPreference: CONFIG.renderer.powerPreference
        });
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, CONFIG.performance.maxPixelRatio)
        );
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.colors.sky);
        this.scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.018);
    }

    createCamera() {
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            CONFIG.camera.near,
            CONFIG.camera.far
        );
        this.camera.position.set(0, 5, 8);
        this.camera.lookAt(0, CONFIG.camera.targetHeight, 0);
    }

    createLighting() {
        this.lights.ambient = new THREE.HemisphereLight(0xfff3db, 0x487928, 1.45);
        this.scene.add(this.lights.ambient);

        this.lights.sun = new THREE.DirectionalLight(0xfff6e4, 2.1);
        this.lights.sun.position.set(22, 38, 18);
        this.lights.sun.castShadow = true;
        this.lights.sun.shadow.mapSize.width = 1024;
        this.lights.sun.shadow.mapSize.height = 1024;
        this.lights.sun.shadow.camera.near = 0.5;
        this.lights.sun.shadow.camera.far = 75;
        this.lights.sun.shadow.bias = -0.0004;

        const d = 26;
        this.lights.sun.shadow.camera.left = -d;
        this.lights.sun.shadow.camera.right = d;
        this.lights.sun.shadow.camera.top = d;
        this.lights.sun.shadow.camera.bottom = -d;

        this.scene.add(this.lights.sun);
        this.scene.add(this.lights.sun.target);

        this.lights.fill = new THREE.DirectionalLight(0x9bd8ff, 0.45);
        this.lights.fill.position.set(-18, 14, -14);
        this.scene.add(this.lights.fill);
    }

    createSky() {
        const cloudGroup = new THREE.Group();
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: true
        });

        const cloudPositions = [
            { x: -26, y: 24, z: -35, s: 1.3 },
            { x: 16, y: 28, z: -40, s: 1.6 },
            { x: -8, y: 22, z: -50, s: 1.8 }
        ];

        cloudPositions.forEach((cp) => {
            const singleCloud = new THREE.Group();
            const parts = [
                { r: 2.0, x: 0, y: 0, z: 0 },
                { r: 1.5, x: -1.6, y: -0.2, z: 0.2 },
                { r: 1.6, x: 1.7, y: -0.1, z: -0.2 }
            ];
            parts.forEach((p) => {
                const geo = new THREE.DodecahedronGeometry(p.r * cp.s, 1);
                const puff = new THREE.Mesh(geo, cloudMat);
                puff.position.set(p.x * cp.s, p.y * cp.s, p.z * cp.s);
                singleCloud.add(puff);
            });
            singleCloud.position.set(cp.x, cp.y, cp.z);
            this.clouds.push(singleCloud);
            cloudGroup.add(singleCloud);
        });

        this.scene.add(cloudGroup);
    }

    createFarmEnvironment() {
        const envGroup = new THREE.Group();

        // 1. أرض العشب الطبيعي
        const grassGeo = new THREE.PlaneGeometry(120, 120);
        const grassMat = new THREE.MeshStandardMaterial({
            color: CONFIG.colors.grass,
            roughness: 0.95,
            metalness: 0.04
        });
        const mainGrass = new THREE.Mesh(grassGeo, grassMat);
        mainGrass.rotation.x = -Math.PI / 2;
        mainGrass.receiveShadow = true;
        envGroup.add(mainGrass);

        // 2. الممرات الزراعية المتقاطعة
        const pathMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.path, roughness: 0.96 });
        const crossX = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 56), pathMat);
        crossX.rotation.x = -Math.PI / 2;
        crossX.position.set(0, 0.012, 0);
        crossX.receiveShadow = true;
        envGroup.add(crossX);

        const crossZ = new THREE.Mesh(new THREE.PlaneGeometry(56, 3.8), pathMat);
        crossZ.rotation.x = -Math.PI / 2;
        crossZ.position.set(0, 0.013, 0);
        crossZ.receiveShadow = true;
        envGroup.add(crossZ);

        // 3. بحيرة مياه صغيرة
        const pondGeo = new THREE.CylinderGeometry(4.8, 5.2, 0.35, 20);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x3399cc,
            roughness: 0.15,
            metalness: 0.25,
            transparent: true,
            opacity: 0.88
        });
        const pond = new THREE.Mesh(pondGeo, waterMat);
        pond.position.set(-18, 0.08, -16);
        envGroup.add(pond);

        // 4. أشجار المزرعة الحدودية
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4321, roughness: 0.9 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a8226, roughness: 0.85 });

        const treeCoords = [
            [-22, -8], [-24, 6], [-20, 20], [20, -14], [24, 8], [20, 22],
            [-10, -24], [10, -24], [-14, 25], [14, 25]
        ];

        treeCoords.forEach(([tx, tz]) => {
            const tree = new THREE.Group();
            tree.position.set(tx, 0, tz);

            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 2.2, 7), trunkMat);
            trunk.position.y = 1.1;
            trunk.castShadow = true;
            tree.add(trunk);

            const fol = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), leafMat);
            fol.position.set(0, 2.7, 0);
            fol.castShadow = true;
            tree.add(fol);

            envGroup.add(tree);
            this.animatedTrees.push(tree);
        });

        // 5. حظيرة كرتونية حمراء
        const barn = new THREE.Group();
        barn.position.set(16, 0, -6);
        const barnBody = new THREE.Mesh(
            new THREE.BoxGeometry(6.5, 4.2, 8.0),
            new THREE.MeshStandardMaterial({ color: 0xa83228, roughness: 0.85 })
        );
        barnBody.position.y = 2.1;
        barnBody.castShadow = true;
        barn.add(barnBody);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(5.2, 2.6, 4),
            new THREE.MeshStandardMaterial({ color: 0x441410, roughness: 0.8 })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 5.2;
        roof.castShadow = true;
        barn.add(roof);
        envGroup.add(barn);

        this.ground = envGroup;
        this.scene.add(envGroup);
    }

    createPlayer() {
        this.player = new PlayerController(this.scene);
    }

    /* ========================================================
       FARM FIELDS & 4-SLOT CROPS BUILDER (HAY DAY STYLE)
       ======================================================== */
    buildFarmFields() {
        const fields = LandSystem.getAllFields();
        const plotSize = 4.8;

        fields.forEach((field) => {
            const plotGroup = new THREE.Group();
            plotGroup.position.set(field.posX, 0, field.posZ);

            // أرضية الحقل
            const soilGeo = new THREE.BoxGeometry(plotSize, 0.16, plotSize);
            const soilMat = new THREE.MeshStandardMaterial({
                color: field.prepared ? CONFIG.colors.soil : (field.purchased ? CONFIG.colors.roughLand : 0x556633),
                roughness: 0.96
            });
            const soilMesh = new THREE.Mesh(soilGeo, soilMat);
            soilMesh.position.y = 0.08;
            soilMesh.receiveShadow = true;
            soilMesh.castShadow = true;
            plotGroup.add(soilMesh);

            // إطار خشبي
            const frameMesh = new THREE.Mesh(
                new THREE.BoxGeometry(plotSize + 0.22, 0.2, plotSize + 0.22),
                new THREE.MeshStandardMaterial({ color: field.purchased ? CONFIG.colors.wood : 0x4a3a2a, roughness: 0.9 })
            );
            frameMesh.position.y = 0.07;
            plotGroup.add(frameMesh);

            // مجموعة خانات الزراعة الأربعة (2x2 Slots)
            const slotsGroup = new THREE.Group();
            slotsGroup.position.set(0, 0.16, 0);
            plotGroup.add(slotsGroup);

            // صخور وأعشاب برية للأرض المشتراة وغير المجهزة
            const wildGroup = new THREE.Group();
            if (field.purchased && !field.prepared) {
                this.addWildProps(wildGroup);
            }
            plotGroup.add(wildGroup);

            // شارة القفل وسعر 100 للأراضي المقفولة
            const lockGroup = new THREE.Group();
            lockGroup.position.set(0, 1.25, 0);

            if (!field.purchased) {
                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8),
                    new THREE.MeshStandardMaterial({ color: 0x743e18 })
                );
                post.position.y = -0.65;
                lockGroup.add(post);

                const sign = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, 0.75, 0.12),
                    new THREE.MeshStandardMaterial({ color: 0xffb800, roughness: 0.4, metalness: 0.4 })
                );
                sign.castShadow = true;
                lockGroup.add(sign);

                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(0.22, 0.05, 8, 16, Math.PI),
                    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7 })
                );
                ring.position.set(0, 0.38, 0);
                lockGroup.add(ring);
            }
            plotGroup.add(lockGroup);

            this.scene.add(plotGroup);

            this.fieldMeshes.set(field.id, {
                fieldData: field,
                group: plotGroup,
                soilMesh,
                frameMesh,
                slotsGroup,
                wildGroup,
                lockGroup,
                slotMeshes: new Map()
            });

            if (field.prepared) {
                this.renderAllFieldSlots(field.id);
            }
        });
    }

    addWildProps(group) {
        const rockGeo = new THREE.DodecahedronGeometry(0.28, 0);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.95 });
        const weedMat = new THREE.MeshStandardMaterial({ color: 0x768833, roughness: 0.9 });

        const offsets = [[-1.1, -1.0], [1.1, 0.8], [-0.5, 1.1], [1.2, -1.0]];
        offsets.forEach(([ox, oz], idx) => {
            if (idx % 2 === 0) {
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(ox, 0.15, oz);
                rock.scale.set(1.2, 0.7, 1.0);
                group.add(rock);
            } else {
                const weed = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 5), weedMat);
                weed.position.set(ox, 0.22, oz);
                group.add(weed);
            }
        });
    }

    renderAllFieldSlots(fieldId) {
        const slots = FarmingSystem.getOrCreateSlots(fieldId);
        slots.forEach((slot, idx) => {
            this.renderSlotCrop(fieldId, idx);
        });
    }

    /**
     * تجسيم المحصول الإجرائي الواقعي (Wheat / Corn / Carrot / Tomato)
     */
    renderSlotCrop(fieldId, slotIndex) {
        const entry = this.fieldMeshes.get(fieldId);
        if (!entry) return;

        const slots = FarmingSystem.getOrCreateSlots(fieldId);
        const slot = slots[slotIndex];
        if (!slot) return;

        if (entry.slotMeshes.has(slotIndex)) {
            const oldMesh = entry.slotMeshes.get(slotIndex);
            entry.slotsGroup.remove(oldMesh);
            entry.slotMeshes.delete(slotIndex);
        }

        const slotMeshGroup = new THREE.Group();
        slotMeshGroup.position.set(slot.ox, 0, slot.oz);

        // قاعدة ترابية مقسمة ومرطبة عند الري
        const tileBed = new THREE.Mesh(
            new THREE.BoxGeometry(1.9, 0.06, 1.9),
            new THREE.MeshStandardMaterial({
                color: slot.watered ? 0x3d2310 : 0x543217,
                roughness: 0.95
            })
        );
        tileBed.position.y = 0.03;
        tileBed.receiveShadow = true;
        slotMeshGroup.add(tileBed);

        if (slot.state === 'growing' || slot.state === 'ready') {
            const cropDef = CROPS_DEFINITIONS[slot.cropType] || CROPS_DEFINITIONS.wheat;
            const now = Date.now();
            const total = cropDef.growTime * 1000;
            const elapsed = Math.max(0, total - (slot.readyAt - now));
            const progress = Math.min(1, elapsed / total);

            const isReady = slot.state === 'ready' || progress >= 1;
            const type = slot.cropType;

            if (isReady) {
                // ================= STAGE 3: ناضج وجاهز للحصاد =================
                if (type === 'wheat') {
                    const wheatMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.4 });
                    for (let i = 0; i < 5; i++) {
                        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), wheatMat);
                        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), wheatMat);
                        ear.position.y = 0.55;
                        const wGroup = new THREE.Group();
                        wGroup.add(stalk);
                        wGroup.add(ear);
                        const ang = (i / 5) * Math.PI * 2;
                        wGroup.position.set(Math.cos(ang) * 0.4, 0.45, Math.sin(ang) * 0.4);
                        wGroup.rotation.z = Math.sin(ang) * 0.15;
                        slotMeshGroup.add(wGroup);
                    }
                } else if (type === 'corn') {
                    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x68c728, roughness: 0.6 });
                    const cobMat = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.4 });
                    const mainStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 6), stalkMat);
                    mainStalk.position.y = 0.6;
                    slotMeshGroup.add(mainStalk);
                    const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.38, 7), cobMat);
                    cob.position.set(0.14, 0.7, 0);
                    cob.rotation.z = -0.3;
                    slotMeshGroup.add(cob);
                } else if (type === 'carrot') {
                    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4aa625, roughness: 0.7 });
                    const carrotMat = new THREE.MeshStandardMaterial({ color: 0xff7043, roughness: 0.5 });
                    const topCarrot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.08, 0.28, 8), carrotMat);
                    topCarrot.position.y = 0.14;
                    slotMeshGroup.add(topCarrot);
                    for (let i = 0; i < 4; i++) {
                        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 4), leafMat);
                        const a = (i / 4) * Math.PI * 2;
                        leaf.position.set(Math.cos(a) * 0.12, 0.38, Math.sin(a) * 0.12);
                        leaf.rotation.z = Math.sin(a) * 0.25;
                        slotMeshGroup.add(leaf);
                    }
                } else {
                    const bushMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 });
                    const fruitMat = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.3 });
                    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1), bushMat);
                    bush.position.y = 0.45;
                    slotMeshGroup.add(bush);
                    for (let i = 0; i < 3; i++) {
                        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), fruitMat);
                        const ang = (i / 3) * Math.PI * 2;
                        fruit.position.set(Math.cos(ang) * 0.35, 0.42, Math.sin(ang) * 0.35);
                        slotMeshGroup.add(fruit);
                    }
                }
            } else if (progress < 0.4) {
                // ================= STAGE 1: بذرة / براعم خضراء =================
                const sproutMat = new THREE.MeshStandardMaterial({ color: cropDef.colors.sprout });
                for (let i = 0; i < 3; i++) {
                    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), sproutMat);
                    sp.position.set((i - 1) * 0.32, 0.12, (i % 2 - 0.5) * 0.18);
                    slotMeshGroup.add(sp);
                }
            } else {
                // ================= STAGE 2: نبات نامي أخضر =================
                const growMat = new THREE.MeshStandardMaterial({ color: cropDef.colors.growing });
                for (let i = 0; i < 3; i++) {
                    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 5), growMat);
                    const ang = (i / 3) * Math.PI * 2;
                    st.position.set(Math.cos(ang) * 0.25, 0.28, Math.sin(ang) * 0.25);
                    slotMeshGroup.add(st);
                }
            }
        }

        entry.slotsGroup.add(slotMeshGroup);
        entry.slotMeshes.set(slotIndex, slotMeshGroup);
    }

    /* ========================================================
       UNIFIED GAMEPLAY PROMPT LOGIC
       ======================================================== */
    setupUnifiedPromptUI() {
        const promptEl = document.getElementById('action-prompt');
        const promptBtn = document.getElementById('btn-prompt-action');
        const modalEl = document.getElementById('purchase-modal');
        const confirmBtn = document.getElementById('btn-confirm-buy');
        const cancelBtn = document.getElementById('btn-cancel-buy');

        [promptEl, modalEl].forEach((el) => {
            if (!el) return;
            el.addEventListener('pointerdown', (e) => e.stopPropagation());
            el.addEventListener('touchstart', (e) => e.stopPropagation());
        });

        promptBtn.addEventListener('click', () => {
            this.triggerActiveInteraction();
        });

        cancelBtn.addEventListener('click', () => {
            modalEl.classList.remove('open');
        });

        confirmBtn.addEventListener('click', () => {
            if (!this.activeTarget || this.activeTarget.type !== 'field') return;
            const res = LandSystem.purchaseField(this.activeTarget.fieldId);
            modalEl.classList.remove('open');

            if (!res.success && res.reason === 'insufficient-funds') {
                this.spawnFloatingFeedback('💰 تحتاج إلى 100 كوينز لشراء هذا الحقل', '#ff4444');
            }
        });
    }

    triggerActiveInteraction() {
        if (!this.activeTarget) return;
        const target = this.activeTarget;

        if (target.type === 'field' && !target.data.purchased) {
            const modal = document.getElementById('purchase-modal');
            if (modal) modal.classList.add('open');
            return;
        }

        if (target.type === 'field' && target.data.purchased && !target.data.prepared) {
            if (this.player) this.player.playToolSwing();
            LandSystem.strikeFieldWithAxe(target.fieldId);
            return;
        }

        if (target.type === 'slot') {
            const slot = target.slot;
            const selectedItem = this.hud?.getSelectedItem();

            if (slot.state === 'empty') {
                const cropType = selectedItem?.type === 'seed' ? selectedItem.cropType : 'wheat';
                const success = this.hud?.consumeSelectedItemCount();
                if (success) {
                    FarmingSystem.plantSeed(target.fieldId, target.slotIndex, cropType);
                    this.spawnFloatingFeedback(`🌱 تم بذر ${cropType}!`, '#86d942');
                } else {
                    this.spawnFloatingFeedback('اختر بذرة من الـ Hotbar أولاً!', '#ffb800');
                }
            } else if (slot.state === 'growing' && !slot.watered) {
                FarmingSystem.waterSlot(target.fieldId, target.slotIndex);
                this.renderSlotCrop(target.fieldId, target.slotIndex);
                this.spawnFloatingFeedback('💧 تم ري المحصول!', '#00d2ff');
            } else if (slot.state === 'ready') {
                FarmingSystem.harvestSlot(target.fieldId, target.slotIndex);
            }
        }
    }

    checkNearTargets() {
        if (!this.player || !this.player.root) return;
        const playerPos = this.player.root.position;

        let closestTarget = null;
        let minDist = 3.6;

        for (const [fieldId, entry] of this.fieldMeshes.entries()) {
            const field = entry.fieldData;
            const fieldCenter = new THREE.Vector3(field.posX, 0, field.posZ);
            const distToField = playerPos.distanceTo(fieldCenter);

            if (distToField > 5.5) continue;

            if (!field.purchased || !field.prepared) {
                if (distToField < minDist) {
                    minDist = distToField;
                    closestTarget = { type: 'field', fieldId, data: field };
                }
            } else {
                const slots = FarmingSystem.getOrCreateSlots(fieldId);
                slots.forEach((slot, sIdx) => {
                    const slotWorldPos = new THREE.Vector3(field.posX + slot.ox, 0, field.posZ + slot.oz);
                    const dSlot = playerPos.distanceTo(slotWorldPos);
                    if (dSlot < 2.3 && dSlot < minDist) {
                        minDist = dSlot;
                        closestTarget = { type: 'slot', fieldId, slotIndex: sIdx, slot };
                    }
                });
            }
        }

        const promptEl = document.getElementById('action-prompt');
        const promptTitle = document.getElementById('prompt-title');
        const promptDesc = document.getElementById('prompt-desc');
        const promptBtn = document.getElementById('btn-prompt-action');

        if (closestTarget) {
            this.activeTarget = closestTarget;
            promptEl.classList.add('visible');

            if (closestTarget.type === 'field') {
                const f = closestTarget.data;
                if (!f.purchased) {
                    promptTitle.textContent = '🌾 أرض جديدة متاح فتحها';
                    promptDesc.textContent = 'السعر: 💰 100 كوينز';
                    promptBtn.textContent = 'شراء الأرض';
                    promptBtn.style.background = 'linear-gradient(180deg, #79d63c 0%, #46961a 100%)';
                } else {
                    promptTitle.textContent = '🪓 أرض تحتاج تجهيز بالفأس';
                    promptDesc.textContent = `نسبة التجهيز: ${f.prepProgress || 0}%`;
                    promptBtn.textContent = 'اضرب بالفأس 🪓';
                    promptBtn.style.background = 'linear-gradient(180deg, #ff9f1c 0%, #d87800 100%)';
                }
            } else if (closestTarget.type === 'slot') {
                const s = closestTarget.slot;
                if (s.state === 'empty') {
                    promptTitle.textContent = '🌱 خانة تربة جاهزة';
                    promptDesc.textContent = 'اختر بذرة من الـ Hotbar للزراعة';
                    promptBtn.textContent = 'زراعة 🌱';
                    promptBtn.style.background = 'linear-gradient(180deg, #5dbcf0 0%, #1e88e5 100%)';
                } else if (s.state === 'growing') {
                    promptTitle.textContent = s.watered ? '⏳ المحصول ينمو...' : '💧 المحصول عطشان';
                    promptDesc.textContent = s.watered ? 'انتظر اكتمال النضج' : 'قم بري المحصول لتسريع النمو';
                    promptBtn.textContent = s.watered ? 'ينمو...' : 'اسقِ ماء 💧';
                    promptBtn.style.background = 'linear-gradient(180deg, #00d2ff 0%, #0088cc 100%)';
                } else if (s.state === 'ready') {
                    promptTitle.textContent = '🧺 المحصول ناضج وجاهز!';
                    promptDesc.textContent = 'احصد لكسب العملات والـ XP';
                    promptBtn.textContent = 'حصاد 🧺';
                    promptBtn.style.background = 'linear-gradient(180deg, #ffd54f 0%, #f5a623 100%)';
                }
            }
        } else {
            this.activeTarget = null;
            promptEl.classList.remove('visible');
        }
    }

    onLandPurchased({ field, cost }) {
        const entry = this.fieldMeshes.get(field.id);
        if (!entry) return;

        entry.fieldData.purchased = true;
        entry.fieldData.prepared = false;
        entry.fieldData.prepProgress = 0;

        entry.soilMesh.material.color.setHex(CONFIG.colors.roughLand);
        entry.frameMesh.material.color.setHex(CONFIG.colors.wood);
        entry.group.remove(entry.lockGroup);

        this.addWildProps(entry.wildGroup);

        this.spawnFloatingFeedback('🌾 تم شراء الأرض!', '#76d941');
        setTimeout(() => {
            this.spawnFloatingFeedback(`-${cost} 💰`, '#ffd54f');
        }, 280);

        this.checkNearTargets();
    }

    onLandAxeHit({ field, progress }) {
        const entry = this.fieldMeshes.get(field.id);
        if (!entry) return;

        entry.fieldData.prepProgress = progress;

        const origY = entry.group.position.y;
        entry.group.position.y = -0.06;
        setTimeout(() => { entry.group.position.y = origY; }, 120);

        this.spawnFloatingFeedback(`🪓 ضربة فأس! (${progress}%)`, '#ffb800');
        this.checkNearTargets();
    }

    onLandPrepared({ field }) {
        const entry = this.fieldMeshes.get(field.id);
        if (!entry) return;

        entry.fieldData.prepared = true;
        entry.fieldData.state = 'empty';

        while (entry.wildGroup.children.length > 0) {
            entry.wildGroup.remove(entry.wildGroup.children[0]);
        }

        entry.soilMesh.material.color.setHex(CONFIG.colors.soil);
        this.renderAllFieldSlots(field.id);

        this.spawnFloatingFeedback('✨ الحقل جاهز للزراعة! (+25 XP)', '#4ade80');
        try {
            const currentXp = GameState.get('player.xp') || 0;
            GameState.set('player.xp', currentXp + 25);
        } catch (e) {}

        this.checkNearTargets();
    }

    onCropHarvested({ fieldId, slotIndex, crop, coins, xp }) {
        this.renderSlotCrop(fieldId, slotIndex);
        this.spawnFloatingFeedback(`🧺 تم حصاد ${crop.name}! (+${coins} 💰, +${xp} XP)`, '#4ade80');
        this.checkNearTargets();
    }

    onLandPurchaseFailed({ reason }) {
        if (reason === 'insufficient-funds') {
            this.spawnFloatingFeedback('💰 تحتاج إلى 100 كوينز لشراء هذا الحقل', '#ff4d4d');
        }
    }

    spawnFloatingFeedback(text, color = '#ffd54f') {
        const el = document.createElement('div');
        el.className = 'floating-feedback';
        el.textContent = text;
        el.style.color = color;
        el.style.left = '50%';
        el.style.top = '44%';
        el.style.transform = 'translate(-50%, -50%)';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1300);
    }

    handleKeyDown(e) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.up = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
        if (e.code === 'Space') {
            e.preventDefault();
            this.triggerActiveInteraction();
        }
    }

    handleKeyUp(e) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.up = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
    }

    setupCameraTouch() {
        if (!this.canvas) return;

        const getTouchDistance = () => {
            const points = [...this.activeTouches.values()];
            if (points.length < 2) return 0;
            const dx = points[0].x - points[1].x;
            const dy = points[0].y - points[1].y;
            return Math.hypot(dx, dy);
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.target !== this.canvas) return;

            this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.canvas.setPointerCapture?.(e.pointerId);

            if (this.activeTouches.size === 1) {
                this.touchCameraActive = true;
                this.cameraTouchId = e.pointerId;
                this.touchLastX = e.clientX;
                this.touchLastY = e.clientY;
            } else if (this.activeTouches.size === 2) {
                this.touchCameraActive = false;
                this.pinchStartDistance = getTouchDistance();
                this.pinchStartCameraDistance = this.cameraDistance;
            }
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (!this.activeTouches.has(e.pointerId)) return;
            this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this.activeTouches.size >= 2) {
                const currentDist = getTouchDistance();
                if (currentDist > 0 && this.pinchStartDistance > 0) {
                    const ratio = this.pinchStartDistance / currentDist;
                    this.cameraDistance = THREE.MathUtils.clamp(
                        this.pinchStartCameraDistance * ratio,
                        CONFIG.camera.minDistance,
                        CONFIG.camera.maxDistance
                    );
                }
                return;
            }

            if (this.touchCameraActive && e.pointerId === this.cameraTouchId) {
                const dx = e.clientX - this.touchLastX;
                const dy = e.clientY - this.touchLastY;
                this.touchLastX = e.clientX;
                this.touchLastY = e.clientY;

                this.cameraYaw -= dx * 0.0055;
                this.cameraPitch = THREE.MathUtils.clamp(
                    this.cameraPitch - dy * 0.0035,
                    CONFIG.camera.minPitch,
                    CONFIG.camera.maxPitch
                );
            }
        });

        const releasePointer = (e) => {
            if (!this.activeTouches.has(e.pointerId)) return;
            this.activeTouches.delete(e.pointerId);

            if (this.activeTouches.size === 1) {
                const [remainingId, pos] = [...this.activeTouches.entries()][0];
                this.cameraTouchId = remainingId;
                this.touchLastX = pos.x;
                this.touchLastY = pos.y;
                this.touchCameraActive = true;
            } else if (this.activeTouches.size === 0) {
                this.touchCameraActive = false;
                this.cameraTouchId = null;
            }
        };

        this.canvas.addEventListener('pointerup', releasePointer);
        this.canvas.addEventListener('pointercancel', releasePointer);
        this.canvas.addEventListener('pointerleave', releasePointer);
    }

    resize() {
        if (!this.camera || !this.renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        const pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            CONFIG.performance.maxPixelRatio
        );
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height, false);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.clock.start();
        requestAnimationFrame(this._boundLoop);
    }

    gameLoop() {
        if (!this.running) return;
        const delta = Math.min(this.clock.getDelta(), 0.1);
        this.update(delta);
        this.render();
        requestAnimationFrame(this._boundLoop);
    }

    update(delta) {
        FarmingSystem.updateGrowth();

        this.clouds.forEach((cloud) => {
            cloud.position.x += delta * 0.8;
            if (cloud.position.x > 55) cloud.position.x = -55;
        });

        for (const entry of this.fieldMeshes.values()) {
            if (!entry.fieldData.purchased && entry.lockGroup) {
                entry.lockGroup.position.y = 1.25 + Math.sin(this.clock.getElapsedTime() * 2.5) * 0.08;
                entry.lockGroup.rotation.y += delta * 0.6;
            }
        }

        this.animatedTrees.forEach((tree, idx) => {
            tree.rotation.z = Math.sin(this.clock.getElapsedTime() * 1.5 + idx) * 0.015;
        });

        if (this.player && this.player.root) {
            let inputX = this.joystickVector.x;
            let inputZ = -this.joystickVector.y;

            if (this.keys.up) inputZ -= 1;
            if (this.keys.down) inputZ += 1;
            if (this.keys.left) inputX -= 1;
            if (this.keys.right) inputX += 1;

            let moveVector = new THREE.Vector3();
            if (Math.hypot(inputX, inputZ) > 0.05) {
                const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
                const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
                moveVector.addScaledVector(forward, -inputZ);
                moveVector.addScaledVector(right, inputX);
                moveVector.normalize();
            }

            this.player.update(delta, moveVector);

            this.checkNearTargets();

            if (this.lights.sun) {
                this.lights.sun.position.set(
                    this.player.root.position.x + 22,
                    38,
                    this.player.root.position.z + 18
                );
                this.lights.sun.target.position.copy(this.player.root.position);
                this.lights.sun.target.updateMatrixWorld();
            }

            // كاميرا طرف ثالث متوازنة مع المشهد
            const horizontalDist = this.cameraDistance * Math.cos(this.cameraPitch);
            const verticalDist = this.cameraDistance * Math.sin(this.cameraPitch);

            const camX = this.player.root.position.x + Math.sin(this.cameraYaw) * horizontalDist;
            const camZ = this.player.root.position.z + Math.cos(this.cameraYaw) * horizontalDist;
            const camY = this.player.root.position.y + CONFIG.camera.targetHeight + verticalDist;

            this.cameraTargetPosition.set(camX, Math.max(0.6, camY), camZ);
            this.cameraLookTarget.set(
                this.player.root.position.x,
                this.player.root.position.y + CONFIG.camera.targetHeight,
                this.player.root.position.z
            );

            const lerpFactor = 1.0 - Math.exp(-delta * 9.5);
            this.camera.position.lerp(this.cameraTargetPosition, lerpFactor);
            this.camera.lookAt(this.cameraLookTarget);
        }
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                if (loadingScreen && loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }
            }, 450);
        }
    }

    stop() {
        this.running = false;
    }

    destroy() {
        this.stop();
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);

        if (this.scene) {
            this.scene.traverse((child) => {
                if (!child.isMesh) return;
                if (child.geometry) child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => material.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            });
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
        this.player = null;
        this.initialized = false;
        console.log('[MY FARM] Cleaned up.');
    }
}

const app = new MyFarmApp();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.boot(), { once: true });
} else {
    app.boot();
}

if (typeof window !== 'undefined') {
    window.MY_FARM = app;
}
