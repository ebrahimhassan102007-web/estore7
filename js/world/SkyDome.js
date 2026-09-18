/**
 * ============================================================
 * SkyDome.js — سماء حقيقية من الساعة والتقويم (Brief §2 «Sky»)
 * ============================================================
 * المطلوب:
 *   • غيوم متحركة.
 *   • تدرّج نهار/ليل من الساعة الحقيقية للجهاز.
 *   • مزاج الطقس من الساعة + الفصل (حرّ صيفي، دفء خريفي،
 *     برودة شتوية، مصابيح ليلية).
 *
 * التنفيذ رخيص عمدًا (ميزانية نداءات الرسم):
 *   1 قبة ShaderMaterial  +  1 قرص شمس  +  1 قرص قمر
 *   + 1 Points للنجوم     +  ~10 غيوم مدموجة
 *   ⇒ ~13 نداء رسم لكل السماء.
 * ============================================================
 */

import * as THREE from 'three';
import { mergeGroupChildren } from './MergeUtils.js';

/** ألوان السماء لكل فصل: ليل / غروب / نهار (أعلى وأسفل الأفق). */
const SKY_PRESETS = Object.freeze({
    summer: {
        night: { top: 0x08121f, bottom: 0x152a44, fog: 0x101d2e },
        dusk:  { top: 0x2f4a72, bottom: 0xf58a3c, fog: 0xb9705a },
        day:   { top: 0x2f86d6, bottom: 0xc9e8fa, fog: 0xa9d8f2 }
    },
    spring: {
        night: { top: 0x0a1524, bottom: 0x183049, fog: 0x132436 },
        dusk:  { top: 0x35557c, bottom: 0xf2a35f, fog: 0xb98a72 },
        day:   { top: 0x3d95dd, bottom: 0xd7f0e2, fog: 0xb6e2ee }
    },
    autumn: {
        night: { top: 0x0c1520, bottom: 0x1d2c3c, fog: 0x16202a },
        dusk:  { top: 0x3a4a63, bottom: 0xe8873a, fog: 0xb07a52 },
        day:   { top: 0x4a86c4, bottom: 0xf2ddb4, fog: 0xd6c69f }
    },
    winter: {
        night: { top: 0x070d18, bottom: 0x12203a, fog: 0x0e1826 },
        dusk:  { top: 0x2b3f5e, bottom: 0xd98a63, fog: 0x9d8089 },
        day:   { top: 0x5c86ab, bottom: 0xe4eef6, fog: 0xc9dbe6 }
    }
});

const DOME_RADIUS = 210;
const CLOUD_COUNT = 11;
const STAR_COUNT = 420;

const _top = new THREE.Color();
const _bottom = new THREE.Color();
const _fog = new THREE.Color();
const _tmp = new THREE.Color();
const _cloudNight = new THREE.Color(0x3a4a63);
const _cloudWhite = new THREE.Color(0xffffff);

export class SkyDome {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'SkyDome';
        this.group.frustumCulled = false;
        scene.add(this.group);

        this.season = 'summer';
        this.hourFloat = 12;
        this.nightFactor = 0;
        this.sunDirection = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
        this.clouds = [];

