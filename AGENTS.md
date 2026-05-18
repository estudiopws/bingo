# Bingo Project - AI Agent Guidelines

## Project Overview
This repository is for a single-page Bingo caller screen used by the person drawing balls and calling numbers.

The product goals are:
- simple operator flow
- visually striking presentation
- a 3D ball cage built with Three.js
- soft, polished motion rather than loud arcade-style animation

## Current State
- [index.html](index.html) is the current single-page entrypoint and main reference for layout and tone.
- The project uses an npm-based workflow with Vite.
- Prefer evolving the existing single-page experience before introducing extra routes or frameworks.

## Project Structure
- `.git/` - Git repository metadata
- [AGENTS.md](AGENTS.md) - shared instructions for coding agents
- [index.html](index.html) - current single-page Bingo caller entrypoint
- `src/` - JavaScript modules for UI state and Three.js rendering
- `package.json` - npm scripts and dependencies
- `node_modules/` - installed packages

## Build & Development Commands
- `npm install` - install dependencies
- `npm run dev` - start the local development server
- `npm run build` - produce a production build
- `npm run preview` - preview the production build locally

## Implementation Conventions

### Product Direction
- Keep the experience to one page unless the user explicitly asks for multiple views.
- Optimize for the caller/operator, not for player cards.
- Treat the 3D cage as the visual centerpiece; supporting UI should remain readable and secondary.

### Frontend Approach
- Prefer plain HTML, CSS, and JavaScript modules with Three.js unless the user requests a framework.
- Use npm-managed dependencies for rendering and application logic.
- Keep animation smooth and restrained: easing, drift, subtle lighting, and gentle motion over flashy effects.
- Preserve good legibility for large-screen use in a live room.

### Code Organization
- Keep rendering logic for the Three.js scene separate from general UI state.
- Keep Bingo draw state deterministic and easy to test.
- Avoid adding heavy dependencies unless they materially improve the 3D scene or developer workflow.

## AI Agent Guidance
- Start from [index.html](index.html) and the `src/` modules when making visual or interaction changes.
- When replacing prototype code, preserve the existing design intent: premium presentation, strong hierarchy, and simple controls.
- Prefer small, testable iterations. After the first substantive edit, run the narrowest relevant validation step.
- Update this file when project structure, scripts, or conventions change.

## Useful Resources
- Add a `README.md` once the initial npm structure is in place.
- Add focused instructions files later only if the project splits into clearly separate areas such as UI, rendering, or game logic.

---
**Last Updated**: May 18, 2026
**Status**: Single-page Bingo caller app initialized around a Three.js-driven visual experience
