import { expect, it } from "vitest";

it("temporary Jenkins shadow command-failure probe", () => {
  expect("motion-lab-shadow-probe").toBe("intentionally-wrong");
});
