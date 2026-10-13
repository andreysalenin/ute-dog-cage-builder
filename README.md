# Ute Dog Cage Builder

**Live page: https://andreysalenin.github.io/ute-dog-cage-builder/**

A one-page tool for designing welded dog cages that sit on a ute tray: rows of two dogs side by side (an N x 2 layout), with a mesh door at each end. Change the settings and the 3D model, cut list and weights update straight away. Then save:

- **Drawings**: an A3 PDF set. It is normally 5 sheets (overview, general arrangement, module frame, doors, details and panels, cut list and stock), with a 6th sheet for cutting plans on long sets.
- **3D model**: a STEP (AP214) assembly for CAD, one part per member, sheet, door and fitting.

Everything runs in the browser and nothing is uploaded. The page is a single self-contained file (`index.html`), so it also works offline or saved to a phone.

## What you can change

- **Layout**: 1 to 6 rows, overall width, row depth, height, and the tray size for the fit check.
- **Doors**: front or rear hinge for each door, and the gap round each door.
- **Walls**: solid sheet, sheet with air holes or weldmesh for the cab and tailgate faces and between rows, plus a solid or perforated divider and the air-hole size and spacing.
- **Materials**: steel or aluminium, chosen separately for the SHS frame and the sheets. With mixed metals the sheets are riveted rather than welded.
- **Sizes and mounting**: SHS section, sheet thicknesses, floor joists, roof bars, mesh, tray and join bolts, and stock bar and sheet sizes.

Settings are remembered in the browser. Use **Save settings** and **Load settings** to keep a design as a file.

## Building

`index.html` is generated from the sources:

```
npm install
npm run build      # writes index.html
```

- `src/page.html`: markup and styles
- `src/core.js`: geometry, quantities, cutting and nesting, STEP writer (also runs in Node)
- `src/viewer.js`: three.js viewer and the renders used in the drawings
- `src/drawings.js`: the A3 drawing set (jsPDF)
- `src/app.js`: page wiring

three.js r128 and jsPDF 2.5.1 (both MIT licensed) are inlined by `build.js`.

## Tests

`test/` holds the checks used during development:

- headless Chromium runs that save the PDF and STEP for several setups (`npm test`; set `CHROMIUM_PATH` to a Chromium binary)
- OpenCASCADE checks of the STEP files (`validate_step.py`, `clash.py`, `sweep.py`; need Python with cadquery)

## Please note

The drawings are a starting point for fabrication, not certified engineering. Check the design against your vehicle, tray and canopy, your dogs and the dog-transport rules where you live, and have the welding done by someone qualified.
