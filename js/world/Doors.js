/**
 * ============================================================
 * Doors.js — Interactive hinged doors
 * ============================================================
 * A door is a mesh parented to a hinge pivot. Toggling eases
 * the pivot toward an open angle and disables its AABB so the
 * player can walk through the doorway.
 * ============================================================
 */

import * as THREE from 'three';

const _world = new THREE.Vector3();

export class InteractiveDoor {
    constructor({
        parent,
        hinge,
        size,
        material,
        openAngle = -Math.PI * 0.82,
        id = 'door',
        label = 'باب',
        collider = null,
        interactOffset = { x: 0, y: 0, z: 0.55 }
    } = {}) {
        this.id = id;
        this.label = label;
        this.open = false;
        this.angle = 0;
        this.targetAngle = 0;
        this.openAngle = openAngle;
        this.speed = 4.2;
        this.collider = collider;
        this.interactOffset = interactOffset;

        this.pivot = new THREE.Group();
        this.pivot.name = id;
        this.pivot.position.set(hinge.x, hinge.y, hinge.z);
        parent.add(this.pivot);

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size.w, size.h, size.d),
            material
        );
        mesh.position.set(size.w * 0.5, size.h * 0.5, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.interactiveDoor = this;
        this.pivot.add(mesh);
        this.mesh = mesh;

        const handleMat = new THREE.MeshStandardMaterial({
            color: 0xd4b15a,
            metalness: 0.65,
            roughness: 0.35
        });
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), handleMat);
        handle.position.set(size.w - 0.22, size.h * 0.5, size.d * 0.55 + 0.04);
        this.pivot.add(handle);
        this.handle = handle;
    }

    toggle() {
        this.open = !this.open;
        this.targetAngle = this.open ? this.openAngle : 0;
        return this.open;
    }

    setOpen(open) {
        this.open = !!open;
        this.targetAngle = this.open ? this.openAngle : 0;
    }

    update(delta) {
        const diff = this.targetAngle - this.angle;
        if (Math.abs(diff) > 0.0008) {
            const step = Math.sign(diff) * Math.min(Math.abs(diff), this.speed * delta);
            this.angle += step;
            this.pivot.rotation.y = this.angle;
        } else {
            this.angle = this.targetAngle;
            this.pivot.rotation.y = this.angle;
        }

        if (this.collider) {
            this.collider.solid = Math.abs(this.angle) < 0.38;
        }
    }

    getInteractPoint(target = _world) {
        this.pivot.getWorldPosition(target);
        target.x += this.interactOffset.x;
        target.y += this.interactOffset.y;
        target.z += this.interactOffset.z;
        return target;
    }

    distanceTo(position) {
        this.getInteractPoint(_world);
        const dx = position.x - _world.x;
        const dz = position.z - _world.z;
        return Math.hypot(dx, dz);
    }
}

export default InteractiveDoor;
