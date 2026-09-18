/**
 * ============================================================
 * GameData.js — الجريدة المركزية للعبة MY FARM 3D
 * ============================================================
 * Central read-only game content: items, crops, buildings,
 * recipes (Hay Day-style production chains), animals, economy
 * tuning, NPCs, orders, decorations and tools.
 *
 * Arabic display names follow the same convention used by
 * FarmingSystem.js (القمح، الذرة، الجزر، الطماطم).
 *
 * Consumed by: ProductionSystem, BuildingSystem, AnimalSystem,
 * MarketSystem, OrderSystem, SocialSystem, EventSystem, Components.
 * ============================================================
 */

/* ============================================================
   CROPS — مرآة CROPS_DEFINITIONS في FarmingSystem.js
   ============================================================ */

export const CROPS = Object.freeze({
    wheat: {
        id: 'wheat',
        name: 'قمح',
        nameEn: 'Wheat',
        icon: '🌾',
        seedId: 'wheat_seed',
        growTime: 10,
        xpReward: 15,
        sellPrice: 25,
        colors: { sprout: 0x86d942, growing: 0x57b327, ready: 0xffd54f }
    },
    corn: {
        id: 'corn',
        name: 'ذرة',
        nameEn: 'Corn',
        icon: '🌽',
        seedId: 'corn_seed',
        growTime: 16,
        xpReward: 25,
        sellPrice: 45,
        colors: { sprout: 0x9be046, growing: 0x68c728, ready: 0xf5a623 }
    },
    carrot: {
        id: 'carrot',
        name: 'جزر',
        nameEn: 'Carrot',
        icon: '🥕',
        seedId: 'carrot_seed',
        growTime: 22,
        xpReward: 35,
        sellPrice: 65,
        colors: { sprout: 0x72c738, growing: 0x4aa625, ready: 0xff7043 }
    },
    tomato: {
        id: 'tomato',
        name: 'طماطم',
        nameEn: 'Tomato',
        icon: '🍅',
        seedId: 'tomato_seed',
        growTime: 28,
        xpReward: 45,
        sellPrice: 85,
        colors: { sprout: 0x76cc3f, growing: 0x4caf50, ready: 0xe53935 }
    }
});

/* ============================================================
   ITEMS — كل ما يمكن تخزينه أو تداوله في المخزن
   (محاصيل + بذور + منتجات معالجة + منتجات حيوانية)
   ============================================================ */

