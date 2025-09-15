/**
 * Fire Simulation Demo Scene
 * 
 * Showcases various fire behaviors for testing and demonstration:
 * - Wood structures that burn and spread fire
 * - Oil pools that ignite explosively
 * - Water interactions and extinguishing
 * - Steam generation
 * - Ember waterfalls and particle effects
 */

import { MaterialType } from '../systems/fire_simulation.js';
import { VW, VH } from '../core/constants.js';

/**
 * Demo scene setup for fire simulation
 */
export class FireDemoScene {
  constructor(fireSimulation) {
    this.fireSimulation = fireSimulation;
    this.setupComplete = false;
    this.demoStructures = [];
  }

  /**
   * Setup demo scene with various fire test scenarios
   */
  setupDemo() {
    if (this.setupComplete) return;

    const CELL_SIZE = 2;
    const groundY = Math.floor((VH - 22) / CELL_SIZE);

    // Clear existing structures in demo area
    this.clearDemoArea();

    // Demo Structure 1: Wood cabin (left side)
    this.createWoodCabin(15, groundY - 8);

    // Demo Structure 2: Oil depot (center)
    this.createOilDepot(40, groundY - 4);

    // Demo Structure 3: Mixed materials building (right side)
    this.createMixedBuilding(65, groundY - 6);

    // Add some scattered flammable materials
    this.addScatteredMaterials(groundY);

    // Add water source for testing
    this.createWaterSource(80, groundY - 2);

    this.setupComplete = true;
    console.log('Fire demo scene setup complete!');
  }

  /**
   * Clear demo area
   */
  clearDemoArea() {
    const CELL_SIZE = 2;
    for (let y = 0; y < Math.floor(VH / CELL_SIZE); y++) {
      for (let x = 10; x < Math.floor(VW / CELL_SIZE) - 10; x++) {
        const cell = this.fireSimulation.getCell(x, y);
        if (cell) {
          cell.materialId = MaterialType.AIR;
          cell.temperature = 20;
          cell.fuel = 0;
          cell.burning = false;
          cell.wetness = 0;
          cell.oxygen = 100;
        }
      }
    }
  }

  /**
   * Create a wooden cabin structure
   */
  createWoodCabin(startX, startY) {
    // Floor
    for (let x = 0; x < 12; x++) {
      this.setMaterial(startX + x, startY + 7, MaterialType.WOOD);
    }

    // Walls
    for (let y = 0; y < 7; y++) {
      this.setMaterial(startX, startY + y, MaterialType.WOOD); // Left wall
      this.setMaterial(startX + 11, startY + y, MaterialType.WOOD); // Right wall
    }

    // Roof
    for (let x = 1; x < 11; x++) {
      this.setMaterial(startX + x, startY, MaterialType.WOOD);
    }

    // Add some cloth/fabric inside
    for (let x = 2; x < 5; x++) {
      for (let y = 3; y < 6; y++) {
        this.setMaterial(startX + x, startY + y, MaterialType.CLOTH);
      }
    }

    this.demoStructures.push({
      name: 'Wood Cabin',
      x: startX,
      y: startY,
      description: 'Wooden structure with cloth interior - burns steadily'
    });
  }

  /**
   * Create an oil depot
   */
  createOilDepot(startX, startY) {
    // Oil containers (metal)
    for (let i = 0; i < 3; i++) {
      const x = startX + i * 4;
      // Metal container walls
      for (let dy = 0; dy < 4; dy++) {
        this.setMaterial(x, startY + dy, MaterialType.METAL);
        this.setMaterial(x + 3, startY + dy, MaterialType.METAL);
      }
      for (let dx = 1; dx < 3; dx++) {
        this.setMaterial(x + dx, startY, MaterialType.METAL);
      }
      
      // Oil inside
      for (let dx = 1; dx < 3; dx++) {
        for (let dy = 1; dy < 4; dy++) {
          this.setMaterial(x + dx, startY + dy, MaterialType.OIL);
        }
      }
    }

    this.demoStructures.push({
      name: 'Oil Depot',
      x: startX,
      y: startY,
      description: 'Metal containers with oil - explosive when heated'
    });
  }

  /**
   * Create a mixed materials building
   */
  createMixedBuilding(startX, startY) {
    // Stone foundation
    for (let x = 0; x < 10; x++) {
      this.setMaterial(startX + x, startY + 5, MaterialType.STONE);
    }

    // Wood frame
    for (let y = 0; y < 5; y++) {
      this.setMaterial(startX, startY + y, MaterialType.WOOD);
      this.setMaterial(startX + 9, startY + y, MaterialType.WOOD);
    }
    for (let x = 1; x < 9; x++) {
      this.setMaterial(startX + x, startY, MaterialType.WOOD);
    }

    // Mixed interior materials
    this.setMaterial(startX + 2, startY + 2, MaterialType.CLOTH);
    this.setMaterial(startX + 3, startY + 2, MaterialType.CLOTH);
    this.setMaterial(startX + 6, startY + 3, MaterialType.OIL);
    this.setMaterial(startX + 7, startY + 3, MaterialType.OIL);

    this.demoStructures.push({
      name: 'Mixed Building',
      x: startX,
      y: startY,
      description: 'Stone foundation, wood frame, mixed interior'
    });
  }

