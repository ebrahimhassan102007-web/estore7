/**
 * ============================================================
 * HouseInterior.js — مشهد داخلي حقيقي للبيت (لا فراغ أسود)
 * ============================================================
 * Brief §2 «House interior»:
 *   • منظر المزرعة يُخفى/يُفرَّغ، ويظهر مشهد داخلي حقيقي
 *     (غرف + أثاث + صندوق تخزين).
 *   • الخروج يعيد المزرعة كما كانت.
 *   • الباب مفتاح/إغلاق حقيقي — لا جدار وهمي.
 *
 * التنفيذ:
 *   المشهد الداخلي مجموعة واحدة في نفس الـ scene عند إزاحة بعيدة
 *   (INTERIOR_ORIGIN) ومخفيّة افتراضيًا. عند الدخول تُخفى جذور
 *   المزرعة وتُضاء المجموعة بمصابيحها الدافئة. لا scene ثانية ولا
 *   إعادة تهيئة للريندرر ⇒ لا شاشة سوداء ولا تسريب موارد.
 *
 *   الأثاث الساكن يُدمج (mergeGroupChildren) في عدد قليل من نداءات
 *   الرسم، والأجزاء المتحركة (الباب) تبقى خارج الدمج.
 * ============================================================
 */

import * as THREE from 'three';
import { InteractiveDoor } from './Doors.js';
import { mergeAllStatic, mergeGroupChildren, mergeMeshes } from './MergeUtils.js';
import {
    HOUSE,
    INTERIOR_ORIGIN,
    INTERIOR_SPAWN,
    INTERIOR_CHEST,
    INTERIOR_EXIT
} from './FarmLayout.js';

/* ============================================================
   CONSTANTS — أبعاد ومواد ثابتة
   ============================================================ */

const ROOM = Object.freeze({
    width: 13.2,          // x
    depth: 11.4,          // z
    wallHeight: 3.5,
    wallThickness: 0.34,
    doorwayWidth: 2.1,
    floorY: 0.02
});

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;

const PALETTE = Object.freeze({
    floorPlank: 0x8a5a30,
    floorPlankAlt: 0x7c4f28,
    wall: 0xe8d6b4,
    wallAccent: 0xc9a877,
    wainscot: 0x6f4522,
    ceiling: 0xf2e6cf,
    beam: 0x5f3a1d,
    rug: 0xa63d3d,
    rugBorder: 0x7d2b2b,
    sofa: 0x4d7a8c,
    sofaCushion: 0x6f9aab,
    woodDark: 0x4a2d16,
    woodMid: 0x7a4c25,
    woodLight: 0xa9743c,
    metal: 0x9aa3a8,
    stone: 0x8d8578,
    fabric: 0xd9c7a3,
    blanket: 0x3f6b52,
    pillow: 0xf0e4cd,
    plant: 0x3f8f3a,
    pot: 0xb4643c,
    glass: 0x9fd4ef,
    fireGlow: 0xff8a34,
    lampShade: 0xffe0a3,
    book1: 0xa83c2e,
    book2: 0x2f5d7c,
    book3: 0x6b7f2e,
    copper: 0xb87333,
    chest: 0x8b5a2b,
    chestBand: 0x4a3418,
    gold: 0xd4a017
});

