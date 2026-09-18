/**
 * ============================================================
 * FarmLayout.js — خطة zoning واحدة لكل العالم (Hay Day doctrine)
 * ============================================================
 * Brief §1 «Layout doctrine» + §2 «Zoning»:
 *   • Residential   : البيت + الشرفة + صندوق البريد + لافتة — هادئ.
 *   • Production    : المخبز/الألبان/مطحنة العلف + الصوامع + المخزن — قرب الممرات.
 *   • Fields        : شبكة حقول فقط، بعيدًا عن البيت.
 *   • Livestock     : حظائر الحيوانات أبعد عن السكن.
 *   • Landmark      : طاحونة هواء بحجم معلم لا لعبة.
 *
 * هذه الوحدة نقية (بلا THREE وبلا استيراد أي نظام) حتى تقرأها
 * GameData/LandSystem/Environment/BuildingManager/Animals/Foliage
 * من مصدر واحد — لا إحداثيات مكرّرة في خمسة ملفات.
 *
 * الاصطلاح: x شرقًا (+) وغربًا (−)، z جنوبًا (+) وشمالًا (−).
 * الممر الرئيسي (العمود الفقري) على x = 0 من الشمال إلى الجنوب.
 * ============================================================ */

/** حدود اللعب الفعلية (السور المحيط + clamp اللاعب). */
export const WORLD_BOUNDS = Object.freeze({
    minX: -30,
    maxX: 30,
    minZ: -32,
    maxZ: 30,
    /** السور المحيط — يُترك فيه بوابة جنوبية عند قوس الترحيب. */
    perimeter: { minX: -28, maxX: 28, minZ: -30, maxZ: 28, gateHalfWidth: 3.4 }
});

/** مراكز المناطق الثلاث الكبرى — تُستخدم للقراءة/التوثيق/الخريطة. */
export const DISTRICTS = Object.freeze({
    residential: { id: 'residential', name: 'الحي السكني',   nameEn: 'Residential',   x: -16, z: -16, radius: 11 },
    production:  { id: 'production',  name: 'ساحة الإنتاج',  nameEn: 'Production',    x: 14,  z: -10, radius: 13 },
    fields:      { id: 'fields',      name: 'منطقة الحقول',  nameEn: 'Fields',        x: 16.5, z: 11, radius: 13 },
    livestock:   { id: 'livestock',   name: 'حيّ المواشي',   nameEn: 'Livestock',     x: -17, z: 6,   radius: 14 },
    landmark:    { id: 'landmark',    name: 'معلم الطاحونة', nameEn: 'Landmark',      x: 2,   z: -26, radius: 7 },
    market:      { id: 'market',      name: 'كشك الطريق',    nameEn: 'Roadside Stall', x: -4, z: 17,  radius: 5 }
});

/* ============================================================
   RESIDENTIAL — البيت ومرفقاته
   ============================================================ */

export const HOUSE = Object.freeze({
    x: -16,
    z: -16,
    /** البيت أكبر بكثير مما كان (Brief §2 «Scale»): يقرأ كمسكن حقيقي. */
    scale: 1.45,
    body: { w: 8.4, h: 4.6, d: 7.4 },
    /** الباب الحقيقي على الواجهة الجنوبية (باتجاه الممر). */
    door: { side: 'south', width: 1.9 },
    porch: { z: 5.0 },
    mailbox: { x: -9.5, z: -9.5 },
    /** موضع اللاعب عند الخروج من البيت (أمام الباب). */
    exitSpawn: { x: -16, z: -9.6 }
});

/* ============================================================
   LANDMARK — طاحونة الهواء المعلم
   ============================================================ */

export const WINDMILL = Object.freeze({
    x: 2,
    z: -26,
    /** حجم معلم: البرج ~16 وحدة والشفرات ~14 وحدة قطرًا. */
    scale: 2.35,
    rotorSpeed: 0.42
});

