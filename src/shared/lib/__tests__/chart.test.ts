import { niceCeil, percentages, smoothPath, yTicks } from '../chart';

describe('graphiques', () => {
  it('arrondit à des valeurs rondes', () => {
    expect(niceCeil(0)).toBe(0);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(2_400)).toBe(2_500);
    expect(niceCeil(2_600)).toBe(3_000);
    expect(niceCeil(4_100)).toBe(5_000);
  });

  it('produit des graduations régulières couvrant le maximum', () => {
    const ticks = yTicks(10_450);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10_450);
    expect(ticks).toHaveLength(5);
    expect(ticks[4]).toBe(12_000); // pas de grand vide au-dessus de la courbe
    expect(yTicks(0)).toEqual([0, 1, 2, 3, 4]);
  });

  it('donne des pourcentages qui totalisent 100', () => {
    expect(percentages([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(percentages([3400, 2800, 1250, 950, 550, 300]).reduce((a, b) => a + b)).toBe(100);
    expect(percentages([0, 0])).toEqual([0, 0]);
  });

  it('trace un chemin qui passe par le premier et le dernier point', () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 5 }]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d.endsWith('20,5')).toBe(true);
    expect(smoothPath([])).toBe('');
  });
});
