// All schematic pipes: one NODES map, edges only connect named nodes.

/** @type {Record<string, { x: number, y: number }>} */
export const NODES = {
  // Tank ports — fresh = center top, return = left top (no shared riser)
  tankAFeed: { x: 160, y: 280 },
  tankBFeed: { x: 320, y: 280 },
  tankCFeed: { x: 480, y: 280 },
  fillATank: { x: 160, y: 100 },
  fillBTank: { x: 320, y: 100 },
  fillCTank: { x: 480, y: 100 },
  retATank: { x: 110, y: 100 },
  retBTank: { x: 270, y: 100 },
  retCTank: { x: 430, y: 100 },

  feedAValve: { x: 160, y: 320 },
  feedBValve: { x: 320, y: 320 },
  feedCValve: { x: 480, y: 320 },
  feedAJunc: { x: 160, y: 370 },
  feedCJunc: { x: 480, y: 370 },
  feedJunc: { x: 320, y: 370 },

  pumpCenter: { x: 320, y: 435 },
  pumpIn: { x: 320, y: 410 },
  /** Below pump casing (r=24 at y=435); extra gap before manifold drop */
  pumpOut: { x: 320, y: 478 },

  gaugeTap: { x: 445, y: 478 },
  gaugePort: { x: 445, y: 444 },
  gaugeCenter: { x: 445, y: 425 },

  expTankTap: { x: 560, y: 478 },
  expTankPort: { x: 560, y: 430 },

  /** Irrigation header (zone taps) — drops from pump outlet tee. */
  pumpJunc: { x: 320, y: 512 },
  /** West end of pump outlet header (same y as gauge / expansion). */
  recircW: { x: 60, y: 478 },
  recircNW: { x: 60, y: 58 },
  /** Return header (y=58); stub drops to valve before tank connection. */
  retA: { x: 110, y: 58 },
  retB: { x: 270, y: 58 },
  retC: { x: 430, y: 58 },

  retAValveTop: { x: 110, y: 70 },
  retAValveBot: { x: 110, y: 86 },
  retBValveTop: { x: 270, y: 70 },
  retBValveBot: { x: 270, y: 86 },
  retCValveTop: { x: 430, y: 70 },
  retCValveBot: { x: 430, y: 86 },

  freshW: { x: 60, y: 4 },
  fillA: { x: 160, y: 4 },
  fillB: { x: 320, y: 4 },
  fillC: { x: 480, y: 4 },

  fillAValveTop: { x: 160, y: 26 },
  fillAValveBot: { x: 160, y: 50 },
  fillBValveTop: { x: 320, y: 26 },
  fillBValveBot: { x: 320, y: 50 },
  fillCValveTop: { x: 480, y: 26 },
  fillCValveBot: { x: 480, y: 50 },

  /** Four zones centered under tanks A/B/C (160–480); 70px header spacing */
  water1Hdr: { x: 215, y: 512 },
  water2Hdr: { x: 285, y: 512 },
  water3Hdr: { x: 355, y: 512 },
  water4Hdr: { x: 425, y: 512 },
  water1ValveTop: { x: 215, y: 527 },
  water1ValveBot: { x: 215, y: 543 },
  water2ValveTop: { x: 285, y: 527 },
  water2ValveBot: { x: 285, y: 543 },
  water3ValveTop: { x: 355, y: 527 },
  water3ValveBot: { x: 355, y: 543 },
  water4ValveTop: { x: 425, y: 527 },
  water4ValveBot: { x: 425, y: 543 },
  /** Pipe drop ends here — sprinkler mounts on this node. */
  water1Zone: { x: 215, y: 548 },
  water2Zone: { x: 285, y: 548 },
  water3Zone: { x: 355, y: 548 },
  water4Zone: { x: 425, y: 548 }
};

