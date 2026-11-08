# Himanshu Patial · Portfolio

Portfolio of Himanshu Patial, product manager for payments, growth and AI, based in Dubai.

- **Home** (`#home`): who, what, availability, three headline results and links to the resume and LinkedIn.
  Home is set in a light studio: a glass DNA helix, modelled and path traced in Blender, stands on the right with
  glass droplets around it. The surface keeps flowing, the cursor sends ripples across it, and dragging
  spins it. Leaving Home fades the studio into the dark pages.
- **Work** (`#work`): three Classplus case studies, one per pillar: Payments, Growth and AI.
- **Projects** (`#projects`): Master of Global Business projects at SP Jain School of Global Management.
- **About** (`#about`): profile, how I work, experience (including Customer Delight), education, skills and contact.

Case studies sit on an arc of louver slats that flip in a staggered wave, open around the cursor and flatten
into the hero image of each page. The artwork is generated at runtime, so no confidential product screens are shown.
The About page draws the portrait from particles sampled from the headshot.

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

## Editing content

All copy lives in `src/content.js`:

- `site`: name, role, availability, email, LinkedIn, resume path, profile, experience, education and skills.
- `projects`: one entry per case study. `group: 'work'` lists it under Work, `group: 'projects'` under Projects.
  `metrics` are the key results (the first one also shows on the index). `chapters` are the features shipped,
  each with its own illustration. `problem`, `insight`, `decisions` and `learnings` are optional story sections
  that appear on the page as soon as they are filled in. `colors` tints the whole 3D scene, and `style` (0 to 5)
  with `seed` choose the generative artwork.

The resume download is `public/himanshu-patial-resume.pdf`; replace that file to update it.

To show real screenshots instead of generated artwork, add a `cover` (index wall and page hero) and a
`media` array (the three illustrations) to an entry, and put the files in `public/media/`:

```js
cover: { type: 'image', src: './media/payments-cover.jpg' },
media: [
  { type: 'video', src: './media/payments-01.mp4' },
  { type: 'image', src: './media/payments-02.jpg' },
  { type: 'image', src: './media/payments-03.jpg' },
],
```

### Portrait

The About page portrait is generated from a headshot on a plain backdrop (needs Python with numpy and Pillow):

```bash
python3 scripts/make-portrait.py path/to/headshot.png --preview portrait-preview.png
```

This rewrites `src/gl/portrait-data.js`.

### Helix

The Home helix is modelled and rendered in Blender (Cycles), run headless through its Python module
(needs Python 3.13), then encoded for the site with Pillow:

```bash
pip install bpy==5.2.3 numpy
```

```bash
python scripts/make-helix.py --strip helix-strip.png --drop helix-drop.png --dispersion --meta helix-meta.json
```

```bash
python3 scripts/encode-helix.py helix-strip.png helix-drop.png --meta helix-meta.json
```

The page spins the helix without a 3D model: a helix turning about its axis looks the same as one sliding along it,
so the site scrolls one seamless render of two turns (`src/assets/helix-strip.webp`). Everything in the script is
built to repeat along the axis so the strip has no seam. `--preview helix-preview.png` renders a perspective close-up
for look development, and `--look '{"absorb": 3}'` overrides the studio or glass settings (see `LOOK` in the script).
A full strip render with `--dispersion` takes about ten minutes on four CPU cores.

## What is in the box

| Area | Where |
| --- | --- |
| Louver wall, flip wave, open/close, cursor tilt | `src/gl/shaders.js` (`SLAT_VERT`, `SLAT_FRAG`) |
| Six generative artwork styles | `src/gl/shaders.js` (`ART`) |
| Particle portrait | `src/gl/shaders.js` (`PORTRAIT_VERT`), `scripts/make-portrait.py` |
| Glass DNA helix and light studio (Home): Blender render, scroll-to-spin, cursor ripples, drag to spin | `src/gl/helix.js`, `scripts/make-helix.py`, `scripts/encode-helix.py` |
| Scene states, transitions, DOM-synced media planes | `src/gl/stage.js` |
| Mouse fluid simulation (distortion and colour split) | `src/gl/fluid.js` |
| Generative soundscape and UI sounds (Web Audio) | `src/audio.js` |
| Router, views, preloader, cursor, input | `src/main.js` |
| Layout and type | `src/style.css` |

Interaction: scroll, drag or use the arrow keys on Work and Projects; Enter opens the current case study; Escape goes one level up.
Scrolling to the end of a case study pulls you into the next one in the same section.

Accessibility: keyboard navigation, visible focus, screen-reader announcements for the current project,
and `prefers-reduced-motion` support (crossfades instead of flips, no fluid, native scroll).

Performance:

- One clock drives GSAP, Lenis smooth scroll and the WebGL frame, so the page and the 3D scene never drift apart.
- Page geometry is measured only when layout changes; scrolling never forces a layout read.
- Procedural artwork and floor reflections refresh at half rate on alternating frames, so no single frame carries both.
- Work nobody can see is skipped: the hero once scrolled away, reflections under a black floor, the fluid when the cursor is still,
  and the louver wall, sky, floor reflections and bloom while the light studio covers Home.
- Resolution starts inside a pixel budget, drops when frames are missed and climbs back after sustained headroom.
- Add `?bench` to the URL to expose `window.__louver` and per-frame GPU timings (`__louver.stage.benchTimes`).

Fonts: Big Shoulders Display, Hanken Grotesk and Martian Mono from Google Fonts (SIL Open Font License).
