# Louver Portfolio

A WebGL portfolio for a creative developer. Projects are shown on an arc of louver slats that
flip in a staggered wave, open around the cursor and flatten into the hero image of each project page.
All code, artwork and sound are original and generated at runtime: there are no image, video or audio files.

## Run it

Requires Node.js 18 or newer.

```bash
npm install
npm run dev            # local dev server at http://localhost:5173
npm run build          # static site in dist/
npm run preview        # serve the built dist/ locally
npm run build:single   # one self-contained HTML file in dist-single/ (opens with a double-click)
```

The files in `dist/` must be served over HTTP (use `npm run preview` or any static host);
browsers block their scripts when `index.html` is opened straight from disk. The single-file build has no such limit.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the site on every push to `main`.
To publish it, turn Pages on once:

1. Open the repository's **Settings > Pages**.
2. Under **Build and deployment > Source**, choose **GitHub Actions**.
3. Open the **Actions** tab, select **Build and deploy to GitHub Pages**, and choose **Run workflow**
   (or push any commit to `main`).

The site is then served at `https://<your-username>.github.io/<repository-name>/`.
Until Pages is on, the workflow still builds the site to check it, and skips the deploy step.

Any other static host (Vercel, Netlify, Cloudflare Pages) works too: build command `npm run build`, output folder `dist`.

## Make it yours

Everything you need to edit is in `src/content.js`:

- `site`: name, role, availability line, email, intro, profile, services, toolkit, social links.
- `projects`: one entry per project. `colors` tints the whole 3D scene for that project.
  `style` (0 to 5) and `seed` choose the generative artwork used until you add real media.

To use your own images or videos, add a `cover` (index wall and project hero) and a `media` array
(the three blocks on the project page) to a project:

```js
cover: { type: 'image', src: './media/halcyon-cover.jpg' },
media: [
  { type: 'video', src: './media/halcyon-01.mp4' },
  { type: 'image', src: './media/halcyon-02.jpg' },
  { type: 'image', src: './media/halcyon-03.jpg' },
],
```

Put the files in `public/media/` so Vite copies them into the build.

## What is in the box

| Area | Where |
| --- | --- |
| Louver wall, flip wave, open/close, cursor tilt | `src/gl/shaders.js` (`SLAT_VERT`, `SLAT_FRAG`) |
| Six generative artwork styles | `src/gl/shaders.js` (`ART`) |
| Scene states, transitions, DOM-synced media planes | `src/gl/stage.js` |
| Mouse fluid simulation (distortion and colour split) | `src/gl/fluid.js` |
| Generative soundscape and UI sounds (Web Audio) | `src/audio.js` |
| Router, views, preloader, cursor, input | `src/main.js` |
| Layout and type | `src/style.css` |

Interaction: scroll, drag or use the arrow keys on the index; Enter opens the current project; Escape goes back.
Scrolling to the end of a project pulls you into the next one.

Accessibility: keyboard navigation, visible focus, screen-reader announcements for the current project,
and `prefers-reduced-motion` support (crossfades instead of flips, no fluid, native scroll).

Performance:

- One clock drives GSAP, Lenis smooth scroll and the WebGL frame, so the page and the 3D scene never drift apart.
- Page geometry is measured only when layout changes; scrolling never forces a layout read.
- Procedural artwork and floor reflections refresh at half rate on alternating frames, so no single frame carries both.
- Work nobody can see is skipped: the hero once scrolled away, reflections under a black floor, the fluid when the cursor is still.
- Resolution starts inside a pixel budget, drops when frames are missed and climbs back after sustained headroom.
- Add `?bench` to the URL to expose `window.__louver` and per-frame GPU timings (`__louver.stage.benchTimes`).

Fonts: Big Shoulders Display, Hanken Grotesk and Martian Mono from Google Fonts (SIL Open Font License).
