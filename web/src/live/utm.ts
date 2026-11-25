// Longitude/latitude (WGS 84) <-> UTM metres, so the browser can find the same pixel window in a Sentinel-2 picture as
// rasterio does in src/imagery.py. Sentinel-2 tiles are stored in UTM (EPSG:326xx north, 327xx south).
// Transverse Mercator with Krüger's series to the 6th order (Karney 2011): well under a millimetre inside a UTM zone,
// which is what we need, since pixel windows are rounded from these numbers. Tested against pyproj in live.test.ts.
const A_ = 6378137, F = 1 / 298.257223563, K0 = 0.9996;
const N = F / (2 - F), E = Math.sqrt(F * (2 - F));
const n2 = N * N, n3 = n2 * N, n4 = n3 * N, n5 = n4 * N, n6 = n5 * N;
const A = (A_ / (1 + N)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
const ALPHA = [
  N / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
  (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
  (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
  (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
  (212378941 * n6) / 319334400,
];
const BETA = [
  N / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
  (17 * n3) / 480 - (37 * n4) / 840 - (209261 * n5) / 4838400 + (5569 * n6) / 90720,
  (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
  (4583 * n5) / 161280 - (108847 * n6) / 3991680,
  (20648693 * n6) / 638668800,
];
const RAD = Math.PI / 180;

// EPSG code -> UTM zone. Only 326xx / 327xx (every Sentinel-2 tile uses one of them).
export function utmZone(epsg: number): { zone: number; south: boolean } {
  if (epsg > 32600 && epsg <= 32660) return { zone: epsg - 32600, south: false };
  if (epsg > 32700 && epsg <= 32760) return { zone: epsg - 32700, south: true };
  throw new Error(`EPSG:${epsg} is not a UTM zone`);
}

const confTau = (tau: number) => { const s = Math.sinh(E * Math.atanh((E * tau) / Math.hypot(1, tau))); return tau * Math.hypot(1, s) - s * Math.hypot(1, tau); };

export function toUtm(epsg: number, lon: number, lat: number): [number, number] {
  const { zone, south } = utmZone(epsg);
  const lam = (lon - (zone * 6 - 183)) * RAD;
  const tp = confTau(Math.tan(lat * RAD));
  const xi0 = Math.atan2(tp, Math.cos(lam)), eta0 = Math.asinh(Math.sin(lam) / Math.hypot(tp, Math.cos(lam)));
  let xi = xi0, eta = eta0;
  ALPHA.forEach((a, j) => { const k = 2 * (j + 1); xi += a * Math.sin(k * xi0) * Math.cosh(k * eta0); eta += a * Math.cos(k * xi0) * Math.sinh(k * eta0); });
  return [K0 * A * eta + 500000, K0 * A * xi + (south ? 10000000 : 0)];
}

export function toLonLat(epsg: number, x: number, y: number): [number, number] {
  const { zone, south } = utmZone(epsg);
  const xi = (y - (south ? 10000000 : 0)) / (K0 * A), eta = (x - 500000) / (K0 * A);
  let xi0 = xi, eta0 = eta;
  BETA.forEach((b, j) => { const k = 2 * (j + 1); xi0 -= b * Math.sin(k * xi) * Math.cosh(k * eta); eta0 -= b * Math.cos(k * xi) * Math.sinh(k * eta); });
  const sh = Math.sinh(eta0), cx = Math.cos(xi0);
  const tp = Math.sin(xi0) / Math.hypot(sh, cx);
  // Newton's method for tan(latitude) from the conformal one.
  let tau = tp;
  for (let i = 0; i < 8; i++) {
    const d = ((tp - confTau(tau)) / Math.hypot(1, confTau(tau))) * ((1 + (1 - E * E) * tau * tau) / ((1 - E * E) * Math.hypot(1, tau)));
    tau += d;
    if (Math.abs(d) < 1e-14) break;
  }
  return [Math.atan2(sh, cx) / RAD + (zone * 6 - 183), Math.atan(tau) / RAD];
}
