# Himanshu Patial · Portfolio

Portfolio of Himanshu Patial, product manager for payments, growth and AI, based in Dubai.

- **Home** (`#home`): who, what, availability, three headline results and links to the resume and LinkedIn.
  Home is set in a light studio: a liquid glass-chrome DNA helix, modelled and path traced in Blender, sways on
  the right, shot close-up like a product photo: perspective, with the top leaning away and softening out of
  focus. It draws on its own layer above the page and lets clicks through. The surface keeps flowing, the cursor
  sends ripples across it, and dragging turns it. Leaving Home fades the studio into the dark pages.
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
(needs Python 3.13), then encoded and colour-graded for the site with Pillow:

```bash
pip install bpy==5.2.3 numpy
```

```bash
python scripts/make-helix.py --organic --pitch 7.2 --voxel 0.016 --sway helix-frames --count 48 --sway-range 50 --sway-width 960 --fstop 1.6 --depth-tilt 18 --sway-dist 7.4 --strand-scale 1.25 --rungs-per-turn 17 --rung-height 0.28 --samples 128 --look '{"material":"hybrid","metal_mix":0.72,"absorb":3.0,"cyc":1.0}'
```

```bash
python3 scripts/encode-helix.py helix-frames
```

```bash
python3 scripts/grade-helix.py reference.jpg helix-frames --box 200 0 565 920 --max-slope 2.6
```

What the render is: a one-off molten sculpture (`--organic`: every rung and swell different, fine liquid ripples)
in liquid glass with a chrome skin (`"material": "hybrid"`), lit like a high-key product shot (a dark room in
front, a bright cyc behind, an overhead softbox), shot close-up with perspective and shallow focus. `--sway`
renders 48 frames across a 50° turn; the page plays them back and forth with cross-fades, dragging turns it
further and it eases back. About 80 seconds a frame on four CPU cores, so just over an hour for the set.
Phones get half-size frames.

`grade-helix.py` matches the tone and colour to a reference picture: it ranks the helix pixels of both by
brightness and maps each grey level of the frames to the brightness and colour the reference has at the same
rank (histogram matching, with the curve's slope limited so it stays smooth). `--box` is the helix's area in the
reference, in pixels; `--exclude` leaves out droplets or labels inside it. It writes a 256-entry table,
`src/assets/helix/grade.json`, that the page applies as a colour grade. The reference is only read, not stored.

Without `--organic`, `--frames` renders the older endless rotation instead: a regular helix with screw symmetry
(identical rungs), so turning it by one rung step looks exactly like sliding it by one rung spacing; the page
plays those frames in a loop and shifts the picture a rung each time it wraps. `--preview` renders a single
close-up for look development, and `--look` overrides the studio or material settings (see `LOOK` in the script).

## What is in the box

| Area | Where |
| --- | --- |
| Louver wall, flip wave, open/close, cursor tilt | `src/gl/shaders.js` (`SLAT_VERT`, `SLAT_FRAG`) |
| Six generative artwork styles | `src/gl/shaders.js` (`ART`) |
| Particle portrait | `src/gl/shaders.js` (`PORTRAIT_VERT`), `scripts/make-portrait.py` |
| Glass-chrome DNA helix and light studio (Home): Blender sway frames, colour grade, cursor ripples, drag to turn | `src/gl/helix.js`, `scripts/make-helix.py`, `scripts/encode-helix.py`, `scripts/grade-helix.py` |
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
