# Good first issues

Each is small, testable and fits the project's rules (see CONTRIBUTING.md).

1. **Add a preset city.** Run the showcase pipeline (`src/showcase.py`) for one more Indian city and add it to
   `web/public/data/index.json`. Check: the city card and the Explorer picker show it; web tests pass.
2. **Show the model's confidence as a histogram in "Map your own area".** The live result already has every square's
   confidence (`patches_geojson`). Check: a Vitest test for the binning.
3. **Export the live map as a PNG with a legend.** One button in the result panel; drawn with a canvas from the data the
   panel already has. Check: the file opens and the legend colours match `index.json`.
4. **Cache the satellite search in the browser.** The same box searched twice should not hit the STAC API again within a
   session. Check: `web/scripts/count-reads.mjs` shows fewer requests on the second run.
5. **Command-line mapper: write a Cloud-Optimised GeoTIFF.** `src/map_area.py` writes a plain GeoTIFF; add tiling and
   overviews. Check: `rio cogeo validate` passes in a test on the saved tile.
