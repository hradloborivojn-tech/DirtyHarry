// Material registry and properties used by both environment grid and entity fire agents.

export const Materials = {
  AIR: 0,
  WATER: 1,
  FUEL: 2,
  SMOKE: 3,
  STEAM: 4,

  // Entity materials
  CLOTH: 10,
  SKIN: 11,
  HAIR: 12,
  BONE: 13,
  GLASS: 14,
  STONE: 15,
};

export const Mat = Materials;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// Properties summary:
// - density (relative), conductivity (0..1), heatCapacity (relative)
// - flammability (0..1), ignitionTemp (K), sustainTemp (K)
// - burnRate (per tick), fuelCapacity (max local fuel storage 0..1), heatRelease
// - smokeYield (fraction), steamYield, volatile (explosion propensity)
// - flags: gas, liquid, solid
export const MaterialProps = {
  [Mat.AIR]: {
    name: 'Air', color: hex('#101015'),
    density: 0.0013, conductivity: 0.02, heatCapacity: 1.0,
    flammability: 0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    volatile: false, gas: true,
  },

  [Mat.WATER]: {
    name: 'Water', color: hex('#3355ff'),
    density: 1.0, conductivity: 0.6, heatCapacity: 4.18,
    flammability: 0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    steamYield: 1.0, liquid: true,
  },

  [Mat.FUEL]: {
    name: 'Fuel', color: hex('#bf6a16'),
    density: 0.8, conductivity: 0.1, heatCapacity: 2.2,
    flammability: 0.95, ignitionTemp: 520, sustainTemp: 470,
    burnRate: 0.02, fuelCapacity: 1.0, heatRelease: 70, smokeYield: 0.4,
    volatile: false, liquid: true,
  },

  [Mat.SMOKE]: {
    name: 'Smoke', color: hex('#333333'),
    density: 0.0009, conductivity: 0.01, heatCapacity: 1.0,
    flammability: 0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    gas: true,
  },

  [Mat.STEAM]: {
    name: 'Steam', color: hex('#aacccc'),
    density: 0.0006, conductivity: 0.03, heatCapacity: 1.9,
    flammability: 0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    gas: true,
  },

  // Entity materials (clothes burn first)
  [Mat.CLOTH]: {
    name: 'Cloth', color: hex('#8a6b3a'),
    density: 0.3, conductivity: 0.05, heatCapacity: 1.4,
    flammability: 0.85, ignitionTemp: 520, sustainTemp: 450,
    burnRate: 0.015, fuelCapacity: 0.35, heatRelease: 25, smokeYield: 0.6,
    solid: true,
  },
  [Mat.HAIR]: {
    name: 'Hair', color: hex('#3b2a1a'),
    density: 0.2, conductivity: 0.04, heatCapacity: 1.2,
    flammability: 0.92, ignitionTemp: 500, sustainTemp: 450,
    burnRate: 0.03, fuelCapacity: 0.18, heatRelease: 15, smokeYield: 0.7,
    solid: true,
  },
  [Mat.SKIN]: {
    name: 'Skin', color: hex('#cfa68a'),
    density: 1.0, conductivity: 0.12, heatCapacity: 3.8,
    flammability: 0.2, ignitionTemp: 820, sustainTemp: 780,
    burnRate: 0.004, fuelCapacity: 0.5, heatRelease: 20, smokeYield: 0.4,
    solid: true,
  },
  [Mat.BONE]: {
    name: 'Bone', color: hex('#d9d2c5'),
    density: 1.9, conductivity: 0.2, heatCapacity: 2.0,
    flammability: 0.0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    solid: true,
  },

  [Mat.GLASS]: {
    name: 'Glass', color: hex('#88aacc'),
    density: 2.5, conductivity: 0.2, heatCapacity: 0.8,
    flammability: 0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    solid: true,
  },
  [Mat.STONE]: {
    name: 'Stone', color: hex('#777777'),
    density: 2.4, conductivity: 0.9, heatCapacity: 0.8,
    flammability: 0, ignitionTemp: Infinity, sustainTemp: Infinity,
    burnRate: 0, fuelCapacity: 0, heatRelease: 0, smokeYield: 0,
    solid: true,
  },
};

// Simple heat-tinted color for debug drawing
export function colorFor(material, tempK, burning) {
  const base = MaterialProps[material]?.color || [255, 0, 255];
  const t = Math.max(0, Math.min(1, (tempK - 293) / 1000));
  const flame = burning ? [255, 140, 40] : [0, 0, 0];
  const mix = burning ? 0.4 : 0.0;
  return [
    Math.min(255, base[0] * (1 - t * 0.2) + flame[0] * mix),
    Math.min(255, base[1] * (1 - t * 0.3) + flame[1] * mix),
    Math.min(255, base[2] * (1 - t * 0.5) + flame[2] * mix),
  ];
}