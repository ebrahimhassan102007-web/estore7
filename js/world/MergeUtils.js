/**
 * ============================================================
 * MergeUtils.js — دمجMeshes الساكنة لتقليل draw calls
 * ============================================================
 * كل Mesh = نداء رسم واحد. العالم كان يرسم ~500 نداء (أسوار 100،
 * أشجار 40، غيوم 40، حيوانات ~190) على iPhone.
 *
 * الدمج هنا «هندسي بحت»: نفس المثلثات، نفس المواد البصرية (الألوان
 * تُخبز في vertex colors)، ونفس التحويلات — الفرق الوحيد هو عدد
 * النداءات. لذلك نتحقق من تطابق صندوق الإحاطة (bounding box) قبل
 * الاعتماد على النتيجة، ونتراجع تلقائيًا عند أي اختلاف.
 *
 * لا ندمج أبدًا:
 *   • mesh داخل Group متحرك (الأبواب، أجنحة الطيور، شفرات الطاحونة)
 *   • mesh معلَّم بـ userData.noMerge
 *   • InstancedMesh (نداء واحد أصلًا)
 *
 * لا نستدعي dispose() على الهندسة المدموجة: الدمج يحدث قبل أول
 * إطار رسم، فهي لم تُرفع إلى GPU أصلًا، ويكفي أن يجمعها GC.
 * ============================================================
 */

import * as THREE from 'three';

const REQUIRED = ['position', 'normal'];
const OPTIONAL = ['uv', 'color'];

const _boxBefore = new THREE.Box3();
const _boxAfter = new THREE.Box3();
const _sizeA = new THREE.Vector3();
const _sizeB = new THREE.Vector3();
const _centerA = new THREE.Vector3();
const _centerB = new THREE.Vector3();

function sameBox(a, b) {
    if (a.isEmpty() || b.isEmpty()) return a.isEmpty() === b.isEmpty();
    a.getSize(_sizeA);
    b.getSize(_sizeB);
    a.getCenter(_centerA);
    b.getCenter(_centerB);
    const eps = 1e-3;
    return (
        Math.abs(_sizeA.x - _sizeB.x) < eps &&
        Math.abs(_sizeA.y - _sizeB.y) < eps &&
        Math.abs(_sizeA.z - _sizeB.z) < eps &&
        Math.abs(_centerA.x - _centerB.x) < eps &&
        Math.abs(_centerA.y - _centerB.y) < eps &&
        Math.abs(_centerA.z - _centerB.z) < eps
    );
}

/**
 * دمج هندسات مفهرسة (indexed) تشترك في نفس السمات.
 * @returns {THREE.BufferGeometry|null} null عند أي تعارض سمات
 */
