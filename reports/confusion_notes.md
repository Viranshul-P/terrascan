# Why the model mixes up these classes (step 3.1)

My notes from looking at `reports/figures/confused_pairs.png`
(EfficientNet-B0, seed 42, test split; counts in `results/confused_pairs.md`).

1. **HerbaceousVegetation / PermanentCrop:** I think the model confuses these because most of the wrong images are
   mostly brown across the whole image. Two of the wrong images have more green with dots of brown.
2. **AnnualCrop / PermanentCrop:** most of these images have rectangular blocks, mostly in different shades of green,
   with a few exceptions that are mostly brown.
3. **HerbaceousVegetation / Pasture:** these images are mostly green land with no clear shapes, just green land with
   some brown in between.
4. **AnnualCrop / Pasture:** these are mostly green and have rectangular shapes, but also larger chunks of green land.
5. **Industrial / Residential:** there is not much difference between them. All the images have some green or brown
   land and concrete buildings in rectangular blocks.

## Added by Claude (at my request), to make the notes stronger

These are **ideas, not tested results**. Nothing here has been measured yet unless a file is named.

- **PermanentCrop is the class the model struggles with most.** It has the lowest per-class F1 (0.9675), and 18 of
  its 375 test images were wrong: 9 called HerbaceousVegetation, 7 called AnnualCrop, 1 Highway, 1 Industrial
  (`results/efficientnet_b0.json`, seed 42). So the two biggest pairs are mostly *one* problem: orchards and vineyards
  being read as something else, not the other way round.
- **Why colour isn't enough (idea):** the model only sees red, green and blue. Dry orchards, scrubland and bare soil
  are all brown in RGB, and different green crops are all green. That matches the observations in notes 1–4 above.
- **Why shape isn't enough (idea):** one pixel is 10 m × 10 m. A single fruit tree or vine row is usually smaller than
  that, so the "rows of trees" that make an orchard an orchard can blur into a plain texture. Then an orchard
  looks like either a normal field (row 2) or wild land (row 1).
- **Mixed patches (idea):** one patch covers 640 m × 640 m but gets only one label. Several images in rows 2 and 4
  seem to contain more than one kind of land, so even a person could fairly pick either label.
- **Industrial vs Residential (idea):** both are concrete blocks with roads. The only real difference is building
  size and layout, which is hard to see at 64×64.

**What this means for the rest of the project**
- Step 3.2 (Grad-CAM) can test these ideas: if the heatmaps on the wrong images cover the whole patch evenly, the
  model is probably using colour/texture, not shapes.
- Step 4.3 (India): Indian farms are often smaller and mixed, and the landscape is often drier. My guess is these same
  farmland/vegetation pairs will get worse there, so check them first when measuring the drop.
- A possible fix (not planned in PLAN.md, not tried): EuroSAT also has a 13-band version with near-infrared, which
  helps separate kinds of vegetation. That would need a new model, so it is only a note for "future work".