/** Pot origin below sprinkler — clears max growth (1.5×) from stem base y=15, top y=-32. */
const SPRINKLER_BOTTOM_Y = 6;
const PLANT_STEM_Y = 15;
const PLANT_TOP_Y = -32;
const MAX_PLANT_SCALE = 1.5;
const PLANT_CLEARANCE = 14;
export const ZONE_PLANT_OFFSET_Y =
  SPRINKLER_BOTTOM_Y +
  PLANT_CLEARANCE +
  MAX_PLANT_SCALE * (PLANT_STEM_Y - PLANT_TOP_Y) -
  PLANT_STEM_Y;

/** Tight viewBox around tanks, plumbing, gauge, expansion tank, and plant stacks. */
const SCHEMATIC_PAD = 24;
const TANK_BOUNDS = { minX: 95, maxX: 545, minY: 95, maxY: 285 };
const EXPANSION_HALF_W = 28;
const PLANT_UI_BOTTOM = 62;
const PLANT_FOLIAGE_TOP = MAX_PLANT_SCALE * (PLANT_STEM_Y - PLANT_TOP_Y) + PLANT_STEM_Y;

export function getSchematicViewBox() {
  const xs = Object.values(NODES).map((n) => n.x);
  const ys = Object.values(NODES).map((n) => n.y);
  const plantMaxY = Math.max(
    ...[1, 2, 3, 4].map((z) => NODES[`water${z}Zone`].y + ZONE_PLANT_OFFSET_Y + PLANT_UI_BOTTOM)
  );
  const minX = Math.min(...xs, TANK_BOUNDS.minX) - SCHEMATIC_PAD;
  const maxX = Math.max(...xs, TANK_BOUNDS.maxX, NODES.expTankPort.x + EXPANSION_HALF_W) + SCHEMATIC_PAD;
  const minY = Math.min(...ys, TANK_BOUNDS.minY, NODES.expTankPort.y - 75) - SCHEMATIC_PAD;
  const maxY = Math.max(...ys, TANK_BOUNDS.maxY, plantMaxY) + SCHEMATIC_PAD;
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY)
  };
}

export const SCHEMATIC_VIEW_BOX = getSchematicViewBox();
export const VIEW_W = SCHEMATIC_VIEW_BOX.width;
export const VIEW_H = SCHEMATIC_VIEW_BOX.height;

const ZONE_GROUPS = [
  { groupId: 'zone-1-group', pipeEnd: 'water1Zone' },
  { groupId: 'zone-2-group', pipeEnd: 'water2Zone' },
  { groupId: 'zone-3-group', pipeEnd: 'water3Zone' },
  { groupId: 'zone-4-group', pipeEnd: 'water4Zone' }
];

/** @typedef {{ from: string, to: string, layer?: string }} Edge */

/** @type {Edge[]} */
const FEED_EDGES = [
  { from: 'tankAFeed', to: 'feedAValve', layer: 'feed' },
  { from: 'feedAValve', to: 'feedAJunc', layer: 'feed' },
  { from: 'feedAJunc', to: 'feedJunc', layer: 'feed' },
  { from: 'tankBFeed', to: 'feedBValve', layer: 'feed' },
  { from: 'feedBValve', to: 'feedJunc', layer: 'feed' },
  { from: 'tankCFeed', to: 'feedCValve', layer: 'feed' },
  { from: 'feedCValve', to: 'feedCJunc', layer: 'feed' },
  { from: 'feedCJunc', to: 'feedJunc', layer: 'feed' },
  { from: 'feedJunc', to: 'pumpIn', layer: 'feed' },
  { from: 'pumpIn', to: 'pumpOut', layer: 'feed' },
  /** Shared pressurized header — same layer as gauge/expansion branch */
  { from: 'pumpOut', to: 'pumpJunc', layer: 'feed' },
  { from: 'pumpOut', to: 'recircW', layer: 'feed' }
];

/** Irrigation header only (zone taps west + east of pump tee). */
const MANIFOLD_IRRIG_D =
  'M 215 512 L 285 512 L 320 512 L 355 512 L 425 512';

/** West leg of pump outlet header (y=478, same as gauge/expansion). */
const MANIFOLD_RECIRC_W_D = 'M 60 478 L 320 478';

