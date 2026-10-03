# Temporary Motion Lab Node 24 Actions receipt probe

This documentation-only pull request obtains a fresh PR-event GitHub Actions
receipt for the Motion Lab Node 24 lane. It changes no product code, workflow,
credentials, or deployment configuration.

## Source and workflow reviewed

- Repository: `setnessconsulting/game-motion-lab`
- Default branch: `main`
- Probe base: `77d6317cd635a0d423cf13014122d766fe754549`
- Workflow: `.github/workflows/ci.yml` (`CI`)
- Events: `pull_request`, pushes to `main`, and `workflow_dispatch`
- Workflow permission: `contents: read`
- Node major: `24` from `.nvmrc`

The workflow comment states that it uses no secrets, private registry, or
deployment. The job runs locked dependency installation, contract and
foundation checks, typecheck, lint, tests, production build and bundle checks,
browser and nested-host tests, Phaser rendering, accessibility, Lighthouse,
and uploads performance evidence as a GitHub Actions artifact. This probe
records the PR-event result only; the browser, nested-host, Lighthouse, and
artifact lanes remain part of Actions coverage.

## Evidence handling

Record the actual PR URL, exact head SHA, Actions run ID, check ID, and
conclusion from GitHub after the workflow completes. This document makes no
claim about an Actions or Jenkins result before that readback. GitHub Actions
remains the current CI source for the repository; this probe requests no
Jenkins dispatch.
