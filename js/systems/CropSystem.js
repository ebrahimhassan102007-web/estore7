/**
 * CropSystem — presentation-independent crop growth helpers.
 * Growth is deliberately timestamp based so it remains correct after a tab
 * is suspended or the application is closed. FarmingSystem owns inventory;
 * this module owns stages and the small visual contract used by renderers.
 */
export const CROP_STAGES = Object.freeze(['sprout', 'vegetative', 'flowering', 'ready']);
export const STAGE_INDEX = Object.freeze({ sprout: 0, vegetative: 1, flowering: 2, ready: 3 });

export function cropProgress(crop, now = Date.now()) {
    if (!crop?.plantedAt) return 0;
    const duration = Math.max(1, Number(crop.growTime || crop.duration || 1));
    const elapsed = Math.max(0, now - crop.plantedAt) / 1000;
    return Math.min(1, elapsed / duration);
}

export function getCropStage(crop, now = Date.now()) {
    if (!crop) return 'empty';
    if (crop.state === 'ready' || crop.readyAt && now >= crop.readyAt) return 'ready';
    const p = cropProgress(crop, now);
    return CROP_STAGES[Math.min(3, Math.floor(p * 4))];
}

export class CropSystem {
    constructor({ now = () => Date.now() } = {}) { this.now = now; }
    stage(crop, now = this.now()) { return getCropStage(crop, now); }
    progress(crop, now = this.now()) { return cropProgress(crop, now); }
    snapshot(crop, now = this.now()) {
        const progress = this.progress(crop, now);
        return { ...crop, progress, stage: this.stage(crop, now), elapsedSeconds: progress * Number(crop?.growTime || 0) };
    }
    /** Applies rain growth without mutating the saved crop record. */
    applyWeather(crop, { rain = false, multiplier = 1.25 } = {}, now = this.now()) {
        if (!rain || !crop?.plantedAt) return this.snapshot(crop, now);
        const duration = Number(crop.growTime || crop.duration || 0);
        const virtualElapsed = (now - crop.plantedAt) * multiplier;
        return this.snapshot({ ...crop, plantedAt: now - virtualElapsed, growTime: duration }, now);
    }
}

export default CropSystem;