/* ============================================================
   PRODUCTION COURT — ساحة الإنتاج والتخزين
   ------------------------------------------------------------
   صفّ آلات واحد على z = -6 (شرقي الممر، شمالي الحقول)،
   والصوامع/المخزن خلفه شمالًا. الممر العرضي z = -7.5 يخدمها.
   ============================================================ */

export const PRODUCTION_COURT = Object.freeze({
    /**
     * صف الآلات — مرتبة كما تظهر في الواجهة.
     * `ids` مصدر واحد لترتيب الآلات (تقرأه البلاطة المشتركة والاختبارات).
     */
    machineRow: {
        z: -6.0,
        spacing: 4.5,
        startX: 7.5,
        ids: ['feed_mill', 'grain_mill', 'bakery', 'dairy']
    },
    machines: {
        feed_mill:  { x: 7.5,  z: -6.0 },
        grain_mill: { x: 12.0, z: -6.0 },
        bakery:     { x: 16.5, z: -6.0 },
        dairy:      { x: 21.0, z: -6.0 }
    },
    /** مباني التخزين المرئية (الصوامع + المخزن الأحمر). */
    barn: { x: 13, z: -14, scale: 1.18 },
    silo: { x: 20.5, z: -13.5, scale: 1.3 },
    /** ممر الخدمة أمام الصف. */
    servicePath: { x: 14.25, z: -8.6, width: 22, length: 3.4 }
});

/* ============================================================
   FIELDS — منطقة الحقول المخصصة (بعيدًا عن السكن)
   ------------------------------------------------------------
   المعرّفات مثبّتة عمدًا: الحفوظات القديمة تربط الخانات والمحاصيل
   بهذه المعرّفات، وتغييرها يعني فقدان تقدّم اللاعب.
   ============================================================ */

export const FIELD_PLOTS = Object.freeze([
    // الحقول الأساسية المجانية (أول صف في منطقة الحقول)
    { id: 'field_center_left',  x: 10.5, z: 2.0,  base: true },
    { id: 'field_center_right', x: 16.5, z: 2.0,  base: true },

    // الـ 10 أراضٍ المقفولة داخل منطقة الحقول فقط
    { id: 'land_north_1',  x: 22.5, z: 2.0 },
    { id: 'land_north_2',  x: 10.5, z: 8.2 },
    { id: 'land_north_3',  x: 16.5, z: 8.2 },
    { id: 'land_west_1',   x: 22.5, z: 8.2 },
    { id: 'land_west_2',   x: 10.5, z: 14.4 },
    { id: 'land_east_1',   x: 16.5, z: 14.4 },
    { id: 'land_east_2',   x: 22.5, z: 14.4 },
    { id: 'land_south_1',  x: 10.5, z: 20.6 },
    { id: 'land_south_2',  x: 16.5, z: 20.6 },
    { id: 'land_south_3',  x: 22.5, z: 20.6 }
]);

/** حدود منطقة الحقول كمستطيل (للعلامات/الممرات/منع العشب). */
export const FIELD_ZONE = Object.freeze({
    minX: 7.6,
    maxX: 25.4,
    minZ: -0.9,
    maxZ: 23.5
});

/* ============================================================
   LIVESTOCK — حيّ المواشي (غرب الممر، بعيدًا عن السكن)
   ============================================================ */

export const PENS = Object.freeze([
    { id: 'pen-cow',     species: 'cow',     x: -21,   z: -2,   w: 9,   d: 7,   gate: 'east',  shelter: null },
    { id: 'pen-chicken', species: 'chicken', x: -11.5, z: 6,    w: 6,   d: 5,   gate: 'west',  shelter: 'coop' },
    { id: 'pen-sheep',   species: 'sheep',   x: -21,   z: 7,    w: 8.5, d: 7,   gate: 'east',  shelter: null },
    { id: 'pen-pig',     species: 'pig',     x: -16,   z: 15,   w: 8,   d: 7,   gate: 'north', shelter: 'sty' }
]);

