// All site copy lives here. Replace the sample identity and projects with your own.
//
// Project fields
//   slug      URL name (letters, digits, hyphens) - used as #slug
//   style     generative artwork used when no `cover` is given:
//             0 dunes, 1 orbits, 2 liquid marble, 3 night grid, 4 aurora, 5 crystal
//   seed      any number; changes the composition of the artwork
//   colors    bg / a (accent, light) / b (secondary) - tints the whole 3D scene
//   cover     optional real media: { type: 'image' | 'video', src: './media/x.jpg', aspect: 1.6 }
//   media     optional per-block media for the project page (same shape as cover)

export const site = {
  name: 'Your Name',
  role: 'Creative Developer',
  availability: 'Available for projects',
  email: 'hello@yourdomain.com',
  intro:
    'I design and build interactive websites, real-time 3D scenes and sound-led experiences for studios and brands.',
  about: [
    'Creative developer working between design and engineering. I prototype early with designers, then take the idea all the way to a fast, accessible production build.',
    'Most of my work lives in the browser: WebGL scenes, motion systems, generative audio and the tooling that keeps them running at 60 frames per second on a mid-range phone.',
  ],
  services: ['WebGL and Three.js development', 'Front-end engineering', 'Interaction and motion design', 'Generative sound for the web'],
  toolkit: ['Three.js and GLSL', 'GSAP', 'Web Audio API', 'Vite and Astro', 'Blender', 'Figma'],
  socials: [
    { label: 'GitHub', url: 'https://github.com/' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/' },
    { label: 'Instagram', url: 'https://www.instagram.com/' },
  ],
};

export const projects = [
  {
    slug: 'halcyon',
    title: 'Halcyon',
    client: 'Halcyon Records',
    role: 'Design and WebGL',
    year: '2026',
    url: null,
    style: 0,
    seed: 0.13,
    colors: { bg: '#0c0807', a: '#ffa45c', b: '#7a351b' },
    summary: 'A listening room set in a desert at dusk. Each track moves the sun, and the dunes shift with the bass.',
    body: [
      'The album launch needed a place to listen, not a page to scroll. We built a single continuous landscape where every track sets the time of day and the low end drives the wind across the dunes.',
      'All terrain is generated on the GPU from layered noise, so the whole experience ships in under 400 KB and holds 60 fps on mid-range phones.',
    ],
    captions: ['Track 03 at golden hour', 'Dune layers in parallax', 'Night state after the final track'],
  },
  {
    slug: 'undertow',
    title: 'Undertow',
    client: 'Undertow Festival',
    agency: 'North Shore Studio',
    role: 'Creative development',
    year: '2025',
    url: null,
    style: 2,
    seed: 0.47,
    colors: { bg: '#03080c', a: '#5fd3ff', b: '#123c5e' },
    summary: 'A festival identity drawn in liquid. The line-up drifts through a fluid field that never repeats.',
    body: [
      'The festival brand is built on water, so the site treats every surface as a fluid. Artist names surface and sink as you scroll, and the cursor stirs the field in real time.',
      'A domain-warped noise system replaces video backgrounds entirely, which cut page weight by 90 percent compared with the previous edition.',
    ],
    captions: ['Line-up reveal', 'Fluid field at rest', 'Ticket page colourway'],
  },
  {
    slug: 'meridian',
    title: 'Meridian',
    client: 'Meridian Observatory',
    role: 'Creative development',
    year: '2025',
    url: null,
    style: 1,
    seed: 0.71,
    colors: { bg: '#06060b', a: '#e6e0ff', b: '#5547b0' },
    summary: 'An interactive night sky for a public observatory, with orbits plotted from this week’s ephemeris.',
    body: [
      'Visitors plan their evening at the observatory from this page. Each ring is a real orbit, recalculated weekly, and hovering one tells you when it will be visible from the telescope deck.',
      'The scene is built for projection in the lobby as well as the web, so every effect scales from a phone up to a 6-metre screen.',
    ],
    captions: ['Weekly orbit map', 'Ring detail with transit times', 'Lobby projection mode'],
  },
  {
    slug: 'northline',
    title: 'Northline',
    client: 'Northline Outdoor',
    agency: 'Fjell & Co',
    role: 'Front-end and motion',
    year: '2024',
    url: null,
    style: 4,
    seed: 0.29,
    colors: { bg: '#020a08', a: '#7cffc8', b: '#18594d' },
    summary: 'Campaign site for an outdoor label. The aurora follows live geomagnetic data, so no two visits look alike.',
    body: [
      'Northline’s winter range is designed for the far north, so the campaign lives under the aurora. A small edge function feeds the current Kp index into the shader every ten minutes.',
      'Product shots sit on the same render pipeline as the sky, so jackets pick up the green of the lights behind them.',
    ],
    captions: ['Kp 6 storm state', 'Product rail under the aurora', 'Quiet night variant'],
  },
  {
    slug: 'static-bloom',
    title: 'Static Bloom',
    client: 'Static Bloom Gallery',
    role: 'Design and development',
    year: '2024',
    url: null,
    style: 5,
    seed: 0.58,
    colors: { bg: '#0c050a', a: '#ff86c5', b: '#5d1b45' },
    summary: 'Online catalogue for a glass and ceramics show, with every piece rendered as faceted light.',
    body: [
      'The gallery wanted the online catalogue to feel like walking past glass. Each work is represented by a cellular light study tuned to its colour and translucency.',
      'Curators edit the catalogue in a plain spreadsheet; the site rebuilds itself from it in under a minute.',
    ],
    captions: ['Catalogue overview', 'Facet study for a single piece', 'Opening night colourway'],
  },
  {
    slug: 'low-orbit',
    title: 'Low Orbit',
    client: 'Low Orbit Audio',
    role: 'Creative development',
    year: '2023',
    url: null,
    style: 3,
    seed: 0.84,
    colors: { bg: '#070707', a: '#ffd65a', b: '#4b3c12' },
    summary: 'Launch site for a music tool: a night drive along an endless grid, locked to the product’s sequencer.',
    body: [
      'The grid scrolls at the tempo of the demo track, and every window that lights up in the skyline is a note from the sequencer.',
      'Visitors can swap patterns and hear the change instantly, which tripled the time spent on the page compared with the previous launch.',
    ],
    captions: ['Sequencer-locked skyline', 'Grid at 128 BPM', 'Pattern editor'],
  },
  {
    slug: 'paper-tide',
    title: 'Paper Tide',
    client: 'Paper Tide Press',
    role: 'Full-stack development',
    year: '2022',
    url: null,
    style: 2,
    seed: 0.93,
    colors: { bg: '#08090d', a: '#cdd5ff', b: '#2c3453' },
    summary: 'Reading platform for an independent publisher, with a marbled cover generated for every title.',
    body: [
      'Every book gets a unique marbled endpaper, generated from its ISBN so it never changes between visits.',
      'The reader works offline, remembers your place across devices and exports annotations as plain text.',
    ],
    captions: ['Generated endpapers', 'Reader view', 'Catalogue grid'],
  },
  {
    slug: 'ember',
    title: 'Ember',
    client: 'Ember Field Museum',
    role: 'Creative development',
    year: '2021',
    url: null,
    style: 0,
    seed: 0.36,
    colors: { bg: '#0d0504', a: '#ff6a45', b: '#3f0f09' },
    summary: 'Companion guide to a volcanic geology exhibit: lava fields that cool as you explore them.',
    body: [
      'The exhibit traces a single eruption over twelve months. On the web, each month is a layer of the landscape that cools from orange to basalt as you move through it.',
      'The guide doubles as the in-gallery kiosk software, running full screen on the museum’s touch tables.',
    ],
    captions: ['Month one, active flow', 'Cooling layers', 'Kiosk mode'],
  },
];
