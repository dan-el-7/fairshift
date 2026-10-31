export type AmbientColor = readonly [number, number, number];
const ORIGINS = [[0.08, 0.1, 0.25], [0.94, 0.54, 0.28], [0.24, 1.02, 0.27], [0.7, 0.08, 0.22]] as const;

/** Seeded value noise: continuous position and velocity, without repeating a fixed animation path. */
function noise(time: number, seed: number): number {
  const cell = Math.floor(time), fraction = time - cell;
  const random = (index: number) => {
    let value = Math.imul(index ^ seed, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const blend = fraction * fraction * (3 - 2 * fraction);
  return random(cell) * (1 - blend) + random(cell + 1) * blend;
}

/** Render a small scalar field. Summed density fuses nearby lights; weighted colour stays inside it. */
export function renderAmbientField(data: Uint8ClampedArray, width: number, height: number, seconds: number, colors: readonly AmbientColor[]): void {
  const size = Math.max(width, height), sx = width / size, sy = height / size;
  const lights = ORIGINS.map(([x, y, radius], i) => ({
    x: (x + (noise(seconds / (11 + i * 3), 17 + i * 43) - .5) * .5) * sx,
    y: (y + (noise(seconds / (14 + i * 2), 83 + i * 71) - .5) * .5) * sy,
    radius: radius * (.82 + noise(seconds / (16 + i * 3), 193 + i * 29) * .32),
    color: colors[i] ?? [0, 0, 0],
  }));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let density = 0, colorWeight = 0, red = 0, green = 0, blue = 0;
    for (const light of lights) {
      const dx = (x + .5) / size - light.x, dy = (y + .5) / size - light.y;
      const weight = light.radius * light.radius / (dx * dx + dy * dy + .018);
      const pigment = weight * weight;
      density += weight; colorWeight += pigment;
      red += light.color[0] * pigment; green += light.color[1] * pigment; blue += light.color[2] * pigment;
    }
    const edge = Math.max(0, Math.min(1, (density - 1.05) / .55));
    const index = (y * width + x) * 4;
    data[index] = red / colorWeight; data[index + 1] = green / colorWeight; data[index + 2] = blue / colorWeight;
    data[index + 3] = 255 * edge * edge * (3 - 2 * edge);
  }
}