const M = (color, roughness = 0.85, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(group, size, pos, material, { cast = true, receive = true, name = '' } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (name) mesh.name = name;
    group.add(mesh);
    return mesh;
}

export class HouseInterior {
    /**
     * @param {object} deps
     * @param {THREE.Scene} deps.scene
     * @param {import('../core/CollisionEngine.js').CollisionEngine} [deps.collision]
     */
    constructor({ scene, collision = null }) {
        this.scene = scene;
        this.collision = collision;

        this.group = new THREE.Group();
        this.group.name = 'HouseInterior';
        this.group.position.set(INTERIOR_ORIGIN.x, INTERIOR_ORIGIN.y, INTERIOR_ORIGIN.z);
        this.group.visible = false;
        this.scene.add(this.group);

        /** عناصر تفاعلية داخل البيت — يقرأها نظام الـ prompt في main.js. */
        this.interactables = [];
        this.exitDoor = null;
        this.chestLid = null;
        this.fireLight = null;
        this.lampLights = [];
        this._elapsed = 0;

        this.build();
    }

    /* ========================================================
       BUILD
       ======================================================== */

    build() {
        this._materials();
        this._shell();
        this._livingRoom();
        this._kitchen();
        this._bedroom();
        this._chest();
        this._exitDoor();
        this._decor();
        this._lights();

        // دمج الأثاث الساكن: كل غرفة تُدمج في نداء رسم واحد تقريبًا.
        mergeGroupChildren(this.group, { name: 'Interior-static' });
        /*
         * مرور ثانٍ داخل كل غرفة/قطعة: mergeGroupChildren يدمج أبناء
         * الجذر المباشر فقط، بينما أغلب الأثاث داخل مجموعات فرعية.
         * المستثنى بـ noMerge: الزجاج، اللهب، السقف، أغطية المصابيح،
         * وجه الساعة، وغطاء الصندوق (يتحرك).
         */
        mergeAllStatic(this.group, { name: 'Interior-deep' });
    }

    _materials() {
        this.mat = {
            floor: M(PALETTE.floorPlank, 0.92),
            floorAlt: M(PALETTE.floorPlankAlt, 0.92),
            wall: M(PALETTE.wall, 0.95),
            wallAccent: M(PALETTE.wallAccent, 0.95),
            wainscot: M(PALETTE.wainscot, 0.8),
            ceiling: M(PALETTE.ceiling, 0.98),
            beam: M(PALETTE.beam, 0.85),
            woodDark: M(PALETTE.woodDark, 0.8),
            woodMid: M(PALETTE.woodMid, 0.82),
            woodLight: M(PALETTE.woodLight, 0.78),
            rug: M(PALETTE.rug, 1),
            rugBorder: M(PALETTE.rugBorder, 1),
            sofa: M(PALETTE.sofa, 0.95),
            cushion: M(PALETTE.sofaCushion, 0.95),
            fabric: M(PALETTE.fabric, 0.95),
            blanket: M(PALETTE.blanket, 0.95),
            pillow: M(PALETTE.pillow, 0.95),
            metal: M(PALETTE.metal, 0.4, 0.6),
            stone: M(PALETTE.stone, 0.95),
            plant: M(PALETTE.plant, 0.9),
            pot: M(PALETTE.pot, 0.9),
            copper: M(PALETTE.copper, 0.35, 0.7),
            gold: M(PALETTE.gold, 0.35, 0.7),
            chest: M(PALETTE.chest, 0.8),
            chestBand: M(PALETTE.chestBand, 0.6, 0.3),
            glass: new THREE.MeshStandardMaterial({
                color: PALETTE.glass, roughness: 0.25, metalness: 0.05,
                transparent: true, opacity: 0.42
            }),
            lampShade: new THREE.MeshStandardMaterial({
                color: PALETTE.lampShade, emissive: 0xffb45e,
                emissiveIntensity: 0.9, roughness: 0.7
            }),
            fire: new THREE.MeshStandardMaterial({
                color: PALETTE.fireGlow, emissive: PALETTE.fireGlow,
                emissiveIntensity: 1.6, roughness: 1
            }),
            book1: M(PALETTE.book1, 0.9),
            book2: M(PALETTE.book2, 0.9),
            book3: M(PALETTE.book3, 0.9)
        };
    }

    /** الأرضية + الجدران + السقف + العوارض + النوافذ. */
    _shell() {
        const g = this.group;
        const m = this.mat;

        // --- أرضية ألواح خشبية (planks) ---
        const plankW = 0.9;
        const planks = [];
        for (let i = 0; i < Math.ceil(ROOM.width / plankW); i++) {
            const x = -HALF_W + plankW / 2 + i * plankW;
            const plank = new THREE.Mesh(
                new THREE.BoxGeometry(plankW - 0.03, 0.08, ROOM.depth),
                i % 2 ? m.floorAlt : m.floor
            );
            plank.position.set(x, ROOM.floorY - 0.04, 0);
            plank.receiveShadow = true;
            g.add(plank);
            planks.push(plank);
        }
        mergeMeshes(planks, { name: 'Interior-floor' });

        // --- الجدران الأربعة مع فتحة الباب الجنوبية ---
        const wallY = ROOM.floorY + ROOM.wallHeight / 2;
        const t = ROOM.wallThickness;

        // شمال (صلب)
        box(g, [ROOM.width, ROOM.wallHeight, t], [0, wallY, -HALF_D], m.wall);
        // شرق (صلب)
        box(g, [t, ROOM.wallHeight, ROOM.depth], [HALF_W, wallY, 0], m.wall);
        // غرب (صلب)
        box(g, [t, ROOM.wallHeight, ROOM.depth], [-HALF_W, wallY, 0], m.wall);

        // جنوب: ضلفتان حول فتحة الباب
        const sideW = (ROOM.width - ROOM.doorwayWidth) / 2;
        const sideX = (ROOM.doorwayWidth + sideW) / 2;
        box(g, [sideW, ROOM.wallHeight, t], [-sideX, wallY, HALF_D], m.wall);
        box(g, [sideW, ROOM.wallHeight, t], [sideX, wallY, HALF_D], m.wall);
        // عتب فوق الباب
        box(g, [ROOM.doorwayWidth + 0.2, ROOM.wallHeight - 2.35, t], [0, ROOM.floorY + 2.35 + (ROOM.wallHeight - 2.35) / 2, HALF_D], m.wall);

        // --- وزرة خشبية أسفل الجدران (تفصيلة مسكن حقيقي) ---
        const wainH = 0.95;
        box(g, [ROOM.width - 0.1, wainH, 0.08], [0, ROOM.floorY + wainH / 2, -HALF_D + t / 2 + 0.05], m.wainscot);
        box(g, [0.08, wainH, ROOM.depth - 0.1], [HALF_W - t / 2 - 0.05, ROOM.floorY + wainH / 2, 0], m.wainscot);
        box(g, [0.08, wainH, ROOM.depth - 0.1], [-HALF_W + t / 2 + 0.05, ROOM.floorY + wainH / 2, 0], m.wainscot);

        // --- سقف + عوارض ---
        const ceiling = box(
            g,
            [ROOM.width + 0.4, 0.16, ROOM.depth + 0.4],
            [0, ROOM.floorY + ROOM.wallHeight + 0.08, 0],
            m.ceiling,
            { cast: false, receive: false, name: 'Interior-ceiling' }
        );
        ceiling.userData.noMerge = true;

        for (let i = -1; i <= 1; i++) {
            box(g, [ROOM.width, 0.26, 0.3], [0, ROOM.floorY + ROOM.wallHeight - 0.16, i * 3.2], m.beam);
        }

        // --- نوافذ (زجاج + إطار) على الجدارين الشمالي والغربي ---
        this._window(-2.6, -HALF_D + t / 2 + 0.02, 0, 1.7, 1.5);
        this._window(2.6, -HALF_D + t / 2 + 0.02, 0, 1.7, 1.5);
        this._window(-HALF_W + t / 2 + 0.02, -1.4, Math.PI / 2, 1.7, 1.5);

        // --- حصيرة الترحيب أمام الباب ---
        box(g, [2.4, 0.03, 1.5], [0, ROOM.floorY + 0.02, HALF_D - 1.3], m.rugBorder, { cast: false });
    }

    _window(x, z, rotY, w, h) {
        const g = this.group;
        const m = this.mat;
        const y = ROOM.floorY + 1.85;

        const frame = new THREE.Group();
        frame.position.set(x, y, z);
        frame.rotation.y = rotY;
        g.add(frame);

        box(frame, [w + 0.18, h + 0.18, 0.1], [0, 0, 0], m.woodMid);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.glass);
        pane.position.set(0, 0, 0.06);
        pane.userData.noMerge = true;
        frame.add(pane);
        // قضبان النافذة
        box(frame, [0.07, h, 0.14], [0, 0, 0.02], m.woodLight);
        box(frame, [w, 0.07, 0.14], [0, 0, 0.02], m.woodLight);
        // رف النافذة
        box(frame, [w + 0.5, 0.1, 0.34], [0, -h / 2 - 0.12, 0.14], m.woodDark);

        mergeGroupChildren(frame, { name: 'Interior-window' });
        return frame;
    }

    /* ========================================================
       LIVING ROOM — الغرفة الغربية: كنبة + طاولة + مدفأة + رف كتب
       ======================================================== */

    _livingRoom() {
        const g = this.group;
        const m = this.mat;
        const living = new THREE.Group();
        living.name = 'LivingRoom';
        g.add(living);

        // سجادة
        box(living, [5.2, 0.04, 4.0], [-3.1, ROOM.floorY + 0.03, 0.4], m.rug, { cast: false });
        box(living, [5.6, 0.03, 4.4], [-3.1, ROOM.floorY + 0.02, 0.4], m.rugBorder, { cast: false });

        // كنبة مواجهَة للمدفأة
        const sofa = new THREE.Group();
        sofa.position.set(-3.1, 0, 2.1);
        living.add(sofa);
        box(sofa, [3.0, 0.42, 1.15], [0, 0.42, 0], m.sofa);
        box(sofa, [3.0, 0.85, 0.3], [0, 0.75, 0.45], m.sofa);
        box(sofa, [0.3, 0.72, 1.15], [-1.5, 0.62, 0], m.sofa);
        box(sofa, [0.3, 0.72, 1.15], [1.5, 0.62, 0], m.sofa);
        for (const cx of [-0.75, 0.75]) {
            box(sofa, [1.3, 0.2, 0.95], [cx, 0.72, -0.05], m.cushion);
        }
        box(sofa, [0.62, 0.42, 0.18], [-0.95, 0.95, 0.3], m.pillow);
        box(sofa, [0.62, 0.42, 0.18], [0.95, 0.95, 0.3], m.pillow);
        mergeGroupChildren(sofa, { name: 'Interior-sofa' });

        // طاولة قهوة
        const table = new THREE.Group();
        table.position.set(-3.1, 0, 0.15);
        living.add(table);
        box(table, [1.7, 0.1, 0.95], [0, 0.5, 0], m.woodMid);
        for (const [lx, lz] of [[-0.72, -0.36], [0.72, -0.36], [-0.72, 0.36], [0.72, 0.36]]) {
            box(table, [0.11, 0.5, 0.11], [lx, 0.25, lz], m.woodDark);
        }
        // كوب + كتاب على الطاولة
        box(table, [0.16, 0.16, 0.16], [0.35, 0.63, 0.1], m.copper);
        box(table, [0.42, 0.07, 0.3], [-0.3, 0.59, -0.05], m.book2);
        mergeGroupChildren(table, { name: 'Interior-coffeeTable' });

        // مدفأة حجرية على الجدار الغربي
        const fire = new THREE.Group();
        fire.position.set(-HALF_W + 0.75, 0, -2.4);
        living.add(fire);
        box(fire, [1.1, 2.5, 2.6], [0, 1.25, 0], m.stone);
        box(fire, [1.3, 0.22, 2.9], [0, 2.6, 0], m.woodDark);
        box(fire, [0.55, 1.15, 1.5], [0.35, 0.6, 0], M(0x1a1410, 1));
        // لهب (emissive) + جذوع
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.72, 7), this.mat.fire);
        flame.position.set(0.42, 0.55, 0);
        flame.userData.noMerge = true;
        fire.add(flame);
        this.flame = flame;
        box(fire, [0.5, 0.14, 0.9], [0.42, 0.22, 0], m.woodDark);
        box(fire, [0.46, 0.13, 0.8], [0.42, 0.32, 0.08], m.woodMid);
        // أدوات المدفأة
        box(fire, [0.06, 1.0, 0.06], [0.95, 0.5, 1.35], m.metal);
        mergeGroupChildren(fire, { name: 'Interior-fireplace' });

        this.fireLight = new THREE.PointLight(0xff8a34, 6, 9, 2);
        this.fireLight.position.set(-HALF_W + 1.3, 1.0, -2.4);
        g.add(this.fireLight);

        // رف كتب على الجدار الشمالي
        const shelf = new THREE.Group();
        shelf.position.set(-3.2, 0, -HALF_D + 0.55);
        living.add(shelf);
        box(shelf, [2.4, 2.2, 0.42], [0, 1.1, 0], m.woodDark);
        for (const y of [0.62, 1.16, 1.7]) {
            box(shelf, [2.2, 0.06, 0.36], [0, y, 0.03], m.woodMid);
        }
        let bx = -1.0;
        for (let i = 0; i < 14; i++) {
            const h = 0.3 + (i % 3) * 0.05;
            const mat = i % 3 === 0 ? this.mat.book1 : i % 3 === 1 ? this.mat.book2 : this.mat.book3;
            box(shelf, [0.11, h, 0.26], [bx, 0.62 + 0.03 + h / 2, 0.03], mat);
            bx += 0.145;
            if (i === 6) bx = -1.0;
        }
        mergeGroupChildren(shelf, { name: 'Interior-bookshelf' });

        // لوحة على الجدار
        box(living, [1.3, 0.95, 0.08], [-3.1, 2.35, -HALF_D + 0.24], m.woodLight);
        box(living, [1.05, 0.7, 0.05], [-3.1, 2.35, -HALF_D + 0.3], M(0x6f9aab, 0.9));
    }

    /* ========================================================
       KITCHEN / DINING — الجهة الشرقية: طاولة طعام + مطبخ
       ======================================================== */

    _kitchen() {
        const g = this.group;
        const m = this.mat;
        const kitchen = new THREE.Group();
        kitchen.name = 'Kitchen';
        g.add(kitchen);

        // طاولة الطعام + 4 كراسي
        const dining = new THREE.Group();
        dining.position.set(2.9, 0, 1.5);
        kitchen.add(dining);
        box(dining, [2.3, 0.13, 1.5], [0, 0.82, 0], m.woodLight);
        for (const [lx, lz] of [[-1.0, -0.6], [1.0, -0.6], [-1.0, 0.6], [1.0, 0.6]]) {
            box(dining, [0.14, 0.82, 0.14], [lx, 0.41, lz], m.woodDark);
        }
        // صحون وكوب
        for (const [px, pz] of [[-0.55, -0.3], [0.55, 0.3], [-0.55, 0.3], [0.55, -0.3]]) {
            box(dining, [0.34, 0.05, 0.34], [px, 0.91, pz], m.pillow);
        }
        box(dining, [0.14, 0.2, 0.14], [0, 0.98, 0], m.copper);

        const chairOffsets = [
            { x: -1.5, z: 0, rot: Math.PI / 2 },
            { x: 1.5, z: 0, rot: -Math.PI / 2 },
            { x: 0, z: -1.2, rot: 0 },
            { x: 0, z: 1.2, rot: Math.PI }
        ];
        for (const c of chairOffsets) {
            const chair = new THREE.Group();
            chair.position.set(c.x, 0, c.z);
            chair.rotation.y = c.rot;
            dining.add(chair);
            box(chair, [0.52, 0.08, 0.52], [0, 0.5, 0], m.woodMid);
            box(chair, [0.52, 0.75, 0.08], [0, 0.86, -0.24], m.woodMid);
            for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
                box(chair, [0.07, 0.5, 0.07], [lx, 0.25, lz], m.woodDark);
            }
        }
        mergeGroupChildren(dining, { name: 'Interior-dining' });

        // طاولة المطبخ (عدّاد + موقد + حوض) على الجدار الشرقي
        const counter = new THREE.Group();
        counter.position.set(HALF_W - 1.05, 0, -2.2);
        kitchen.add(counter);
        box(counter, [1.5, 0.95, 4.4], [0, 0.48, 0], m.woodMid);
        box(counter, [1.65, 0.1, 4.55], [0, 1.0, 0], m.woodLight);
        // أبواب الخزائن
        for (const cz of [-1.5, -0.5, 0.5, 1.5]) {
            box(counter, [0.06, 0.72, 0.86], [-0.76, 0.45, cz], m.woodDark);
            box(counter, [0.05, 0.16, 0.05], [-0.82, 0.62, cz + 0.3], m.gold);
        }
        // حوض + صنبور
        box(counter, [0.85, 0.16, 1.0], [0.1, 1.02, -1.3], m.metal);
        box(counter, [0.07, 0.42, 0.07], [0.35, 1.26, -1.72], m.metal);
        box(counter, [0.07, 0.07, 0.34], [0.35, 1.45, -1.56], m.metal);
        // موقد
        box(counter, [0.9, 0.08, 1.0], [0.1, 1.09, 1.0], M(0x2b2b2b, 0.6, 0.4));
        for (const [bx, bz] of [[-0.18, 0.75], [0.38, 0.75], [-0.18, 1.25], [0.38, 1.25]]) {
            box(counter, [0.26, 0.04, 0.26], [bx, 1.14, bz], M(0x151515, 0.7, 0.3));
        }
        // قدر على الموقد
        box(counter, [0.34, 0.26, 0.34], [-0.18, 1.28, 0.75], m.copper);
        mergeGroupChildren(counter, { name: 'Interior-counter' });

        // خزائن علوية
        box(kitchen, [1.0, 0.95, 3.2], [HALF_W - 0.85, 2.5, -2.2], m.woodDark);
        box(kitchen, [1.05, 0.08, 3.3], [HALF_W - 0.85, 2.0, -2.2], m.woodMid);
    }

    /* ========================================================
       BEDROOM — ركن النوم خلف حاجز خشبي (شمال-شرق)
       ======================================================== */

    _bedroom() {
        const g = this.group;
        const m = this.mat;
        const bedroom = new THREE.Group();
        bedroom.name = 'Bedroom';
        g.add(bedroom);

        // حاجز الغرفة (جدار نصفي بفتحة باب)
        box(bedroom, [0.18, ROOM.wallHeight, 2.6], [0.7, ROOM.floorY + ROOM.wallHeight / 2, -HALF_D + 1.3], m.wallAccent);
        box(bedroom, [0.18, 0.9, 2.2], [0.7, ROOM.floorY + ROOM.wallHeight - 0.45, -HALF_D + 3.7], m.wallAccent);

        // سرير
        const bed = new THREE.Group();
        bed.position.set(3.6, 0, -3.1);
        bedroom.add(bed);
        box(bed, [2.3, 0.42, 3.2], [0, 0.32, 0], m.woodDark);
        box(bed, [2.4, 1.15, 0.16], [0, 0.85, -1.6], m.woodMid);   // لوح الرأس
        box(bed, [2.2, 0.3, 3.0], [0, 0.62, 0.05], m.pillow);        // مرتبة
        box(bed, [2.25, 0.14, 2.0], [0, 0.78, 0.55], m.blanket);     // غطاء
        box(bed, [0.85, 0.22, 0.5], [-0.55, 0.86, -1.1], m.pillow);  // وسادتان
        box(bed, [0.85, 0.22, 0.5], [0.55, 0.86, -1.1], m.pillow);
        mergeGroupChildren(bed, { name: 'Interior-bed' });

        // طاولة جانبية + مصباح
        const night = new THREE.Group();
        night.position.set(5.35, 0, -4.4);
        bedroom.add(night);
        box(night, [0.85, 0.65, 0.75], [0, 0.33, 0], m.woodMid);
        box(night, [0.9, 0.07, 0.8], [0, 0.68, 0], m.woodLight);
        box(night, [0.16, 0.3, 0.16], [0, 0.85, 0], m.metal);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.34, 10), this.mat.lampShade);
        shade.position.set(0, 1.14, 0);
        shade.userData.noMerge = true;
        night.add(shade);
        mergeGroupChildren(night, { name: 'Interior-nightstand' });

        const lamp = new THREE.PointLight(0xffc27a, 4, 8, 2);
        lamp.position.set(5.35, 1.3, -4.4);
        bedroom.add(lamp);
        this.lampLights.push(lamp);

        // سجادة صغيرة
        box(bedroom, [2.6, 0.03, 1.6], [3.6, ROOM.floorY + 0.03, -0.7], m.rugBorder, { cast: false });
    }

    /* ========================================================
       STORAGE CHEST — صندوق التخزين التفاعلي
       ======================================================== */

    _chest() {
        const g = this.group;
        const m = this.mat;

        const x = INTERIOR_CHEST.x - INTERIOR_ORIGIN.x;
        const z = INTERIOR_CHEST.z - INTERIOR_ORIGIN.z;

        const chest = new THREE.Group();
        chest.name = 'StorageChest';
        chest.position.set(x, 0, z);
        chest.rotation.y = Math.PI * 0.08;
        g.add(chest);

        box(chest, [1.5, 0.75, 0.95], [0, 0.4, 0], m.chest);
        // أشرطة حديدية
        for (const bx of [-0.55, 0, 0.55]) {
            box(chest, [0.14, 0.78, 0.98], [bx, 0.4, 0], m.chestBand);
        }
        box(chest, [1.55, 0.12, 1.0], [0, 0.76, 0], m.chestBand);
        // قفل ذهبي
        box(chest, [0.22, 0.26, 0.1], [0, 0.62, 0.5], m.gold);

        // الغطاء المتحرك (pivot عند الخلف)
        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, 0.82, -0.47);
        chest.add(lidPivot);
        const lid = box(lidPivot, [1.5, 0.16, 0.95], [0, 0.08, 0.47], m.chest);
        lid.userData.interactive = 'chest';
        box(lidPivot, [1.55, 0.08, 0.2], [0, 0.18, 0.02], m.chestBand);
        this.chestLid = lidPivot;
        this._chestOpen = false;
        this._chestAngle = 0;

        mergeGroupChildren(chest, { name: 'Interior-chest' });

        if (this.collision) {
            this.collision.addBox({
                id: 'interior-chest',
                x: INTERIOR_CHEST.x,
                z: INTERIOR_CHEST.z,
                width: 1.7,
                depth: 1.2,
                height: 1.1,
                tag: 'prop'
            });
        }

        this.interactables.push({
            id: 'chest',
            label: '📦 صندوق التخزين',
            desc: 'افتح مخزن المزرعة (الصوامع والمخزن)',
            button: 'فتح الصندوق',
            position: new THREE.Vector3(INTERIOR_CHEST.x, 0, INTERIOR_CHEST.z + 0.9),
            radius: 2.2,
            gradient: 'linear-gradient(180deg, #ffd54f 0%, #f5a623 100%)'
        });
    }

    /* ========================================================
       EXIT DOOR — باب خروج حقيقي بمفصلة
       ======================================================== */

    _exitDoor() {
        const g = this.group;
        const m = this.mat;
        const z = INTERIOR_EXIT.z - INTERIOR_ORIGIN.z;

        // إطار الباب
        box(g, [ROOM.doorwayWidth + 0.34, 2.42, 0.16], [0, ROOM.floorY + 1.21, z], m.woodDark);

        let doorCollider = null;
        if (this.collision) {
            // فتحة الباب الجنوبي: تصادم على الضلفتين فقط.
            const jambW = (ROOM.width - ROOM.doorwayWidth) / 2;
            this.collision.addBox({
                id: 'interior-wall-s-l',
                x: INTERIOR_ORIGIN.x - (ROOM.doorwayWidth + jambW) / 2,
                z: INTERIOR_ORIGIN.z + HALF_D,
                width: jambW, depth: ROOM.wallThickness + 0.2, height: ROOM.wallHeight,
                tag: 'building'
            });
            this.collision.addBox({
                id: 'interior-wall-s-r',
                x: INTERIOR_ORIGIN.x + (ROOM.doorwayWidth + jambW) / 2,
                z: INTERIOR_ORIGIN.z + HALF_D,
                width: jambW, depth: ROOM.wallThickness + 0.2, height: ROOM.wallHeight,
                tag: 'building'
            });
            doorCollider = this.collision.addBox({
                id: 'interior-door',
                x: INTERIOR_EXIT.x,
                z: INTERIOR_ORIGIN.z + HALF_D,
                width: ROOM.doorwayWidth,
                depth: 0.4,
                height: 2.4,
                tag: 'door'
            });
        }

        // الباب نفسه: مفصلة يسارية، يفتح للداخل.
        const door = new InteractiveDoor({
            parent: g,
            hinge: { x: -ROOM.doorwayWidth / 2, y: ROOM.floorY, z },
            size: { w: ROOM.doorwayWidth, h: 2.35, d: 0.12 },
            material: m.woodMid,
            openAngle: Math.PI * 0.72,
            id: 'interior-exit-door',
            label: 'باب الخروج',
            collider: doorCollider,
            interactOffset: { x: ROOM.doorwayWidth / 2, y: 0, z: -0.7 }
        });
        // ألواح زخرفية على ضلفة الباب (أبناء المفصلة ⇒ تتحرك معه)
        for (const oy of [0.55, 1.55]) {
            box(door.pivot, [ROOM.doorwayWidth - 0.4, 0.72, 0.05],
                [ROOM.doorwayWidth / 2, oy, 0.09], m.woodDark);
        }
        door.setOpen(true);   // الباب مفتوح عند الدخول — لا جدار وهمي
        this.exitDoor = door;

        this.interactables.push({
            id: 'exit',
            label: '🚪 باب الخروج',
            desc: 'ارجع إلى المزرعة',
            button: 'اخرج',
            position: new THREE.Vector3(INTERIOR_EXIT.x, 0, INTERIOR_ORIGIN.z + HALF_D - 0.9),
            radius: 2.4,
            gradient: 'linear-gradient(180deg, #79d63c 0%, #46961a 100%)'
        });

        // درج/عتبة خارجية صغيرة خلف الباب
        box(g, [2.6, 0.14, 1.0], [0, ROOM.floorY - 0.02, HALF_D + 0.6], m.stone, { cast: false });
    }

    /* ========================================================
       DECOR — تفاصيل تجعل المكان مسكونًا
       ======================================================== */

    _decor() {
        const g = this.group;
        const m = this.mat;

        // نبتة داخلية قرب النافذة الغربية
        const plant = new THREE.Group();
        plant.position.set(-HALF_W + 1.0, 0, 1.6);
        g.add(plant);
        box(plant, [0.6, 0.55, 0.6], [0, 0.28, 0], m.pot);
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.95, 5), m.plant);
            leaf.position.set(Math.cos(a) * 0.2, 0.95, Math.sin(a) * 0.2);
            leaf.rotation.set(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45);
            leaf.castShadow = true;
            plant.add(leaf);
        }
        mergeGroupChildren(plant, { name: 'Interior-plant' });

        // مصباح سقف في الوسط
        const ceilLamp = new THREE.Group();
        ceilLamp.position.set(0, ROOM.floorY + ROOM.wallHeight - 0.2, 0.6);
        g.add(ceilLamp);
        box(ceilLamp, [0.06, 0.55, 0.06], [0, -0.28, 0], m.metal);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 0.42, 12), this.mat.lampShade);
        shade.position.y = -0.72;
        shade.userData.noMerge = true;
        ceilLamp.add(shade);
        mergeGroupChildren(ceilLamp, { name: 'Interior-ceilingLamp' });

        const roomLight = new THREE.PointLight(0xffd6a0, 7, 16, 2);
        roomLight.position.set(0, ROOM.floorY + ROOM.wallHeight - 1.0, 0.6);
        g.add(roomLight);
        this.lampLights.push(roomLight);

        // حصيرة + رف أحذية قرب الباب
        box(g, [1.5, 0.5, 0.45], [HALF_W - 1.0, 0.25, HALF_D - 0.7], m.woodDark);
        box(g, [0.42, 0.2, 0.24], [HALF_W - 1.25, 0.6, HALF_D - 0.7], m.woodMid);
        box(g, [0.42, 0.2, 0.24], [HALF_W - 0.78, 0.6, HALF_D - 0.7], m.woodMid);

        // ساعة جدارية فوق الباب
        const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 16), m.pillow);
        clockFace.rotation.x = Math.PI / 2;
        clockFace.position.set(2.2, 2.75, HALF_D - 0.22);
        clockFace.userData.noMerge = true;
        g.add(clockFace);
        box(g, [0.05, 0.3, 0.04], [2.2, 2.85, HALF_D - 0.3], m.woodDark);
        box(g, [0.22, 0.05, 0.04], [2.28, 2.75, HALF_D - 0.3], m.woodDark);

        // جدران + أثاث ⇒ تصادم داخلي (يُمنع الخروج من الجدران)
        this._registerCollisions();
    }

    _registerCollisions() {
        if (!this.collision) return;
        const ox = INTERIOR_ORIGIN.x;
        const oz = INTERIOR_ORIGIN.z;
        const t = ROOM.wallThickness + 0.2;

        const walls = [
            { id: 'interior-wall-n', x: ox, z: oz - HALF_D, w: ROOM.width + 0.6, d: t },
            { id: 'interior-wall-e', x: ox + HALF_W, z: oz, w: t, d: ROOM.depth + 0.6 },
            { id: 'interior-wall-w', x: ox - HALF_W, z: oz, w: t, d: ROOM.depth + 0.6 }
        ];
        for (const w of walls) {
            this.collision.addBox({
                id: w.id, x: w.x, z: w.z,
                width: w.w, depth: w.d, height: ROOM.wallHeight,
                tag: 'building'
            });
        }

        // أثاث صلب
        const props = [
            { id: 'int-sofa', x: ox - 3.1, z: oz + 2.1, w: 3.2, d: 1.3 },
            { id: 'int-coffee', x: ox - 3.1, z: oz + 0.15, w: 1.8, d: 1.0 },
            { id: 'int-fire', x: ox - HALF_W + 0.75, z: oz - 2.4, w: 1.3, d: 2.8 },
            { id: 'int-shelf', x: ox - 3.2, z: oz - HALF_D + 0.55, w: 2.5, d: 0.6 },
            { id: 'int-dining', x: ox + 2.9, z: oz + 1.5, w: 2.5, d: 1.7 },
            { id: 'int-counter', x: ox + HALF_W - 1.05, z: oz - 2.2, w: 1.7, d: 4.6 },
            { id: 'int-bed', x: ox + 3.6, z: oz - 3.1, w: 2.5, d: 3.4 },
            { id: 'int-partition', x: ox + 0.7, z: oz - HALF_D + 1.3, w: 0.4, d: 2.7 },
            { id: 'int-plant', x: ox - HALF_W + 1.0, z: oz + 1.6, w: 0.8, d: 0.8 }
        ];
        for (const p of props) {
            this.collision.addBox({
                id: p.id, x: p.x, z: p.z,
                width: p.w, depth: p.d, height: 1.2,
                tag: 'prop'
            });
        }
    }

    /* ========================================================
       LIGHTS — إضاءة داخلية دافئة مستقلة عن الشمس
       ======================================================== */

    _lights() {
        this.hemi = new THREE.HemisphereLight(0xffe9c9, 0x6b4a2a, 0.85);
        this.group.add(this.hemi);

        this.ambient = new THREE.AmbientLight(0xffd9a8, 0.55);
        this.group.add(this.ambient);
    }

    /* ========================================================
       PUBLIC API
       ======================================================== */

    setVisible(visible) {
        this.group.visible = !!visible;
        return this.group.visible;
    }

    /** نقطة الظهور داخل البيت. */
    getSpawnPoint(target = new THREE.Vector3()) {
        return target.set(INTERIOR_SPAWN.x, 0, INTERIOR_SPAWN.z);
    }

    /** موضع باب البيت من الخارج (للخروج) — من FarmLayout. */
    static getOutsideExit() {
        return { x: HOUSE.exitSpawn.x, z: HOUSE.exitSpawn.z };
    }

    /** أقرب عنصر تفاعلي داخل البيت. */
    getNearestInteractable(position, maxDist = 2.6) {
        let best = null;
        let bestDist = maxDist;
        for (const item of this.interactables) {
            const dx = position.x - item.position.x;
            const dz = position.z - item.position.z;
            const d = Math.hypot(dx, dz);
            const limit = Math.min(maxDist, item.radius);
            if (d < limit && d < bestDist) {
                bestDist = d;
                best = item;
            }
        }
        return best;
    }

    toggleChest() {
        this._chestOpen = !this._chestOpen;
        return this._chestOpen;
    }

    update(delta) {
        this._elapsed += delta;

        if (this.exitDoor) this.exitDoor.update(delta);

        // غطاء الصندوق يتحرك بنعومة
        if (this.chestLid) {
            const target = this._chestOpen ? -Math.PI * 0.55 : 0;
            const diff = target - this._chestAngle;
            if (Math.abs(diff) > 0.001) {
                this._chestAngle += Math.sign(diff) * Math.min(Math.abs(diff), 3.4 * delta);
                this.chestLid.rotation.x = this._chestAngle;
            }
        }

        // رفرفة اللهب + المصابيح
        if (this.flame) {
            const flicker = 1 + Math.sin(this._elapsed * 9.3) * 0.09 + Math.sin(this._elapsed * 4.1) * 0.05;
            this.flame.scale.set(flicker, 0.9 + Math.sin(this._elapsed * 7.7) * 0.12, flicker);
        }
        if (this.fireLight) {
            this.fireLight.intensity = 5.4 + Math.sin(this._elapsed * 8.1) * 0.9 + Math.sin(this._elapsed * 3.3) * 0.5;
        }
        for (const lamp of this.lampLights) {
            lamp.intensity = lamp.userData.baseIntensity ??
                (lamp.userData.baseIntensity = lamp.intensity);
        }
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse((child) => {
            if (!child.isMesh) return;
            if (child.geometry) child.geometry.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) if (m) m.dispose();
        });
    }
}

export default HouseInterior;