/** مواضع الحيوانات داخل كل حظيرة (نسبة لمركز الحظيرة). */
export const PEN_HERDS = Object.freeze([
    { pen: 'pen-cow',     type: 'cow',     offsets: [[-1.6, -1.0], [1.4, 0.8]], scale: [1.15, 0.98] },
    { pen: 'pen-sheep',   type: 'sheep',   offsets: [[-1.4, -0.8], [1.2, 1.0]], scale: [1.0, 0.88] },
    { pen: 'pen-pig',     type: 'pig',     offsets: [[-1.3, -0.6], [1.3, 0.9]], scale: [1.05, 0.9] },
    { pen: 'pen-chicken', type: 'chicken', offsets: [[-0.9, -0.6], [0.9, 0.5]], scale: [0.9, 0.82] },
    { pen: 'pen-chicken', type: 'rooster', offsets: [[0.1, 0.9]], scale: [0.95] }
]);

/* ============================================================
   MARKET / SIGN / POND — نقاط الاهتمام
   ============================================================ */

export const MARKET_STALL = Object.freeze({ x: -4, z: 17, standZ: 15.2 });
export const WELCOME_SIGN = Object.freeze({ x: 0, z: 25, boardY: 4.35 });
/*
 * البركة شمال-غرب (بين البيت ومعلم الطاحونة): موضعها السابق (-25,21)
 * كان يتقاطع مع حظيرة الخنازير بعد إعادة الـ zoning.
 */
export const POND = Object.freeze({ x: -7.5, z: -25.5, sandRadius: 4.8, waterRadius: 3.9 });

/* ============================================================
   MASTHEAD — لافتات خشبية مرتفعة حتى يُقرأ العربي (Brief §2)
   ============================================================ */

/** ارتفاعات اللوحات: عالية بما يكفي أن تبقى فوق المجسمات وتُقرأ. */
export const SIGN_HEIGHTS = Object.freeze({
    welcome: 4.35,
    district: 3.6,
    machine: 2.9
});

/* ============================================================
   PATHS — شبكة الممرات (العمود الفقري + فروع لكل حيّ)
   ============================================================ */

export const PATHS = Object.freeze([
    // العمود الفقري: شمال ↔ جنوب على x = 0
    { id: 'spine',       x: 0,      z: 0,     width: 4.7,  length: 66, y: 0.015 },
    // فرع الإنتاج: شرقي الممر أمام صف الآلات
    { id: 'court',       x: 14.25,  z: -8.6,  width: 22,   length: 3.4, y: 0.02 },
    // فرع الحقول: طولي غربي منطقة الحقول
    { id: 'fields-west', x: 7.6,    z: 11,    width: 3.2,  length: 26, y: 0.025 },
    // فرع الحقول: عرضي شمالي المنطقة (يربطها بالعمود الفقري)
    { id: 'fields-north', x: 14.5,  z: -1.6,  width: 17,   length: 3.0, y: 0.022 },
    // فرع المواشي: طولي غربي الممر أمام الحظائر
    { id: 'livestock',   x: -10.5,  z: 3,     width: 2.8,  length: 26, y: 0.02 },
    // فرع السكن: من العمود الفقري إلى شرفة البيت
    { id: 'residential', x: -12.5,  z: -10.5, width: 9.5,  length: 3.0, y: 0.02 },
    // فرع المعلم: إلى الطاحونة شمالًا
    { id: 'landmark',    x: 0.5,    z: -21,   width: 3.0,  length: 12,  y: 0.02 },
    // فرع الكشك: إلى سوق الطريق جنوبًا
    { id: 'stall',       x: -2.2,   z: 15.2,  width: 4.0,  length: 5.0, y: 0.022 }
]);

/* ============================================================
   HOUSE INTERIOR — موضع المشهد الداخلي في نفس الـ scene
   ------------------------------------------------------------
   يُبنى المشهد الداخلي بعيدًا عن المزرعة (إزاحة كبيرة على z) ثم
   تُخفى جذور المزرعة عند الدخول. لا scene ثانية ولا إعادة بناء
   للريندرر ⇒ لا شاشة سوداء ولا تسريب موارد.
   ============================================================ */

export const INTERIOR_ORIGIN = Object.freeze({ x: 0, y: 0, z: 400 });

