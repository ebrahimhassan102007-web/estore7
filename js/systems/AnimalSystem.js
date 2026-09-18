/**
 * AnimalSystem.js — Animals, Feeding & Products
 * Handles animal purchase, feeding, production and collection.
 *
 * مذكرة تصميم — التكاثر/الولادة (مؤجّل عمدًا، لا يُنفَّذ الآن):
 *   الفكرة المقترحة: حيوانان بالغان من نفس النوع + شبعان معًا داخل
 *   حظيرتهما ⇒ بعد N دقيقة يظهر صغير (scale 0.5) بلا إنتاج حتى يكبر.
 *   أُجّل لأن ولادة مجسم جديد تعني: تبنّي AnimalSystem.adopt + ربط
 *   rig جديد + حفظ rigIndex + مزامنة الحذف — أي لمس مباشر لمنطق
 *   الإنتاج والربط الحالي. الحلقة الحالية (إطعام ⇒ انتظار ⇒ جمع)
 *   تبقى كما هي حتى يُبنى ذلك باختبار حقيقي.
 */

import { Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import {
    ANIMALS,
    ITEMS,
    getAnimal
} from '../data/GameData.js';
import { uuid } from '../utils/Utils.js';

class AnimalSystemService {

    constructor() {
        this._initListeners();
    }

    _initListeners() {
        Events.on('game:tick', (dt) => this._tick(dt));

        Events.on('time:offline', (seconds) => {
            this._processOffline(seconds);
        });
    }

    // =========================================================
    // ADD ANIMAL
    // =========================================================

    /**
     * @param {string} animalId  معرّف النوع في GameData.ANIMALS
     * @param {{x?:number,z?:number}} [position] موضع عالم اختياري —
     *        يُستخدم لربط الحيوان بالنموذج ثلاثي الأبعاد في Animals.js
     *        (البيانات بدونها تبقى كما كانت تمامًا).
     */
    addAnimal(animalId, position = null) {
        const animalData = getAnimal(animalId);

        if (!animalData) {
            return {
                success: false,
                error: 'حيوان غير معروف'
            };
        }

        const level = GameState.get('player.level');

        if (animalData.unlockLevel > level) {
            return {
                success: false,
                error: `يتطلب المستوى ${animalData.unlockLevel}`
            };
        }

        const animals = GameState.get('farm.animals');

        const maxAnimals =
            GameState.get('farm.maxAnimals') ||
            20;

        if (animals.length >= maxAnimals) {
            return {
                success: false,
                error: 'وصلت للحد الأقصى من الحيوانات'
            };
        }

        const coins = GameState.get('player.coins');
        const gems = GameState.get('player.gems');

        /*
         * ANIMALS[].cost هو { coins, gems } مثل BUILDINGS —
         * القراءته كرقم تجعل الشرط دائمًا خاطئًا.
         */
        const costEntry = animalData.cost;
        const cost =
            typeof costEntry === 'number'
                ? costEntry
                : (Number(costEntry?.coins) || 0);

        const gemsCost =
            (typeof costEntry === 'object' && costEntry)
                ? (Number(costEntry.gems) || 0)
                : (Number(animalData.gems) || 0);

        if (coins < cost || gems < gemsCost) {
            return {
                success: false,
                error: `تحتاج إلى ${cost} عملة${gemsCost ? ` و${gemsCost} جوهرة` : ''}`
            };
        }

        GameState.set(
            'player.coins',
            coins - cost
        );

        GameState.set(
            'player.gems',
            gems - gemsCost
        );

        const animal = {
            id: uuid(),
            animalId,
            state: 'hungry',
            hunger: 100,
            x: Number.isFinite(position?.x) ? position.x : 100 + Math.random() * 500,
            y: Number.isFinite(position?.y) ? position.y : 100 + Math.random() * 300,
            z: Number.isFinite(position?.z) ? position.z : 0,
            lastFedAt: Date.now(),
            lastProductAt: 0,
            productReadyAt: 0,
            totalCollected: 0,
            createdAt: Date.now()
        };

        GameState.push(
            'farm.animals',
            animal
        );

        Events.emit(
            'animal:added',
            animal
        );

        return {
            success: true,
            animal
        };
    }

    // =========================================================
    // ADOPT — تسجبل حيوان موجود في العالم (بدون سعر/مستوى)
    // =========================================================

    /**
     * يضيف حيوانًا لحالة المزرعة دون خصم عملات أو فحص المستوى.
     * يُستخدم لربط نماذج Animals.js ثلاثية الأبعاد بالنظام، فتصبح
     * الحيوانات التي تراها على الشاشة هي نفسها القابلة للإطعام/الجمع.
     * @returns {{success:boolean, animal?:object, reason?:string}}
     */
    adopt(animalId, position = null) {
        const animalData = getAnimal(animalId);

        if (!animalData) {
            return { success: false, reason: 'unknown_species' };
        }

        const animals = GameState.get('farm.animals') || [];

        const existing = animals.find(
            a => a.animalId === animalId &&
                 Math.abs((a.x ?? 1e9) - (position?.x ?? -1e9)) < 0.01 &&
                 Math.abs((a.z ?? 1e9) - (position?.z ?? -1e9)) < 0.01
        );

        if (existing) {
            return { success: true, animal: existing, reused: true };
        }

        const maxAnimals =
            GameState.get('farm.maxAnimals') || 20;

        if (animals.length >= maxAnimals) {
            return { success: false, reason: 'limit_reached' };
        }

        const animal = {
            id: uuid(),
            animalId,
            state: 'hungry',
            hunger: 60,
            x: Number.isFinite(position?.x) ? position.x : 0,
            z: Number.isFinite(position?.z) ? position.z : 0,
            y: 0,
            lastFedAt: 0,
            lastProductAt: 0,
            productReadyAt: 0,
            totalCollected: 0,
            adopted: true,
            createdAt: Date.now()
        };

        GameState.push('farm.animals', animal);

        Events.emit('animal:added', animal);

        return { success: true, animal };
    }

    // =========================================================
    // REMOVE ANIMAL
    // =========================================================

    removeAnimal(animalId) {
        const animals = GameState.get('farm.animals');

        const index = animals.findIndex(
            a => a.id === animalId
        );

        if (index === -1) {
            return {
                success: false,
                error: 'الحيوان غير موجود'
            };
        }

        const animal = animals[index];

        animals.splice(index, 1);

        GameState.set(
            'farm.animals',
            [...animals]
        );

        Events.emit(
            'animal:removed',
            animalId
        );

        return {
            success: true
        };
    }

    // =========================================================
    // FEED ANIMAL
    // =========================================================

    feed(animalId, feedItemId = null) {

        const animals = GameState.get(
            'farm.animals'
        );

        const animal = animals.find(
            a => a.id === animalId
        );

        if (!animal) {
            return {
                success: false,
                error: 'الحيوان غير موجود'
            };
        }

        const animalData = getAnimal(
            animal.animalId
        );

        if (!animalData) {
            return {
                success: false,
                error: 'بيانات الحيوان غير متوفرة'
            };
        }

        const feedId =
            feedItemId ||
            animalData.feedItem ||
            animalData.feed ||
            'wheat';

        const items = GameState.get(
            'inventory.items'
        );

        if (
            !items[feedId] ||
            items[feedId].count < 1
        ) {
            return {
                success: false,
                error: `ينقصك ${ITEMS[feedId]?.name || feedId} للإطعام`
            };
        }

        items[feedId].count--;

        if (items[feedId].count <= 0) {
            delete items[feedId];
        }

        GameState.set(
            'inventory.items',
            { ...items }
        );

        animal.hunger = 100;
        animal.state = 'fed';
        animal.lastFedAt = Date.now();

        const productionTime =
            animalData.productionTime ||
            animalData.productTime ||
            600;

        animal.productReadyAt =
            Date.now() +
            productionTime * 1000;

        GameState.set(
            'farm.animals',
            [...animals]
        );

        Events.emit(
            'animal:fed',
            animal.id,
            animal.animalId
        );

        return {
            success: true,
            animal
        };
    }

    // =========================================================
    // COLLECT PRODUCT
    // =========================================================

    collect(animalId) {

        const animals = GameState.get(
            'farm.animals'
        );

        const animal = animals.find(
            a => a.id === animalId
        );

        if (!animal) {
            return {
                success: false,
                error: 'الحيوان غير موجود'
            };
        }

        const animalData = getAnimal(
            animal.animalId
        );

        if (!animalData) {
            return {
                success: false,
                error: 'بيانات الحيوان غير متوفرة'
            };
        }

        if (
            animal.state !== 'ready' &&
            animal.productReadyAt > Date.now()
        ) {
            return {
                success: false,
                error: 'المنتج غير جاهز بعد'
            };
        }

        const productId =
            animalData.product ||
            animalData.productItem;

        if (!productId) {
            return {
                success: false,
                error: 'لا منتج لهذا الحيوان'
            };
        }

        const productAmount =
            animalData.productAmount || 1;

        const inventory =
            GameState.get('inventory');

        const current =
            Object.values(
                inventory.items
            ).reduce(
                (sum, item) =>
                    sum + item.count,
                0
            );

        if (
            current + productAmount >
            inventory.maxCapacity
        ) {
            Events.emit(
                'inventory:full'
            );

            return {
                success: false,
                error: 'المخزن ممتلئ'
            };
        }

        const items =
            GameState.get(
                'inventory.items'
            );

        if (!items[productId]) {
            items[productId] = {
                count: 0,
                quality: 1
            };
        }

        items[productId].count +=
            productAmount;

        GameState.set(
            'inventory.items',
            { ...items }
        );

        animal.totalCollected =
            (animal.totalCollected || 0) +
            productAmount;

        animal.state = 'hungry';
        animal.hunger = 50;
        animal.lastProductAt = Date.now();
        animal.productReadyAt = 0;

        GameState.set(
            'farm.animals',
            [...animals]
        );

        Events.emit(
            'animal:collected',
            animal.id,
            productId,
            productAmount
        );

        return {
            success: true,
            productId,
            amount: productAmount
        };
    }

    // =========================================================
    // UPDATE ANIMALS
    // =========================================================

    _tick(dt) {

        const animals =
            GameState.get(
                'farm.animals'
            );

        if (!animals || animals.length === 0) {
            return;
        }

        const now = Date.now();
        let changed = false;

        for (const animal of animals) {

            const animalData =
                getAnimal(
                    animal.animalId
                );

            if (!animalData) {
                continue;
            }

            const hungerRate =
                animalData.hungerRate ||
                1;

            animal.hunger = Math.max(
                0,
                animal.hunger -
                hungerRate *
                (dt / 60)
            );

            if (
                animal.hunger <= 0 &&
                animal.state !== 'hungry'
            ) {
                animal.state = 'hungry';
                changed = true;
            }

            if (
                animal.productReadyAt > 0 &&
                now >= animal.productReadyAt &&
                animal.state !== 'ready'
            ) {

                animal.state = 'ready';

                changed = true;

                Events.emit(
                    'animal:ready',
                    animal.id,
                    animalData.product ||
                    animalData.productItem
                );
            }
        }

        if (changed) {
            GameState.set(
                'farm.animals',
                [...animals]
            );
        }
    }

    // =========================================================
    // OFFLINE PROGRESS
    // =========================================================

    _processOffline(seconds) {

        if (!seconds || seconds <= 0) {
            return;
        }

        const animals =
            GameState.get(
                'farm.animals'
            );

        if (!animals) {
            return;
        }

        const now =
            Date.now();

        let changed = false;

        for (const animal of animals) {

            const animalData =
                getAnimal(
                    animal.animalId
                );

            if (!animalData) {
                continue;
            }

            if (
                animal.productReadyAt > 0 &&
                now >= animal.productReadyAt &&
                animal.state !== 'ready'
            ) {

                animal.state = 'ready';

                changed = true;

                Events.emit(
                    'animal:ready',
                    animal.id,
                    animalData.product ||
                    animalData.productItem
                );
            }

            const hungerLoss =
                (animalData.hungerRate || 1) *
                (seconds / 60);

            animal.hunger =
                Math.max(
                    0,
                    animal.hunger -
                    hungerLoss
                );

            if (
                animal.hunger <= 0
            ) {
                animal.state =
                    'hungry';

                changed = true;
            }
        }

        if (changed) {
            GameState.set(
                'farm.animals',
                [...animals]
            );
        }
    }

    // =========================================================
    // HELPERS
    // =========================================================

    getAnimals() {
        return GameState.get(
            'farm.animals'
        );
    }

    getAnimalById(id) {
        return GameState.get(
            'farm.animals'
        ).find(
            animal =>
                animal.id === id
        );
    }

    getReadyAnimals() {
        return GameState.get(
            'farm.animals'
        ).filter(
            animal =>
                animal.state === 'ready'
        );
    }

    getHungryAnimals() {
        return GameState.get(
            'farm.animals'
        ).filter(
            animal =>
                animal.hunger < 30
        );
    }

    getCount() {
        return GameState.get(
            'farm.animals'
        ).length;
    }

    getCapacity() {
        return (
            GameState.get(
                'farm.maxAnimals'
            ) || 20
        );
    }
}

export const AnimalSystem =
    new AnimalSystemService();