/** @type {Edge[]} */
const EXPANSION_EDGES = [
  { from: 'pumpOut', to: 'gaugeTap', layer: 'feed' },
  { from: 'gaugeTap', to: 'expTankTap', layer: 'feed' },
  { from: 'gaugeTap', to: 'gaugePort', layer: 'feed' },
  { from: 'expTankTap', to: 'expTankPort', layer: 'feed' }
];

/** West riser only; return header segments are line edges + fluid paths. */
const RECIRC_TRUNK_D = 'M 60 478 L 60 58';

/** @type {Edge[]} */
const RECIRC_EDGES = [
  { from: 'recircW', to: 'recircNW', layer: 'recirc' },
  { from: 'recircNW', to: 'retA', layer: 'recirc' },
  { from: 'retA', to: 'retB', layer: 'recirc' },
  { from: 'retB', to: 'retC', layer: 'recirc' },
  { from: 'retA', to: 'retAValveTop', layer: 'recirc' },
  { from: 'retAValveBot', to: 'retATank', layer: 'recirc' },
  { from: 'retB', to: 'retBValveTop', layer: 'recirc' },
  { from: 'retBValveBot', to: 'retBTank', layer: 'recirc' },
  { from: 'retC', to: 'retCValveTop', layer: 'recirc' },
  { from: 'retCValveBot', to: 'retCTank', layer: 'recirc' }
];

/** @type {Edge[]} */
const FRESH_EDGES = [
  { from: 'freshW', to: 'fillA', layer: 'fresh' },
  { from: 'fillA', to: 'fillB', layer: 'fresh' },
  { from: 'fillB', to: 'fillC', layer: 'fresh' },
  { from: 'fillA', to: 'fillAValveTop', layer: 'fresh' },
  { from: 'fillAValveBot', to: 'fillATank', layer: 'fresh' },
  { from: 'fillB', to: 'fillBValveTop', layer: 'fresh' },
  { from: 'fillBValveBot', to: 'fillBTank', layer: 'fresh' },
  { from: 'fillC', to: 'fillCValveTop', layer: 'fresh' },
  { from: 'fillCValveBot', to: 'fillCTank', layer: 'fresh' }
];

/** Zone drops only — horizontal run is MANIFOLD_IRRIG_D. */
/** @type {Edge[]} */
const WATER_EDGES = [
  { from: 'water1Hdr', to: 'water1ValveTop', layer: 'water' },
  { from: 'water1ValveTop', to: 'water1ValveBot', layer: 'water' },
  { from: 'water1ValveBot', to: 'water1Zone', layer: 'water' },
  { from: 'water2Hdr', to: 'water2ValveTop', layer: 'water' },
  { from: 'water2ValveTop', to: 'water2ValveBot', layer: 'water' },
  { from: 'water2ValveBot', to: 'water2Zone', layer: 'water' },
  { from: 'water3Hdr', to: 'water3ValveTop', layer: 'water' },
  { from: 'water3ValveTop', to: 'water3ValveBot', layer: 'water' },
  { from: 'water3ValveBot', to: 'water3Zone', layer: 'water' },
  { from: 'water4Hdr', to: 'water4ValveTop', layer: 'water' },
  { from: 'water4ValveTop', to: 'water4ValveBot', layer: 'water' },
  { from: 'water4ValveBot', to: 'water4Zone', layer: 'water' }
];

const ALL_LINE_EDGES = [...FEED_EDGES, ...EXPANSION_EDGES, ...RECIRC_EDGES, ...FRESH_EDGES, ...WATER_EDGES];

