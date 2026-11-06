// Shapes of the data files in web/public/data/ (made by src/showcase.py, src/web_checks.py, src/quiz.py).

export type ClassInfo = { name: string; colour: string };
export type CityRef = { id: string; name: string; bbox: number[]; summary: string };
export type Index = { years: string[]; classes: ClassInfo[]; cities: CityRef[]; model: string };

export type Change = { from: string; to: string; patches: number; km2: number };
export type Summary = {
  id: string;
  name: string;
  tile: string;
  grid_rows: number;
  grid_cols: number;
  km2_per_patch: number;
  n_patches: number;
  changed_patches: number;
  changed_km2: number;
  overlay_corners: [number, number][];
  areas_km2: Record<string, Record<string, number>>;
  changes: Change[];
  years: Record<string, { n_scenes: number; window: string }>;
  files: {
    overlay: Record<string, string>;
    rgb: Record<string, string>;
    geotiff: Record<string, string>;
    map_png: Record<string, string>;
    patches_geojson: string;
    patches_csv: string;
  };
};

// One row of patches.csv: a 640 m square with the model's class and confidence for each year.
export type Patch = { row: number; col: number; lon: number; lat: number; changed: boolean; cls: Record<string, string>; conf: Record<string, number> };

export type City = { id: string; base: string; summary: Summary; patches: Patch[] };

export type Checks = {
  judged_by: string;
  n_pairs: number;
  real_rate: number;
  squares: { pair: string; id: number; lon: number; lat: number; verdict: "yes" | "no" | "unclear" }[];
};
