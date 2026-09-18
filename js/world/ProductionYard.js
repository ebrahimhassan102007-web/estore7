/**
 * ============================================================
 * ProductionYard.js — مباني الإنتاج ثلاثية الأبعاد
 * ============================================================
 * THREE.js visuals ONLY — original low-poly designs:
 *   🌾 طاحونة الحبوب: برج خشبي بشفرات طاحونة دوّارة
 *   🍞 المخبز: كوخ كريمي بمدخنة يتصاعد منها دخان وفرن متوهّج
 *   🌽 مطحنة الأعلاف: صومعة معدنية + قمع تغذية + مثقب حلزوني دوّار
 *   🥛 مصنع الألبان: مبنى أبيض + خزان تبريد + براميل حليب
 *
 * Decoupling contract:
 *  - Reads placements via syncFromState(buildings) — never
 *    imports GameState directly.
 *  - Listens to state:changed farm.buildings to re-sync.
 *  - Selection is reported BY main.js via pick(); opening the
 *    UI is done through Events — this module has no DOM.
 * ============================================================
 */
import * as THREE from 'three';
import { Events } from '../core/EventBus.js';
import { getBuilding } from '../data/GameData.js';
import { mergeGroupChildren, mergeSubtree } from './MergeUtils.js';

const COLORS = {
    millWood: 0x8a552e,
    millCream: 0xf2dfbd,
    millRoof: 0xc9542c,
    bladeSail: 0xf7ead2,
    bakeryWall: 0xf7e7c8,
    bakeryRoof: 0xa8432a,
    brick: 0xb06a45,
    door: 0x6a3e1b,
    window: 0xffca6a,
    chimney: 0x9c5a3c,
    smoke: 0xe8e4de,
    ring: 0xffd54f,
    base: 0x7ec850,
    steel: 0xb9c3cb,
    steelDark: 0x59616b,
    hopper: 0xd8b23c,
    dairyTile: 0xeef2f4,
    dairyTrim: 0x4f8fbf,
    dairyRoof: 0x5c8fb5
};

