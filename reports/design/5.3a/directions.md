# Step 5.3a: two design directions

Made by Claude on 2026-11-05 as throwaway prototypes (`web/prototypes/a/` and `web/prototypes/b/`).
Each has a landing page (`index.html`) and a map view (`map.html`). Every number on them is read when the page
loads from `web/public/data/` and `results/` (`change_check.json`, `india_after.json`); none is typed in.

Screenshots: `<a|b>-<index|map>-<desktop|phone>-<light|dark>.jpg` in this folder (desktop 1440 × 900, phone
360 × 780). Retake with `npm run shots:prototypes` in `web/`.

To try them yourself: in the repo root run `python -m http.server 8000`, then open
`http://localhost:8000/web/prototypes/a/index.html` (or `b`). The swipe handle can be dragged or moved with the arrow
keys; on the map view, hover the map for a patch's class and confidence, and the city buttons load the other cities.

## Direction D: the full redesign (current, 2026-11-05)

The user's review of C: "too simple, lacks depth … looks extremely AI done … no proper UX and nice navigation … feels
personal project, incomplete and raw". The user picked all four reference worlds (Apple product pages, crafted product
UI like Linear/Vercel/Stripe, pro map tools like Google Earth/Mapbox, data journalism like Reuters/NYT/The Pudding) and
approved a redesign plan. Prototype: `web/prototypes/d/` (Story `index.html`, `explorer.html`, `method.html`).

**Structure (the main fix).** A real site: top navigation (Story · Explorer · Cities menu · Method · Limits · GitHub ·
theme), a footer with a sitemap, credits and who-did-what, and a mobile menu.
- **Story:** a pinned map with 6 chapters scrolling over it, a chapter list on the right (a progress bar on phones).
  Each chapter moves the camera or changes layers: globe → the city in 3D → land use with real 640 m squares → what
  changed (notes pinned on the map) → how sure (reported vs real bar + the 50 checked squares as a grid and as dots on
  the map) → Europe vs India (camera flies out over both) → limits (faint = unsure). Then the four cities as cards.
- **Explorer:** a toolbar (city switcher with search, 2018 | 2026, Compare = swipe between two linked maps, Map your
  own area, Download, Copy link, keyboard shortcuts), a Layers panel (satellite, land use + opacity, shade by
  confidence, changes only, checked by eye; the legend is a filter with km² and change), an inspector for any clicked
  square (real 2018 and 2026 crops, class + confidence bars, check verdict if it was in the sample, coordinates),
  a status bar, zoom controls, links that keep city/year/square/compare in the URL, and an honest "map your own area"
  flow (draw a box, size check against the API's limit, "waking up the server", then says it isn't connected yet).
- **Method & Limits:** a spec sheet, a 5-step pipeline drawn as small diagrams, a sortable table of the 5 models
  (mean ± std computed from `results/<model>.json`), Europe vs India stats, the Grad-CAM figure, six limits, and
  who did what (the author vs Claude, with counts from `results/india_labels.json` and `results/change_check.json`).

**Details.** NASA Blue Marble Earth on the globe with an atmosphere (NASA GIBS, no key; acknowledgement in the
credits), fading back near the city so our sharp picture stands out. Every number has an ⓘ that shows the file and
key it came from. Design tokens in `tokens.css` (neutrals tinted towards the map, one marigold accent in two tones,
type scale, 4 px spacing, 3 depth levels, motion timings), shared components in `base.css`. Logo: a 3 × 3 grid of
640 m squares with one flagged. Fonts: Schibsted Grotesk + JetBrains Mono for coordinates, file names and data only.

**Corrections made while building (so the copy matches the data):** the biggest change in Ahmedabad is Farmland →
Orchards, not Farmland → Industrial; fine-tuning used 149 Indian squares (`results/india_dataset.json`), not "a few
hundred"; the author labelled 43 squares Claude had skipped and kept all 187 of Claude's labels.

**Still open:** the headline wording (options on the review page); class names; real swipe/tiles/performance work is
5.3b. The NASA Blue Marble layer's own licence page was not checked; NASA's data-use page says NASA data is CC0
unless marked. Screenshots: `d/*.jpg`; videos `d/story-*.webm` (local only).

## Direction C: the merge (Claude's recommendation, after the user asked for both themes + working motion)