/** @type {{ id: string, layer: 'recirc' | 'fresh' | 'feed' | 'water', nodes?: string[], d?: string }[]} */
const FLUID_PATHS = [
  { id: 'fluid-feed-port-a', layer: 'feed', nodes: ['tankAFeed', 'feedAValve'] },
  { id: 'fluid-feed-port-b', layer: 'feed', nodes: ['tankBFeed', 'feedBValve'] },
  { id: 'fluid-feed-port-c', layer: 'feed', nodes: ['tankCFeed', 'feedCValve'] },
  { id: 'fluid-feed-a', layer: 'feed', nodes: ['feedAValve', 'feedAJunc', 'feedJunc'] },
  { id: 'fluid-feed-b', layer: 'feed', nodes: ['feedBValve', 'feedJunc'] },
  { id: 'fluid-feed-c', layer: 'feed', nodes: ['feedCValve', 'feedCJunc', 'feedJunc'] },
  { id: 'fluid-pump-intake', layer: 'feed', nodes: ['feedJunc', 'pumpIn'] },
  { id: 'fluid-pump-discharge', layer: 'feed', nodes: ['pumpIn', 'pumpOut'] },
  { id: 'fluid-pump-drop', layer: 'feed', nodes: ['pumpOut', 'pumpJunc'] },
  { id: 'fluid-mani-recirc-bus', layer: 'recirc', nodes: ['pumpOut', 'recircW'] },
  /** Pump tee at 320 — west toward zone 2, then zone 1 only if valve 1 open. */
  { id: 'fluid-mani-west-trunk', layer: 'water', nodes: ['pumpJunc', 'water2Hdr'] },
  { id: 'fluid-mani-west-ext', layer: 'water', nodes: ['water2Hdr', 'water1Hdr'] },
  /** East toward zone 3, then zone 4 only if valve 4 open. */
  { id: 'fluid-mani-east-trunk', layer: 'water', nodes: ['pumpJunc', 'water3Hdr'] },
  { id: 'fluid-mani-east-ext', layer: 'water', nodes: ['water3Hdr', 'water4Hdr'] },
  {
    id: 'fluid-expansion-line',
    layer: 'feed',
    nodes: ['pumpOut', 'gaugeTap', 'expTankTap', 'expTankPort']
  },
  { id: 'fluid-recirc-rise', layer: 'recirc', nodes: ['recircW', 'recircNW'] },
  { id: 'fluid-recirc-header-entry', layer: 'recirc', nodes: ['recircNW', 'retA'] },
  { id: 'fluid-recirc-hdr-a', layer: 'recirc', nodes: ['retA', 'retB'] },
  { id: 'fluid-recirc-hdr-b', layer: 'recirc', nodes: ['retB', 'retC'] },
  {
    id: 'fluid-recirc-port-a',
    layer: 'recirc',
    nodes: ['retAValveTop', 'retAValveBot', 'retATank']
  },
  {
    id: 'fluid-recirc-stub-a',
    layer: 'recirc',
    nodes: ['retA', 'retAValveTop']
  },
  {
    id: 'fluid-recirc-port-b',
    layer: 'recirc',
    nodes: ['retBValveTop', 'retBValveBot', 'retBTank']
  },
  {
    id: 'fluid-recirc-stub-b',
    layer: 'recirc',
    nodes: ['retB', 'retBValveTop']
  },
  {
    id: 'fluid-recirc-port-c',
    layer: 'recirc',
    nodes: ['retCValveTop', 'retCValveBot', 'retCTank']
  },
  {
    id: 'fluid-recirc-stub-c',
    layer: 'recirc',
    nodes: ['retC', 'retCValveTop']
  },
  { id: 'fluid-fresh-trunk', layer: 'fresh', nodes: ['freshW', 'fillA'] },
  { id: 'fluid-fresh-hdr-b', layer: 'fresh', nodes: ['fillA', 'fillB'] },
  { id: 'fluid-fresh-hdr-c', layer: 'fresh', nodes: ['fillB', 'fillC'] },
  {
    id: 'fluid-fresh-drop-a',
    layer: 'fresh',
    nodes: ['fillA', 'fillAValveTop', 'fillAValveBot', 'fillATank']
  },
  {
    id: 'fluid-fresh-drop-b',
    layer: 'fresh',
    nodes: ['fillB', 'fillBValveTop', 'fillBValveBot', 'fillBTank']
  },
  {
    id: 'fluid-fresh-drop-c',
    layer: 'fresh',
    nodes: ['fillC', 'fillCValveTop', 'fillCValveBot', 'fillCTank']
  },
  {
    id: 'fluid-water-zone-1',
    layer: 'water',
    nodes: ['water1Hdr', 'water1ValveTop', 'water1ValveBot', 'water1Zone']
  },
  {
    id: 'fluid-water-zone-2',
    layer: 'water',
    nodes: ['water2Hdr', 'water2ValveTop', 'water2ValveBot', 'water2Zone']
  },
  {
    id: 'fluid-water-zone-3',
    layer: 'water',
    nodes: ['water3Hdr', 'water3ValveTop', 'water3ValveBot', 'water3Zone']
  },
  {
    id: 'fluid-water-zone-4',
    layer: 'water',
    nodes: ['water4Hdr', 'water4ValveTop', 'water4ValveBot', 'water4Zone']
  }
];

