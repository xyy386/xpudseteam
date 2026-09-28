# Team Website (Static Edition)

English | [简体中文](README-zh.md)

The official website of the Data-Driven Scientific and Engineering Modeling & Computation Team (School of Science, Xi'an Polytechnic University). Built with the Next.js App Router and exported as a **fully static site**, deployable to GitHub Pages or any static host.

> This edition is a trimmed version of the original Cloudflare Workers full-stack app (D1 database, editing backend, member authentication): only the public pages remain, with the visual output unchanged. Site content is bundled in `app/saved-content.json`; rebuild to publish updates.

## Getting Started

```sh
npm install        # Install dependencies (Node.js >= 22.13.0)
npm run dev        # Development server at http://localhost:3000 with HMR
npm run build      # Static export into out/
npm run preview    # Preview the exported site locally (serve out)
```

## Updating Site Content

1. Edit `app/saved-content.json` (team members, research directions, news, archives — everything)
2. Put media files under `public/` and reference them with root-relative paths in the JSON (e.g. `/migrated-media/xxx.jpg`)
3. Run `npm run build` to re-export

Notes: news articles with draft status (`status: "draft"`) are excluded from the static output. Routes for detail pages (research directions, archives, custom sections) are enumerated automatically at build time — no extra configuration needed.

## Deploying to GitHub Pages

A project site is served under `https://<username>.github.io/<repo>/`, so every URL needs a `/<repo>` prefix:

```sh
NEXT_PUBLIC_BASE_PATH=/repo-name npm run build
```

The build handles both halves automatically:

- `next.config.ts` reads `NEXT_PUBLIC_BASE_PATH` so Next-generated assets (JS/CSS/favicon) use the subpath
- `scripts/apply-base-path.mjs` prefixes root-relative links and images in the page content (`/team`, `/migrated-media/x.jpg`, …)

Deployment notes:

- The output is the `out/` directory; push its entire contents, including an empty `.nojekyll` file (disables Jekyll processing)
- `trailingSlash: true` is enabled, exporting a `directory/index.html` layout that matches Pages' directory-index behavior
- With a custom domain or a `username.github.io` root repository (no subpath), leave `NEXT_PUBLIC_BASE_PATH` unset
- A GitHub Actions workflow can automate this: build with the prefix on push and publish `out/`

## Project Layout

- `app/` pages and content modules (all server components, prerendered at build time)
- `app/saved-content.json` site content data
- `public/` static assets (images, logos)
- `scripts/apply-base-path.mjs` GitHub Pages subpath prefixing
- `tests/` unit tests for content logic (`npm test`)

## Commands

- `npm run dev`: development server
- `npm run build`: static export
- `npm run preview`: preview the exported site
- `npm run lint`: ESLint
- `npm test`: unit tests
