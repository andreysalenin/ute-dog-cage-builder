# Ute Dog Cage Builder

**Live page: https://andreysalenin.github.io/ute-dog-cage-builder/**

A one-page tool for designing welded dog cages that sit on a ute tray: rows of two dogs side by side (an N x 2 layout), with a mesh door at each end. Change the settings and the 3D model, cut list and weights update straight away. The 3D view can also show the tray and a generic ute under the cages. Then save:

- **Drawings**: an A3 PDF set. It is normally 5 sheets (overview, general arrangement, module frame, doors, details and panels, cut list and stock), with a 6th sheet for cutting plans on long sets.
- **3D model**: a STEP (AP214) assembly for CAD, one part per member, sheet, door and fitting.

Everything runs in the browser and nothing is uploaded. The page is a single self-contained file (`index.html`), so it also works offline or saved to a phone.

## What you can change

- **Layout**: 1 to 6 rows, overall width, row depth and height, and the tray width and length, plus the clearances on the tray: each side (100 by default), headboard to the front of the cages, and the back of the cages to the tail. Lock either the cages or the tray, then **Fit** sizes the other set to match it with those clearances (cages to fill the tray, or a tray to suit the cages).
- **Doors**: front or rear hinge for each door, and the gap round each door.
- **Walls and roof**: solid sheet, sheet with air holes or weldmesh for the cab and tailgate faces and between rows, a solid or perforated divider, and a solid roof or one with air holes over the open bays of the top frame.
- **Air holes**: each panel position (front face, between rows, rear face, divider, roof) has its own arrangement: straight or staggered rows, over the whole panel or in bands at the top (or top and bottom), hole size, spacing across and up, and the plain border, with a live drawing of the panel showing the hole count and open area. Walls whose arrangements differ get their own cut-list marks (S5a, S5b, S5c).
- **How rows join**: separate frames with a wall each (rows bolt together), separate frames with one sheet clamped between them, or one shared frame with a wall on each side of the shared SHS or a single wall on its centre line. A shared frame saves one SHS width per joint.
- **Materials**: steel or aluminium, chosen separately for the SHS frame and the sheets, each with a grade: pre-galv, black (to powder coat), galvanised after fabrication or stainless 304/316 steel; 6061-T6, 6082-T6 or 6060-T5 aluminium SHS; galvanised, Zincanneal, black or stainless steel sheet; 5052-H32, 5005-H34 or 5083-H321 aluminium sheet. The floor can be plain sheet or tread plate. Switching to aluminium sets the usual aluminium sizes (40 x 40 x 2.0 SHS, 2.0 sheet, 3.0 tread-plate floor), and switching back restores your steel sizes. With mixed metals the sheets are riveted rather than welded.
- **Sizes and mounting**: SHS section, sheet thicknesses, floor joists, roof bars, mesh, tray and join bolts, and stock bar and sheet sizes.
- **3D view**: show or hide the roof, open the doors, pull the rows apart, colour the frame by cut-list mark, and show the tray and a ute (single, extra or dual cab picked from the tray length, with the rear axle moved back for long trays).

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
- OpenCASCADE checks of the STEP files (`validate_step.py`, `clash.py`, `sweep.py`, `sweep_joins.py` for the row joins and grades, and `sweep_holes.py` for the hole arrangements; need Python with cadquery)

## Please note

The drawings are a starting point for fabrication, not certified engineering. Check the design against your vehicle, tray and canopy, your dogs and the dog-transport rules where you live, and have the welding done by someone qualified.
