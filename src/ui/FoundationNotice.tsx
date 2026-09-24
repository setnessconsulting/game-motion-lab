/**
 * The foundation notice.
 *
 * ML-02 delivers the repository/application foundation, not a mission. This panel says
 * exactly what is implemented and what is not, so nothing in the running app can be
 * mistaken for a finished mission or for the physics kernel.
 */
export function FoundationNotice() {
  return (
    <section className="notice" aria-labelledby="foundation-notice-heading" data-testid="foundation-notice">
      <h2 id="foundation-notice-heading">Foundation preview</h2>
      <p>
        This build is the <strong>application foundation</strong> for Motion Lab (Jira GAME-384). It
        proves the science/presentation boundary: a pure TypeScript science and domain layer feeds a
        typed view model, which React and Phaser both render, and the presentation layers can only
        send back bounded intents.
      </p>
      <p>
        Only <strong>one case</strong> from the frozen science model is implemented here:{" "}
        <strong>balanced forces</strong>. With a net force of 0 N, the cart moves at constant
        velocity, exactly as <code>docs/SCIENCE_MODEL.md</code> requires. Unbalanced motion — how
        acceleration depends on net force and mass — arrives with the physics kernel (GAME-386) and
        the missions (GAME-389). No trial here is scored, and no graph is presented as evidence.
      </p>
    </section>
  );
}
