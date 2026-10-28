# SmallCNN, explained for beginners

This explains the model in `src/models.py` (`SmallCNN`). You don't need to know neural networks yet.
Read it once now; come back when your course reaches CNNs.

## 1. What an image is to a computer

A EuroSAT image is 64 × 64 pixels. Each pixel has 3 numbers: how red, how green, how blue.
So one image is just a stack of 3 grids of numbers:

```
   Red grid         Green grid        Blue grid
 64 x 64 numbers   64 x 64 numbers   64 x 64 numbers

 shape: (3, 64, 64)  =  (channels, height, width)
```

The model's job: turn these 3 × 64 × 64 = 12,288 numbers into 10 scores, one per class
(AnnualCrop, Forest, …, SeaLake). The highest score is the guess.

## 2. What a filter does

A **filter** is a tiny 3 × 3 window of numbers (one 3 × 3 window per colour channel).
It slides over the image. At each spot it multiplies what it sees by its own numbers and adds it all up.
That gives one number per spot, so you get a new grid called a **feature map**.

```
 image                     filter          feature map
 . . . . . .               a b c           . . . . . .
 . [x x x] .      x        d e f    ->     . . # . . .   # = how well this spot
 . [x x x] .               g h i           . . . . . .       matches the filter
 . [x x x] .
```

Different filters light up for different things: edges, bright water, rough textures.
At the start the filter numbers are random. **Training** slowly changes them so they find
patterns that help tell the classes apart.

See `reports/figures/feature_maps.png`: 8 random filters on a River image. Some light up on the
riverbank, some on the water.

## 3. One block = 4 steps

SmallCNN repeats the same block 3 times. Each block does:

```
 conv       ->  batchnorm   ->  ReLU            ->  maxpool
 (find          (keep the       (negatives          (keep the biggest of
 patterns)      numbers in      become 0)           each 2x2 square:
                a steady range)                     size is halved)
```

- **conv:** many filters, so many feature maps. Block 1 has 32 filters, so 3 channels become 32.
- **batchnorm:** rescales each feature map so its numbers aren't too big or too small. Makes training steadier.
- **ReLU:** turns every negative number into 0. Simple, but it is what lets stacked layers learn complex shapes.
- **maxpool:** looks at each 2 × 2 square and keeps only the biggest number. Height and width halve.

## 4. The whole model

```
 input image                 (3,   64, 64)
   │ block 1: 32 filters
   ▼
                             (32,  32, 32)
   │ block 2: 64 filters
   ▼
                             (64,  16, 16)
   │ block 3: 128 filters
   ▼
                             (128,  8,  8)
   │ flatten: put all numbers in one long row
   ▼
                             8192 numbers   (128 × 8 × 8)
   │ dropout: in training, randomly zero 30% of them
   ▼
   │ linear: each of the 10 classes gets a score from all 8192 numbers
   ▼
 10 class scores             (10)
```

## 5. Why the size shrinks and the channels grow

- **Size shrinks (64 → 32 → 16 → 8):** each maxpool halves it. Fewer pixels = less work. It also means
  a 3 × 3 filter in block 3 "sees" a much bigger part of the original image than one in block 1.
- **Channels grow (32 → 64 → 128):** early blocks find simple things (edges, colours). Later blocks
  combine them into richer things (field patterns, rows of houses), and there are more of those to track.

We trade **where** something is for **what** it is.

## 6. Dropout, in one line

During training, dropout hides a random 30% of the 8192 numbers each time, so the model can't lean
on just a few of them and has to learn patterns that also work on new images. It is switched off when
we measure accuracy.

## 7. How big is it?

Every filter number and every score weight is a **parameter** the model learns. Print the count with:

```
python -c "from src.models import SmallCNN, count_parameters; print(count_parameters(SmallCNN()))"
```

`tests/test_models.py` checks that number against the layer-by-layer sum. The biggest single layer is
the last linear one (8192 × 10 weights + 10), bigger than any one conv block.
