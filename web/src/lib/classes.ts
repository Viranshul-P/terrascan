// Names for the 10 EuroSAT classes. The site shows the plain name, with the original EuroSAT name next to it in
// small text where they differ (user's decision, 2026-11-07).
export const PLAIN: Record<string, string> = {
  AnnualCrop: "Farmland",
  Forest: "Forest",
  HerbaceousVegetation: "Scrub and grass",
  Highway: "Roads",
  Industrial: "Industrial",
  Pasture: "Pasture",
  PermanentCrop: "Orchards",
  Residential: "Housing",
  River: "River",
  SeaLake: "Lake",
};

// { plain, original }; original is null when it is the same word as the plain name.
export function className(key: string) {
  const plain = PLAIN[key] ?? key;
  return { plain, original: plain === key ? null : key };
}
