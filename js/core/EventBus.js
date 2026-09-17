/**
 * EventBus.js — Central Event System
 * Decoupled communication between all game modules.
 * Supports: on, off, emit, once, clear
 */
export class EventBus {
  constructor() {
    this.events = new Map();
    this.onceEvents = new Map();
  }
  
  /** Subscribe to an event */
  on(event, listener, priority = 0) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    this.events.get(event).push({ listener, priority });
    
    // Sort by priority (higher first)
    this.events.get(event).sort((a, b) => b.priority - a.priority);
    
    return () => this.off(event, listener);
  }
  
  /** Subscribe once */
  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    
    return this.on(event, wrapper);
  }
  
  /** Unsubscribe from an event */
  off(event, listenerToRemove) {
    if (!this.events.has(event)) return;
    
    const listeners = this.events
      .get(event)
      .filter(({ listener }) => listener !== listenerToRemove);
    
    if (listeners.length === 0) {
      this.events.delete(event);
    } else {
      this.events.set(event, listeners);
    }
  }
  
  /** Emit an event synchronously */
  emit(event, ...args) {
    if (this.events.has(event)) {
      for (const { listener } of this.events.get(event)) {
        try {
          listener(...args);
        } catch (err) {
          console.error(
            `[EventBus] Error in listener for "${event}":`,
            err
          );
        }
      }
    }
  }
  
  /** Emit async (non-blocking) */
  emitAsync(event, ...args) {
    setTimeout(() => this.emit(event, ...args), 0);
  }
  
  /** Remove all listeners for an event, or all events */
  clear(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
  
  /** Check if event has listeners */
  hasListeners(event) {
    return (
      this.events.has(event) &&
      this.events.get(event).length > 0
    );
  }
}

// Singleton instance for the entire game
export const Events = new EventBus();