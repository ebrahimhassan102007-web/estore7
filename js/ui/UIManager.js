import HUD from './HUD.js';

/** Presentation facade for the farm HUD. Keeps world/gameplay code independent of DOM details. */
export class UIManager extends HUD {
  constructor(options = {}) {
    super(options);
  }
}

export default UIManager;
