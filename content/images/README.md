# Model photos

One exterior photo per Toyota model in `content/catalog.json`, used by the configurator page
in place of the old SVG silhouettes. **These images are illustrative only, for a prototype of
a fictional dealer (Harbourline Toyota).** They are not Toyota imagery, do not show Australian
specification or the exact grade/colour being configured, and should be replaced with licensed
brand imagery before anything goes to production.

## Files

| Path | What |
| --- | --- |
| `<model-id>.jpg` | 1600 px wide, JPEG quality 85, landscape (no taller than 3:2), metadata stripped |
| `thumb/<model-id>.jpg` | 640 px wide, JPEG quality 80, same crop |
| `credits.json` | Source, author, licence and generation note for every image |
| `index.json` | `{ "<model-id>": { "hero", "thumb", "colours": {} } }`; `colours` is empty (no per-colour photos yet) |
| `raw/` | Original downloads. Git- and Docker-ignored; re-create with the sourcing steps below |

Served by `server/images.mjs`: `/api/images/<model-id>.jpg`, `/api/images/<model-id>/thumb.jpg`,
`/api/images/credits`, `/api/images/index`. Each image is also stored in the knowledge box as resource
`image-<model-id>` (`scripts/ingest-images.mjs`).

## Sourcing

All photos come from **Wikimedia Commons** under CC BY-SA 3.0/4.0 or CC0, chosen for the
current generation (see `generation_note`), front-three-quarter view and landscape originals
of at least 2,500 px. No Toyota press images or dealer-site images are used. Originals were downloaded
from each file page's original-file link into `raw/`, then cropped and resized with Pillow.

## Attribution obligations

CC BY-SA images must be credited wherever they are shown. Credit the author, link the licence,
and say the image was modified (cropped and resized). Example:

> Photo: Mr.choppers, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), via Wikimedia Commons, cropped.

`GET /api/images/credits` gives the page everything it needs to render these credits. The resized
derivatives are shared under the same licence as their source (ShareAlike).