/** أبعاد الغرفة نفسها (HouseInterior يبني عليها — مصدر واحد). */
export const INTERIOR_ROOM = Object.freeze({ width: 13.2, depth: 11.4, wallHeight: 3.5 });

const HALF_W_IN = INTERIOR_ROOM.width / 2;
const HALF_D_IN = INTERIOR_ROOM.depth / 2;

/**
 * حدود الحركة داخل البيت (clamp اللاعب أثناء الدخول) — أضيق قليلًا
 * من الجدران حتى لا ينغرس اللاعب فيها أو في الأثاث.
 */
export const INTERIOR_BOUNDS = Object.freeze({
    minX: INTERIOR_ORIGIN.x - (HALF_W_IN - 0.75),
    maxX: INTERIOR_ORIGIN.x + (HALF_W_IN - 0.75),
    minZ: INTERIOR_ORIGIN.z - (HALF_D_IN - 0.75),
    maxZ: INTERIOR_ORIGIN.z + (HALF_D_IN - 0.5)
});

/** نقطة ظهور اللاعب داخل البيت (خلف الباب حتى لا يعلق في ضلفته). */
export const INTERIOR_SPAWN = Object.freeze({
    x: INTERIOR_ORIGIN.x,
    z: INTERIOR_ORIGIN.z + 3.5
});

/** موضع صندوق التخزين داخل البيت (تفاعل ⇒ لوحة المخزن). */
export const INTERIOR_CHEST = Object.freeze({
    x: INTERIOR_ORIGIN.x - 4.4,
    z: INTERIOR_ORIGIN.z - 3.2
});

/** باب الخروج داخل البيت — على الجدار الجنوبي نفسه (لا باب طافٍ). */
export const INTERIOR_EXIT = Object.freeze({
    x: INTERIOR_ORIGIN.x,
    z: INTERIOR_ORIGIN.z + HALF_D_IN
});

/**
 * هل النقطة داخل إحدى مناطق البناء/الحقول/الحظائر؟
 * تُستخدم لمنع العشب والزهور من النمو تحت المجسمات.
 */
export function isInsidePlayZone(x, z) {
    if (Math.abs(x) < 3.2 && z > -33 && z < 29) return false;          // العمود الفقري
    if (x > FIELD_ZONE.minX && x < FIELD_ZONE.maxX &&
        z > FIELD_ZONE.minZ && z < FIELD_ZONE.maxZ) return false;        // الحقول
    if (x > 4.5 && x < 25 && z > -16 && z < -3.5) return false;          // ساحة الإنتاج
    if (Math.abs(x - HOUSE.x) < 8 && Math.abs(z - HOUSE.z) < 8) return false; // البيت
    if (Math.abs(x - WINDMILL.x) < 5 && Math.abs(z - WINDMILL.z) < 5) return false;
    if (Math.abs(x - MARKET_STALL.x) < 4.6 && Math.abs(z - MARKET_STALL.z) < 3.8) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.sandRadius + 1) return false;

    for (const pen of PENS) {
        if (Math.abs(x - pen.x) < pen.w / 2 + 1 && Math.abs(z - pen.z) < pen.d / 2 + 1) return false;
    }
    for (const path of PATHS) {
        if (Math.abs(x - path.x) < path.width / 2 + 0.6 &&
            Math.abs(z - path.z) < path.length / 2 + 0.6) return false;
    }
    return true;
}

export default {
    WORLD_BOUNDS,
    DISTRICTS,
    HOUSE,
    WINDMILL,
    PRODUCTION_COURT,
    FIELD_PLOTS,
    FIELD_ZONE,
    PENS,
    PEN_HERDS,
    MARKET_STALL,
    WELCOME_SIGN,
    POND,
    SIGN_HEIGHTS,
    PATHS,
    INTERIOR_ORIGIN,
    INTERIOR_BOUNDS,
    INTERIOR_SPAWN,
    INTERIOR_CHEST,
    INTERIOR_EXIT,
    isInsidePlayZone
};