export const ITEMS = Object.freeze({
    // ---- Raw crops ----
    wheat:       { id: 'wheat',       name: 'قمح',            nameEn: 'Wheat',        icon: '🌾', category: 'crop',     sellPrice: 25 },
    corn:        { id: 'corn',        name: 'ذرة',            nameEn: 'Corn',         icon: '🌽', category: 'crop',     sellPrice: 45 },
    carrot:      { id: 'carrot',      name: 'جزر',            nameEn: 'Carrot',       icon: '🥕', category: 'crop',     sellPrice: 65 },
    tomato:      { id: 'tomato',      name: 'طماطم',          nameEn: 'Tomato',       icon: '🍅', category: 'crop',     sellPrice: 85 },

    // ---- Seeds ----
    wheat_seed:  { id: 'wheat_seed',  name: 'بذور القمح',     nameEn: 'Wheat Seeds',  icon: '🌱', category: 'seed',     sellPrice: 5 },
    corn_seed:   { id: 'corn_seed',   name: 'بذور الذرة',     nameEn: 'Corn Seeds',   icon: '🌱', category: 'seed',     sellPrice: 9 },
    carrot_seed: { id: 'carrot_seed', name: 'بذور الجزر',     nameEn: 'Carrot Seeds', icon: '🌱', category: 'seed',     sellPrice: 13 },
    tomato_seed: { id: 'tomato_seed', name: 'بذور الطماطم',   nameEn: 'Tomato Seeds', icon: '🌱', category: 'seed',     sellPrice: 17 },

    // ---- Grain Mill products ----
    flour:        { id: 'flour',        name: 'دقيق',          nameEn: 'Flour',        icon: '🥣', category: 'milled',   sellPrice: 90 },
    corn_flour:   { id: 'corn_flour',   name: 'دقيق الذرة',    nameEn: 'Corn Flour',   icon: '🌽', category: 'milled',   sellPrice: 150 },
    chicken_feed: { id: 'chicken_feed', name: 'علف الدجاج',    nameEn: 'Chicken Feed', icon: '🫘', category: 'milled',   sellPrice: 35 },

    // ---- Bakery products ----
    bread:         { id: 'bread',         name: 'خبز',          nameEn: 'Bread',        icon: '🍞', category: 'baked',    sellPrice: 260 },
    corn_bread:    { id: 'corn_bread',    name: 'خبز الذرة',    nameEn: 'Corn Bread',   icon: '🥖', category: 'baked',    sellPrice: 420 },
    tomato_pastry: { id: 'tomato_pastry', name: 'فطيرة الطماطم', nameEn: 'Tomato Pie',  icon: '🥧', category: 'baked',    sellPrice: 480 },
    carrot_cake:   { id: 'carrot_cake',   name: 'كيك الجزر',    nameEn: 'Carrot Cake',  icon: '🍰', category: 'baked',    sellPrice: 650 },

    // ---- Animal products ----
    egg:  { id: 'egg',  name: 'بيض',  nameEn: 'Egg',  icon: '🥚', category: 'animal', sellPrice: 60 },
    milk: { id: 'milk', name: 'حليب', nameEn: 'Milk', icon: '🥛', category: 'animal', sellPrice: 140 },
    wool: { id: 'wool', name: 'صوف',  nameEn: 'Wool', icon: '🧶', category: 'animal', sellPrice: 220 },
    truffle: { id: 'truffle', name: 'كمأة', nameEn: 'Truffle', icon: '🍄', category: 'animal', sellPrice: 180 },

    // ---- Dairy products (Hay Day) ----
    cream:  { id: 'cream',  name: 'قشطة', nameEn: 'Cream',  icon: '🍶', category: 'dairy', sellPrice: 200 },
    butter: { id: 'butter', name: 'زبدة', nameEn: 'Butter', icon: '🧈', category: 'dairy', sellPrice: 320 },
    cheese: { id: 'cheese', name: 'جبن',  nameEn: 'Cheese', icon: '🧀', category: 'dairy', sellPrice: 480 },

    // ---- Species-Specific Animal Feeds (Feed Mill) ----
    cow_feed:   { id: 'cow_feed',   name: 'علف الأبقار',  nameEn: 'Cow Feed',   icon: '🌽', category: 'milled', sellPrice: 45 },
    sheep_feed: { id: 'sheep_feed', name: 'علف الأغنام',  nameEn: 'Sheep Feed', icon: '🌾', category: 'milled', sellPrice: 40 },
    pig_feed:   { id: 'pig_feed',   name: 'علف الخنازير', nameEn: 'Pig Feed',   icon: '🥕', category: 'milled', sellPrice: 50 },

    // ---- Building Upgrade Supplies (Hay Day Silo/Barn) ----
    nail:       { id: 'nail',       name: 'مسامير',  nameEn: 'Nails',  icon: '🔩', category: 'supply', sellPrice: 120 },
    wood_plank: { id: 'wood_plank', name: 'ألواح خشب', nameEn: 'Planks', icon: '🪵', category: 'supply', sellPrice: 150 },
    duct_tape:  { id: 'duct_tape',  name: 'شريط لاصق', nameEn: 'Tape',   icon: '🩹', category: 'supply', sellPrice: 180 },

    // ---- Soil Quality Fertilizers (Stardew-inspired) ----
    fertilizer_normal:  { id: 'fertilizer_normal',  name: 'سماد عادي',  nameEn: 'Normal Fertilizer',  icon: '🧪', category: 'fertilizer', tier: 'normal',  sellPrice: 30 },
    fertilizer_basic:   { id: 'fertilizer_basic',   name: 'سماد أساسي',  nameEn: 'Basic Fertilizer',   icon: '🧪', category: 'fertilizer', tier: 'basic',   sellPrice: 60 },
    fertilizer_quality: { id: 'fertilizer_quality', name: 'سماد جودة',  nameEn: 'Quality Fertilizer', icon: '✨', category: 'fertilizer', tier: 'quality', sellPrice: 120 },
    fertilizer_deluxe:  { id: 'fertilizer_deluxe',  name: 'سماد فاخر',  nameEn: 'Deluxe Fertilizer',  icon: '🌟', category: 'fertilizer', tier: 'deluxe',  sellPrice: 250 }
});