        this._buildDome();
        this._buildStars();
        this._buildSunMoon();
        this._buildClouds();
    }

    /* ========================================================
       BUILD
       ======================================================== */

    _buildDome() {
        this.uniforms = {
            uTopColor: { value: new THREE.Color(SKY_PRESETS.summer.day.top) },
            uBottomColor: { value: new THREE.Color(SKY_PRESETS.summer.day.bottom) },
            uSunColor: { value: new THREE.Color(0xfff0c2) },
            uSunDirection: { value: this.sunDirection.clone() },
            uSunIntensity: { value: 1.0 },
            uOffset: { value: 0.42 },
            uExponent: { value: 0.85 }
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uTopColor;
                uniform vec3 uBottomColor;
                uniform vec3 uSunColor;
                uniform vec3 uSunDirection;
                uniform float uSunIntensity;
                uniform float uOffset;
                uniform float uExponent;
                varying vec3 vWorldPosition;

                void main() {
                    vec3 dir = normalize(vWorldPosition);
                    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
                    float t = pow(clamp((h - uOffset) / (1.0 - uOffset), 0.0, 1.0), uExponent);
                    vec3 color = mix(uBottomColor, uTopColor, t);

                    // وهج الشمس/الشفق حول اتجاه الشمس
                    float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
                    float glow = pow(sunDot, 8.0) * 0.85 + pow(sunDot, 2.2) * 0.18;
                    color += uSunColor * glow * uSunIntensity;

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });

        this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 24, 16), material);
        this.dome.name = 'Sky-dome';
        this.dome.frustumCulled = false;
        this.dome.renderOrder = -1000;
        this.group.add(this.dome);
    }

    _buildStars() {
        const positions = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            // نصف كرة علوي فقط
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 0.85 + 0.05);
            const r = DOME_RADIUS * 0.92;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        this.starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.5,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false
        });

        this.stars = new THREE.Points(geo, this.starMat);
        this.stars.name = 'Sky-stars';
        this.stars.frustumCulled = false;
        this.group.add(this.stars);
    }

    _buildSunMoon() {
        this.sunMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4, fog: false, transparent: true, opacity: 1 });
        this.sun = new THREE.Mesh(new THREE.SphereGeometry(7.5, 16, 12), this.sunMat);
        this.sun.name = 'Sky-sun';
        this.sun.frustumCulled = false;
        this.group.add(this.sun);

        // هالة الشمس
        this.haloMat = new THREE.MeshBasicMaterial({
            color: 0xffd27a, fog: false, transparent: true, opacity: 0.28, depthWrite: false
        });
        this.halo = new THREE.Mesh(new THREE.SphereGeometry(12.5, 16, 12), this.haloMat);
        this.halo.frustumCulled = false;
        this.group.add(this.halo);

        this.moonMat = new THREE.MeshBasicMaterial({ color: 0xe8eef7, fog: false, transparent: true, opacity: 0 });
        this.moon = new THREE.Mesh(new THREE.SphereGeometry(5.0, 14, 10), this.moonMat);
        this.moon.name = 'Sky-moon';
        this.moon.frustumCulled = false;
        this.group.add(this.moon);
    }

    _buildClouds() {
        this.cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 1, metalness: 0,
            transparent: true, opacity: 0.92, fog: false
        });

        /*
         * MergeUtils يرفض دمج المواد الشفافة (تُرسم في ممر آخر)، لذلك
         * تُبنى النفخات بمادة معتمة مؤقتة، ثم يُدمج كل سحابة في mesh
         * واحد ونُسند إليه المادة الشفافة المشتركة ⇒ نداء رسم واحد
         * لكل غيمة بدل 4–7.
         */
        const buildMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 1, metalness: 0, fog: false
        });

        for (let i = 0; i < CLOUD_COUNT; i++) {
            const cloud = new THREE.Group();
            const puffs = 4 + Math.floor(Math.random() * 4);
            const scale = 1.6 + Math.random() * 2.2;

            for (let p = 0; p < puffs; p++) {
                const puff = new THREE.Mesh(
                    new THREE.SphereGeometry((1.5 + Math.random() * 1.6) * scale, 9, 7),
                    buildMat
                );
                puff.position.set(
                    (p - puffs / 2) * scale * 1.5,
                    (Math.random() - 0.5) * scale * 0.7,
                    (Math.random() - 0.5) * scale * 1.2
                );
                puff.scale.y = 0.62;
                cloud.add(puff);
            }

            cloud.position.set(
                -90 + Math.random() * 180,
                34 + Math.random() * 34,
                -70 - Math.random() * 70
            );
            cloud.userData.speed = 0.55 + Math.random() * 0.85;

            // كل غيمة ⇒ نداء رسم واحد (مادة شفافة مشتركة)
            const res = mergeGroupChildren(cloud, { name: 'Cloud' });
            if (res.merged) {
                const merged = cloud.children.find((c) => c.name === 'Cloud');
                if (merged) merged.material = this.cloudMat;
            } else {
                // احتياط: إن تراجع الدمج تبقى النفخات بالمادة المشتركة
                for (const child of cloud.children) {
                    if (child.isMesh) child.material = this.cloudMat;
                }
            }
            this.clouds.push(cloud);
            this.group.add(cloud);
        }
    }

    /* ========================================================
       UPDATE — من الساعة الحقيقية + الفصل
       ======================================================== */

    /**
     * @param {object} clock لقطة Calendar.readRealClock()
     * @param {number} delta
     * @param {THREE.Vector3} [playerPos] لتثبيت القبة على اللاعب
     */
    update(clock, delta, playerPos = null) {
        if (clock) {
            this.hourFloat = clock.hourFloat ?? (clock.hours + (clock.minutes || 0) / 60);
            this.season = clock.season || this.season;
        }

        const preset = SKY_PRESETS[this.season] || SKY_PRESETS.summer;

        // ارتفاع الشمس من الساعة الحقيقية (شروق 6:00 ← غروب 18:30)
        const dayT = (this.hourFloat - 5.6) / 13.4;
        const elevation = Math.sin(dayT * Math.PI);
        const azimuth = -Math.PI / 2 + dayT * Math.PI;

        this.sunDirection.set(
            Math.cos(azimuth) * 0.85,
            Math.max(-0.45, elevation),
            Math.sin(azimuth) * 0.45 - 0.25
        ).normalize();

        const dayFactor = Math.min(1, Math.max(0, (elevation + 0.02) / 0.45));
        const duskFactor = Math.min(1, Math.max(0, (elevation + 0.24) / 0.34));
        this.nightFactor = 1 - duskFactor;
        this.dayFactor = dayFactor;

        // مزج الألوان: ليل ← غروب ← نهار
        _top.setHex(preset.night.top).lerp(_tmp.setHex(preset.dusk.top), duskFactor);
        _top.lerp(_tmp.setHex(preset.day.top), dayFactor);
        _bottom.setHex(preset.night.bottom).lerp(_tmp.setHex(preset.dusk.bottom), duskFactor);
        _bottom.lerp(_tmp.setHex(preset.day.bottom), dayFactor);
        _fog.setHex(preset.night.fog).lerp(_tmp.setHex(preset.dusk.fog), duskFactor);
        _fog.lerp(_tmp.setHex(preset.day.fog), dayFactor);

        this.uniforms.uTopColor.value.copy(_top);
        this.uniforms.uBottomColor.value.copy(_bottom);
        this.uniforms.uSunDirection.value.copy(this.sunDirection);
        this.uniforms.uSunIntensity.value = 0.35 + duskFactor * 0.9;

        // لون قرص الشمس: أبيض نهارًا ← برتقالي عند الأفق
        this.sunMat.color.setHex(0xfff2c4).lerp(_tmp.setHex(0xff8a3c), 1 - dayFactor);
        this.sunMat.opacity = Math.min(1, duskFactor * 1.4);
        this.haloMat.color.copy(this.sunMat.color);
        this.haloMat.opacity = 0.12 + duskFactor * 0.22;

        // القمر مقابل الشمس
        this.moonMat.opacity = Math.min(0.95, this.nightFactor * 1.3);
        this.starMat.opacity = Math.min(0.95, this.nightFactor * 1.15);

        const R = DOME_RADIUS * 0.82;
        this.sun.position.copy(this.sunDirection).multiplyScalar(R);
        this.halo.position.copy(this.sun.position);
        this.moon.position.copy(this.sunDirection).multiplyScalar(-R);

        // الغيوم: حركة مستمرة + صبغة من الضوء + كثافة موسمية
        const cloudSpeed = this.season === 'winter' ? 1.35 : this.season === 'autumn' ? 1.1 : 1.0;
        // بلا تخصيص داخل الحلقة: كائنات Color معاد استخدامها
        this.cloudMat.color.copy(_cloudWhite).lerp(_cloudNight, this.nightFactor * 0.8);
        this.cloudMat.opacity = this.season === 'winter' ? 0.96 : 0.9;

        for (const cloud of this.clouds) {
            cloud.position.x += delta * cloud.userData.speed * cloudSpeed;
            if (cloud.position.x > 120) cloud.position.x = -120;
        }

        // القبة تتبع اللاعب حتى لا يقترب من حافتها أبدًا
        if (playerPos) {
            this.group.position.set(playerPos.x, 0, playerPos.z);
        }

        return this;
    }

    /**
     * يفرض الفصل (يُنادى عند حدث time:season) — الألوان تُلتقط
     * من SKY_PRESETS في التحديث التالي مباشرة.
     */
    setSeason(season) {
        if (season && SKY_PRESETS[season]) this.season = season;
        return this.season;
    }

    /** لون الضباب المطابق للأفق — يقرأه main.js لتحديث scene.fog. */
    getFogColor(target = new THREE.Color()) {
        return target.copy(this.uniforms.uBottomColor.value).lerp(
            this.uniforms.uTopColor.value, 0.35
        );
    }

    /** 0 نهار .. 1 ليل — للمصابيح والإضاءة العامة. */
    getNightFactor() {
        return this.nightFactor;
    }

    getDayFactor() {
        return this.dayFactor ?? 1;
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse((child) => {
            if (!child.isMesh && !child.isPoints) return;
            if (child.geometry) child.geometry.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) if (m) m.dispose();
        });
    }
}

export default SkyDome;
