"""Sentinel-2 imagery from Microsoft Planetary Computer, turned into EuroSAT-style RGB (step 4.1).

Pipeline for one box (lon/lat):
  1. search_scenes: find Sentinel-2 L2A scenes that fully cover the box, lowest cloud first.
  2. read_box: read bands B04/B03/B02 (red, green, blue) for just that box, at 10 m per pixel.
  3. remove_offset: scenes with processing baseline 04.00 or higher store every value +1000.
     Decided per scene from `s2:processing_baseline`, never from the date.
  4. apply_calibration: per colour, one straight line (gain * value + shift) that makes Level-2A
     look like Level-1C. EuroSAT was made from Level-1C (top of atmosphere, haze included);
     Planetary Computer only has Level-2A (haze removed), which came out much less blue.
     The line is fitted on European areas only (fit_calibration), then used unchanged everywhere.
  5. to_eurosat_rgb: stretch 0-2750 to 1-255 and clip, the recipe in the EuroSAT authors' README
     (github.com/phelber/EuroSAT, FAQ: gdal_translate ... -scale 0 2750 1 255 -b 4 -b 3 -b 2).
  6. cut_patches: cut the image into 64x64 patches.
"""

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.transform import xy
from rasterio.warp import transform, transform_bounds
from rasterio.windows import from_bounds
from shapely.geometry import box, shape

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"
RGB_BANDS = ["B04", "B03", "B02"]  # red, green, blue
OFFSET = 1000  # added to every value from processing baseline 04.00 on
OFFSET_FROM_BASELINE = (4, 0)


def search_scenes(bbox, date_range, max_cloud):
    """Scenes that fully cover bbox [west, south, east, north], lowest cloud cover first.

    date_range: "YYYY-MM-DD/YYYY-MM-DD". max_cloud: percent, for the whole scene (not just the box).
    """
    catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    search = catalog.search(
        collections=[COLLECTION],
        bbox=bbox,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": max_cloud}},
    )
    area = box(*bbox)
    items = [item for item in search.items() if shape(item.geometry).contains(area)]
    return sorted(items, key=lambda item: item.properties["eo:cloud_cover"])


def month_summary(items, bbox, max_cloud):
    """Step 4.6: count one month's scenes for bbox, and list the clear ones that cover all of it.

    items: every scene that touches bbox in that month (any cloud). A scene is "clear" if it covers
    the whole box and its whole-scene cloud cover is below max_cloud. A missing processing baseline
    is reported as None, so nobody guesses the offset for that scene.
    """
    area = box(*bbox)
    covering = [item for item in items if shape(item.geometry).contains(area)]
    clear = [item for item in covering if item.properties["eo:cloud_cover"] < max_cloud]
    scenes = []
    for item in sorted(clear, key=lambda item: item.properties["datetime"]):
        baseline = item.properties.get("s2:processing_baseline")
        scenes.append({
            "id": item.id,
            "date": item.properties["datetime"][:10],
            "tile": item.properties.get("s2:mgrs_tile"),
            "cloud": round(item.properties["eo:cloud_cover"], 2),
            "baseline": baseline,
            "needs_offset_fix": None if baseline is None else needs_offset_fix(item),
        })
    counts = {"touching": len(items), "covering": len(covering), "clear": len(clear)}
    return {**counts, "scenes": scenes}


def parse_baseline(baseline):
    """'05.12' -> (5, 12), so baselines compare as numbers, not as text."""
    major, minor = baseline.split(".")
    return int(major), int(minor)


def needs_offset_fix(item):
    """True if this scene's values carry the +1000 offset (baseline 04.00 or higher)."""
    return parse_baseline(item.properties["s2:processing_baseline"]) >= OFFSET_FROM_BASELINE


def remove_offset(dn, item):
    """Subtract the offset if this scene has one. Values never go below 0."""
    dn = dn.astype(np.int32)
    if needs_offset_fix(item):
        dn = np.maximum(dn - OFFSET, 0)
    return dn