export class ProductionYard {
    constructor({ scene, collision = null }) {
        this.scene = scene;
        this.collision = collision;
        this.entries = new Map(); // instanceId -> entry
        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._selectedId = null;

        this._mats = {
            millWood: new THREE.MeshStandardMaterial({ color: COLORS.millWood, roughness: 0.85 }),
            millCream: new THREE.MeshStandardMaterial({ color: COLORS.millCream, roughness: 0.9 }),
            millRoof: new THREE.MeshStandardMaterial({ color: COLORS.millRoof, roughness: 0.7 }),
            blade: new THREE.MeshStandardMaterial({ color: COLORS.bladeSail, roughness: 0.9 }),
            bakeryWall: new THREE.MeshStandardMaterial({ color: COLORS.bakeryWall, roughness: 0.9 }),
            bakeryRoof: new THREE.MeshStandardMaterial({ color: COLORS.bakeryRoof, roughness: 0.7 }),
            brick: new THREE.MeshStandardMaterial({ color: COLORS.brick, roughness: 0.95 }),
            door: new THREE.MeshStandardMaterial({ color: COLORS.door, roughness: 0.9 }),
            window: new THREE.MeshStandardMaterial({
                color: COLORS.window, emissive: 0xff9d2e, emissiveIntensity: 0.55
            }),
            chimney: new THREE.MeshStandardMaterial({ color: COLORS.chimney, roughness: 0.95 }),
            smoke: new THREE.MeshStandardMaterial({
                color: COLORS.smoke, transparent: true, opacity: 0.55, roughness: 1
            }),
            ring: new THREE.MeshBasicMaterial({
                color: COLORS.ring, transparent: true, opacity: 0.85
            }),
            base: new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 1 }),
            steel: new THREE.MeshStandardMaterial({
                color: COLORS.steel, metalness: 0.6, roughness: 0.38
            }),
            steelDark: new THREE.MeshStandardMaterial({
                color: COLORS.steelDark, metalness: 0.45, roughness: 0.6
            }),
            hopper: new THREE.MeshStandardMaterial({
                color: COLORS.hopper, metalness: 0.3, roughness: 0.5
            }),
            dairyTile: new THREE.MeshStandardMaterial({ color: COLORS.dairyTile, roughness: 0.55 }),
            dairyTrim: new THREE.MeshStandardMaterial({ color: COLORS.dairyTrim, roughness: 0.6 }),
            dairyRoof: new THREE.MeshStandardMaterial({ color: COLORS.dairyRoof, roughness: 0.85 }),
            dairyGlass: new THREE.MeshStandardMaterial({
                color: 0xdff1fb, roughness: 0.25, emissive: 0x2b6f96, emissiveIntensity: 0.35
            }),
            churn: new THREE.MeshStandardMaterial({
                color: 0xdfe6ea, metalness: 0.5, roughness: 0.4
            }),
            sack: new THREE.MeshStandardMaterial({ color: 0xcbb98d, roughness: 1 })
        };

        // إعادة المزامنة عند أي تغيير على مباني المزرعة (حفظ/تحميل/إنتاج)
        Events.on('state:changed', (path, value) => {
            if (path === 'farm.buildings' && Array.isArray(value)) {
                this.syncFromState(value);
            }
        });
        Events.on('production:deselect', () => this.setSelected(null));
    }

    /* ========================================================
       SYNC — idempotent: يبني ما ينقص، يحدّث الموجود
       ======================================================== */
    syncFromState(buildings) {
        if (!Array.isArray(buildings)) return;

        const seen = new Set();

        for (const b of buildings) {
            const def = getBuilding(b.typeId);
            if (!def || def.category !== 'production') continue;

            seen.add(b.id);

            if (!this.entries.has(b.id)) {
                const group = this._buildFor(b.typeId);
                const pos = b.position || { x: 0, z: 4.5 };
                group.position.set(pos.x, 0, pos.z);
                group.lookAt(0, 0, 0); // يواجه مركز المزرعة
                this.scene.add(group);

                this.entries.set(b.id, {
                    id: b.id,
                    typeId: b.typeId,
                    group,
                    blades: group.userData.blades || null,
                    smoke: group.userData.smoke || [],
                    glow: group.userData.glow || null,
                    producing: false,
                    ready: false
                });

                if (this.collision) {
                    this.collision.addBox({
                        id: `prod-${b.id}`,
                        x: pos.x,
                        z: pos.z,
                        width: 2.2,
                        depth: 2.2,
                        height: 3.2,
                        tag: 'production'
                    });
                }
            }

            const entry = this.entries.get(b.id);
            const queue = b.productionQueue || [];
            entry.producing = queue.some(j => j.state === 'producing');
            entry.ready = queue.some(j => j.state === 'ready' || Date.now() >= (j.readyAt || Infinity));
        }

        // إزالة مبانٍ حُذفت من الحالة
        for (const [id, entry] of this.entries) {
            if (!seen.has(id)) {
                this.scene.remove(entry.group);
                this.entries.delete(id);
            }
        }
    }

    /* ========================================================
       BUILDERS — تصاميم أصلية منخفضة البولي
       ======================================================== */
    _buildFor(typeId) {
        switch (typeId) {
            case 'grain_mill': return this._buildMill();
            case 'bakery':     return this._buildBakery();
            case 'feed_mill':  return this._buildFeedMill();
            case 'dairy':      return this._buildDairy();
            default:           return this._buildShed();
        }
    }

    _basePlate(group, size = 3.4) {
        const plate = new THREE.Mesh(
            new THREE.CylinderGeometry(size / 2, size / 2, 0.12, 24),
            this._mats.base
        );
        plate.position.y = 0.06;
        plate.receiveShadow = true;
        group.add(plate);
        return plate;
    }

    _selectionRing(group) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.7, 0.07, 10, 40),
            this._mats.ring
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.14;
        ring.visible = false;
        group.add(ring);
        group.userData.ring = ring;
        return ring;
    }

    /** 🌾 طاحونة الهواء «نسيم القمح» */
    _buildMill() {
        const g = new THREE.Group();
        g.userData = { kind: 'grain_mill' };
        this._basePlate(g);

        // القاعدة الحجرية
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.95, 1.15, 0.5, 8),
            this._mats.brick
        );
        base.position.y = 0.35;
        base.castShadow = true;
        g.add(base);

        // جسم الطاحونة (برج مائل للداخل)
        const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.92, 1.9, 8),
            this._mats.millCream
        );
        tower.position.y = 1.55;
        tower.castShadow = true;
        g.add(tower);

        // شريط خشبي زخرفي
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(0.75, 0.8, 0.18, 8),
            this._mats.millWood
        );
        band.position.y = 1.9;
        g.add(band);

        // السقف المخروطي
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(0.85, 0.9, 8),
            this._mats.millRoof
        );
        roof.position.y = 2.95;
        roof.castShadow = true;
        g.add(roof);

        // الباب
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.7, 0.1),
            this._mats.door
        );
        door.position.set(0, 0.75, 1.03);
        g.add(door);

        // الشفرات الأربع (تدور حول محور مواجه)
        const blades = new THREE.Group();
        const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10),
            this._mats.millWood
        );
        hub.rotation.x = Math.PI / 2;
        blades.add(hub);

        for (let i = 0; i < 4; i++) {
            const arm = new THREE.Group();
            const spar = new THREE.Mesh(
                new THREE.BoxGeometry(0.06, 1.05, 0.04),
                this._mats.millWood
            );
            spar.position.y = 0.55;
            arm.add(spar);

            const sail = new THREE.Mesh(
                new THREE.BoxGeometry(0.34, 0.85, 0.02),
                this._mats.blade
            );
            sail.position.set(0.18, 0.78, 0);
            arm.add(sail);

            arm.rotation.z = (i * Math.PI) / 2;
            blades.add(arm);
        }
        blades.position.set(0, 2.35, 1.02);
        g.add(blades);
        g.userData.blades = blades;

        // الشفرات تدور ككل ⇒ تدمج الشجرة كلها في mesh واحد
        mergeSubtree(blades, { name: 'Mill-blades' });

        // أكياس قمح كديكور
        for (const [dx, dz] of [[0.95, 0.75], [1.15, 0.5]]) {
            const sack = new THREE.Mesh(
                new THREE.SphereGeometry(0.22, 10, 8),
                this._mats.blade
            );
            sack.scale.y = 1.25;
            sack.position.set(dx, 0.35, dz);
            sack.castShadow = true;
            g.add(sack);
        }

        mergeGroupChildren(g, { name: 'Mill-body' });
        this._selectionRing(g);
        return g;
    }

    /** 🍞 المخبز «فرن الفجر» — كوخ بمدخنة ودخان وفرن متوهّج */
    _buildBakery() {
        const g = new THREE.Group();
        g.userData = { kind: 'bakery' };
        this._basePlate(g);

        // هيكل الكوخ
        const hut = new THREE.Mesh(
            new THREE.BoxGeometry(1.7, 1.15, 1.5),
            this._mats.bakeryWall
        );
        hut.position.y = 0.62;
        hut.castShadow = true;
        g.add(hut);

        // قاعدة الفرن الحجرية (واجهة)
        const oven = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.75, 0.4),
            this._mats.brick
        );
        oven.position.set(-0.35, 0.45, 0.72);
        oven.castShadow = true;
        g.add(oven);

        // فوهة الفرن المتوهّجة
        const mouth = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.35, 0.06),
            this._mats.window
        );
        mouth.position.set(-0.35, 0.42, 0.93);
        g.add(mouth);
        g.userData.glow = this._mats.window;

        // سقف مثلثي (منشور من مخروط رباعي)
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.45, 0.85, 4),
            this._mats.bakeryRoof
        );
        roof.position.y = 1.6;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        g.add(roof);

        // المدخنة
        const chimney = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.16, 0.9, 8),
            this._mats.chimney
        );
        chimney.position.set(0.5, 1.85, -0.2);
        chimney.castShadow = true;
        g.add(chimney);

        // الدخان المتصاعد (3 بخات متحركة)
        const smokePuffs = [];
        for (let i = 0; i < 3; i++) {
            const puff = new THREE.Mesh(
                new THREE.SphereGeometry(0.13, 8, 6),
                this._mats.smoke.clone()
            );
            puff.position.set(0.5, 2.3 + i * 0.4, -0.2);
            puff.userData.phase = i / 3;
            puff.userData.noMerge = true; // يتحرك كل إطار
            g.add(puff);
            smokePuffs.push(puff);
        }
        g.userData.smoke = smokePuffs;

        // الباب ونافذة دافئة
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.65, 0.08),
            this._mats.door
        );
        door.position.set(0.45, 0.5, 0.76);
        g.add(door);

        const win = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.3, 0.06),
            this._mats.window
        );
        win.position.set(-0.05, 0.85, 0.77);
        win.userData.noMerge = true; // توهّجه يتحرك عبر g.userData.glow
        g.add(win);

        // رف خبز خارجي
        const shelf = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.05, 0.3),
            this._mats.millWood
        );
        shelf.position.set(0.95, 0.55, 0.9);
        g.add(shelf);
        for (let i = 0; i < 3; i++) {
            const bun = new THREE.Mesh(
                new THREE.SphereGeometry(0.09, 8, 6),
                new THREE.MeshStandardMaterial({ color: 0xd9a04a, roughness: 0.9 })
            );
            bun.scale.y = 0.7;
            bun.position.set(0.8 + i * 0.16, 0.63, 0.9);
            g.add(bun);
        }

        mergeGroupChildren(g, { name: 'Bakery-body' });
        this._selectionRing(g);
        return g;
    }

    /**
     * 🌽 مطحنة الأعلاف «خط العلف» — أول آلة في سلسلة Hay Day:
     * محاصيل ⇒ أعلاف لكل نوع حيوان.
     * صومعة معدنية + قمع تغذية مقلوب + مثقب حلزوني + دولاب دوّار.
     */
    _buildFeedMill() {
        const g = new THREE.Group();
        g.userData = { kind: 'feed_mill' };
        this._basePlate(g);

        // صومعة أسطوانية بقاعدة أعرض
        const silo = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.72, 1.8, 14),
            this._mats.steel
        );
        silo.position.set(-0.25, 1.15, -0.1);
        silo.castShadow = true;
        g.add(silo);

        // حلقات تقوية (تفصيلة صناعية)
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.66, 0.035, 6, 18),
                this._mats.steelDark
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.set(-0.25, 0.6 + i * 0.55, -0.1);
            g.add(ring);
        }

        // غطاء مخروطي
        const cap = new THREE.Mesh(
            new THREE.ConeGeometry(0.78, 0.5, 14),
            this._mats.steelDark
        );
        cap.position.set(-0.25, 2.3, -0.1);
        cap.castShadow = true;
        g.add(cap);

        // قمع التغذية (مخروط مفتوح مقلوب) — علامة الآلة المميزة
        const hopper = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.2, 0.62, 12, 1, true),
            this._mats.hopper
        );
        hopper.material.side = THREE.DoubleSide;
        // القمع مفتوح من الوجهين ⇒ لا يُدمج (الدمج يبزخ جانبًا واحدًا)
        hopper.userData.noMerge = true;
        hopper.position.set(0.72, 1.02, 0.15);
        hopper.castShadow = true;
        g.add(hopper);

        // أرجل القمع
        const legs = new THREE.Group();
        legs.name = 'FeedMill-legs';
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6),
                this._mats.steelDark
            );
            leg.position.set(0.72 + Math.cos(a) * 0.3, 0.55, 0.15 + Math.sin(a) * 0.3);
            leg.rotation.z = Math.cos(a) * 0.16;
            leg.rotation.x = -Math.sin(a) * 0.16;
            legs.add(leg);
        }
        g.add(legs);
        mergeSubtree(legs, { name: 'FeedMill-legs' });

        // مثقب حلزوني مائل ينقل العلف من الصومعة إلى القمع
        const auger = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.11, 1.15, 10),
            this._mats.steelDark
        );
        auger.position.set(0.24, 1.5, 0.02);
        auger.rotation.z = 1.0;
        auger.castShadow = true;
        g.add(auger);

        // دولاب دوران (يدور أثناء الإنتاج) — نضعه في blades
        const wheel = new THREE.Group();
        wheel.name = 'FeedMill-wheel';
        const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10),
            this._mats.steelDark
        );
        hub.rotation.x = Math.PI / 2;
        wheel.add(hub);
        for (let i = 0; i < 6; i++) {
            const spoke = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 0.52, 0.05),
                this._mats.millWood
            );
            spoke.rotation.z = (i * Math.PI) / 6;
            wheel.add(spoke);
        }
        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.26, 0.03, 6, 18),
            this._mats.millWood
        );
        wheel.add(rim);
        wheel.position.set(-0.25, 1.75, 0.66);
        g.add(wheel);
        g.userData.blades = wheel;
        mergeSubtree(wheel, { name: 'FeedMill-wheel' });

        // فوهة الخروج + أكياس علف جاهزة
        const chute = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.3, 0.4),
            this._mats.steelDark
        );
        chute.position.set(0.72, 0.5, 0.15);
        chute.castShadow = true;
        g.add(chute);

        for (const [dx, dz, ry] of [[0.95, 0.95, 0.3], [1.25, 0.72, -0.25]]) {
            const sack = new THREE.Mesh(
                new THREE.BoxGeometry(0.26, 0.38, 0.2),
                this._mats.sack
            );
            sack.position.set(dx, 0.32, dz);
            sack.rotation.y = ry;
            sack.castShadow = true;
            g.add(sack);

            const tie = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, 0.07, 8),
                this._mats.millWood
            );
            tie.position.set(dx, 0.53, dz);
            g.add(tie);
        }

        // لوحة تعريف صغيرة على الوجه
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.26, 0.05),
            this._mats.millWood
        );
        plate.position.set(-0.25, 1.62, 0.63);
        g.add(plate);

        mergeGroupChildren(g, { name: 'FeedMill-body' });
        this._selectionRing(g);
        return g;
    }

    /**
     * 🥛 مصنع الألبان «خط الحليب» — حليب ⇒ كريمة/زبدة/جبن.
     * مبنى أبيض نظيف + خزان تبريد + أنابيب + براميل حليب.
     */
    _buildDairy() {
        const g = new THREE.Group();
        g.userData = { kind: 'dairy' };
        this._basePlate(g, 3.8);

        // المبنى الأبيض
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 1.15, 1.5),
            this._mats.dairyTile
        );
        body.position.y = 0.62;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);

        // سقف مائل + شريط أزرق
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.12, 1.7),
            this._mats.dairyRoof
        );
        roof.position.y = 1.26;
        roof.rotation.z = 0.06;
        roof.castShadow = true;
        g.add(roof);

        const band = new THREE.Mesh(
            new THREE.BoxGeometry(2.02, 0.2, 1.52),
            this._mats.dairyTrim
        );
        band.position.y = 1.05;
        g.add(band);

        // نوافذ زجاجية باردة (تتوهّج أثناء الإنتاج)
        for (const x of [-0.62, 0.05, 0.72]) {
            const pane = new THREE.Mesh(
                new THREE.BoxGeometry(0.42, 0.34, 0.05),
                this._mats.dairyGlass
            );
            pane.position.set(x, 0.66, 0.77);
            pane.userData.noMerge = true; // التوهج يتحرك عبر g.userData.glow
            g.add(pane);
        }
        g.userData.glow = this._mats.dairyGlass;

        // خزان تبريد أسطواني على السطح
        const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.34, 1.0, 14),
            this._mats.steel
        );
        tank.position.set(-0.55, 1.8, -0.25);
        tank.castShadow = true;
        g.add(tank);

        const tankCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            this._mats.steel
        );
        tankCap.position.set(-0.55, 2.3, -0.25);
        g.add(tankCap);

        // أنابيب تربط الخزان بالمبنى
        const pipe1 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8),
            this._mats.steel
        );
        pipe1.position.set(-0.1, 1.45, -0.25);
        pipe1.rotation.z = Math.PI / 2;
        g.add(pipe1);

        const pipe2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8),
            this._mats.steel
        );
        pipe2.position.set(0.35, 1.05, -0.25);
        g.add(pipe2);

        // مروحة تبريد تدور أثناء الإنتاج (نضعها في blades)
        const fan = new THREE.Group();
        fan.name = 'Dairy-fan';
        const fanHub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8),
            this._mats.steelDark
        );
        fanHub.rotation.x = Math.PI / 2;
        fan.add(fanHub);
        for (let i = 0; i < 3; i++) {
            const blade = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.07, 0.02),
                this._mats.steelDark
            );
            blade.rotation.z = (i * Math.PI * 2) / 3;
            blade.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.14, Math.sin((i * Math.PI * 2) / 3) * 0.14, 0);
            fan.add(blade);
        }
        fan.position.set(0.62, 1.55, -0.78);
        g.add(fan);
        g.userData.blades = fan;
        mergeSubtree(fan, { name: 'Dairy-fan' });

        // براميل حليب على منصة تحميل
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.1, 0.8),
            this._mats.millWood
        );
        deck.position.set(1.05, 0.18, 0.85);
        deck.receiveShadow = true;
        g.add(deck);

        for (const [dx, dz] of [[0.85, 0.8], [1.2, 0.95]]) {
            const churn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.18, 0.44, 12),
                this._mats.churn
            );
            churn.position.set(dx, 0.45, dz);
            churn.castShadow = true;
            g.add(churn);

            const lid = new THREE.Mesh(
                new THREE.CylinderGeometry(0.11, 0.15, 0.07, 12),
                this._mats.steel
            );
            lid.position.set(dx, 0.7, dz);
            g.add(lid);
        }

        // الباب
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.68, 0.07),
            this._mats.dairyTrim
        );
        door.position.set(-0.9, 0.46, 0.77);
        g.add(door);

        mergeGroupChildren(g, { name: 'Dairy-body' });
        this._selectionRing(g);
        return g;
    }

    /** كوخ احتياطي لأي مبنى إنتاجي غير معروف */
    _buildShed() {
        const g = new THREE.Group();
        g.userData = { kind: 'shed' };
        this._basePlate(g);
        const hut = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 1.0, 1.2),
            this._mats.millWood
        );
        hut.position.y = 0.56;
        g.add(hut);
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.2, 0.7, 4),
            this._mats.millRoof
        );
        roof.position.y = 1.4;
        roof.rotation.y = Math.PI / 4;
        g.add(roof);
        mergeGroupChildren(g, { name: 'Shed-body' });
        this._selectionRing(g);
        return g;
    }

    /* ========================================================
       SELECTION & PICKING
       ======================================================== */

    /** Raycast tap -> { instanceId, typeId, x, z } أو null */
    pick(clientX, clientY, camera) {
        if (this.entries.size === 0) return null;

        const w = (typeof window !== 'undefined') ? window.innerWidth : 1;
        const h = (typeof window !== 'undefined') ? window.innerHeight : 1;
        this._pointer.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
        this._raycaster.setFromCamera(this._pointer, camera);

        const roots = [...this.entries.values()].map(e => e.group);
        const hits = this._raycaster.intersectObjects(roots, true);
        if (hits.length === 0) return null;

        let node = hits[0].object;
        while (node && !node.userData.kind) node = node.parent;
        if (!node) return null;

        for (const entry of this.entries.values()) {
            if (entry.group === node) {
                return {
                    instanceId: entry.id,
                    typeId: entry.typeId,
                    x: entry.group.position.x,
                    z: entry.group.position.z
                };
            }
        }
        return null;
    }

    setSelected(instanceId) {
        this._selectedId = instanceId;
        for (const entry of this.entries.values()) {
            const ring = entry.group.userData.ring;
            if (ring) ring.visible = (entry.id === instanceId);
        }
    }

    getWorldPos(instanceId) {
        const entry = this.entries.get(instanceId);
        return entry
            ? { x: entry.group.position.x, z: entry.group.position.z }
            : null;
    }

    /* ========================================================
       FRAME UPDATE — حركات خفيفة حيّة
       ======================================================== */
    update(delta, elapsed) {
        for (const entry of this.entries.values()) {
            // شفرات الطاحونة: أسرع أثناء الإنتاج
            if (entry.blades) {
                const speed = entry.producing ? 2.6 : 0.75;
                entry.blades.rotation.z += delta * speed;
            }

            // دخان المدخنة يتصاعد ويختفي
            for (const puff of entry.smoke) {
                const rate = entry.producing ? 0.55 : 0.28;
                let ph = (puff.userData.phase + delta * rate) % 1;
                puff.userData.phase = ph;
                puff.position.y = 2.3 + ph * 1.5;
                puff.position.x = 0.5 + Math.sin(elapsed * 1.5 + ph * 6.28) * 0.08;
                const s = 0.6 + ph * 1.4;
                puff.scale.setScalar(s);
                puff.material.opacity = 0.5 * (1 - ph);
            }

            // توهج الفرن/نوافذ الألبان: نبض + سطوع عند الجاهزية
            if (entry.glow && (entry.typeId === 'bakery' || entry.typeId === 'dairy')) {
                const base = entry.producing ? 0.85 : 0.45;
                entry.glow.emissiveIntensity =
                    base + Math.sin(elapsed * (entry.ready ? 6 : 2)) * (entry.ready ? 0.4 : 0.12);
            }

            // حلقة التحديد النابضة
            const ring = entry.group.userData.ring;
            if (ring && ring.visible) {
                const pulse = 1 + Math.sin(elapsed * 5) * 0.06;
                ring.scale.setScalar(pulse);
            }
        }
    }
}

export default ProductionYard;