/* ============================================================
   BUILDINGS — المباني (كتالوج الأنواع)
   ============================================================ */

export const BUILDINGS = Object.freeze({
    silo: {
        id: 'silo',
        name: 'الصومعة',
        nameEn: 'Silo',
        icon: '🌾',
        category: 'storage',
        storageType: 'silo',
        description: 'تخزين المحاصيل الخام فقط.',
        cost: { coins: 0, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        size: { w: 2, d: 2 }
    },
    barn: {
        id: 'barn',
        name: 'الحظيرة',
        nameEn: 'Barn',
        icon: '🛖',
        category: 'storage',
        storageType: 'barn',
        description: 'مخزن منتجات الحيوانات، السلع المصنعة، الأدوات ومواد الترقية.',
        cost: { coins: 0, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        size: { w: 2, d: 2 }
    },

    // ---- طاحونة الحبوب : المرحلة الأولى من السلسلة ----
    grain_mill: {
        id: 'grain_mill',
        name: 'طاحونة الحبوب',
        epithet: 'نسيم القمح',
        nameEn: 'Grain Mill',
        icon: '🌾',
        category: 'production',
        description: 'تطحن القمح والذرة إلى دقيق وعلف.',
        cost: { coins: 500, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        queueLimit: 4,
        size: { w: 1, d: 1 }
    },

    // ---- معمل الألبان : المرحلة الثالثة من السلسلة (Hay Day Dairy) ----
    dairy: {
        id: 'dairy',
        name: 'معمل الألبان',
        epithet: 'نسيم الحليب',
        nameEn: 'Dairy',
        icon: '🥛',
        category: 'production',
        description: 'يحوّل الحليب الطازج إلى قشطة وزبدة وجبن.',
        cost: { coins: 2000, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        queueLimit: 3,
        size: { w: 1, d: 1 }
    },

    // ---- المخبز : المرحلة الثانية من السلسلة ----
    bakery: {
        id: 'bakery',
        name: 'المخبز',
        epithet: 'فرن الفجر',
        nameEn: 'Bakery',
        icon: '🍞',
        category: 'production',
        description: 'يحوّل الدقيق والمحاصيل إلى مخبوزات شهية.',
        cost: { coins: 1200, gems: 0 },
        buildTime: 0,
        unlockLevel: 1,
        queueLimit: 3,
        size: { w: 1, d: 1 }
    },

    // ---- منازل الحيوانات (للمراحل القادمة) ----
    chicken_coop: {
        id: 'chicken_coop',
        name: 'حظيرة الدجاج',
        nameEn: 'Chicken Coop',
        icon: '🐔',
        category: 'animal_home',
        description: 'مأوى الدجاج لإنتاج البيض.',
        cost: { coins: 1500, gems: 0 },
        buildTime: 60,
        unlockLevel: 3,
        size: { w: 1, d: 1 }
    },
    cow_barn: {
        id: 'cow_barn',
        name: 'حظيرة الأبقار',
        nameEn: 'Cow Barn',
        icon: '🐄',
        category: 'animal_home',
        description: 'مأوى الأبقار لإنتاج الحليب.',
        cost: { coins: 4000, gems: 0 },
        buildTime: 180,
        unlockLevel: 5,
        size: { w: 2, d: 2 }
    },
    sheep_pen: {
        id: 'sheep_pen',
        name: 'حظيرة الأغنام',
        nameEn: 'Sheep Pen',
        icon: '🐑',
        category: 'animal_home',
        description: 'مأوى الأغنام لإنتاج الصوف.',
        cost: { coins: 7500, gems: 0 },
        buildTime: 300,
        unlockLevel: 7,
        size: { w: 2, d: 2 }
    },
    pig_sty: {
        id: 'pig_sty',
        name: 'زريبة الخنازير',
        nameEn: 'Pig Sty',
        icon: '🐷',
        category: 'animal_home',
        description: 'مأوى الخنازير لإنتاج الكمأة.',
        cost: { coins: 2500, gems: 0 },
        buildTime: 120,
        unlockLevel: 4,
        size: { w: 2, d: 2 }
    }
});

/* ============================================================
   RECIPES — وصفات الإنتاج (سلسلة Hay Day)
   ------------------------------------------------------------
   الحقول التي يقرأها ProductionSystem:
     building, ingredients[{item,amount}], output{item,amount},
     productionTime (ثوانٍ), unlockLevel
   ============================================================ */

export const RECIPES = Object.freeze({

    // ========== 🌾 طاحونة الحبوب ==========
    flour: {
        id: 'flour',
        building: 'grain_mill',
        name: 'دقيق',
        nameEn: 'Flour',
        icon: '🥣',
        description: 'دقيق ناعم من حبوب القمح — أساس المخبوزات.',
        ingredients: [ { item: 'wheat', amount: 3 } ],
        output: { item: 'flour', amount: 1 },
        productionTime: 30,
        unlockLevel: 1,
        xp: 8,
        sellPrice: 90
    },
    corn_flour: {
        id: 'corn_flour',
        building: 'grain_mill',
        name: 'دقيق الذرة',
        nameEn: 'Corn Flour',
        icon: '🌽',
        description: 'دقيق ذهبي من الذرة — لخبز الذرة الريفي.',
        ingredients: [ { item: 'corn', amount: 3 } ],
        output: { item: 'corn_flour', amount: 1 },
        productionTime: 45,
        unlockLevel: 2,
        xp: 12,
        sellPrice: 150
    },
    chicken_feed: {
        id: 'chicken_feed',
        building: 'grain_mill',
        name: 'علف الدجاج',
        nameEn: 'Chicken Feed',
        icon: '🫘',
        description: 'خليط حبوب مطحونة لتغذية الدجاج.',
        ingredients: [
            { item: 'wheat', amount: 2 },
            { item: 'corn',  amount: 1 }
        ],
        output: { item: 'chicken_feed', amount: 3 },
        productionTime: 20,
        unlockLevel: 1,
        xp: 6,
        sellPrice: 35
    },
    cow_feed: {
        id: 'cow_feed',
        building: 'grain_mill',
        name: 'علف الأبقار',
        nameEn: 'Cow Feed',
        icon: '🌽',
        description: 'خليط من الذرة والقمح لتغذية الأبقار وإنتاج الحليب.',
        ingredients: [
            { item: 'corn',  amount: 2 },
            { item: 'wheat', amount: 1 }
        ],
        output: { item: 'cow_feed', amount: 3 },
        productionTime: 30,
        unlockLevel: 2,
        xp: 8,
        sellPrice: 45
    },
    sheep_feed: {
        id: 'sheep_feed',
        building: 'grain_mill',
        name: 'علف الأغنام',
        nameEn: 'Sheep Feed',
        icon: '🌾',
        description: 'حبوب قمح وجزر لتغذية الأغنام وإنتاج الصوف.',
        ingredients: [
            { item: 'wheat',  amount: 2 },
            { item: 'carrot', amount: 1 }
        ],
        output: { item: 'sheep_feed', amount: 3 },
        productionTime: 40,
        unlockLevel: 2,
        xp: 10,
        sellPrice: 40
    },
    pig_feed: {
        id: 'pig_feed',
        building: 'grain_mill',
        name: 'علف الخنازير',
        nameEn: 'Pig Feed',
        icon: '🥕',
        description: 'جزر وذرة لتغذية الخنازير والبحث عن الكمأة.',
        ingredients: [
            { item: 'carrot', amount: 2 },
            { item: 'corn',   amount: 1 }
        ],
        output: { item: 'pig_feed', amount: 3 },
        productionTime: 50,
        unlockLevel: 2,
        xp: 12,
        sellPrice: 50
    },

    // ========== 🍞 المخبز ==========
    bread: {
        id: 'bread',
        building: 'bakery',
        name: 'خبز',
        nameEn: 'Bread',
        icon: '🍞',
        description: 'خبز طازج من دقيق القمح — ذهب المخبز.',
        ingredients: [ { item: 'flour', amount: 2 } ],
        output: { item: 'bread', amount: 1 },
        productionTime: 60,
        unlockLevel: 1,
        xp: 16,
        sellPrice: 260
    },
    corn_bread: {
        id: 'corn_bread',
        building: 'bakery',
        name: 'خبز الذرة',
        nameEn: 'Corn Bread',
        icon: '🥖',
        description: 'خبز ريفي ذهبي من دقيق الذرة.',
        ingredients: [ { item: 'corn_flour', amount: 2 } ],
        output: { item: 'corn_bread', amount: 1 },
        productionTime: 90,
        unlockLevel: 2,
        xp: 20,
        sellPrice: 420
    },
    tomato_pastry: {
        id: 'tomato_pastry',
        building: 'bakery',
        name: 'فطيرة الطماطم',
        nameEn: 'Tomato Pie',
        icon: '🥧',
        description: 'فطيرة ساخنة محشوة بالطماطم الطازجة.',
        ingredients: [
            { item: 'flour',  amount: 1 },
            { item: 'tomato', amount: 2 }
        ],
        output: { item: 'tomato_pastry', amount: 1 },
        productionTime: 120,
        unlockLevel: 2,
        xp: 26,
        sellPrice: 480
    },
    carrot_cake: {
        id: 'carrot_cake',
        building: 'bakery',
        name: 'كيك الجزر',
        nameEn: 'Carrot Cake',
        icon: '🍰',
        description: 'كيك غني بالجزر والذرة — تحفة المخبز!',
        ingredients: [
            { item: 'flour',  amount: 1 },
            { item: 'corn',   amount: 2 },
            { item: 'carrot', amount: 2 }
        ],
        output: { item: 'carrot_cake', amount: 1 },
        productionTime: 150,
        unlockLevel: 3,
        xp: 34,
        sellPrice: 650
    },

    // ========== 🥛 معمل الألبان (Hay Day Dairy) ==========
    cream: {
        id: 'cream',
        building: 'dairy',
        name: 'قشطة',
        nameEn: 'Cream',
        icon: '🍶',
        description: 'قشطة طازجة غنية من حليب الأبقار.',
        ingredients: [ { item: 'milk', amount: 1 } ],
        output: { item: 'cream', amount: 1 },
        productionTime: 40,
        unlockLevel: 1,
        xp: 14,
        sellPrice: 200
    },
    butter: {
        id: 'butter',
        building: 'dairy',
        name: 'زبدة',
        nameEn: 'Butter',
        icon: '🧈',
        description: 'زبدة ذهبية مخفوقة من الحليب الطازج.',
        ingredients: [ { item: 'milk', amount: 2 } ],
        output: { item: 'butter', amount: 1 },
        productionTime: 75,
        unlockLevel: 2,
        xp: 22,
        sellPrice: 320
    },
    cheese: {
        id: 'cheese',
        building: 'dairy',
        name: 'جبن',
        nameEn: 'Cheese',
        icon: '🧀',
        description: 'قالب جبن ريفي معتّق ولذيذ.',
        ingredients: [ { item: 'milk', amount: 3 } ],
        output: { item: 'cheese', amount: 1 },
        productionTime: 120,
        unlockLevel: 3,
        xp: 35,
        sellPrice: 480
    }
});

/* ============================================================
   ANIMALS — الحيوانات (للمراحل القادمة)
   ============================================================ */

export const ANIMALS = Object.freeze({
    chicken: {
        id: 'chicken',
        name: 'دجاجة',
        nameEn: 'Chicken',
        icon: '🐔',
        home: 'chicken_coop',
        product: 'egg',
        productionTime: 90,
        feed: 'chicken_feed',
        unlockLevel: 1,
        cost: { coins: 300, gems: 0 }
    },
    cow: {
        id: 'cow',
        name: 'بقرة',
        nameEn: 'Cow',
        icon: '🐄',
        home: 'cow_barn',
        product: 'milk',
        productionTime: 180,
        feed: 'cow_feed',
        unlockLevel: 1,
        cost: { coins: 900, gems: 0 }
    },
    sheep: {
        id: 'sheep',
        name: 'خروف',
        nameEn: 'Sheep',
        icon: '🐑',
        home: 'sheep_pen',
        product: 'wool',
        productionTime: 240,
        feed: 'sheep_feed',
        unlockLevel: 1,
        cost: { coins: 1500, gems: 0 }
    },
    pig: {
        id: 'pig',
        name: 'خنزير',
        nameEn: 'Pig',
        icon: '🐷',
        home: 'pig_sty',
        product: 'truffle',
        productionTime: 210,
        feed: 'pig_feed',
        unlockLevel: 1,
        cost: { coins: 1200, gems: 0 }
    }
});

/* ============================================================
   EXPANSIONS — توسعات الأرض العشر
   ============================================================ */

export const EXPANSIONS = Object.freeze(
    Array.from({ length: 10 }, (_, i) => {
        const tier = i + 1;
        return {
            tier,
            id: `expansion_${tier}`,
            name: `توسعة ${tier}`,
            nameEn: `Expansion ${tier}`,
            icon: '🗺️',
            cost: {
                coins: Math.round(400 * Math.pow(1.8, i)),
                gems: i >= 6 ? (i - 5) * 2 : 0
            },
            size: { rows: 4 + tier, cols: 6 + tier }
        };
    })
);

/* ============================================================
   ECONOMY — ضبط الاقتصاد
   ============================================================ */

export const ECONOMY = Object.freeze({
    startingCoins: 350,
    startingGems: 10,
    startingEnergy: 50,

    maxFriends: 50,
    dailyGiftsLimit: 20,

    maxMarketListings: 10,
    marketDuration: 21600,  // 6 ساعات (ثواني)
    marketFee: 0.10,        // عمولة السوق 10%
    priceVariance: 0.25,    // تذبذب أسعار السوق ±25%

    maxActiveOrders: 6,
    orderRefreshInterval: 300, // 5 دقائق (ثواني)
    orderRewardMultiplier: 1.35
});

/* ============================================================
   NPCS + ORDER_TEMPLATES — لوحة الطلبات
   ============================================================ */

export const NPCS = Object.freeze([
    { id: 'om_salem',    name: 'أم سالم',    avatar: '👵', personality: 'تحب المخبوزات الطازجة' },
    { id: 'ammo_ramadan', name: 'العم رمضان', avatar: '👨‍🌾', personality: 'مزارع قديم يعشق القمح' },
    { id: 'layla',       name: 'ليلى',       avatar: '👩‍🍳', personality: 'طاهية المدينة المشهورة' },
    { id: 'capt_tarek',  name: 'كابتن طارق',  avatar: '🧑‍✈️', personality: 'تاجر الميناء' }
]);

export const ORDER_TEMPLATES = Object.freeze([
    {
        id: 'fresh_bread',
        minLevel: 1,
        items: [ { item: 'bread', min: 1, max: 2 } ],
        reward: { coins: { min: 280, max: 560 }, xp: { min: 20, max: 40 } }
    },
    {
        id: 'wheat_deal',
        minLevel: 1,
        items: [ { item: 'wheat', min: 3, max: 6 } ],
        reward: { coins: { min: 85, max: 170 }, xp: { min: 12, max: 24 } }
    },
    {
        id: 'mill_combo',
        minLevel: 2,
        items: [
            { item: 'flour',  min: 1, max: 2 },
            { item: 'carrot', min: 2, max: 4 }
        ],
        reward: { coins: { min: 260, max: 520 }, xp: { min: 25, max: 50 } }
    },
    {
        id: 'bakery_party',
        minLevel: 3,
        items: [
            { item: 'bread',       min: 1, max: 2 },
            { item: 'carrot_cake', min: 1, max: 1 }
        ],
        reward: { coins: { min: 950, max: 1400 }, xp: { min: 60, max: 90 } }
    }
]);

/* ============================================================
   DECORATIONS + TOOLS
   ============================================================ */

export const DECORATIONS = Object.freeze({
    fence:     { id: 'fence',     name: 'سياج خشبي',  nameEn: 'Fence',     icon: '🚧', category: 'decoration', cost: { coins: 50,  gems: 0 } },
    flowerbed: { id: 'flowerbed', name: 'حوض زهور',   nameEn: 'Flowerbed', icon: '🌷', category: 'decoration', cost: { coins: 120, gems: 0 } },
    scarecrow: { id: 'scarecrow', name: 'فزّاعة',     nameEn: 'Scarecrow', icon: '🧍', category: 'decoration', cost: { coins: 250, gems: 0 } },
    well:      { id: 'well',      name: 'بئر قديم',   nameEn: 'Old Well',  icon: '🕳️', category: 'decoration', cost: { coins: 600, gems: 5 } }
});

export const TOOLS = Object.freeze({
    hoe:           { id: 'hoe',           name: 'مِحراث',    nameEn: 'Hoe',           icon: '⛏️' },
    watering_can:  { id: 'watering_can',  name: 'إبريق الري', nameEn: 'Watering Can', icon: '💧' },
    sickle:        { id: 'sickle',        name: 'منجل',       nameEn: 'Sickle',       icon: '🔪' },
    axe:           { id: 'axe',           name: 'فأس',        nameEn: 'Axe',          icon: '🪓' }
});

/* ============================================================
   STARTER KIT — يزرع عند أول تشغيل (لا يلمس الحفوظات القديمة)
   ============================================================ */

export const STARTER_KIT = Object.freeze({
    buildings: ['grain_mill', 'bakery', 'dairy'],
    items: {
        wheat: 8,
        corn: 6,
        carrot: 4,
        milk: 3,
        chicken_feed: 4,
        cow_feed: 4,
        sheep_feed: 4,
        pig_feed: 4,
        nail: 2,
        wood_plank: 2,
        duct_tape: 1,
        fertilizer_basic: 2,
        // بذور أولية — بدونها لا يمكن بدء حلقة الزراعة (الحصاد يعيد البذرة)
        wheat_seed: 10,
        corn_seed: 8,
        carrot_seed: 5,
        tomato_seed: 4
    },
    recipes: ['flour', 'chicken_feed', 'cow_feed', 'sheep_feed', 'pig_feed', 'bread', 'cream', 'butter'],
    // مواقع البناء على الشبكة في ساحة الإنتاج
    positions: {
        grain_mill: { x: -3.8, z: 4.5 },
        bakery:     { x:  3.8, z: 4.5 },
        dairy:      { x:  0.0, z: 6.5 }
    }
});

/* ============================================================
   LOOKUP HELPERS — دوال البحث
   ============================================================ */

function byId(catalog, id) {
    if (!id || !catalog) return undefined;
    if (catalog[id]) return catalog[id];            // keyed map hit
    if (Array.isArray(catalog)) {                   // array catalogs
        return catalog.find(entry => entry && entry.id === id);
    }
    return Object.values(catalog).find(             // .id field match
        entry => entry && entry.id === id
    );
}

export const getCrop    = id => byId(CROPS, id);
export const getItem    = id => byId(ITEMS, id);
export const getRecipe  = id => byId(RECIPES, id);
export const getBuilding = id => byId(BUILDINGS, id);
export const getAnimal  = id => byId(ANIMALS, id);
export const getDecoration = id => byId(DECORATIONS, id);
export const getTool    = id => byId(TOOLS, id);

/** كل وصفات مبنى معين (مرتبة حسب مستوى الفتح) */
export function getRecipesForBuilding(buildingId) {
    return Object.values(RECIPES)
        .filter(r => r.building === buildingId)
        .sort((a, b) => a.unlockLevel - b.unlockLevel);
}