def fit_calibration(our_values, target_values, percentiles):
    """Per colour, fit gain and shift so that gain * our + shift matches the target's spread.

    our_values, target_values: (N, bands) pixel values, same scale (0-10000 reflectance units).
    Takes the given percentiles of each (e.g. 5, 10, ..., 95) and fits a straight line through the
    pairs (least squares). Percentiles, not pixel pairs, because the images show different places.
    Returns {"gain": [...], "shift": [...]}, one number per column (step 8.3a fits every band).
    """
    gains, shifts = [], []
    for k in range(our_values.shape[1]):
        ours = np.percentile(our_values[:, k], percentiles)
        target = np.percentile(target_values[:, k], percentiles)
        gain, shift = np.polyfit(ours, target, deg=1)
        gains.append(float(gain))
        shifts.append(float(shift))
    return {"gain": gains, "shift": shifts}


def apply_calibration(dn, calibration):
    """gain * value + shift per colour, on (..., 3) values. Never below 0."""
    out = dn * np.array(calibration["gain"]) + np.array(calibration["shift"])
    return np.maximum(out, 0)


def eurosat_to_dn(rgb, scale_max):
    """Undo the EuroSAT stretch: pixel value 1..255 -> 0..scale_max (clipped stays clipped)."""
    return (rgb.astype(np.float64) - 1) * scale_max / 254


def to_eurosat_rgb(dn, scale_max):
    """Values 0..scale_max -> 1..255, clipped, as uint8 (gdal_translate -scale 0 2750 1 255)."""
    scaled = 1 + dn.astype(np.float64) * 254 / scale_max
    return np.rint(np.clip(scaled, 1, 255)).astype(np.uint8)


def read_box(item, bbox):
    """Raw values (H, W, 3) for bands B04/B03/B02 inside bbox, plus a mask of pixels that have data.

    All three bands are on the same 10 m grid, so the same window lines them up.
    """
    bands = []
    for band in RGB_BANDS:
        with rasterio.open(item.assets[band].href) as src:
            bounds = transform_bounds("EPSG:4326", src.crs, *bbox)
            window = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
            bands.append(src.read(1, window=window))
    dn = np.stack(bands, axis=-1)
    has_data = (dn != 0).all(axis=-1)  # 0 = no data in Sentinel-2 L2A
    return dn, has_data


def box_grid(item, bbox):
    """The map grid of read_box's output: (crs, affine transform from pixel row/col to map x/y).

    Uses the same window as read_box, so pixel (row, col) of its output sits at the same place.
    """
    with rasterio.open(item.assets[RGB_BANDS[0]].href) as src:
        bounds = transform_bounds("EPSG:4326", src.crs, *bbox)
        window = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        return src.crs.to_string(), src.window_transform(window)


def patch_centre_lonlat(grid_transform, crs, row, col, size=64):
    """lon, lat (degrees) of the centre of the size x size patch with top-left pixel (row, col)."""
    x, y = xy(grid_transform, row + size / 2, col + size / 2, offset="ul")
    lons, lats = transform(crs, "EPSG:4326", [x], [y])
    return lons[0], lats[0]


def box_to_values(item, bbox):
    """Read the box from one scene; return offset-free values (H, W, 3) and the data mask."""
    dn, has_data = read_box(item, bbox)
    return remove_offset(dn, item), has_data


def values_to_rgb(values, calibration, scale_max):
    """Offset-free Level-2A values -> calibrated, EuroSAT-style uint8 RGB."""
    return to_eurosat_rgb(apply_calibration(values, calibration), scale_max)


def cut_patches(rgb, has_data, size=64):
    """Cut into non-overlapping size x size patches. Drops patches with any no-data pixel.

    Returns a list of (row, col, patch): row/col are the patch's top-left pixel in rgb.
    Leftover strips at the right and bottom edges (smaller than size) are dropped.
    """
    patches = []
    height, width = rgb.shape[:2]
    for row in range(0, height - size + 1, size):
        for col in range(0, width - size + 1, size):
            if has_data[row:row + size, col:col + size].all():
                patches.append((row, col, rgb[row:row + size, col:col + size]))
    return patches
