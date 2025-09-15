/**
 * Player Molotov controller: small state machine + input plumbing.
 *
 * Responsibilities:
 * - Manage states: 'inactive' -> 'preparing' -> 'lit' -> 'charging' -> 'cooldown'
 * - Expose events/callbacks for throw and cancel
 * - Track charge (0..1) based on hold time
 *
 * Integration:
 * - Instantiate per player, pass a config object and callbacks
 * - Call handleInput({equipPressed:boolean, chargeHeld:boolean})
 * - Call update(dt, nowMs), and if it returns an event, handle it
 * - Read current charge via controller.charge for UI bars and trajectory
 *
 * This module is intentionally UI-agnostic; it returns signals only.
 */

/**
 * @typedef {Object} MolotovCtlConfig
 * @property {number} maxChargeTimeMs
 * @property {number} cooldownEquipSec // small cooldown after cancel/equip
 */

export class MolotovController {
  /**
   * @param {MolotovCtlConfig} cfg
   */
  constructor(cfg) {
    this.state = 'inactive';
    this.charge = 0; // 0..1
    this._chargeStartMs = 0;
    this._cooldown = 0; // seconds
    this._equipPressLatched = false;
    this.cfg = cfg;
  }

  /**
   * One-shot buttons like Q should be latched externally and provided here.
   * @param {{equipPressed:boolean, chargeHeld:boolean, inventory:number}} input
   */
  handleInput(input) {
    this._equipPressed = !!input.equipPressed;
    this._chargeHeld = !!input.chargeHeld;
    this._inventory = input.inventory ?? 0;
  }

  /**
   * Advance the state machine. Returns an event when something notable happens.
   * @param {number} dt seconds
   * @param {number} nowMs performance.now()
   * @returns {null | {type:'throw', charge:number} | {type:'cancel'} }
   */
  update(dt, nowMs = performance.now()) {
    if (this._cooldown > 0) this._cooldown -= dt;

    switch (this.state) {
      case 'inactive':
        if (this._equipPressed && this._inventory > 0 && this._cooldown <= 0) {
          this.state = 'preparing';
          this._equipPressLatched = true;
          this._equipStartMs = nowMs;
        }
        break;

      case 'preparing':
        // 250ms prep to "light"
        if (nowMs - this._equipStartMs > 250) {
          this.state = 'lit';
        }
        break;

      case 'lit':
        if (this._chargeHeld) {
          this.state = 'charging';
          this._chargeStartMs = nowMs;
          this.charge = 0;
        } else {
          // Cancel if player never holds charge
          this.state = 'cooldown';
          this._cooldown = this.cfg.cooldownEquipSec ?? 0.5;
          return { type: 'cancel' };
        }
        break;

      case 'charging':
        if (this._chargeHeld) {
          const tMs = nowMs - this._chargeStartMs;
          this.charge = Math.max(0, Math.min(1, tMs / (this.cfg.maxChargeTimeMs ?? 1200)));
        } else {
          // Throw on release
          const power = this.charge;
          this.charge = 0;
          this.state = 'cooldown';
          this._cooldown = 1.0;
          return { type: 'throw', charge: power };
        }
        break;

      case 'cooldown':
        if (this._cooldown <= 0) {
          this.state = 'inactive';
        }
        break;
    }
    return null;
  }
}