  /**
   * Add scattered flammable materials
   */
  addScatteredMaterials(groundY) {
    // Small wood piles
    const woodPiles = [
      { x: 25, y: groundY - 2, size: 2 },
      { x: 55, y: groundY - 1, size: 1 },
      { x: 75, y: groundY - 3, size: 3 }
    ];

    for (const pile of woodPiles) {
      for (let dx = 0; dx < pile.size; dx++) {
        for (let dy = 0; dy < pile.size; dy++) {
          this.setMaterial(pile.x + dx, pile.y + dy, MaterialType.WOOD);
        }
      }
    }

    // Oil spills
    const oilSpills = [
      { x: 35, y: groundY - 1 },
      { x: 50, y: groundY - 1 },
      { x: 70, y: groundY - 1 }
    ];

    for (const spill of oilSpills) {
      for (let dx = 0; dx < 3; dx++) {
        this.setMaterial(spill.x + dx, spill.y, MaterialType.OIL);
      }
    }
  }

  /**
   * Create a water source for testing
   */
  createWaterSource(startX, startY) {
    // Water pool
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 2; y++) {
        this.setMaterial(startX + x, startY + y, MaterialType.WATER);
      }
    }

    this.demoStructures.push({
      name: 'Water Source',
      x: startX,
      y: startY,
      description: 'Water pool for extinguishing fires'
    });
  }

  /**
   * Set material at grid coordinates
   */
  setMaterial(x, y, materialType) {
    const cell = this.fireSimulation.getCell(x, y);
    if (cell) {
      cell.materialId = materialType;
      
      // Set appropriate fuel based on material
      const material = cell.getMaterial();
      cell.fuel = material.fuelAmount;
      cell.temperature = 20; // Ambient
      cell.oxygen = 100;
      cell.burning = false;
      cell.wetness = 0;
      
      this.fireSimulation.markDirty(x, y);
    }
  }

  /**
   * Trigger demo scenarios
   */
  triggerScenario(scenarioName) {
    switch (scenarioName) {
      case 'cabin_fire':
        this.igniteCabin();
        break;
      case 'oil_explosion':
        this.igniteOilDepot();
        break;
      case 'chain_reaction':
        this.triggerChainReaction();
        break;
      case 'water_test':
        this.testWaterExtinguishing();
        break;
      case 'full_demo':
        this.runFullDemo();
        break;
    }
  }

  /**
   * Ignite the wooden cabin
   */
  igniteCabin() {
    // Find the cabin structure
    const cabin = this.demoStructures.find(s => s.name === 'Wood Cabin');
    if (cabin) {
      // Start fire at corner of cabin
      this.fireSimulation.igniteAt((cabin.x + 1) * 2, (cabin.y + 6) * 2, 600, 3);
      console.log('Cabin fire started! Watch it spread through the wood and cloth.');
    }
  }

  /**
   * Ignite the oil depot
   */
  igniteOilDepot() {
    const depot = this.demoStructures.find(s => s.name === 'Oil Depot');
    if (depot) {
      // Ignite oil in first container
      this.fireSimulation.igniteAt((depot.x + 1) * 2, (depot.y + 3) * 2, 800, 2);
      console.log('Oil depot ignited! Expect explosive spread and ember bursts.');
    }
  }

  /**
   * Trigger a chain reaction across all structures
   */
  triggerChainReaction() {
    // Start small fire that should spread across oil spills to other structures
    this.fireSimulation.igniteAt(35 * 2, (Math.floor((VH - 22) / 2) - 1) * 2, 400, 2);
    console.log('Chain reaction started! Fire should spread via oil spills.');
  }

  /**
   * Test water extinguishing
   */
  testWaterExtinguishing() {
    // First ignite something
    this.igniteCabin();
    
    // Then add water near the fire after a delay
    setTimeout(() => {
      const cabin = this.demoStructures.find(s => s.name === 'Wood Cabin');
      if (cabin) {
        this.fireSimulation.addLiquid((cabin.x + 3) * 2, (cabin.y + 4) * 2, MaterialType.WATER, 80, 4);
        console.log('Water added to cabin fire. Observe steam generation and extinguishing.');
      }
    }, 2000);
  }

  /**
   * Run full demonstration sequence
   */
  runFullDemo() {
    console.log('Starting full fire demo sequence...');
    
    // Sequence of events
    setTimeout(() => this.igniteCabin(), 1000);
    setTimeout(() => this.igniteOilDepot(), 3000);
    setTimeout(() => this.triggerChainReaction(), 6000);
    setTimeout(() => this.testWaterExtinguishing(), 9000);
    
    console.log('Full demo sequence initiated. Watch for:');
    console.log('- Wood burning and spreading');
    console.log('- Oil explosive ignition with ember bursts');
    console.log('- Chain reactions via connecting materials');
    console.log('- Water extinguishing and steam generation');
  }

  /**
   * Get demo structure info
   */
  getStructureInfo() {
    return this.demoStructures.map(s => ({
      name: s.name,
      description: s.description,
      position: `(${s.x}, ${s.y})`
    }));
  }

  /**
   * Reset demo scene
   */
  reset() {
    this.setupComplete = false;
    this.demoStructures = [];
    this.setupDemo();
  }
}