/** @type {{ id: string, node: string, kind: 'fresh' | 'return', label: string }[]} */
export const TOP_VALVES = [
  { id: 'svg-valve-fresh-a', node: 'fillA', valveTop: 'fillAValveTop', valveBot: 'fillAValveBot', kind: 'fresh', label: 'Freshwater Fill Valve A' },
  { id: 'svg-valve-fresh-b', node: 'fillB', valveTop: 'fillBValveTop', valveBot: 'fillBValveBot', kind: 'fresh', label: 'Freshwater Fill Valve B' },
  { id: 'svg-valve-fresh-c', node: 'fillC', valveTop: 'fillCValveTop', valveBot: 'fillCValveBot', kind: 'fresh', label: 'Freshwater Fill Valve C' },
  { id: 'svg-valve-return-a', node: 'retA', valveTop: 'retAValveTop', valveBot: 'retAValveBot', kind: 'return', label: 'Return Valve A' },
  { id: 'svg-valve-return-b', node: 'retB', valveTop: 'retBValveTop', valveBot: 'retBValveBot', kind: 'return', label: 'Return Valve B' },
  { id: 'svg-valve-return-c', node: 'retC', valveTop: 'retCValveTop', valveBot: 'retCValveBot', kind: 'return', label: 'Return Valve C' }
];

const HARDWARE_POSITIONS = [
  { id: 'svg-valve-feed-a', node: 'feedAValve' },
  { id: 'svg-valve-feed-b', node: 'feedBValve' },
  { id: 'svg-valve-feed-c', node: 'feedCValve' },
  { id: 'svg-pump', node: 'pumpCenter' },
  { id: 'svg-pressure-gauge', node: 'gaugeCenter' },
  { id: 'svg-expansion-tank', node: 'expTankPort' },
  { id: 'svg-valve-water-1', valveTop: 'water1ValveTop', valveBot: 'water1ValveBot' },
  { id: 'svg-valve-water-2', valveTop: 'water2ValveTop', valveBot: 'water2ValveBot' },
  { id: 'svg-valve-water-3', valveTop: 'water3ValveTop', valveBot: 'water3ValveBot' },
  { id: 'svg-valve-water-4', valveTop: 'water4ValveTop', valveBot: 'water4ValveBot' }
];

function edgeKey(from, to) {
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

function appendLine(parent, fromKey, toKey, className) {
  const a = NODES[fromKey];
  const b = NODES[toKey];
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(a.x));
  line.setAttribute('y1', String(a.y));
  line.setAttribute('x2', String(b.x));
  line.setAttribute('y2', String(b.y));
  line.setAttribute('class', className);
  parent.appendChild(line);
}

function appendBgPath(parent, d, className) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  parent.appendChild(path);
}

