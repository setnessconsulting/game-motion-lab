/**
 * Foundation notice for the ML-03 kernel preview.
 *
 * States honestly what the analytical kernel provides and what later milestones own
 * (missions, scoring, graphs as evidence).
 */
export function FoundationNotice() {
  return (
    <section className="notice" aria-labelledby="foundation-notice-heading" data-testid="foundation-notice">
      <h2 id="foundation-notice-heading">Physics kernel preview</h2>
      <p>
        This build includes the <strong>deterministic analytical 1D physics kernel</strong> for
        Motion Lab (Jira GAME-386 / ML-03). Scientific truth comes from pure TypeScript:{" "}
        <code>Fnet = ΣF</code>, <code>a = Fnet/m</code>,{" "}
        <code>v(t) = v0 + at</code>, <code>x(t) = x0 + v0t + ½at²</code>. React and Phaser only
        display a typed view model and send bounded intents.
      </p>
      <p>
        You can change mass and applied force. Balanced forces (<code>Fnet = 0</code>) keep
        constant velocity; unbalanced forces produce constant acceleration. No trial here is
        scored yet, and no graph is presented as assessed evidence — those arrive with later
        milestones (GAME-388 onward).
      </p>
    </section>
  );
}