The user's answer (2026-11-05): "I want both light and dark mode … animations and effects work as well … what you
think is good do that, you can rethink as well." So C takes B's full-screen "figure" opening and A's "measured
honesty", adds a light/dark switch, and makes the motion real. Prototype: `web/prototypes/c/` (index + map view).

- **Opening:** a real MapLibre globe (country shapes only, from MapLibre's free demo tiles, no API key) turns gently,
  flies down to Ahmedabad and tilts into 3D. It lands on the 2018 land-use map, then 2018 fades into 2026 once, and the
  figure caption appears. The headline is on screen from the start (so it paints fast); the globe sits beside it.
  Headline: "The model saw 319 km² of Ahmedabad change. About 163 km² really did." (numbers read from
  `results/change_check.json`).
- **Map on the page itself:** the land colour of the map equals the page background, so the landed city looks like
  a photo laid on the page (A's "mounted plate", without a frame).
- **Honesty section (from A):** "Not every change is real." The real-change bar shrinks from the reported length and
  its number counts down from 319 to 163 when you scroll to it.
- **Fig. 2 (from B):** Europe / India before / India after bars grow and count up on scroll, with ± spread bars.
- **Light and dark:** follows the system at first; the round switch in the header flips it and remembers the
  choice (localStorage). The globe, the map and every colour change with it.
- **Map view:** full-screen map, floating panel (bottom sheet on phones). Picking a city flies the camera there;
  2018 | 2026 cross-fades; hovering a square outlines it and shows class, confidence and whether it changed (from
  `patches.geojson`, loaded after the map); download buttons point at the real GeoTIFF / PNG / CSV files.
- **Font:** Schibsted Grotesk only (47 KB). **Accent:** marigold, two tones so it passes contrast on light
  (#9a5400 for text) and dark (#ffb224).
- **Reduced motion:** with the system's "reduce motion" on, there is no fly-in or counting; the final state shows at
  once.

Checked by running it (Playwright, 2026-11-05): no page errors; theme switch flips and is remembered after reload;
map recolours; city switch works (Surat); with reduced motion the end state shows after about 0.7 s with all text
visible. Video of the opening: `c-opening-light.webm`, `c-opening-dark.webm` (about 4 MB each, kept on the laptop only, git-ignored; `npm run shots:c` makes them again). Screenshots: `c-index-globe-*`
(mid-spin), `c-index-landed-*` (after landing), `c-story-*` (sections below), `c-map-*`. Retake with
`npm run shots:c` in `web/` (needs internet for the globe tiles).

Known problems to solve in 5.3b (not hidden):
- **Size:** MapLibre is about 285 KB gzipped plus a 143 KB worker. Our budget is 200 KB of initial JavaScript, so the
  map must be loaded after the text (the headline paints first, the globe fades in). The two satellite pictures are
  1.28 MB together; 5.3b needs smaller versions or tiles.
- **Swipe:** C uses a 2018 | 2026 cross-fade. The swipe slider from the plan needs two synced maps; that is 5.3b work.
- **Globe tiles** come from demotiles.maplibre.org (free, no key). If that server is slow or down, the globe is
  empty but the city images still show. 5.3b can self-host a small world outline instead.

## How the first two were chosen

Impeccable's `concept-seed` (seed reference `seed:2b35c1e9b09beb65`, mode "experience") picked candidate 6 of
Claude's list of 7 ideas for A. B is Claude's top-ranked idea ("Impeccable's pick"). Impeccable also dealt 6
"challenger" looks (a depot destination blind, a drum machine, a clay tower, a cloud quarry, a cassette j-card, a Game
Boy screen). All 6 lost on both of Impeccable's tests (does the audience recognise it, does it make the product
clearer), and all clash with our brief (Apple-like restraint). As Impeccable asks, each declined challenger gave one
discipline to both directions:

- Depot blind: one fixed window, and a fault has exactly one look. → Low-confidence patches will get one consistent mark everywhere.
- Drum machine: a light always shows "where now is". → The swipe handle is the single "which year am I seeing" marker.
- Clay tower: each layer records how it was built. → The scroll story goes in build order: Europe → India → Ahmedabad → limits → how.
- Cloud quarry: measurements set the same way every time. → Every number has its unit and the same format.
- Cassette j-card: a side must not overflow the tape. → Hard word budget: at most 2 sentences per section.
- Game Boy: exactly four tones. → Exactly neutrals + 1 accent; the class colours appear only on the map and legend.

## Direction A: "The condition report"

Like a museum conservator's report on a painting: the two photos (2018, 2026) mounted together on one card, then
every claim measured. Light grey mount, ink-black type, one ultramarine accent. Font: **Anek Latin** (Ek Type, an
Indian type foundry; its width axis lets big numbers be set wide). The page opens with the headline and the
measurement (reported km² vs estimated real km², as two bars), then the big before/after "plate" with three numbered
marks on real farmland → industrial patches. The map view is the plate on the left and a "report sheet" on the right.

| Brief point | How A meets it |
|---|---|
| Clean, Apple-like restraint | Plain grey mount, one accent, no cards, no decoration; one hairline rule between sections. |
| Visual first | The before/after plate fills most of the first screen; the story section is one chart + one sentence. |
| Few words | Headline + one sentence; each section ≤ 2 sentences. |
| Large confident type for key numbers | "319 km²" and "163 km²" are the largest type after the headline. |
| Globe → Ahmedabad 3D moment | Not in this static prototype. Plan (5.3b): the plate area starts as the MapLibre globe, flies to Ahmedabad and tilts into 3D, then settles into this framed plate. The headline and numbers wait until the camera lands. |
| Purposeful motion | Only the swipe works in the prototype. Planned: the real-change bar "shrinks" from the reported length when scrolled into view; nothing else moves. |
| Fast | No JS framework yet; fonts self-hosted (Anek Latin 104 KB). Two full satellite images are 1.28 MB together, which is too heavy for a phone; 5.3b must load smaller tiles first. |
| Light and dark | Light first (desk, daylight); dark follows the system setting. |

Risk: the "report" reading is subtle. Someone who doesn't know conservation reports just sees a clean page, which
is fine, but the world is quieter than B's.

## Direction B: "The figure" (Impeccable's pick)

Like Fig. 1 of a science paper: the map fills the whole first screen, edge to edge, and the claim sits on it as a
figure caption ("Fig. 1 | …"). Dark first (the map is a photograph), one marigold accent for "what really happened".
Font: **Schibsted Grotesk** (made for a newspaper group; Impeccable flagged the first choice, Mona Sans, as overused).
The story below continues as "Fig. 2" (accuracy bars with ± spread over 3 runs). The map view is the same full-bleed
map with a floating panel (a bottom sheet on phones).

| Brief point | How B meets it |
|---|---|
| Clean, Apple-like restraint | One full-bleed image, one sentence on it, one accent. Closest to an Apple product page. |
| Visual first | The real map IS the first screen; text is laid on it. |
| Few words | One headline sentence + one caption sentence per figure. |
| Large confident type for key numbers | The headline is the numbers: "319 km² … About 163 km² really did." |
| Globe → Ahmedabad 3D moment | Not in this static prototype. Plan (5.3b): the first screen starts as the slowly turning globe, flies down and tilts, then the caption fades in on the landed map. Full-bleed makes this feel continuous. |
| Purposeful motion | Only the swipe works in the prototype. Planned: the fly-in, and the Fig. 2 bars growing on scroll. Nothing else. |
| Fast | Schibsted Grotesk is 47 KB. Same 1.28 MB image problem as A (5.3b fixes it with tiles). |
| Light and dark | Dark first; in light mode the map stays dark (it is a photo) and the story sections turn light. |

Risk: the map-plus-caption opening is the more familiar choice for map sites, so it's less distinctive than A. Text
over a busy, colourful map needs a dark gradient behind it to stay readable.

## What both share (and is not decided yet)

- Plain class names on the site: Farmland (AnnualCrop), Orchards (PermanentCrop), Scrub and grass
  (HerbaceousVegetation), Roads (Highway), Housing (Residential), Lake (SeaLake). Claude chose these; please confirm.
- The "estimated real change" text says it came from 50 sampled changes checked by eye. The public site will also say
  who checked them (Claude first, then reviewed by the user, per `results/change_check.json` → `judged_by`).
- Impeccable's detector on the prototypes: the remaining warnings are false alarms of a static scan (images get their
  `src` from JavaScript; white text sits on the always-dark map; the striped ruler is the 640 m patch grid).