function pathD(nodeKeys) {
  const pts = nodeKeys.map((k) => NODES[k]);
  if (pts.length < 2) return '';
  return `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('');
}

function appendPath(parent, d, className, id) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  if (id) path.setAttribute('id', id);
  parent.appendChild(path);
}

function renderLineEdges(parent, edges) {
  const drawn = new Set();
  edges.forEach(({ from, to, layer }) => {
    const key = edgeKey(from, to);
    if (drawn.has(key)) return;
    drawn.add(key);
    const layerClass =
      layer === 'fresh' ? 'pipe-fresh-bg' : layer === 'recirc' ? 'pipe-recirc-bg' : '';
    appendLine(parent, from, to, `pipe-bg ${layerClass}`.trim());
  });
}

function renderValve(parent, { id, valveTop, valveBot, kind, label }) {
  const a = NODES[valveTop];
  const b = NODES[valveBot];
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;

  const isVertical = Math.abs(a.x - b.x) < 1;
  const axisClass = isVertical ? 'valve-vertical' : 'valve-horizontal';

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', `valve-body ${axisClass}`);
  g.setAttribute('id', id);
  g.setAttribute('transform', `translate(${x}, ${y})`);
  g.setAttribute('data-tooltip', label);
  const handle = isVertical
    ? '<line class="valve-handle" x1="-8" y1="0" x2="8" y2="0" />'
    : '<line class="valve-handle" x1="0" y1="-8" x2="0" y2="8" />';

  g.innerHTML = `
    <path d="M -12 -8 L 12 8 L 12 -8 L -12 8 Z" fill="#374151" stroke="#4b5563" stroke-width="1.5" />
    <circle class="valve-circle" r="8" cx="0" cy="0" />
    ${handle}
  `;
  parent.appendChild(g);
}

function positionHardware() {
  HARDWARE_POSITIONS.forEach((entry) => {
    const el = document.getElementById(entry.id);
    if (!el) return;
    if (entry.valveTop && entry.valveBot) {
      const a = NODES[entry.valveTop];
      const b = NODES[entry.valveBot];
      el.setAttribute('transform', `translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`);
      return;
    }
    const { x, y } = NODES[entry.node];
    el.setAttribute('transform', `translate(${x}, ${y})`);
  });
}

/** Zone groups sit on pipe-end nodes; sprinkler at origin, plant offset below. */
function positionZoneGroups() {
  ZONE_GROUPS.forEach(({ groupId, pipeEnd }) => {
    const group = document.getElementById(groupId);
    if (!group) return;
    const { x, y } = NODES[pipeEnd];
    group.setAttribute('transform', `translate(${x}, ${y})`);
    const plant = group.querySelector('.zone-plant');
    if (plant) {
      plant.setAttribute('transform', `translate(0, ${ZONE_PLANT_OFFSET_Y})`);
    }
    const sprinkler = group.querySelector('.zone-sprinkler');
    if (sprinkler) {
      sprinkler.setAttribute('transform', 'translate(0, 0)');
    }
  });
}

function fluidClass(layer) {
  if (layer === 'fresh') return 'pipe-fluid pipe-freshwater';
  if (layer === 'recirc') return 'pipe-fluid pipe-recirc';
  if (layer === 'water') return 'pipe-fluid pipe-watering';
  return 'pipe-fluid';
}

export function mountPlumbing() {
  const bg = document.getElementById('plumbing-bg');
  const fluid = document.getElementById('plumbing-fluid');
  const topValves = document.getElementById('top-plumbing-valves');
  if (!bg || !fluid || !topValves) return;

  bg.replaceChildren();
  fluid.replaceChildren();
  topValves.replaceChildren();

  appendBgPath(bg, RECIRC_TRUNK_D, 'pipe-bg pipe-recirc-bg pipe-path');
  appendBgPath(bg, MANIFOLD_RECIRC_W_D, 'pipe-bg pipe-recirc-bg pipe-path');
  appendBgPath(bg, MANIFOLD_IRRIG_D, 'pipe-bg pipe-path');
  renderLineEdges(bg, ALL_LINE_EDGES);

  FLUID_PATHS.forEach(({ id, nodes, layer, d }) => {
    const pathStr = d || (nodes && nodes.length >= 2 ? pathD(nodes) : '');
    if (!pathStr) return;
    appendPath(fluid, pathStr, fluidClass(layer), id);
  });

  TOP_VALVES.forEach((v) => renderValve(topValves, v));
  positionHardware();
  positionZoneGroups();
}

export function mountTopPlumbing() {
  mountPlumbing();
}
