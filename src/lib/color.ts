import type { Calibration, MixerColor } from "../types";

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };
export type MixMode = "visual" | "perceptual" | "subtractive";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const clamp255 = (value: number) => Math.round(clamp(value, 0, 255));

export const normalizeHex = (hex: string) => {
  const clean = hex.trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean
      .split("")
      .map((char) => char + char)
      .join("")}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean}`.toLowerCase();
  }
  return "#000000";
};

export const hexToRgb = (hex: string): Rgb => {
  const normalized = normalizeHex(hex);
  const int = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

export const rgbToHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b]
    .map((channel) => clamp255(channel).toString(16).padStart(2, "0"))
    .join("")}`;

const srgbToLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (channel: number) => {
  const value = clamp(channel);
  const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return srgb * 255;
};

const rgbToLinear = (rgb: Rgb): Rgb => ({
  r: srgbToLinear(rgb.r),
  g: srgbToLinear(rgb.g),
  b: srgbToLinear(rgb.b),
});

const linearToRgb = (rgb: Rgb): Rgb => ({
  r: linearToSrgb(rgb.r),
  g: linearToSrgb(rgb.g),
  b: linearToSrgb(rgb.b),
});

type Oklab = { l: number; a: number; b: number };

const rgbToOklab = (rgb: Rgb): Oklab => {
  const linear = rgbToLinear(rgb);
  const l = 0.4122214708 * linear.r + 0.5363325363 * linear.g + 0.0514459929 * linear.b;
  const m = 0.2119034982 * linear.r + 0.6806995451 * linear.g + 0.1073969566 * linear.b;
  const s = 0.0883024619 * linear.r + 0.2817188376 * linear.g + 0.6299787005 * linear.b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
};

const oklabToRgb = (lab: Oklab): Rgb => {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return linearToRgb({
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  });
};

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
};

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const normalizedS = clamp(s / 100);
  const normalizedL = clamp(l / 100);
  const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = normalizedL - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
};

export const mixColors = (colors: MixerColor[], mode: MixMode) => {
  const active = colors.filter((color) => color.parts > 0);
  const total = active.reduce((sum, color) => sum + color.parts, 0);
  if (!active.length || total <= 0) return "#000000";

  if (mode === "visual") {
    const mixed = active.reduce(
      (sum, color) => {
        const rgb = rgbToLinear(hexToRgb(color.hex));
        const weight = color.parts / total;
        return {
          r: sum.r + rgb.r * weight,
          g: sum.g + rgb.g * weight,
          b: sum.b + rgb.b * weight,
        };
      },
      { r: 0, g: 0, b: 0 },
    );
    return rgbToHex(linearToRgb(mixed));
  }

  if (mode === "perceptual") {
    const mixed = active.reduce(
      (sum, color) => {
        const lab = rgbToOklab(hexToRgb(color.hex));
        const weight = color.parts / total;
        return {
          l: sum.l + lab.l * weight,
          a: sum.a + lab.a * weight,
          b: sum.b + lab.b * weight,
        };
      },
      { l: 0, a: 0, b: 0 },
    );
    return rgbToHex(oklabToRgb(mixed));
  }

  const mixedCmy = active.reduce(
    (sum, color) => {
      const rgb = hexToRgb(color.hex);
      const weight = color.parts / total;
      return {
        c: sum.c + (1 - rgb.r / 255) * weight,
        m: sum.m + (1 - rgb.g / 255) * weight,
        y: sum.y + (1 - rgb.b / 255) * weight,
      };
    },
    { c: 0, m: 0, y: 0 },
  );

  const uniqueFamilies = new Set(active.map((color) => color.name.toLowerCase().split(" ")[0])).size;
  const hues = active.map((color) => rgbToHsl(hexToRgb(color.hex)).h);
  const hasComplementPressure = hues.some((hue, index) =>
    hues.some((otherHue, otherIndex) => index !== otherIndex && Math.abs((((hue - otherHue + 540) % 360) - 180)) < 38),
  );

  const darken = clamp((uniqueFamilies - 1) * 0.045 + (hasComplementPressure ? 0.09 : 0), 0, 0.28);
  const rgb = {
    r: (1 - mixedCmy.c) * 255 * (1 - darken),
    g: (1 - mixedCmy.m) * 255 * (1 - darken),
    b: (1 - mixedCmy.y) * 255 * (1 - darken),
  };
  const hsl = rgbToHsl(rgb);
  const saturationDrop = hasComplementPressure ? 22 : uniqueFamilies > 2 ? 10 : 0;
  return rgbToHex(hslToRgb({ ...hsl, s: clamp(hsl.s - saturationDrop, 0, 100) }));
};

export const applyPrimer = (hex: string, primerHex: string, opacity: string, layers: number) => {
  const paint = hexToRgb(hex);
  const primer = hexToRgb(primerHex);
  const opacityMap: Record<string, number> = {
    opaco: 0.92,
    "semi-opaco": 0.72,
    translúcido: 0.42,
    transparente: 0.28,
  };
  const baseOpacity = opacityMap[opacity] ?? 0.72;
  const alpha = 1 - (1 - baseOpacity) ** Math.max(1, layers);
  return rgbToHex({
    r: primer.r * (1 - alpha) + paint.r * alpha,
    g: primer.g * (1 - alpha) + paint.g * alpha,
    b: primer.b * (1 - alpha) + paint.b * alpha,
  });
};

export const adjustHsl = (hex: string, changes: Partial<Hsl>) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(
    hslToRgb({
      h: (changes.h ?? hsl.h) % 360,
      s: clamp(changes.s ?? hsl.s, 0, 100),
      l: clamp(changes.l ?? hsl.l, 0, 100),
    }),
  );
};

export const getVariations = (hex: string) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  return {
    lighter: adjustHsl(hex, { l: hsl.l + 16 }),
    darker: adjustHsl(hex, { l: hsl.l - 16 }),
    saturated: adjustHsl(hex, { s: hsl.s + 18 }),
    desaturated: adjustHsl(hex, { s: hsl.s - 22 }),
    warmer: adjustHsl(hex, { h: (hsl.h + 18) % 360, s: hsl.s + 8 }),
    cooler: adjustHsl(hex, { h: (hsl.h + 342) % 360, s: hsl.s + 6 }),
    shadow: adjustHsl(hex, { h: (hsl.h + 15) % 360, s: hsl.s - 8, l: hsl.l - 24 }),
    highlight: adjustHsl(hex, { h: (hsl.h + 8) % 360, s: hsl.s - 6, l: hsl.l + 24 }),
  };
};

export const getComplement = (hex: string) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, h: (hsl.h + 180) % 360 }));
};

export const makeCalibrationKey = (colors: MixerColor[]) =>
  colors
    .filter((color) => color.parts > 0)
    .map((color) => `${color.sourceId ?? color.name}:${color.parts}`)
    .sort()
    .join("|");

export const findCalibration = (colors: MixerColor[], calibrations: Calibration[]) => {
  const key = makeCalibrationKey(colors);
  return [...calibrations].reverse().find((calibration) => calibration.sourceKey === key);
};

export const readableTextColor = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#0f172a" : "#f8fafc";
};
