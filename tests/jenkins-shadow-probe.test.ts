import { expect, test } from 'vitest';

test('Jenkins shadow probe intentional failure', () => {
  expect('game-motion-lab-shadow-probe').toBe('intentional-failure');
});
