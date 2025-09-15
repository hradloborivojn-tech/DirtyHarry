# Cellular Automata Fire System

The Dirty Harry game now features a true cellular automata (CA) fire simulation system that replaces hardcoded animations with emergent behavior based on per-cell material states and local rules.

## Overview

The fire system simulates realistic fire behavior through:
- **Heat diffusion** and thermal conductivity between cells
- **Combustion** with oxygen consumption and fuel depletion
- **Convection** and buoyancy effects (hot gases rise)
- **Fluid dynamics** for liquids and gases
- **Material interactions** (water extinguishes fire, oil spreads, steam generation)

## Architecture

### Core Components

- **`src/sim/materials.js`** - Material database with 12 material types and their physical properties
- **`src/sim/chunk_grid.js`** - Chunked grid system for performance optimization
- **`src/sim/fire_ca.js`** - Main cellular automata engine with simulation phases
- **`src/sim/fluids.js`** - Fluid movement kernels for settling and buoyancy
- **`src/sim/debug_overlay.js`** - Debug visualization system with multiple modes

### Integration

- **`src/systems/fire_integration.js`** - Bridge between CA system and existing Molotov mechanics
- **`src/game.js`** - Main orchestrator updated with CA system integration

## Material Types

The simulation includes 12 distinct materials:

| Material | Properties | Behavior |
|----------|------------|----------|
| **Air** | Low density, doesn't burn | Background medium |
| **Water** | High heat capacity, extinguishes fire | Cools and extinguishes flames, generates steam |
| **Oil** | Flammable, floats on water | Burns readily, spreads on surfaces |
| **Wood** | Moderate flammability | Burns to char, then ash |
| **Stone** | High thermal conductivity | Conducts heat, doesn't burn |
| **Metal** | Excellent heat conductor | Rapid heat transfer |
| **Steam** | Low density, rises quickly | Rises and dissipates, can condense |
| **Smoke** | Light gas, reduces oxygen | Rises and gradually dissipates |
| **Gasoline** | Highly flammable, volatile | Burns very fast, can explode |
| **Fire Gas** | Hot combustion product | Rises rapidly, generates heat |
| **Char** | Slow burning residue | Burns slowly after wood |
| **Ash** | Non-flammable residue | Final combustion product |

## Debug Visualization

### Activating Debug Mode

Press the **backtick (`)** key to toggle debug overlay and cycle through visualization modes:

1. **None** - Normal game view
2. **Temperature** - Heat map showing temperature distribution
3. **Materials** - Color-coded material type view
4. **Burning** - Highlights actively burning cells
5. **Oxygen** - Oxygen level visualization
6. **Density** - Material density view
7. **Fuel** - Remaining fuel visualization

### Debug Information Panel

When active, shows real-time statistics:
- Current visualization mode
- Number of active chunks
- Total simulation updates
- Cells updated per frame
- Combustion events
- Material transformations
- Fluid movements

## Developer API

### Global Console Commands

Access the CA system through `window.__DH.ca`:

```javascript
// Create fire at position
window.__DH.ca.igniteCircle(x, y, radius, materialId);

// Add water (extinguishes fire)
window.__DH.ca.addWaterCircle(x, y, radius, intensity);

// Add oil (fuel for fire)
window.__DH.ca.addOilCircle(x, y, radius, amount);

// Add heat (raises temperature)
window.__DH.ca.addHeatCircle(x, y, radius, deltaT);

// Query system state
window.__DH.ca.queryBurningAt(x, y);           // Check if burning
window.__DH.ca.getDebugInfo();                 // Get system stats

// Debug controls
window.__DH.ca.toggleDebug();                  // Toggle debug overlay
window.__DH.ca.setDebugMode(mode);             // Set specific mode
```

### Example Usage

```javascript
// Create a fire near the player
const player = window.__DH.getPlayer();
window.__DH.ca.igniteCircle(player.x + 50, player.y, 15);

// Extinguish it with water
window.__DH.ca.addWaterCircle(player.x + 50, player.y, 20);

// Add oil and ignite for larger fire
window.__DH.ca.addOilCircle(player.x + 100, player.y, 25);
window.__DH.ca.igniteCircle(player.x + 100, player.y, 10);
```

## Performance

The system is optimized for real-time performance:

- **Chunked Grid**: 32x32 cell chunks, only active chunks are processed
- **Selective Updates**: Chunks automatically activate/deactivate based on activity
- **Frame Budget**: Maximum 50,000 cell updates per frame to maintain 60 FPS
- **Efficient Storage**: Structure of Arrays (SoA) for cache-friendly memory access

## Integration with Gameplay

### Molotov Cocktails

When a molotov shatters:
1. Oil material is deposited in a circular splash pattern
2. Multiple ignition points create organic fire spread
3. Initial heat burst ensures rapid ignition
4. Fire spreads naturally based on CA rules

### Entity Damage

- Damage is calculated by sampling the CA grid under entity AABBs
- Burning cells and high temperatures cause damage over time
- Entities receive burning status when in contact with fire
- Damage is proportional to number of burning cells and average temperature

### Backward Compatibility

The system maintains full backward compatibility:
- Falls back to original FirePatch system if CA is disabled
- Existing burning status effects continue to work
- All public APIs remain unchanged
- Performance impact is minimal when CA is inactive

## Technical Details

### Simulation Phases

Each update cycle processes:

1. **Heat Diffusion** - Thermal conductivity between neighbors with convection bias
2. **Oxygen Diffusion** - Gas mixing and consumption during combustion  
3. **Combustion** - Fuel consumption, heat generation, and product formation
4. **Fluid Movement** - Density-based settling, buoyancy, and pressure equalization
5. **Special Interactions** - Water→steam conversion, material transformations

### Material Properties

Each material defines:
- **Thermal**: conductivity, heat capacity, ignition temperature
- **Combustion**: flammability, burn rate, fuel content
- **Fluid**: density, buoyancy factor, flow properties
- **Interaction**: wetness absorption, extinguish thresholds

### Performance Monitoring

Monitor performance through debug info:
- Aim for <10,000 cells updated per frame for 60 FPS
- Active chunks should remain <20 for optimal performance
- High combustion counts indicate heavy fire simulation load

## Future Enhancements

Potential expansions:
- **Wind Effects** - Directional air currents affecting spread
- **Explosive Materials** - Pressure waves and blast damage
- **Advanced Fluids** - Viscosity and surface tension effects
- **Fire Suppression** - Foam and chemical extinguishers
- **Environmental Factors** - Humidity and weather effects