function mergeGeometriesLite(geometries) {
    if (!geometries.length) return null;

    const names = [...REQUIRED];
    for (const name of OPTIONAL) {
        if (geometries.every((g) => !!g.attributes[name])) names.push(name);
    }

    for (const g of geometries) {
        for (const name of REQUIRED) {
            if (!g.attributes[name]) return null;
        }
        if (g.morphAttributes && Object.keys(g.morphAttributes).length) return null;
        if (g.attributes.position.itemSize !== 3) return null;
    }

    let vertexTotal = 0;
    let indexTotal = 0;
    for (const g of geometries) {
        const count = g.attributes.position.count;
        vertexTotal += count;
        indexTotal += g.index ? g.index.count : count;
    }

    const merged = new THREE.BufferGeometry();

    for (const name of names) {
        const itemSize = geometries[0].attributes[name].itemSize;
        const array = new Float32Array(vertexTotal * itemSize);
        let offset = 0;
        for (const g of geometries) {
            const attr = g.attributes[name];
            if (!attr || attr.itemSize !== itemSize) return null;
            const src = attr.array;
            const usable = Math.min(src.length, attr.count * itemSize);
            array.set(src.subarray(0, usable), offset);
            offset += attr.count * itemSize;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }

    const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
    let vertexOffset = 0;
    let indexOffset = 0;

    for (const g of geometries) {
        const count = g.attributes.position.count;
        if (g.index) {
            for (let i = 0; i < g.index.count; i++) {
                indices[indexOffset++] = g.index.getX(i) + vertexOffset;
            }
        } else {
            for (let i = 0; i < count; i++) {
                indices[indexOffset++] = i + vertexOffset;
            }
        }
        vertexOffset += count;
    }

    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    merged.computeBoundingSphere();
    return merged;
}

function bakeColor(geometry, color) {
    const count = geometry.attributes.position.count;
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        array[i * 3] = color.r;
        array[i * 3 + 1] = color.g;
        array[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(array, 3));
}


function mergeable(mesh) {
    return (
        !!mesh &&
        mesh.isMesh === true &&
        mesh.visible !== false &&
        !mesh.isInstancedMesh &&
        !!mesh.geometry &&
        !!mesh.material &&
        !Array.isArray(mesh.material) &&
        mesh.material.transparent !== true &&   // الشفاف يُرسم في ممر آخر
        mesh.userData?.noMerge !== true &&
        mesh.children.length === 0            // أبٌ لأجزاء متحركة ⇒ يُترك وشأنه
    );
}

/**
 * يدمج قائمة meshes (تشترك في نفس الأب) في mesh واحد.
 * @param {THREE.Mesh[]} meshes
 * @param {object} [options]
 * @param {boolean} [options.vertexColors=true] اخبز لون كل مادة في الرؤوس
 * @param {string}  [options.name]
 * @returns {{merged:boolean, before:number, after:number, reverted?:boolean}}
 */
export function mergeMeshes(meshes, { vertexColors = true, name = 'merged' } = {}) {
    const list = (meshes || []).filter(mergeable);
    const before = list.length;
    if (before < 2) return { merged: false, before, after: before };

    const parent = list[0].parent;
    if (!parent) return { merged: false, before, after: before };
    if (list.some((m) => m.parent !== parent)) {
        return { merged: false, before, after: before };
    }

    // نُحدّث مصفوفات العالم أولًا: القياسان (قبل/بعد) يجب أن يكونا في
    // نفس الإطار، وإلا اختلف مركز الصندوق وتراجع الدمج بلا سبب.
    parent.updateWorldMatrix(true, true);
    // precise=true: صندوق مضغوط من الرؤوس الفعلية (بدونه يُضخّم الصندوق
    // بتدوير AABB للهندسة فيظهر الدمج الصحيح وكأنه خطأ)
    _boxBefore.setFromObject(parent, true);

    const geometries = [];
    let castShadow = false;
    let receiveShadow = false;

    for (const mesh of list) {
        const geo = mesh.geometry.clone();
        mesh.updateMatrix();
        geo.applyMatrix4(mesh.matrix);

        if (vertexColors) {
            bakeColor(geo, mesh.material.color || new THREE.Color(0xffffff));
        } else if (geometries.length && !!geometries[0].attributes.uv !== !!geo.attributes.uv) {
            return { merged: false, before, after: before };
        }

        geometries.push(geo);
        castShadow = castShadow || !!mesh.castShadow;
        receiveShadow = receiveShadow || !!mesh.receiveShadow;
    }

    const merged = mergeGeometriesLite(geometries);
    if (!merged) return { merged: false, before, after: before };

    const material = list[0].material.clone();
    if (vertexColors) {
        material.vertexColors = true;
        material.color = new THREE.Color(0xffffff);
    }

    const result = new THREE.Mesh(merged, material);
    result.name = name;
    result.castShadow = castShadow;
    result.receiveShadow = receiveShadow;
    result.userData.mergedFrom = before;

    for (const mesh of list) parent.remove(mesh);
    parent.add(result);

    _boxAfter.setFromObject(parent, true);
    if (!sameBox(_boxBefore, _boxAfter)) {
        // تراجع كامل — الشكل أهم من عدد النداءات
        parent.remove(result);
        for (const mesh of list) parent.add(mesh);
        return { merged: false, before, after: before, reverted: true };
    }

    return { merged: true, before, after: 1 };
}

/**
 * يدمج أبناء `parent` المباشرين من نوع Mesh.
 * المجموعات (Groups) تبقى كما هي، لذلك أي جزء متحرك داخل Group لا يتأثر.
 */
export function mergeGroupChildren(parent, options = {}) {
    if (!parent) return { merged: false, before: 0, after: 0 };
    const meshes = parent.children.filter((c) => mergeable(c));
    return mergeMeshes(meshes, options);
}

/**
 * دمج كل عقدة ساكنة في الشجرة (Groups وMeshes على حد سواء).
 * ------------------------------------------------------------
 * mergeDeep يدمج داخل المجموعات فقط، فتبقى الأجزاء المعلقة على
 * Mesh (مثل تفاصيل الرأس على مجسم الرأس) كنداءات رسم منفصلة.
 * هذه الدالة تمر على كل عقدة لها ≥2 ابن قابل للدمج وتدمجهم.
 *
 * الأجزاء المتحركة تُستثنى تلقائيًا (children.length > 0 أو
 * userData.noMerge أو مواد شفافة)، والمحاور (pivots) تبقى كما هي.
 *
 * @returns {{nodes:number, before:number, after:number}}
 */
export function mergeAllStatic(root, { vertexColors = true, name = '' } = {}) {
    if (!root) return { nodes: 0, before: 0, after: 0 };

    // لقطة مسبقة: الدمج يغيّر قائمة الأبناء أثناء المرور
    const nodes = [];
    root.traverse((o) => nodes.push(o));

    let before = 0;
    let after = 0;
    let touched = 0;

    for (const node of nodes) {
        const candidates = node.children.filter(mergeable);
        if (candidates.length < 2) continue;

        const res = mergeMeshes(candidates, {
            vertexColors,
            name: name || `${root.name || 'node'}-${touched}`
        });
        if (res.merged) {
            before += res.before;
            after += res.after;
            touched += 1;
        }
    }

    return { nodes: touched, before, after };
}

/*
 * دمج شجرة كاملة في mesh واحد — للأجزاء التي تتحرك ككل
 * (مثل دوار الطاحونة): تُخبز تحويلات كل mesh بالنسبة إلى الجذر،
 * فيبقى الجذر وحده هو المتحرك.
 */
export function mergeSubtree(root, { vertexColors = true, name = '' } = {}) {
    if (!root) return { merged: false, before: 0, after: 0 };

    root.updateWorldMatrix(true, true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const list = [];
    root.traverse((o) => {
        if (o === root || !mergeable(o)) return;
        if (o.children.length > 0) return; // أبٌ لشيء آخر
        list.push(o);
    });
    const before = list.length;
    if (before < 2) return { merged: false, before, after: before };

    const origins = list.map((m) => m.parent);
    const geometries = [];
    let castShadow = false;
    let receiveShadow = false;

    for (const mesh of list) {
        const world = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(world);
        if (vertexColors) {
            bakeColor(geo, mesh.material.color || new THREE.Color(0xffffff));
        }
        geometries.push(geo);
        castShadow = castShadow || !!mesh.castShadow;
        receiveShadow = receiveShadow || !!mesh.receiveShadow;
    }

    const merged = mergeGeometriesLite(geometries);
    if (!merged) return { merged: false, before, after: before };

    const material = list[0].material.clone();
    if (vertexColors) {
        material.vertexColors = true;
        material.color = new THREE.Color(0xffffff);
    }

    const result = new THREE.Mesh(merged, material);
    result.name = name || `${root.name || 'subtree'}-merged`;
    result.castShadow = castShadow;
    result.receiveShadow = receiveShadow;
    result.userData.mergedFrom = before;

    root.updateWorldMatrix(true, true);
    _boxBefore.setFromObject(root, true);
    for (const mesh of list) mesh.parent.remove(mesh);
    root.add(result);
    _boxAfter.setFromObject(root, true);
    if (!sameBox(_boxBefore, _boxAfter)) {
        root.remove(result);
        list.forEach((mesh, i) => origins[i].add(mesh));
        return { merged: false, before, after: before, reverted: true };
    }

    return { merged: true, before, after: 1 };
}

/**
 * يدمج داخل كل مجموعة تحت `root` (لا يلمس root نفسه).
 */
export function mergeDeep(root, options = {}) {
    if (!root) return { groups: 0, before: 0, after: 0 };

    const groups = [];
    root.traverse((node) => {
        if (node !== root && (node.isGroup || node.isObject3D) && !node.isMesh) groups.push(node);
    });

    let before = 0;
    let after = 0;
    let touched = 0;

    for (const group of groups) {
        const opts = { ...options, name: `${options.name || root.name || 'rig'}-${group.name || touched}` };
        const res = mergeGroupChildren(group, opts);
        if (res.merged) {
            before += res.before;
            after += res.after;
            touched += 1;
        }
    }

    return { groups: touched, before, after };
}

export default mergeMeshes;
