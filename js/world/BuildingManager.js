/**
 * ============================================================
 * BuildingManager.js — Farm structures + interactive doors
 * ============================================================
 */

import * as THREE from 'three';
import { InteractiveDoor } from './Doors.js';
import { mergeGroupChildren, mergeMeshes, mergeSubtree } from './MergeUtils.js';

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
        this.lamps();
    }

    farmhouse() {
        const g = new THREE.Group();
        g.name = 'Farmhouse';
        // موضع حي سكني هادئ شمال غرب
        g.position.set(-14, 0, -14);

        const blue = mat(0x397f9f);
        const white = mat(0xf5ead7);
        const stone = mat(0x77756b);
        const roof = mat(0x354653);
        const wood = mat(0x6a3925);
        const warmGlow = mat(0xffca6a, 0.4, 0);

        // مقياس مكبّر حقيقي (12 × 9.5) ليقرأ كمنزل ريفي حقيقي لا لعبة
        box(g, [12, 0.8, 9.5], [0, 0.4, 0], stone);
        box(g, [11.4, 5.2, 8.8], [0, 3.4, 0], blue);

        // سقف هرمي كبير
        const r = new THREE.Mesh(new THREE.ConeGeometry(8.2, 4.2, 4), roof);
        r.rotation.y = Math.PI / 4;
        r.position.y = 8.1;
        r.castShadow = true;
        g.add(r);

        // شرفة خشبية عريضة
        box(g, [12.6, 0.35, 3.2], [0, 1.2, 5.8], mat(0x9a6a3e));
        [-5.2, -2.6, 2.6, 5.2].forEach((x) => box(g, [0.3, 3.8, 0.3], [x, 3.1, 5.8], white));
        box(g, [12.8, 0.25, 3.4], [0, 5.0, 5.8], roof);

        // نوافذ بتوهج دافئ
        [-3.6, 3.6].forEach((x) => {
            box(g, [1.6, 1.8, 0.15], [x, 3.8, 4.45], white);
            box(g, [1.3, 1.5, 0.18], [x, 3.8, 4.48], warmGlow);
        });

        // صندوق بريد خشبي على الرصيف
        const mb = new THREE.Group();
        mb.position.set(5.5, 0, 7.5);
        box(mb, [0.15, 1.3, 0.15], [0, 0.65, 0], wood);
        box(mb, [0.4, 0.3, 0.55], [0, 1.3, 0], mat(0x8a3324));
        g.add(mb);

        let doorCollider = null;
        if (this.collision) {
            const walls = this.collision.addBuildingWalls({
                id: 'farmhouse',
                x: -14,
                z: -14,
                width: 11.4,
                depth: 8.8,
                thickness: 0.5,
                height: 5.2,
                door: { side: 'south', width: 2.4 }
            });
            doorCollider = walls.door;
        }

        const door = new InteractiveDoor({
            parent: g,
            hinge: { x: -1.2, y: 0.85, z: 4.42 },
            size: { w: 2.4, h: 3.8, d: 0.16 },
            material: wood,
            openAngle: Math.PI * 0.82,
            id: 'farmhouse-door',
            label: 'باب البيت',
            collider: doorCollider,
            interactOffset: { x: 1.2, y: 0, z: 0.9 }
        });
        door.isHouseDoor = true; // علامة لدخول البيت الداخلي
        this.doors.push(door);

        this.group.add(g);
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

        // بابا الحظيرة من الخشب الحقيقي يفتحان للخارج (لا X عائمًا).
        const left = new InteractiveDoor({
            parent: g,
            hinge: { x: -3.0, y: 0.12, z: 3.55 },
            size: { w: 2.95, h: 4.0, d: 0.14 },
            material: wood,
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
            material: wood,
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

        // عوارض أفقية على كل ضلفة — أبناء الـ pivot فيتحركون مع الباب.
        const battenMat = mat(0x40220f);
        const battens = [
            [left.pivot, 2.95 * 0.5],
            [right.pivot, -2.95 * 0.5]
        ];
        for (const [pivot, cx] of battens) {
            for (const y of [1.0, 2.1, 3.2]) {
                const batten = new THREE.Mesh(
                    new THREE.BoxGeometry(2.7, 0.16, 0.05),
                    battenMat
                );
                batten.position.set(cx, y, 0.09);
                batten.castShadow = true;
                pivot.add(batten);
            }
        }

        // شرفة واضحة أمام الباب (بلاطة + عمودان + سقف صغير).
        const stoneMat = mat(0x8d8578);
        box(g, [7.2, 0.12, 2.6], [0, 0.06, 4.9], stoneMat);
        box(g, [0.25, 3.1, 0.25], [-3.2, 1.55, 5.9], white);
        box(g, [0.25, 3.1, 0.25], [3.2, 1.55, 5.9], white);
        box(g, [7.6, 0.16, 3.0], [0, 3.2, 4.9], mat(0x3a3430));

        if (this.collision) {
            this.collision.addBox({ id: 'barn-porch-l', x: 14 - 3.2, z: -12 + 5.9, width: 0.4, depth: 0.4, height: 3.1, tag: 'prop' });
            this.collision.addBox({ id: 'barn-porch-r', x: 14 + 3.2, z: -12 + 5.9, width: 0.4, depth: 0.4, height: 3.1, tag: 'prop' });
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
        // طاحونة هواء عملاقة كمعلم أثري للمزرعة (Landmark Scale)
        const g = new THREE.Group();
        g.name = 'Windmill';
        g.position.set(5, 0, -24);

        const stone = mat(0x8d8578);
        const wood = mat(0x5c432c);
        const cream = mat(0xe8d9b8);
        const sailMat = mat(0xf3ead3);

        // قاعدة حجرية ضخمة
        const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.0, 2.2, 12), stone);
        base.position.y = 1.1;
        base.castShadow = true;
        base.receiveShadow = true;
        g.add(base);

        // برج شاهق
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.9, 10.5, 12), cream);
        tower.position.y = 7.45;
        tower.castShadow = true;
        tower.receiveShadow = true;
        g.add(tower);

        for (const y of [4.5, 8.5, 12.0]) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.55, 0.35, 12), wood);
            band.position.y = y;
            g.add(band);
        }

        // سقف مدبب
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 12), wood);
        roof.position.y = 13.9;
        roof.castShadow = true;
        g.add(roof);

        // باب مدخل
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.25), wood);
        door.position.set(0, 1.6, 3.45);
        g.add(door);

        // 4 شفرات عملاقة تدور بأشرعة قماشية
        const rotor = new THREE.Group();
        rotor.position.set(0, 11.8, 2.6);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 12), wood);
        hub.rotation.x = Math.PI / 2;
        rotor.add(hub);
        for (let i = 0; i < 4; i++) {
            const arm = new THREE.Group();
            arm.rotation.z = (i * Math.PI) / 2;
            const spar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 9.2, 0.16), wood);
            spar.position.y = 4.6;
            spar.castShadow = true;
            arm.add(spar);
            const sail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 6.8, 0.08), sailMat);
            sail.position.set(1.15, 5.5, 0);
            sail.castShadow = true;
            arm.add(sail);
            rotor.add(arm);
        }
        g.add(rotor);
        this.rotors.push(rotor);
        mergeSubtree(rotor, { name: 'Windmill-blades' });

        if (this.collision) {
            this.collision.addBox({
                id: 'windmill',
                x: 5,
                z: -24,
                width: 6.5,
                depth: 6.5,
                height: 15,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Windmill-tower' });
    }

    market() {
        // كشك سوق حقيقي في منطقة السوق جنوب-غرب الوسط: أعمدة + عداد +
        // مظلة مخططة مائلة + صناديق خضار low-poly + لافتة عربية.
        const g = new THREE.Group();
        g.name = 'Market';
        g.position.set(-4, 0, 17);

        const wood = mat(0x84502a);
        const darkWood = mat(0x6b3d20);
        const cream = mat(0xf3ead3);
        const red = mat(0xc0392b);

        box(g, [5.4, 0.22, 3.4], [0, 0.11, 0], darkWood); // منصة
        [[-2.3, -1.3], [2.3, -1.3], [-2.3, 1.3], [2.3, 1.3]].forEach(([x, z]) => {
            box(g, [0.22, 3.4, 0.22], [x, 1.8, 0 + z], wood);
        });
        // العداد على جهة المزرعة (الشمال) حيث يقف اللاعب.
        box(g, [4.4, 0.85, 1.1], [0, 0.65, -0.85], wood); // واجهة العداد
        box(g, [4.4, 0.12, 1.3], [0, 1.14, -0.85], darkWood); // سطح العداد
        box(g, [4.4, 0.5, 0.15], [0, 0.55, -1.45], darkWood); // حاجز أمامي

        // مظلة مخططة مائلة قليلًا للأمام.
        const awning = new THREE.Group();
        awning.position.set(0, 3.62, 0.15);
        awning.rotation.x = -0.1;
        g.add(awning);
        for (let i = 0; i < 8; i++) {
            const x = -2.45 + i * 0.7;
            box(awning, [0.68, 0.1, 3.8], [x, 0, 0], i % 2 ? red : cream);
        }
        mergeGroupChildren(awning, { name: 'Market-awning' });

        // 3 صناديق خضار على العداد — مجسمات حقيقية لا إيموجي طافيًا.
        const produce = [
            { x: -1.45, kinds: [0xe53935, 0xe53935, 0xd32f2f], geo: () => new THREE.SphereGeometry(0.11, 7, 6) },
            { x: 0, kinds: [0xf5c542, 0xf5c542, 0xe9a020], geo: () => new THREE.ConeGeometry(0.09, 0.26, 7) },
            { x: 1.45, kinds: [0xff7043, 0xff7043, 0xe5632e], geo: () => new THREE.ConeGeometry(0.1, 0.24, 7) }
        ];
        for (const crate of produce) {
            box(g, [0.85, 0.22, 0.6], [crate.x, 1.3, -0.85], darkWood);
            crate.kinds.forEach((color, i) => {
                const veg = new THREE.Mesh(crate.geo(), mat(color, 0.6));
                veg.position.set(crate.x - 0.2 + i * 0.2, 1.5, -0.85 - (i % 2) * 0.14);
                veg.castShadow = true;
                g.add(veg);
            });
        }

        // لافتة «سوق المزرعة».
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 256;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#4a2c10';
        ctx.font = '900 120px Tajawal, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('سوق المزرعة', 512, 134);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const board = new THREE.Mesh(
            new THREE.PlaneGeometry(2.9, 0.72),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        board.position.set(0, 3.0, -1.55);
        board.rotation.y = Math.PI; // تواجه المزرعة (اللاعب يأتي من الشمال)
        board.userData.noMerge = true; // شفاف — الدمج يتجاهله أصلًا
        g.add(board);

        if (this.collision) {
            this.collision.addBox({
                id: 'market',
                x: -4,
                z: 17,
                width: 5.6,
                depth: 3.6,
                height: 2.5,
                tag: 'building'
            });
        }

        this.group.add(g);
        mergeGroupChildren(g, { name: 'Market-body' });
        this.marketGroup = g;
        this.marketPos = new THREE.Vector3(-4, 0, 15.2);
    }

    fences() {
        const wood = mat(0xf2eee0);
        const gap = 3.4;

        // السور الجنوبي أُبعد إلى z=25: منطقة الحقول (حتى z≈23) والسوق
        // والحظائر كلها داخله، وقوس الترحيب يقف في فجوة بوابته.
        for (const z of [-5, 25]) {
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
        // قوس ترحيب خشبي في فجوة السور الجنوبي — المزارع يمر من تحته.
        const g = new THREE.Group();
        g.position.set(0, 0, 25);
        const postMat = mat(0x60401f);
        box(g, [0.3, 3.7, 0.3], [-2.6, 1.85, 0], postMat);
        box(g, [0.3, 3.7, 0.3], [2.6, 1.85, 0], postMat);
        box(g, [6.4, 1.2, 0.24], [0, 3.4, 0], mat(0x8b572c));
        box(g, [6.9, 0.16, 1.0], [0, 4.08, 0], mat(0x5c3a1c));

        // لوحة قماشية أكبر (2048px) حتى يُقرأ النص من بعيد دون انضغاط:
        // نسبة اللوحة 6.4/1.2 = 5.33 = نسبة الرسم تمامًا.
        const c = document.createElement('canvas');
        c.width = 2048;
        c.height = 384;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#fff3c9';
        ctx.font = '900 150px Tajawal, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('مزرعتك انت تستحق الأفضل', 1024, 200);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: tex, transparent: true })
        );
        // الـ Sprite يواجه الكاميرا دائمًا فيُقرأ من الجهتين.
        sprite.position.set(0, 3.4, 0);
        sprite.scale.set(6.1, 1.145, 1);
        g.add(sprite);
        this.group.add(g);
        mergeGroupChildren(g, { name: 'Sign-body' });

        // تصادم على العمودين فقط — المنتصف مفتوح للمرور.
        if (this.collision) {
            this.collision.addBox({ id: 'sign-post-l', x: -2.6, z: 25, width: 0.5, depth: 0.5, height: 3.7, tag: 'prop' });
            this.collision.addBox({ id: 'sign-post-r', x: 2.6, z: 25, width: 0.5, depth: 0.5, height: 3.7, tag: 'prop' });
        }
    }

    /**
     * مصابيح دافئة قرب البيت والحظيرة والطاحونة والسوق — مطفأة نهارًا،
     * تتوهج ليلًا عبر setNightFactor من دورة النهار/الليل في main.js.
     * الأعمدة تُدمج في mesh واحد؛ الرؤوس تبقى بمادة مشتركة واحدة
     * (4 نداءات رسم فقط) حتى يتغير توهجها معًا.
     */
    lamps() {
        this.lampLights = [];
        this.lampHeadMat = new THREE.MeshStandardMaterial({
            color: 0xffe2a8,
            emissive: 0xff9d2e,
            emissiveIntensity: 0,
            roughness: 0.5
        });
        const postMat = mat(0x3a3f45, 0.6, 0.4);
        const positions = [
            [-10, -8],    // قرب البيت
            [10.5, -8],   // قرب الحظيرة
            [-1.5, 6.5],  // قرب طاحونة الحبوب
            [-1.2, 14.6]  // قرب السوق
        ];
        const posts = [];
        for (let i = 0; i < positions.length; i++) {
            const x = positions[i][0];
            const z = positions[i][1];
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.2, 7), postMat);
            post.position.set(x, 1.6, z);
            post.castShadow = true;
            this.group.add(post);
            posts.push(post);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 8), postMat);
            cap.position.set(x, 3.62, z);
            this.group.add(cap);
            posts.push(cap);

            const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), this.lampHeadMat);
            head.position.set(x, 3.32, z);
            this.group.add(head);

            const light = new THREE.PointLight(0xffb45e, 0, 11, 2);
            light.position.set(x, 3.2, z);
            this.group.add(light);
            this.lampLights.push(light);

            if (this.collision) {
                this.collision.addBox({
                    id: 'lamp-' + i,
                    x, z,
                    width: 0.4,
                    depth: 0.4,
                    height: 3.4,
                    tag: 'prop'
                });
            }
        }
        mergeMeshes(posts, { name: 'Lamps-posts' });
    }

    /** f من 0 (نهار) إلى 1 (ليل عميق). */
    setNightFactor(f) {
        const k = Math.min(1, Math.max(0, f || 0));
        if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = k * 1.8;
        if (this.lampLights) {
            for (const light of this.lampLights) light.intensity = k * 16;
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
