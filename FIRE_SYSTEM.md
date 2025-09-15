# Dirty Harry - Fire Simulation System v1.1

## Overview

The fire simulation system is a Noita-inspired cellular automata engine that provides realistic fire behavior, material interactions, and visual effects. The system uses a grid-based approach where each cell can contain different materials with unique physical properties.

## Features

### Core Fire Simulation
- **Grid-based cellular automata** (2x2 pixel cells for performance)
- **Material system** with 7+ material types (air, wood, cloth, oil, water, stone, metal)
- **Heat propagation** with conduction and convection
- **Oxygen consumption** affecting burn rates
- **Temperature-based ignition** and extinguishing
- **Two-phase update system** for stability

### Material Properties
Each material has configurable properties:
- `ignitionTemp` - Temperature required to ignite
- `maxTemp` - Maximum temperature the material can reach
- `flammability` - How easily the material catches fire
- `fuelAmount` - How much fuel the material provides
- `burnRate` - How fast the material burns
- `thermalConductivity` - Heat transfer rate
- `heatCapacity` - Heat storage capacity
- `moistureAbsorption` - Water absorption rate
- `smokeYield` - Smoke production when burning
- `lightColor` - Light emission color
- `extinguishThreshold` - Wetness level that stops burning

### Visual Effects
- **Enhanced particle system** with ember waterfalls
- **Heat visualization** with temperature-based colors
- **Light emission** with bloom-like effects
- **Smoke and steam** with realistic physics
- **Multiple render layers** for compositing

### Interactive Features
- **Dynamic material placement** during gameplay
- **Water extinguishing** with steam generation
- **Oil explosive spreading** with ember bursts
- **Chain reactions** across connected materials
- **Real-time parameter tuning** via debug controls

## Controls

### Basic Fire Controls
- `F` - Spawn fire at player location
- `G` - Add water at player location

### Debug Visualization
- `1` - Toggle heat map overlay
- `2` - Toggle grid overlay
- `3` - Toggle oxygen visualization
- `4` - Toggle fuel visualization

### Demo Scene Controls
- `5` - Setup demo scene with test structures
- `6` - Ignite wooden cabin
- `7` - Trigger oil depot explosion
- `8` - Start chain reaction
- `9` - Run full demo sequence
- `0` - Reset demo scene

## Architecture

### Fire Simulation (`fire_simulation.js`)
- Main simulation engine with cellular automata
- Material database and properties management
- Heat diffusion with convection bias
- Combustion and state management
- Performance optimizations with dirty regions

### Fire Renderer (`fire_renderer.js`)
- Multi-layer rendering system
- Material visualization with temperature effects
- Debug overlays and visualization modes
- Performance monitoring

### Enhanced Particles (`fire_particles.js`)
- Advanced particle physics for embers, smoke, and steam
- Ember waterfalls with realistic convection
- Curl noise for smoke turbulence
- Steam pressure effects
- Particle pooling for performance

### Demo Scene (`fire_demo.js`)
- Pre-built test scenarios
- Interactive demonstration of fire behaviors
- Structured testing of material interactions

## Configuration

Materials and simulation parameters are configurable via JSON:

```json
{
  "materials": {
    "wood": {
      "ignitionTemp": 300,
      "flammability": 0.7,
      "burnRate": 15,
      "thermalConductivity": 0.1
    }
  },
  "simulation_config": {
    "cell_size": 2,
    "heat_diffusion_rate": 0.3,
    "convection_strength": 0.8,
    "max_particles": 2000
  }
}
```

## Performance

The system is optimized for real-time performance:
- **Grid-based updates** with dirty region tracking
- **Particle pooling** to reduce garbage collection
- **Multi-layer rendering** with offscreen canvases
- **Configurable quality levels** for different hardware

Target performance: 60 FPS with 100k+ active cells on mid-range hardware.

## Integration

The fire system integrates seamlessly with the existing game:
- **Molotov cocktails** can ignite the new fire simulation
- **Entity burning** status effects work with both systems
- **Visual compatibility** with existing game art style
- **Minimal performance impact** on core gameplay

## Demo Scenarios

### Cabin Fire
Watch fire spread through wooden structures and cloth materials, demonstrating:
- Material-to-material fire spreading
- Heat conduction through connected materials
- Smoke generation and particle effects

### Oil Depot Explosion
Explosive ignition of oil materials showcasing:
- Rapid fire spreading in flammable liquids
- Ember burst effects for dramatic visuals
- Chain reactions across multiple containers

### Water Extinguishing
Interactive fire suppression demonstrating:
- Water extinguishing burning materials
- Steam generation from heated water
- Temperature-based state changes

### Chain Reactions
Connected fire spreading across the scene:
- Oil spills connecting distant structures
- Progressive ignition of multiple buildings
- Complex fire behavior patterns

## Technical Notes

### Heat Propagation
- Uses 8-directional diffusion with convection bias
- Upward heat transfer is enhanced for realistic fire behavior
- Temperature gradients create natural fire spreading patterns

### Particle Physics
- Embers have buoyancy in hot air for waterfall effects
- Smoke uses curl noise for realistic turbulence
- Steam expands with pressure for dramatic effects

### Material States
- Dynamic material conversion (water → steam → water)
- Fuel consumption reduces material over time
- Char creation from burnt organic materials

## Future Enhancements

Potential improvements for future versions:
- **Liquid flow physics** for realistic water/oil spreading
- **Wind effects** for directional fire behavior
- **Explosion pressure waves** for more dramatic effects
- **Advanced material reactions** (metal heating, concrete cracking)
- **Sound integration** for audio feedback
- **Multiplayer synchronization** for online play

## Version History

### v1.1 - Noita-like Fire Simulation
- Complete rewrite of fire system using cellular automata
- Enhanced particle effects with ember waterfalls
- Material property database with 7+ materials
- Interactive demo scene with multiple scenarios
- Debug visualization tools
- Performance optimizations for real-time gameplay

### v1.0 - Basic Fire Effects
- Simple fire patches from molotov cocktails
- Basic burning status effects
- Minimal particle effects