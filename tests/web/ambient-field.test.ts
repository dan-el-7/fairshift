import { expect, it } from 'vitest';
import { renderAmbientField, type AmbientColor } from '../../src/web/ambientField';

const palette: AmbientColor[] = [[67, 56, 202], [124, 58, 237], [37, 99, 235], [190, 24, 93]];
function frame(time: number, width = 48, height = 32) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  renderAmbientField(pixels, width, height, time, palette);
  return pixels;
}
it('generates stable seeded frames, evolving surfaces and blended colours', () => {
  const first = frame(0);
  expect(frame(0)).toEqual(first);
  expect(frame(60)).not.toEqual(first);
  expect([...first].some((value, i) => i % 4 === 3 && value > 0 && value < 255)).toBe(true);
  for (let i = 0; i < first.length; i += 4) {
    expect(first[i]).toBeGreaterThanOrEqual(37);
    expect(first[i]).toBeLessThanOrEqual(190);
    expect(first[i + 1]).toBeGreaterThanOrEqual(24);
    expect(first[i + 1]).toBeLessThanOrEqual(99);
  }
});
it('stays continuous at noise boundaries and works in portrait layouts', () => {
  const before = frame(11 - .001, 20, 48), after = frame(11 + .001, 20, 48);
  const largestChange = Math.max(...after.map((value, i) => Math.abs(value - (before[i] ?? 0))));
  expect(largestChange).toBeLessThanOrEqual(1);
  expect(frame(31, 20, 48)).not.toEqual(frame(91, 20, 48));
});
