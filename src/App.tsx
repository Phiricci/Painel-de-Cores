import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Beaker,
  BookOpen,
  Brush,
  CheckCircle2,
  ClipboardList,
  Contrast,
  Copy,
  Download,
  Droplets,
  FileJson,
  FileText,
  FlaskConical,
  Gem,
  Home,
  Image as ImageIcon,
  Layers,
  Link,
  Moon,
  Palette,
  PaintBucket,
  Pipette,
  Plus,
  RotateCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  SprayCan,
  Star,
  Sun,
  ThermometerSun,
  Trash2,
  Upload,
  WandSparkles,
  Wrench,
} from "lucide-react";
import rawDatabase from "./data/paintDatabase.json";
import { paintBrands } from "./data/paintBrands";
import {
  adjustHsl,
  applyPrimer,
  findCalibration,
  getComplement,
  getVariations,
  hexToRgb,
  hslToRgb,
  makeCalibrationKey,
  mixColors,
  normalizeHex,
  readableTextColor,
  rgbToHex,
  rgbToHsl,
  type MixMode,
} from "./lib/color";
import type { BrandPaint, Calibration, ColorEntry, MixerColor, PaintDatabase, Palette as PaletteData, Recipe, SavedRecipe } from "./types";

type SectionId =
  | "home"
  | "mixer"
  | "recipes"
  | "techniques"
  | "paintTypes"
  | "resin"
  | "palettes"
  | "problems"
  | "project"
  | "mine"
  | "guide"
  | "settings";

type HistoryItem = {
  id: string;
  hex: string;
  calibratedHex?: string;
  mode: MixMode;
  createdAt: string;
  label: string;
};

type FavoriteState = {
  recipes: string[];
  techniques: string[];
  palettes: string[];
};

type ProjectState = {
  name: string;
  piece: string;
  primer: string;
  palette: string;
  varnish: string;
  recipes: string[];
  notes: string;
  tasks: Array<{ id: string; label: string; done: boolean }>;
};

type ShareRecipePayload = {
  v: 1;
  name: string;
  colors: MixerColor[];
  mode: MixMode;
  primer: string;
  opacity: string;
  finish: string;
  resultHex: string;
  calibratedHex?: string;
};

type BrandMixSuggestion = {
  targetHex: string;
  resultHex: string;
  score: number;
  parts: Array<{ paint: BrandPaint; parts: number }>;
};

const seedDatabase = rawDatabase as unknown as PaintDatabase;

const storageKeys = {
  db: "solitario.color3d.database",
  saved: "solitario.color3d.savedRecipes",
  calibrations: "solitario.color3d.calibrations",
  history: "solitario.color3d.history",
  checklist: "solitario.color3d.resinChecklist",
  theme: "solitario.color3d.theme",
  favorites: "solitario.color3d.favorites",
  project: "solitario.color3d.currentProject",
};

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: "mixer", label: "Misturador de Cores", icon: FlaskConical },
  { id: "recipes", label: "Receitas Prontas", icon: BookOpen },
  { id: "techniques", label: "Técnicas de Pintura", icon: Brush },
  { id: "paintTypes", label: "Tipos de Tinta e Efeitos", icon: PaintBucket },
  { id: "resin", label: "Fluxo para Resina 3D", icon: ShieldCheck },
  { id: "palettes", label: "Biblioteca de Paletas", icon: Palette },
  { id: "problems", label: "Problemas e Soluções", icon: Wrench },
  { id: "project", label: "Projeto Atual", icon: ClipboardList },
  { id: "mine", label: "Minhas Receitas", icon: Save },
  { id: "settings", label: "Configurações / Calibração", icon: Settings },
];

const primarySections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Início", icon: Home },
  { id: "mixer", label: "Criar cor", icon: Pipette },
  { id: "recipes", label: "Receitas", icon: BookOpen },
  { id: "mine", label: "Salvos", icon: Save },
  { id: "settings", label: "Mais", icon: Settings },
];

const primerOptions = [
  { id: "preto", label: "Preto", hex: "#050505" },
  { id: "branco", label: "Branco", hex: "#f8fafc" },
  { id: "cinza", label: "Cinza", hex: "#737373" },
  { id: "zenithal", label: "Zenithal preto/branco", hex: "#a8a29e" },
  { id: "prata", label: "Prata metálico", hex: "#c0c7cf" },
  { id: "dourado", label: "Dourado metálico", hex: "#d4a72c" },
  { id: "marrom", label: "Marrom", hex: "#4b2b1a" },
  { id: "custom", label: "Cor personalizada", hex: "#64748b" },
];

const opacityOptions = ["opaco", "semi-opaco", "translúcido", "transparente"];
const finishOptions = ["fosco", "acetinado", "brilhante", "gloss intenso", "metálico", "perolado", "candy", "fluorescente", "interference / color shift"];
const paintInputTypes = ["acrílica", "ink", "wash", "contrast", "speedpaint", "óleo", "enamel", "laca", "metálica", "fluorescente", "candy", "transparente"];
const paletteTypes = [
  "monocromática",
  "complementar",
  "complementar dividida",
  "análoga",
  "triádica",
  "tétrade",
  "quente",
  "fria",
  "grimdark",
  "pastel",
  "neon",
  "naturalista",
  "alto contraste",
  "baixo contraste",
  "fantasia",
  "sci-fi",
  "horror",
  "militar",
  "anime",
  "realista",
  "cel shading",
];

const techniqueFilters = [
  "iniciante",
  "intermediário",
  "avançado",
  "pincel",
  "airbrush",
  "speedpaint",
  "busto",
  "miniatura RPG",
  "veículo",
  "diorama",
  "metal",
  "pele",
  "tecido",
  "monstro",
  "efeito mágico",
  "weathering",
];

const emptyFavorites: FavoriteState = { recipes: [], techniques: [], palettes: [] };

const defaultProject: ProjectState = {
  name: "Projeto sem título",
  piece: "Miniatura / peça em resina",
  primer: "cinza ou zenithal",
  palette: "",
  varnish: "fosco geral com gloss seletivo",
  recipes: [],
  notes: "",
  tasks: [
    { id: "limpeza", label: "Limpar, secar e curar a peça", done: false },
    { id: "primer", label: "Aplicar primer fino e inspecionar falhas", done: false },
    { id: "base", label: "Aplicar basecoat em camadas finas", done: false },
    { id: "sombras", label: "Criar sombras, wash ou recess wash", done: false },
    { id: "luzes", label: "Fazer layers, highlights e detalhes", done: false },
    { id: "acabamento", label: "Aplicar verniz final e gloss seletivo", done: false },
  ],
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

const downloadBlob = (filename: string, content: BlobPart, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const copyToClipboard = async (text: string) => {
  await navigator.clipboard?.writeText(text);
};

const colorFormats = (hex: string) => {
  const normalized = normalizeHex(hex);
  const rgb = hexToRgb(normalized);
  const hsl = rgbToHsl(rgb);
  return {
    hex: normalized.toUpperCase(),
    rgb: `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`,
    hsl: `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)`,
    css: `--cor-pintura: ${normalized.toUpperCase()};`,
  };
};

const channelLuminance = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
};

const contrastRatio = (a: string, b: string) => {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
};

const contrastLabel = (ratio: number) => {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "Grande";
  return "Baixo";
};

const encodeSharePayload = (payload: ShareRecipePayload) => {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeSharePayload = (value: string): ShareRecipePayload | null => {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as ShareRecipePayload;
  } catch {
    return null;
  }
};

const createMixerColor = (color: ColorEntry, parts = 1): MixerColor => ({
  id: crypto.randomUUID(),
  sourceId: color.id,
  name: color.name,
  hex: color.hex,
  parts,
  paintType: color.finish === "metálico" ? "metálica" : "acrílica",
  opacity: color.opacity,
  finish: color.finish,
});

const createBrandMixerColor = (brandId: string, paintId: string, parts = 1): MixerColor => {
  const brand = paintBrands.find((entry) => entry.id === brandId) ?? paintBrands[0];
  const paint = brand.paints.find((entry) => entry.id === paintId) ?? brand.paints[0];
  return {
    id: crypto.randomUUID(),
    brandId: brand.id,
    brandName: brand.name,
    paintId: paint.id,
    line: paint.line,
    name: paint.name,
    hex: paint.hex,
    parts,
    paintType: paint.type,
    opacity: paint.opacity,
    finish: paint.finish,
  };
};

const createCustomMixerColor = (name: string, hex: string, parts = 1): MixerColor => ({
  id: crypto.randomUUID(),
  name,
  hex: normalizeHex(hex),
  parts,
  paintType: "acrílica",
  opacity: "semi-opaco",
  finish: "fosco",
});

const findColorForMix = (database: PaintDatabase, colorName: string, fallbackHex: string) => {
  const normalized = normalizeText(colorName);
  return (
    database.colors.find((color) => normalizeText(color.id) === normalized) ??
    database.colors.find((color) => normalizeText(color.name) === normalized) ??
    database.colors.find((color) => normalized.includes(normalizeText(color.family)) || normalizeText(color.name).includes(normalized.split(" ")[0])) ??
    null
  ) ?? createCustomMixerColor(colorName, fallbackHex);
};

const colorDistance = (a: string, b: string) => {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  const hslA = rgbToHsl(rgbA);
  const hslB = rgbToHsl(rgbB);
  const hueDistance = Math.abs(((hslA.h - hslB.h + 540) % 360) - 180) / 180;
  const rgbDistance = Math.sqrt((rgbA.r - rgbB.r) ** 2 + (rgbA.g - rgbB.g) ** 2 + (rgbA.b - rgbB.b) ** 2) / 441.7;
  const saturationDistance = Math.abs(hslA.s - hslB.s) / 100;
  const lightnessDistance = Math.abs(hslA.l - hslB.l) / 100;
  return rgbDistance * 0.58 + hueDistance * 0.22 + saturationDistance * 0.1 + lightnessDistance * 0.1;
};

const closestBrandPaint = (brandId: string, targetHex: string, line?: string) => {
  const brand = paintBrands.find((entry) => entry.id === brandId) ?? paintBrands[0];
  const pool = line && line !== "todas" ? brand.paints.filter((paint) => paint.line === line) : brand.paints;
  const candidates = pool.length ? pool : brand.paints;
  return [...candidates].sort((a, b) => colorDistance(a.hex, targetHex) - colorDistance(b.hex, targetHex))[0];
};

const brandLineOptions = (brandId: string) => {
  const brand = paintBrands.find((entry) => entry.id === brandId) ?? paintBrands[0];
  return ["todas", ...brand.lines];
};

const paintPartToMixerColor = (paint: BrandPaint, parts: number, brand?: (typeof paintBrands)[number]): MixerColor => ({
  id: `${paint.id}-${parts}`,
  brandId: brand?.id,
  brandName: brand?.name,
  paintId: paint.id,
  line: paint.line,
  name: paint.name,
  hex: paint.hex,
  parts,
  paintType: paint.type,
  opacity: paint.opacity,
  finish: paint.finish,
});

const mixBrandParts = (parts: Array<{ paint: BrandPaint; parts: number }>, brand?: (typeof paintBrands)[number]) =>
  mixColors(parts.map((part) => paintPartToMixerColor(part.paint, part.parts, brand)), "perceptual");

const suggestBrandMix = (paints: BrandPaint[], targetHex: string, brand?: (typeof paintBrands)[number]): BrandMixSuggestion | null => {
  if (!paints.length) return null;
  const candidates = paints.slice(0, 48);
  const ratios = [
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [1, 2],
    [1, 3],
    [1, 4],
  ];
  const pushCandidate = (parts: Array<{ paint: BrandPaint; parts: number }>, currentBest: BrandMixSuggestion | null) => {
    const resultHex = mixBrandParts(parts, brand);
    const score = colorDistance(resultHex, targetHex);
    if (!currentBest || score < currentBest.score) return { targetHex, resultHex, score, parts };
    return currentBest;
  };

  let best: BrandMixSuggestion | null = null;
  candidates.forEach((paint) => {
    best = pushCandidate([{ paint, parts: 1 }], best);
  });

  for (let index = 0; index < candidates.length; index += 1) {
    for (let other = index + 1; other < candidates.length; other += 1) {
      ratios.forEach(([first, second]) => {
        best = pushCandidate(
          [
            { paint: candidates[index], parts: first },
            { paint: candidates[other], parts: second },
          ],
          best,
        );
      });
    }
  }

  return best;
};

const paletteFromBase = (type: string, baseHex: string): PaletteData => {
  const baseHsl = rgbToHsl(hexToRgb(baseHex));
  const make = (h: number, s = baseHsl.s, l = baseHsl.l) => rgbToHex(hslToRgb({ h: (h + 360) % 360, s, l }));
  const low = Math.max(14, baseHsl.l - 28);
  const high = Math.min(92, baseHsl.l + 28);
  const recipes: Record<string, string[]> = {
    "monocromática": [make(baseHsl.h), make(baseHsl.h, baseHsl.s - 16, low + 10), make(baseHsl.h, baseHsl.s + 8, low), make(baseHsl.h, baseHsl.s - 12, high), make(baseHsl.h, baseHsl.s + 18, high - 12), make(baseHsl.h, baseHsl.s - 35, 52), "#5b5146"],
    complementar: [make(baseHsl.h), make(baseHsl.h + 180), make(baseHsl.h, baseHsl.s, low), make(baseHsl.h, baseHsl.s - 8, high), make(baseHsl.h + 180, baseHsl.s + 8, 46), make(baseHsl.h + 180, 80, 62), "#6b5f4a"],
    "complementar dividida": [make(baseHsl.h), make(baseHsl.h + 150), make(baseHsl.h, baseHsl.s, low), make(baseHsl.h, baseHsl.s - 10, high), make(baseHsl.h + 210), make(baseHsl.h + 30, 75, 58), "#5f6368"],
    "análoga": [make(baseHsl.h), make(baseHsl.h + 32), make(baseHsl.h - 24, baseHsl.s, low), make(baseHsl.h + 12, baseHsl.s - 8, high), make(baseHsl.h - 42), make(baseHsl.h + 180, 65, 55), "#556b2f"],
    "triádica": [make(baseHsl.h), make(baseHsl.h + 120), make(baseHsl.h, baseHsl.s, low), make(baseHsl.h, baseHsl.s - 8, high), make(baseHsl.h + 240), make(baseHsl.h + 60, 80, 58), "#737373"],
    tétrade: [make(baseHsl.h), make(baseHsl.h + 90), make(baseHsl.h + 180, baseHsl.s, low), make(baseHsl.h, baseHsl.s - 8, high), make(baseHsl.h + 270), make(baseHsl.h + 45, 78, 56), "#4b5563"],
  };

  const themed: Record<string, string[]> = {
    quente: ["#d71920", "#f97316", "#5c1b17", "#ffd21f", "#d4a72c", "#06b6d4", "#7c3f20"],
    fria: ["#2563eb", "#2dd4bf", "#0f172a", "#b9ecff", "#6d28d9", "#f97316", "#475569"],
    grimdark: ["#101622", "#4b5563", "#050505", "#94a3b8", "#7f1d1d", "#d4a72c", "#5f6368"],
    pastel: ["#f7c7d9", "#b9ecff", "#a78bfa", "#ffffff", "#f2e7c9", "#2dd4bf", "#d4d4d4"],
    neon: ["#111827", "#6d28d9", "#020617", "#00d5ff", "#39ff14", "#c026d3", "#3f3f46"],
    naturalista: ["#556b2f", "#7c3f20", "#25351f", "#a3a36f", "#b7791f", "#d6b98c", "#3f2414"],
    "alto contraste": ["#050505", "#f8fafc", "#111827", "#ffffff", baseHex, getComplement(baseHex), "#737373"],
    "baixo contraste": [make(baseHsl.h, 35, 48), make(baseHsl.h + 24, 30, 54), make(baseHsl.h, 25, 34), make(baseHsl.h, 22, 68), make(baseHsl.h - 18, 38, 56), make(baseHsl.h + 80, 30, 55), "#77716a"],
    fantasia: ["#6d28d9", "#d4a72c", "#150b2b", "#f2e7c9", "#2dd4bf", "#d71920", "#556b2f"],
    "sci-fi": ["#e5e7eb", "#1f2937", "#0f172a", "#ffffff", "#ef4444", "#00d5ff", "#475569"],
    horror: ["#6b2f2a", "#4f2d22", "#1c0f0c", "#d6b98c", "#8f0711", "#39ff14", "#3f2414"],
    militar: ["#556b2f", "#7c6a46", "#2f3324", "#a3a36f", "#5b6168", "#b7791f", "#8a6f3f"],
    anime: ["#f97316", "#2563eb", "#7f1d1d", "#fff7ad", "#050505", "#f8fafc", "#737373"],
    realista: ["#7c3f20", "#556b2f", "#2f241e", "#d6b98c", "#5b6168", "#b7791f", "#6b5f4a"],
    "cel shading": ["#f97316", "#2563eb", "#7f1d1d", "#fff7ad", "#050505", "#f8fafc", "#737373"],
  };

  const values = recipes[type] ?? themed[type] ?? recipes.complementar;
  return {
    id: `gerada-${type}`,
    name: `Paleta ${type}`,
    type,
    colors: {
      principal: values[0],
      secundaria: values[1],
      sombra: values[2],
      highlight: values[3],
      detalhe: values[4],
      contraste: values[5],
      base: values[6],
    },
    varnish: type.includes("candy") || type === "sci-fi" ? "satin com gloss seletivo" : "fosco com brilho seletivo quando necessário",
    techniques: type === "grimdark" ? ["wash", "streaking grime", "edge highlight", "pigmentos"] : ["basecoat", "glaze", "highlight", "verniz seletivo"],
  };
};

function FieldLabel({ children }: { children: string }) {
  return <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</label>;
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  type = "button",
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={label}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
        active
          ? "border-teal-400 bg-teal-500 text-slate-950 shadow-glow"
          : "border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-400",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function ColorSwatch({ hex, label, large = false }: { hex: string; label?: string; large?: boolean }) {
  return (
    <div
      className={cx("flex items-end rounded-lg border border-white/20 p-2 shadow-inner", large ? "h-32 min-h-32" : "h-20")}
      style={{ background: hex, color: readableTextColor(hex) }}
      title={`${label ?? "cor"} ${hex}`}
    >
      <div className="min-w-0">
        {label ? <div className="truncate text-xs font-bold">{label}</div> : null}
        <div className="font-mono text-xs font-semibold uppercase">{hex}</div>
      </div>
    </div>
  );
}

function ColorCodePanel({ hex, label = "Cor calibrada" }: { hex: string; label?: string }) {
  const [copied, setCopied] = useState("");
  const formats = colorFormats(hex);
  const whiteContrast = contrastRatio(hex, "#ffffff");
  const blackContrast = contrastRatio(hex, "#000000");
  const bestText = whiteContrast >= blackContrast ? "branco" : "preto";
  const items = [
    ["HEX", formats.hex],
    ["RGB", formats.rgb],
    ["HSL", formats.hsl],
    ["CSS", formats.css],
  ] as const;

  const handleCopy = async (formatLabel: string, value: string) => {
    await copyToClipboard(value);
    setCopied(formatLabel);
    window.setTimeout(() => setCopied(""), 1400);
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-slate-950 dark:text-white">{label}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Toque para copiar códigos de cor.</div>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {formats.hex}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(([formatLabel, value]) => (
          <button
            key={formatLabel}
            type="button"
            onClick={() => handleCopy(formatLabel, value)}
            className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-xs transition hover:border-teal-400 dark:border-slate-800 dark:bg-slate-950"
          >
            <span>
              <span className="block font-black text-slate-950 dark:text-white">{formatLabel}</span>
              <span className="block max-w-[190px] truncate font-mono text-slate-600 dark:text-slate-300">{value}</span>
            </span>
            <span className="flex items-center gap-1 text-teal-700 dark:text-teal-300">
              <Copy className="h-3.5 w-3.5" />
              {copied === formatLabel ? "copiado" : "copiar"}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ContrastSample label="Texto branco" ratio={whiteContrast} background={hex} color="#ffffff" />
        <ContrastSample label="Texto preto" ratio={blackContrast} background={hex} color="#000000" />
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
            <Contrast className="h-4 w-4 text-teal-500" />
            Melhor leitura
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Use texto <strong>{bestText}</strong> sobre esta cor. Contraste é referência digital, não substitui teste na peça.
          </p>
        </div>
      </div>
    </div>
  );
}

function ContrastSample({ label, ratio, background, color }: { label: string; ratio: number; background: string; color: string }) {
  return (
    <div className="rounded-lg border border-white/20 p-3" style={{ background, color }}>
      <div className="text-xs font-black">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold">{ratio.toFixed(1)}:1</div>
      <div className="mt-2 inline-flex rounded-md bg-black/15 px-2 py-1 text-[11px] font-black uppercase">{contrastLabel(ratio)}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500 text-slate-950">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{title}</h2>
        </div>
        {subtitle ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function DataCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <article className={cx("rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>{children}</article>;
}

function App() {
  const [database, setDatabase] = useLocalStorage<PaintDatabase>(storageKeys.db, seedDatabase);
  const [savedRecipes, setSavedRecipes] = useLocalStorage<SavedRecipe[]>(storageKeys.saved, []);
  const [calibrations, setCalibrations] = useLocalStorage<Calibration[]>(storageKeys.calibrations, []);
  const [history, setHistory] = useLocalStorage<HistoryItem[]>(storageKeys.history, []);
  const [checklist, setChecklist] = useLocalStorage<Record<string, boolean>>(storageKeys.checklist, {});
  const [theme, setTheme] = useLocalStorage<"dark" | "light">(storageKeys.theme, "dark");
  const [favorites, setFavorites] = useLocalStorage<FavoriteState>(storageKeys.favorites, emptyFavorites);
  const [project, setProject] = useLocalStorage<ProjectState>(storageKeys.project, defaultProject);
  const [section, setSection] = useState<SectionId>("home");
  const [mixMode, setMixMode] = useState<MixMode>("perceptual");
  const [primerId, setPrimerId] = useState("cinza");
  const [customPrimer, setCustomPrimer] = useState("#64748b");
  const [mixerOpacity, setMixerOpacity] = useState("semi-opaco");
  const [mixerFinish, setMixerFinish] = useState("fosco");
  const [selectedBrandId, setSelectedBrandId] = useState("vallejo");
  const [selectedBrandLine, setSelectedBrandLine] = useState("todas");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [techniqueSearch, setTechniqueSearch] = useState("");
  const [activeTechniqueFilter, setActiveTechniqueFilter] = useState("todos");
  const [paintSearch, setPaintSearch] = useState("");
  const [problemSearch, setProblemSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState({ recipes: false, techniques: false, palettes: false });
  const [quickPreview, setQuickPreview] = useState<{ label: string; hex: string } | null>(null);
  const [paletteType, setPaletteType] = useState("complementar");
  const [paletteBase, setPaletteBase] = useState("#6d28d9");
  const exportRef = useRef<HTMLDivElement>(null);
  const loadedSharedRecipe = useRef(false);

  const [mixerColors, setMixerColors] = useState<MixerColor[]>(() => [
    createMixerColor(seedDatabase.colors.find((color) => color.id === "vermelho-vivo") ?? seedDatabase.colors[0], 3),
    createMixerColor(seedDatabase.colors.find((color) => color.id === "amarelo-vivo") ?? seedDatabase.colors[1], 1),
    createMixerColor(seedDatabase.colors.find((color) => color.id === "branco") ?? seedDatabase.colors[2], 0.5),
  ]);

  const currentPrimer = primerOptions.find((primer) => primer.id === primerId) ?? primerOptions[2];
  const primerHex = primerId === "custom" ? normalizeHex(customPrimer) : currentPrimer.hex;
  const predictedHex = useMemo(() => mixColors(mixerColors, mixMode), [mixerColors, mixMode]);
  const matchedCalibration = useMemo(() => findCalibration(mixerColors, calibrations), [mixerColors, calibrations]);
  const [manualCalibratedHex, setManualCalibratedHex] = useState(predictedHex);
  const calibratedHex = normalizeHex(matchedCalibration?.estimatedHex ?? manualCalibratedHex);
  const variations = useMemo(() => getVariations(predictedHex), [predictedHex]);
  const generatedPalette = useMemo(() => paletteFromBase(paletteType, paletteBase), [paletteType, paletteBase]);
  const selectedBrand = paintBrands.find((brand) => brand.id === selectedBrandId) ?? paintBrands[0];
  const selectedBrandPaints = selectedBrand.paints.filter((paint) => selectedBrandLine === "todas" || paint.line === selectedBrandLine);
  const brandEquivalentResult = closestBrandPaint(selectedBrandId, calibratedHex, selectedBrandLine);
  const brandEquivalentColors = useMemo(
    () =>
      mixerColors.map((color) => ({
        color,
        paint: closestBrandPaint(selectedBrandId, color.hex, selectedBrandLine),
      })),
    [mixerColors, selectedBrandId, selectedBrandLine],
  );

  const [calibrationDraft, setCalibrationDraft] = useState({
    brand: "Genérica",
    line: "Linha acrílica hobby",
    colorName: "Amostra real",
    estimatedHex: predictedHex,
    opacity: mixerOpacity,
    finish: mixerFinish,
    primer: currentPrimer.label,
    layers: 2,
    dilution: "1 parte tinta + 1 parte água/medium",
    photoName: "",
    photoDataUrl: "",
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (loadedSharedRecipe.current) return;
    loadedSharedRecipe.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith("#receita=")) return;
    const payload = decodeSharePayload(hash.replace("#receita=", ""));
    if (!payload?.colors?.length) return;
    setMixerColors(payload.colors.slice(0, 5).map((color) => ({ ...color, id: crypto.randomUUID() })));
    setMixMode(payload.mode ?? "perceptual");
    setMixerOpacity(payload.opacity);
    setMixerFinish(payload.finish);
    setManualCalibratedHex(payload.calibratedHex ?? payload.resultHex);
    setQuickPreview({ label: `Receita importada: ${payload.name}`, hex: payload.calibratedHex ?? payload.resultHex });
    setSection("mixer");
  }, []);

  useEffect(() => {
    setManualCalibratedHex(matchedCalibration?.estimatedHex ?? predictedHex);
    setCalibrationDraft((draft) => ({
      ...draft,
      estimatedHex: matchedCalibration?.estimatedHex ?? predictedHex,
      opacity: mixerOpacity,
      finish: mixerFinish,
      primer: currentPrimer.label,
    }));
  }, [predictedHex, matchedCalibration?.estimatedHex, mixerOpacity, mixerFinish, currentPrimer.label]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const sourceKey = makeCalibrationKey(mixerColors);
      setHistory((items) => {
        const next: HistoryItem = {
          id: `${sourceKey}-${mixMode}`,
          hex: predictedHex,
          calibratedHex: matchedCalibration?.estimatedHex,
          mode: mixMode,
          createdAt: new Date().toISOString(),
          label: mixerColors
            .filter((color) => color.parts > 0)
            .map((color) => `${color.parts} ${color.name}`)
            .join(" + "),
        };
        return [next, ...items.filter((item) => item.id !== next.id)].slice(0, 8);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [mixerColors, mixMode, predictedHex, matchedCalibration?.estimatedHex, setHistory]);

  const recipeResults = useMemo(() => {
    const term = normalizeText(recipeSearch);
    return database.recipes.filter((recipe) => {
      const body = normalizeText(`${recipe.name} ${recipe.primer} ${recipe.shade} ${recipe.highlight} ${recipe.techniques.join(" ")}`);
      return body.includes(term) && (!favoriteOnly.recipes || favorites.recipes.includes(recipe.id));
    });
  }, [database.recipes, favoriteOnly.recipes, favorites.recipes, recipeSearch]);

  const techniqueResults = useMemo(() => {
    const term = normalizeText(techniqueSearch);
    return database.techniques.filter((technique) => {
      const body = normalizeText(`${technique.name} ${technique.difficulty} ${technique.tags.join(" ")} ${technique.purpose} ${technique.uses.join(" ")}`);
      const matchesSearch = body.includes(term);
      const matchesFilter =
        activeTechniqueFilter === "todos" ||
        technique.difficulty === activeTechniqueFilter ||
        technique.tags.some((tag) => normalizeText(tag) === normalizeText(activeTechniqueFilter));
      return matchesSearch && matchesFilter && (!favoriteOnly.techniques || favorites.techniques.includes(technique.id));
    });
  }, [activeTechniqueFilter, database.techniques, favoriteOnly.techniques, favorites.techniques, techniqueSearch]);

  const paintTypeResults = useMemo(() => {
    const term = normalizeText(paintSearch);
    return database.paintTypes.filter((paintType) => normalizeText(`${paintType.name} ${paintType.description} ${paintType.bestUse.join(" ")}`).includes(term));
  }, [database.paintTypes, paintSearch]);

  const problemResults = useMemo(() => {
    const term = normalizeText(problemSearch);
    return database.problems.filter((problem) => normalizeText(`${problem.problem} ${problem.causes.join(" ")} ${problem.solution.join(" ")}`).includes(term));
  }, [database.problems, problemSearch]);

  const paletteResults = useMemo(
    () => database.palettes.filter((palette) => !favoriteOnly.palettes || favorites.palettes.includes(palette.id)),
    [database.palettes, favoriteOnly.palettes, favorites.palettes],
  );

  const globalResults = useMemo(() => {
    const term = normalizeText(globalSearch);
    if (term.length < 2) return [];
    const results: Array<{ id: string; label: string; detail: string; section: SectionId; action: () => void }> = [];

    database.recipes.forEach((recipe) => {
      if (normalizeText(`${recipe.name} ${recipe.primer} ${recipe.techniques.join(" ")}`).includes(term)) {
        results.push({
          id: `recipe-${recipe.id}`,
          label: recipe.name,
          detail: "Receita pronta",
          section: "recipes",
          action: () => {
            setRecipeSearch(recipe.name);
            setSection("recipes");
          },
        });
      }
    });

    database.techniques.forEach((technique) => {
      if (normalizeText(`${technique.name} ${technique.tags.join(" ")} ${technique.purpose}`).includes(term)) {
        results.push({
          id: `technique-${technique.id}`,
          label: technique.name,
          detail: `Técnica ${technique.difficulty}`,
          section: "techniques",
          action: () => {
            setTechniqueSearch(technique.name);
            setSection("techniques");
          },
        });
      }
    });

    database.paintTypes.forEach((paintType) => {
      if (normalizeText(`${paintType.name} ${paintType.description}`).includes(term)) {
        results.push({
          id: `paint-${paintType.id}`,
          label: paintType.name,
          detail: "Tipo de tinta",
          section: "paintTypes",
          action: () => {
            setPaintSearch(paintType.name);
            setSection("paintTypes");
          },
        });
      }
    });

    database.palettes.forEach((palette) => {
      if (normalizeText(`${palette.name} ${palette.type} ${palette.techniques.join(" ")}`).includes(term)) {
        results.push({
          id: `palette-${palette.id}`,
          label: palette.name,
          detail: `Paleta ${palette.type}`,
          section: "palettes",
          action: () => setSection("palettes"),
        });
      }
    });

    database.problems.forEach((problem) => {
      if (normalizeText(`${problem.problem} ${problem.causes.join(" ")} ${problem.solution.join(" ")}`).includes(term)) {
        results.push({
          id: `problem-${problem.id}`,
          label: problem.problem,
          detail: "Problema e solução",
          section: "problems",
          action: () => {
            setProblemSearch(problem.problem);
            setSection("problems");
          },
        });
      }
    });

    savedRecipes.forEach((recipe) => {
      if (normalizeText(`${recipe.name} ${recipe.notes}`).includes(term)) {
        results.push({
          id: `saved-${recipe.id}`,
          label: recipe.name,
          detail: "Minha receita",
          section: "mine",
          action: () => setSection("mine"),
        });
      }
    });

    return results.slice(0, 12);
  }, [database, globalSearch, savedRecipes]);

  const updateMixerColor = (id: string, patch: Partial<MixerColor>) => {
    setMixerColors((colors) => colors.map((color) => (color.id === id ? { ...color, ...patch } : color)));
  };

  const addMixerColor = () => {
    if (mixerColors.length >= 5) return;
    const nextPaint = selectedBrandPaints[mixerColors.length % Math.max(1, selectedBrandPaints.length)];
    if (nextPaint) {
      setMixerColors((colors) => [...colors, createBrandMixerColor(selectedBrand.id, nextPaint.id, 1)]);
      return;
    }
    const next = database.colors[mixerColors.length % database.colors.length];
    setMixerColors((colors) => [...colors, createMixerColor(next, 1)]);
  };

  const removeMixerColor = (id: string) => {
    setMixerColors((colors) => (colors.length <= 1 ? colors : colors.filter((color) => color.id !== id)));
  };

  const updateMixerColorFromBrandPaint = (id: string, brandId: string, paintId: string) => {
    const brand = paintBrands.find((entry) => entry.id === brandId);
    const paint = brand?.paints.find((entry) => entry.id === paintId);
    if (!brand || !paint) return;
    updateMixerColor(id, {
      brandId: brand.id,
      brandName: brand.name,
      paintId: paint.id,
      line: paint.line,
      sourceId: undefined,
      name: paint.name,
      hex: paint.hex,
      paintType: paint.type,
      opacity: paint.opacity,
      finish: paint.finish,
    });
  };

  const convertMixerToBrand = () => {
    setMixerColors((colors) =>
      colors.map((color) => {
        const paint = closestBrandPaint(selectedBrandId, color.hex, selectedBrandLine);
        return {
          ...color,
          brandId: selectedBrand.id,
          brandName: selectedBrand.name,
          paintId: paint.id,
          line: paint.line,
          sourceId: undefined,
          name: paint.name,
          hex: paint.hex,
          paintType: paint.type,
          opacity: paint.opacity,
          finish: paint.finish,
        };
      }),
    );
    setQuickPreview({ label: `Mistura convertida para ${selectedBrand.name}`, hex: brandEquivalentResult.hex });
  };

  const applyPhotoMixSuggestion = (suggestion: BrandMixSuggestion) => {
    setMixerColors(
      suggestion.parts.map((part) => ({
        ...paintPartToMixerColor(part.paint, part.parts, selectedBrand),
        id: crypto.randomUUID(),
      })),
    );
    setManualCalibratedHex(suggestion.targetHex);
    setQuickPreview({ label: "Cor da foto aplicada ao misturador", hex: suggestion.targetHex });
  };

  const toggleFavorite = (kind: keyof FavoriteState, id: string) => {
    setFavorites((current) => {
      const list = current[kind];
      return {
        ...current,
        [kind]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
      };
    });
  };

  const useRecipeInMixer = (recipe: Recipe, adaptation?: string) => {
    const mapped = recipe.mix.slice(0, 5).map((part) => {
      const match = findColorForMix(database, part.color, recipe.targetHex);
      return "sourceId" in match || "family" in match
        ? createMixerColor(match as ColorEntry, part.parts)
        : {
            ...(match as MixerColor),
            id: crypto.randomUUID(),
            parts: part.parts,
          };
    });
    setMixerColors(mapped.length ? mapped : [createCustomMixerColor(recipe.name, recipe.targetHex, 1)]);
    setMixerOpacity(adaptation?.includes("airbrush") ? "translúcido" : "semi-opaco");
    setMixerFinish(recipe.finish);
    setPrimerId(recipe.primer.includes("preto") ? "preto" : recipe.primer.includes("branco") ? "branco" : "cinza");
    setQuickPreview({ label: adaptation ? `${recipe.name} (${adaptation})` : recipe.name, hex: recipe.targetHex });
    setSection("mixer");
  };

  const saveRecipe = (recipe?: Recipe) => {
    if (recipe) {
      const saved: SavedRecipe = {
        id: crypto.randomUUID(),
        name: recipe.name,
        createdAt: new Date().toISOString(),
        colors: recipe.mix.map((part) => {
          const match = findColorForMix(database, part.color, recipe.targetHex);
          return "sourceId" in match || "family" in match ? createMixerColor(match as ColorEntry, part.parts) : ({ ...(match as MixerColor), parts: part.parts } as MixerColor);
        }),
        resultHex: recipe.targetHex,
        primer: recipe.primer,
        opacity: "semi-opaco",
        finish: recipe.finish,
        notes: `${recipe.shade}. Highlight: ${recipe.highlight}. ${recipe.observations ?? ""}`,
      };
      setSavedRecipes((items) => [saved, ...items]);
      return;
    }

    const name = window.prompt("Nome da receita", `Mistura ${new Date().toLocaleDateString("pt-BR")}`);
    if (!name) return;
    const saved: SavedRecipe = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      colors: mixerColors,
      resultHex: predictedHex,
      calibratedHex,
      primer: currentPrimer.label,
      opacity: mixerOpacity,
      finish: mixerFinish,
      notes: "Resultado aproximado. Testar em paleta, colher plástica, suporte de resina ou peça de descarte.",
    };
    setSavedRecipes((items) => [saved, ...items]);
  };

  const duplicateMixer = () => {
    setMixerColors((colors) => colors.map((color) => ({ ...color, id: crypto.randomUUID() })));
    setQuickPreview({ label: "Mistura duplicada", hex: calibratedHex });
  };

  const applyQuickAction = (label: string, hex: string) => {
    setQuickPreview({ label, hex });
  };

  const addComplement = () => {
    if (mixerColors.length >= 5) return;
    setMixerColors((colors) => [...colors, createCustomMixerColor("Complementar", getComplement(predictedHex), 0.25)]);
    setMixMode("subtractive");
  };

  const transformMedium = (kind: "wash" | "glaze" | "candy" | "airbrush") => {
    const settings = {
      wash: { opacity: "transparente", finish: "fosco", label: "Wash gerado" },
      glaze: { opacity: "translúcido", finish: "acetinado", label: "Glaze gerado" },
      candy: { opacity: "transparente", finish: "candy", label: "Candy gerado" },
      airbrush: { opacity: "semi-opaco", finish: "acetinado", label: "Versão para airbrush" },
    }[kind];
    setMixerOpacity(settings.opacity);
    setMixerFinish(settings.finish);
    setQuickPreview({ label: settings.label, hex: kind === "wash" ? variations.shadow : kind === "glaze" ? adjustHsl(predictedHex, { s: rgbToHsl(hexToRgb(predictedHex)).s - 8 }) : predictedHex });
  };

  const exportCurrentJson = () => {
    const payload = {
      name: "Receita do Misturador",
      mode: mixMode,
      colors: mixerColors,
      primer: currentPrimer.label,
      targetBrand: selectedBrand.name,
      targetLine: selectedBrandLine,
      predictedHex,
      calibratedHex,
      opacity: mixerOpacity,
      finish: mixerFinish,
      warning: "Resultado aproximado. Faça teste antes de aplicar no modelo final.",
    };
    downloadBlob("receita-solitario-cores-3d.json", JSON.stringify(payload, null, 2), "application/json");
  };

  const exportCurrentPdf = () => {
    const doc = new jsPDF();
    const predicted = hexToRgb(predictedHex);
    const calibrated = hexToRgb(calibratedHex);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Solitario - Painel de Cores 3D", 16, 18);
    doc.setFontSize(12);
    doc.text("Receita de mistura", 16, 30);
    doc.setFont("helvetica", "normal");
    doc.text(`Modo: ${mixMode}`, 16, 42);
    doc.text(`Primer: ${currentPrimer.label}`, 16, 50);
    doc.text(`Marca alvo: ${selectedBrand.name} / ${selectedBrandLine}`, 16, 58);
    doc.text(`Opacidade: ${mixerOpacity} | Acabamento: ${mixerFinish}`, 16, 66);
    doc.setFillColor(predicted.r, predicted.g, predicted.b);
    doc.rect(16, 76, 46, 26, "F");
    doc.setFillColor(calibrated.r, calibrated.g, calibrated.b);
    doc.rect(70, 76, 46, 26, "F");
    doc.text(`Previsto: ${predictedHex}`, 16, 110);
    doc.text(`Calibrado: ${calibratedHex}`, 70, 110);
    mixerColors.forEach((color, index) => {
      doc.text(`${index + 1}. ${color.parts} partes - ${color.name} (${color.brandName ?? "genérica"})`, 16, 126 + index * 8);
    });
    doc.setFontSize(9);
    doc.text("Resultado aproximado. Faça teste em paleta, suporte de resina ou peça de descarte antes do modelo final.", 16, 170, { maxWidth: 178 });
    doc.save("receita-solitario-cores-3d.pdf");
  };

  const exportCurrentPng = async () => {
    if (!exportRef.current) return;
    const dataUrl = await toPng(exportRef.current, { pixelRatio: 2, backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff" });
    const link = document.createElement("a");
    link.download = "receita-solitario-cores-3d.png";
    link.href = dataUrl;
    link.click();
  };

  const createShareLink = (payload: ShareRecipePayload) => {
    const url = new URL(window.location.href);
    url.hash = `receita=${encodeSharePayload(payload)}`;
    return url.toString();
  };

  const shareCurrentRecipe = async () => {
    const payload: ShareRecipePayload = {
      v: 1,
      name: "Receita do Misturador",
      colors: mixerColors,
      mode: mixMode,
      primer: currentPrimer.label,
      opacity: mixerOpacity,
      finish: mixerFinish,
      resultHex: predictedHex,
      calibratedHex,
    };
    const link = createShareLink(payload);
    await copyToClipboard(link);
    if (navigator.share) {
      await navigator.share({ title: payload.name, text: "Receita de pintura do Solitario - Painel de Cores 3D", url: link }).catch(() => undefined);
    }
    setQuickPreview({ label: "Link copiado para compartilhar", hex: calibratedHex });
  };

  const shareSavedRecipe = async (recipe: SavedRecipe) => {
    const payload: ShareRecipePayload = {
      v: 1,
      name: recipe.name,
      colors: recipe.colors,
      mode: "perceptual",
      primer: recipe.primer,
      opacity: recipe.opacity,
      finish: recipe.finish,
      resultHex: recipe.resultHex,
      calibratedHex: recipe.calibratedHex,
    };
    const link = createShareLink(payload);
    await copyToClipboard(link);
    if (navigator.share) {
      await navigator.share({ title: recipe.name, text: "Receita de pintura do Solitario - Painel de Cores 3D", url: link }).catch(() => undefined);
    }
  };

  const addCurrentMixToProject = () => {
    const saved: SavedRecipe = {
      id: crypto.randomUUID(),
      name: `Mistura do projeto ${new Date().toLocaleDateString("pt-BR")}`,
      createdAt: new Date().toISOString(),
      colors: mixerColors,
      resultHex: predictedHex,
      calibratedHex,
      primer: currentPrimer.label,
      opacity: mixerOpacity,
      finish: mixerFinish,
      notes: "Mistura adicionada a partir do misturador.",
    };
    setSavedRecipes((items) => [saved, ...items]);
    setProject((current) => ({ ...current, recipes: [saved.id, ...current.recipes.filter((id) => id !== saved.id)] }));
    setQuickPreview({ label: "Mistura adicionada ao Projeto Atual", hex: calibratedHex });
  };

  const exportDatabase = () => {
    downloadBlob("banco-solitario-cores-3d.json", JSON.stringify(database, null, 2), "application/json");
  };

  const importDatabase = async (file?: File) => {
    if (!file) return;
    const parsed = JSON.parse(await file.text()) as PaintDatabase;
    if (!Array.isArray(parsed.colors) || !Array.isArray(parsed.recipes) || !Array.isArray(parsed.techniques)) {
      window.alert("O arquivo não parece ser um banco válido.");
      return;
    }
    setDatabase(parsed);
  };

  const saveCalibration = () => {
    const calibration: Calibration = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceKey: makeCalibrationKey(mixerColors),
      ...calibrationDraft,
      estimatedHex: normalizeHex(calibrationDraft.estimatedHex),
    };
    setCalibrations((items) => [calibration, ...items]);
    setManualCalibratedHex(calibration.estimatedHex);
  };

  const renderSection = () => {
    switch (section) {
      case "home":
        return (
          <HomeSection
            database={database}
            savedRecipes={savedRecipes}
            project={project}
            predictedHex={predictedHex}
            calibratedHex={calibratedHex}
            setSection={setSection}
          />
        );
      case "mixer":
        return (
          <MixerSection
            database={database}
            selectedBrandId={selectedBrandId}
            selectedBrandLine={selectedBrandLine}
            selectedBrand={selectedBrand}
            selectedBrandPaints={selectedBrandPaints}
            setSelectedBrandId={setSelectedBrandId}
            setSelectedBrandLine={setSelectedBrandLine}
            updateMixerColorFromBrandPaint={updateMixerColorFromBrandPaint}
            convertMixerToBrand={convertMixerToBrand}
            applyPhotoMixSuggestion={applyPhotoMixSuggestion}
            brandEquivalentResult={brandEquivalentResult}
            brandEquivalentColors={brandEquivalentColors}
            mixerColors={mixerColors}
            updateMixerColor={updateMixerColor}
            removeMixerColor={removeMixerColor}
            addMixerColor={addMixerColor}
            mixMode={mixMode}
            setMixMode={setMixMode}
            predictedHex={predictedHex}
            calibratedHex={calibratedHex}
            setManualCalibratedHex={setManualCalibratedHex}
            matchedCalibration={matchedCalibration}
            primerId={primerId}
            setPrimerId={setPrimerId}
            primerHex={primerHex}
            customPrimer={customPrimer}
            setCustomPrimer={setCustomPrimer}
            mixerOpacity={mixerOpacity}
            setMixerOpacity={setMixerOpacity}
            mixerFinish={mixerFinish}
            setMixerFinish={setMixerFinish}
            variations={variations}
            quickPreview={quickPreview}
            history={history}
            saveRecipe={() => saveRecipe()}
            duplicateMixer={duplicateMixer}
            exportCurrentJson={exportCurrentJson}
            exportCurrentPdf={exportCurrentPdf}
            exportCurrentPng={exportCurrentPng}
            shareCurrentRecipe={shareCurrentRecipe}
            addCurrentMixToProject={addCurrentMixToProject}
            addComplement={addComplement}
            applyQuickAction={applyQuickAction}
            transformMedium={transformMedium}
            setPaletteBase={setPaletteBase}
            setSection={setSection}
            exportRef={exportRef}
          />
        );
      case "recipes":
        return (
          <RecipesSection
            recipes={recipeResults}
            search={recipeSearch}
            setSearch={setRecipeSearch}
            useRecipeInMixer={useRecipeInMixer}
            saveRecipe={saveRecipe}
            favorites={favorites.recipes}
            favoriteOnly={favoriteOnly.recipes}
            setFavoriteOnly={(value) => setFavoriteOnly((current) => ({ ...current, recipes: value }))}
            toggleFavorite={(id) => toggleFavorite("recipes", id)}
          />
        );
      case "techniques":
        return (
          <TechniquesSection
            techniques={techniqueResults}
            search={techniqueSearch}
            setSearch={setTechniqueSearch}
            activeFilter={activeTechniqueFilter}
            setActiveFilter={setActiveTechniqueFilter}
            favorites={favorites.techniques}
            favoriteOnly={favoriteOnly.techniques}
            setFavoriteOnly={(value) => setFavoriteOnly((current) => ({ ...current, techniques: value }))}
            toggleFavorite={(id) => toggleFavorite("techniques", id)}
          />
        );
      case "paintTypes":
        return <PaintTypesSection paintTypes={paintTypeResults} search={paintSearch} setSearch={setPaintSearch} />;
      case "resin":
        return <ResinSection database={database} checklist={checklist} setChecklist={setChecklist} />;
      case "palettes":
        return <PalettesSection palettes={paletteResults} generatedPalette={generatedPalette} paletteType={paletteType} setPaletteType={setPaletteType} paletteBase={paletteBase} setPaletteBase={setPaletteBase} favorites={favorites.palettes} favoriteOnly={favoriteOnly.palettes} setFavoriteOnly={(value) => setFavoriteOnly((current) => ({ ...current, palettes: value }))} toggleFavorite={(id) => toggleFavorite("palettes", id)} />;
      case "problems":
        return <ProblemsSection problems={problemResults} search={problemSearch} setSearch={setProblemSearch} safety={database.safety} />;
      case "project":
        return <ProjectSection project={project} setProject={setProject} savedRecipes={savedRecipes} palettes={database.palettes} addCurrentMixToProject={addCurrentMixToProject} />;
      case "mine":
        return <MineSection savedRecipes={savedRecipes} setSavedRecipes={setSavedRecipes} useSavedInMixer={(saved) => {
          setMixerColors(saved.colors.map((color) => ({ ...color, id: crypto.randomUUID() })));
          setMixerOpacity(saved.opacity);
          setMixerFinish(saved.finish);
          setQuickPreview({ label: saved.name, hex: saved.calibratedHex ?? saved.resultHex });
          setSection("mixer");
        }} shareSavedRecipe={shareSavedRecipe} />;
      case "guide":
        return (
          <GuideSection
            database={database}
            techniques={techniqueResults}
            techniqueSearch={techniqueSearch}
            setTechniqueSearch={setTechniqueSearch}
            activeTechniqueFilter={activeTechniqueFilter}
            setActiveTechniqueFilter={setActiveTechniqueFilter}
            favorites={favorites}
            favoriteOnly={favoriteOnly}
            setFavoriteOnly={setFavoriteOnly}
            toggleFavorite={toggleFavorite}
            paintTypes={paintTypeResults}
            paintSearch={paintSearch}
            setPaintSearch={setPaintSearch}
            checklist={checklist}
            setChecklist={setChecklist}
            problems={problemResults}
            problemSearch={problemSearch}
            setProblemSearch={setProblemSearch}
          />
        );
      case "settings":
        return (
          <SettingsSection
            theme={theme}
            setTheme={setTheme}
            database={database}
            exportDatabase={exportDatabase}
            importDatabase={importDatabase}
            calibrationDraft={calibrationDraft}
            setCalibrationDraft={setCalibrationDraft}
            saveCalibration={saveCalibration}
            calibrations={calibrations}
            setCalibrations={setCalibrations}
            currentKey={makeCalibrationKey(mixerColors)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col lg:flex-row">
        <aside className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:h-screen lg:w-80 lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-300">Solitario</p>
              <h1 className="truncate text-lg font-black leading-tight text-slate-950 dark:text-white">Painel de Cores 3D</h1>
            </div>
            <button
              type="button"
              title="Alternar tema"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
            {primarySections.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cx(
                    "flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition lg:w-full",
                    section === item.id
                      ? "bg-teal-500 text-slate-950 shadow-glow"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap lg:whitespace-normal">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                placeholder="Busca global"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            {globalResults.length > 0 ? (
              <div className="mt-2 max-h-72 space-y-1 overflow-auto">
                {globalResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      result.action();
                      setGlobalSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white dark:hover:bg-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{result.label}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{result.detail}</span>
                    </span>
                    <span className="text-xs font-bold uppercase text-teal-600 dark:text-teal-300">{sections.find((item) => item.id === result.section)?.label.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            ) : globalSearch.length > 1 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Nada encontrado.</p>
            ) : null}
          </div>
          <div className="mt-5 hidden rounded-lg border border-amber-300/50 bg-amber-100 p-3 text-xs leading-5 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100 lg:block">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              Mistura real é aproximada
            </div>
            Pigmento, primer, cobertura, diluição, camadas, acabamento, luz e cor de base mudam o resultado final.
          </div>
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{renderSection()}</main>
      </div>
    </div>
  );
}

function HomeSection({
  database,
  savedRecipes,
  project,
  predictedHex,
  calibratedHex,
  setSection,
}: {
  database: PaintDatabase;
  savedRecipes: SavedRecipe[];
  project: ProjectState;
  predictedHex: string;
  calibratedHex: string;
  setSection: (section: SectionId) => void;
}) {
  const completedTasks = project.tasks.filter((task) => task.done).length;
  const quickCards = [
    {
      title: "Tenho uma foto",
      text: "Envie uma imagem, clique na cor e receba uma mistura aproximada pela marca escolhida.",
      icon: ImageIcon,
      action: () => setSection("mixer"),
      label: "Pegar cor",
    },
    {
      title: "Quero receita pronta",
      text: "Escolha pele, osso, metal, couro, sangue, slime, magia, candy e outros efeitos.",
      icon: BookOpen,
      action: () => setSection("recipes"),
      label: "Ver receitas",
    },
    {
      title: "Já salvei algo",
      text: "Volte nas suas misturas salvas, copie proporções e compartilhe receitas.",
      icon: Save,
      action: () => setSection("mine"),
      label: "Abrir salvos",
    },
  ];

  return (
    <div>
      <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-300">Solitario</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight text-slate-950 dark:text-white">
              Escolha uma cor e transforme em receita de tinta.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              O fluxo principal ficou simples: foto ou cor alvo, marca desejada, mistura aproximada e salvar.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <IconButton icon={ImageIcon} label="Pegar cor de foto" onClick={() => setSection("mixer")} />
              <IconButton icon={BookOpen} label="Receita pronta" onClick={() => setSection("recipes")} />
            </div>
            <div className="mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
              {["1. Escolha a marca", "2. Clique na cor", "3. Aplique a receita"].map((step) => (
                <div key={step} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-bold dark:border-slate-800 dark:bg-slate-950">
                  {step}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60 lg:border-l lg:border-t-0">
            <ColorSwatch hex={predictedHex} label="Mistura atual" large />
            <ColorSwatch hex={calibratedHex} label="Calibrado" large />
            <Stat label="Receitas" value={database.recipes.length} />
            <Stat label="Marcas" value={paintBrands.length} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {quickCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-400 hover:shadow-glow dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-teal-500 text-slate-950">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">{card.title}</h3>
              <p className="mt-2 min-h-16 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.text}</p>
              <span className="mt-3 inline-block text-sm font-bold text-teal-700 dark:text-teal-300">{card.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <DataCard>
          <h3 className="text-lg font-black">Seu painel</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {savedRecipes.length} receitas salvas. Projeto atual: {completedTasks}/{project.tasks.length} etapas concluídas.
          </p>
        </DataCard>
        <DataCard className="lg:col-span-2">
          <h3 className="text-lg font-black">Modo plug and play</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            As ferramentas avançadas continuam existindo, mas agora ficam escondidas. Comece pela foto ou por uma receita pronta e ajuste só se precisar.
          </p>
        </DataCard>
      </div>
    </div>
  );
}

function GuideSection({
  database,
  techniques,
  techniqueSearch,
  setTechniqueSearch,
  activeTechniqueFilter,
  setActiveTechniqueFilter,
  favorites,
  favoriteOnly,
  setFavoriteOnly,
  toggleFavorite,
  paintTypes,
  paintSearch,
  setPaintSearch,
  checklist,
  setChecklist,
  problems,
  problemSearch,
  setProblemSearch,
}: {
  database: PaintDatabase;
  techniques: PaintDatabase["techniques"];
  techniqueSearch: string;
  setTechniqueSearch: (value: string) => void;
  activeTechniqueFilter: string;
  setActiveTechniqueFilter: (value: string) => void;
  favorites: FavoriteState;
  favoriteOnly: { recipes: boolean; techniques: boolean; palettes: boolean };
  setFavoriteOnly: React.Dispatch<React.SetStateAction<{ recipes: boolean; techniques: boolean; palettes: boolean }>>;
  toggleFavorite: (kind: keyof FavoriteState, id: string) => void;
  paintTypes: PaintDatabase["paintTypes"];
  paintSearch: string;
  setPaintSearch: (value: string) => void;
  checklist: Record<string, boolean>;
  setChecklist: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  problems: PaintDatabase["problems"];
  problemSearch: string;
  setProblemSearch: (value: string) => void;
}) {
  const [tab, setTab] = useState<"essencial" | "tecnicas" | "tintas" | "resina" | "problemas">("essencial");
  const tabs = [
    { id: "essencial", label: "Essencial", icon: Sparkles },
    { id: "tecnicas", label: "Técnicas", icon: Brush },
    { id: "tintas", label: "Tintas", icon: PaintBucket },
    { id: "resina", label: "Resina 3D", icon: ShieldCheck },
    { id: "problemas", label: "Problemas", icon: Wrench },
  ] as const;

  return (
    <div>
      <SectionTitle icon={Brush} title="Guia" subtitle="Consulta rápida. O material mais denso ficou aqui para não atrapalhar o fluxo principal." />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <IconButton key={item.id} icon={item.icon} label={item.label} active={tab === item.id} onClick={() => setTab(item.id)} />
        ))}
      </div>
      {tab === "essencial" ? <EssentialGuide database={database} /> : null}
      {tab === "tecnicas" ? (
        <TechniquesSection
          techniques={techniques}
          search={techniqueSearch}
          setSearch={setTechniqueSearch}
          activeFilter={activeTechniqueFilter}
          setActiveFilter={setActiveTechniqueFilter}
          favorites={favorites.techniques}
          favoriteOnly={favoriteOnly.techniques}
          setFavoriteOnly={(value) => setFavoriteOnly((current) => ({ ...current, techniques: value }))}
          toggleFavorite={(id) => toggleFavorite("techniques", id)}
        />
      ) : null}
      {tab === "tintas" ? <PaintTypesSection paintTypes={paintTypes} search={paintSearch} setSearch={setPaintSearch} /> : null}
      {tab === "resina" ? <ResinSection database={database} checklist={checklist} setChecklist={setChecklist} /> : null}
      {tab === "problemas" ? <ProblemsSection problems={problems} search={problemSearch} setSearch={setProblemSearch} safety={database.safety} /> : null}
    </div>
  );
}

function EssentialGuide({ database }: { database: PaintDatabase }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DataCard>
        <h3 className="mb-3 text-lg font-black">Fluxo seguro para resina</h3>
        <ol className="space-y-2">
          {database.resinFlow.paintingFlow.slice(0, 8).map((item, index) => (
            <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-xs font-black text-slate-950">{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </DataCard>
      <DataCard>
        <h3 className="mb-3 text-lg font-black">Regras que realmente importam</h3>
        <RuleBlock title="Mistura" items={database.mixingRules.basics.slice(0, 5)} />
      </DataCard>
      <DataCard>
        <h3 className="mb-3 text-lg font-black">Ajustes rápidos</h3>
        <InfoList title="Na bancada" items={database.mixingRules.quickAdjustments.slice(0, 6)} />
      </DataCard>
      <DataCard>
        <h3 className="mb-3 text-lg font-black">Segurança</h3>
        <InfoList title="Sempre" items={database.safety.slice(0, 6)} />
      </DataCard>
    </div>
  );
}

function PhotoColorPickerSection({
  selectedBrand,
  selectedBrandPaints,
  selectedBrandLine,
  applyPhotoMixSuggestion,
}: {
  selectedBrand: (typeof paintBrands)[number];
  selectedBrandPaints: BrandPaint[];
  selectedBrandLine: string;
  applyPhotoMixSuggestion: (suggestion: BrandMixSuggestion) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoTargetHex, setPhotoTargetHex] = useState("");
  const [photoSuggestion, setPhotoSuggestion] = useState<BrandMixSuggestion | null>(null);

  useEffect(() => {
    if (!photoTargetHex) return;
    setPhotoSuggestion(suggestBrandMix(selectedBrandPaints, photoTargetHex, selectedBrand));
  }, [photoTargetHex, selectedBrand, selectedBrandPaints]);

  const drawPhoto = (dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const image = new Image();
    image.onload = () => {
      const maxWidth = 920;
      const scale = Math.min(1, maxWidth / image.width);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = dataUrl;
  };

  useEffect(() => {
    if (photoUrl) drawPhoto(photoUrl);
  }, [photoUrl]);

  const handlePhotoFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setPhotoName(file.name);
      setPhotoUrl(dataUrl);
      setPhotoTargetHex("");
      setPhotoSuggestion(null);
    };
    reader.readAsDataURL(file);
  };

  const handlePickColor = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height)));
    const [r, g, b] = context.getImageData(x, y, 1, 1).data;
    setPhotoTargetHex(rgbToHex({ r, g, b }));
  };

  const copyPhotoRecipe = async () => {
    if (!photoSuggestion) return;
    const parts = photoSuggestion.parts.map((part) => `${part.parts} parte${part.parts > 1 ? "s" : ""} ${part.paint.name} (${part.paint.line})`).join(" + ");
    await copyToClipboard(`${selectedBrand.name}: ${parts}. Alvo ${photoSuggestion.targetHex}, previsão ${photoSuggestion.resultHex}.`);
  };

  const accuracy = photoSuggestion ? Math.max(0, Math.round((1 - Math.min(photoSuggestion.score, 1)) * 100)) : 0;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
            <Pipette className="h-5 w-5 text-teal-500" />
            2. Pegue a cor da foto
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Envie uma imagem, clique/toque na cor desejada e gere uma receita aproximada usando {selectedBrand.name}
            {selectedBrandLine !== "todas" ? ` / ${selectedBrandLine}` : ""}.
          </p>
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold transition hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900">
          <ImageIcon className="h-4 w-4" />
          Escolher foto
          <input type="file" accept="image/*" onChange={handlePhotoFile} className="sr-only" />
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
          {photoUrl ? (
            <canvas ref={canvasRef} onClick={handlePickColor} className="block max-h-[460px] w-full cursor-crosshair object-contain" title="Clique na cor que deseja copiar" />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400">
              <ImageIcon className="mb-3 h-10 w-10" />
              <div className="text-sm font-bold">Carregue uma foto da referência, miniatura ou arte.</div>
              <div className="mt-1 text-xs">Depois clique na área da imagem para pegar a cor.</div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Foto não mede tinta real com precisão absoluta. Luz, câmera, monitor, primer, pigmento e camada mudam o resultado. Use como ponto de partida e faça teste em descarte.
          </div>
          {photoName ? <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Arquivo: {photoName}</div> : null}

          {photoTargetHex ? (
            <div className="grid gap-3">
              <ColorSwatch hex={photoTargetHex} label="Cor escolhida na foto" large />
              {photoSuggestion ? (
                <>
                  <ColorSwatch hex={photoSuggestion.resultHex} label={`Previsão ${selectedBrand.name}`} large />
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-black text-slate-950 dark:text-white">Mistura sugerida</div>
                      <span className="rounded-md bg-teal-100 px-2 py-1 text-xs font-black text-teal-900 dark:bg-teal-500/20 dark:text-teal-100">{accuracy}% similar</span>
                    </div>
                    <div className="space-y-2">
                      {photoSuggestion.parts.map((part) => (
                        <div key={`${part.paint.id}-${part.parts}`} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <span className="h-7 w-7 rounded-md border border-white/20" style={{ background: part.paint.hex }} />
                          <span>
                            <strong>{part.parts} parte{part.parts > 1 ? "s" : ""}</strong> {part.paint.name} / {part.paint.line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <IconButton icon={FlaskConical} label="Aplicar no misturador" onClick={() => applyPhotoMixSuggestion(photoSuggestion)} />
                    <IconButton icon={Copy} label="Copiar receita" onClick={copyPhotoRecipe} />
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
              A receita aparece aqui depois que você selecionar uma cor na foto.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MixerSection(props: {
  database: PaintDatabase;
  selectedBrandId: string;
  selectedBrandLine: string;
  selectedBrand: (typeof paintBrands)[number];
  selectedBrandPaints: (typeof paintBrands)[number]["paints"];
  setSelectedBrandId: (id: string) => void;
  setSelectedBrandLine: (line: string) => void;
  updateMixerColorFromBrandPaint: (id: string, brandId: string, paintId: string) => void;
  convertMixerToBrand: () => void;
  applyPhotoMixSuggestion: (suggestion: BrandMixSuggestion) => void;
  brandEquivalentResult: (typeof paintBrands)[number]["paints"][number];
  brandEquivalentColors: Array<{ color: MixerColor; paint: (typeof paintBrands)[number]["paints"][number] }>;
  mixerColors: MixerColor[];
  updateMixerColor: (id: string, patch: Partial<MixerColor>) => void;
  removeMixerColor: (id: string) => void;
  addMixerColor: () => void;
  mixMode: MixMode;
  setMixMode: (mode: MixMode) => void;
  predictedHex: string;
  calibratedHex: string;
  setManualCalibratedHex: (hex: string) => void;
  matchedCalibration?: Calibration;
  primerId: string;
  setPrimerId: (id: string) => void;
  primerHex: string;
  customPrimer: string;
  setCustomPrimer: (hex: string) => void;
  mixerOpacity: string;
  setMixerOpacity: (value: string) => void;
  mixerFinish: string;
  setMixerFinish: (value: string) => void;
  variations: ReturnType<typeof getVariations>;
  quickPreview: { label: string; hex: string } | null;
  history: HistoryItem[];
  saveRecipe: () => void;
  duplicateMixer: () => void;
  exportCurrentJson: () => void;
  exportCurrentPdf: () => void;
  exportCurrentPng: () => void;
  shareCurrentRecipe: () => void;
  addCurrentMixToProject: () => void;
  addComplement: () => void;
  applyQuickAction: (label: string, hex: string) => void;
  transformMedium: (kind: "wash" | "glaze" | "candy" | "airbrush") => void;
  setPaletteBase: (hex: string) => void;
  setSection: (section: SectionId) => void;
  exportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    database,
    selectedBrandId,
    selectedBrandLine,
    selectedBrand,
    selectedBrandPaints,
    setSelectedBrandId,
    setSelectedBrandLine,
    updateMixerColorFromBrandPaint,
    convertMixerToBrand,
    applyPhotoMixSuggestion,
    brandEquivalentResult,
    brandEquivalentColors,
    mixerColors,
    updateMixerColor,
    removeMixerColor,
    addMixerColor,
    mixMode,
    setMixMode,
    predictedHex,
    calibratedHex,
    setManualCalibratedHex,
    matchedCalibration,
    primerId,
    setPrimerId,
    primerHex,
    customPrimer,
    setCustomPrimer,
    mixerOpacity,
    setMixerOpacity,
    mixerFinish,
    setMixerFinish,
    variations,
    quickPreview,
    history,
    saveRecipe,
    duplicateMixer,
    exportCurrentJson,
    exportCurrentPdf,
    exportCurrentPng,
    shareCurrentRecipe,
    addCurrentMixToProject,
    addComplement,
    applyQuickAction,
    transformMedium,
    setPaletteBase,
    setSection,
    exportRef,
  } = props;

  const colorA = mixerColors[0]?.hex ?? "#000000";
  const colorB = mixerColors[1]?.hex ?? "#ffffff";
  const primerVariations = primerOptions.filter((primer) => primer.id !== "custom").slice(0, 6);
  const layerSamples = [1, 2, 3].map((layers) => ({ layers, hex: applyPrimer(predictedHex, primerHex, mixerOpacity, layers) }));
  const firstHsl = rgbToHsl(hexToRgb(mixerColors[0]?.hex ?? predictedHex));

  return (
    <div>
      <SectionTitle
        icon={Pipette}
        title="Criar cor"
        subtitle="Escolha a marca, pegue uma cor de foto ou use ajuste manual só se precisar."
      />

      <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-100 p-4 text-sm leading-6 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
        <strong>Receita aproximada.</strong> Use como ponto de partida e teste em paleta, suporte de resina ou peça de descarte antes do modelo final.
      </div>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">1. Escolha a marca</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A receita da foto e as sugestões vão usar apenas tintas dessa marca/linha.
            </p>
          </div>
          <span className="rounded-md bg-teal-100 px-2 py-1 text-xs font-black uppercase text-teal-900 dark:bg-teal-500/20 dark:text-teal-100">plug and play</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>Marca alvo</FieldLabel>
            <select
              value={selectedBrandId}
              onChange={(event) => {
                setSelectedBrandId(event.target.value);
                setSelectedBrandLine("todas");
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {paintBrands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Linha</FieldLabel>
            <select value={selectedBrandLine} onChange={(event) => setSelectedBrandLine(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              {brandLineOptions(selectedBrandId).map((line) => (
                <option key={line} value={line}>
                  {line === "todas" ? "Todas as linhas" : line}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 text-sm font-bold text-slate-950 dark:text-white">Equivalente mais próximo do resultado</div>
            <div className="grid gap-2 sm:grid-cols-[90px_1fr]">
              <ColorSwatch hex={brandEquivalentResult.hex} label={brandEquivalentResult.name} />
              <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                <strong>{selectedBrand.name}</strong> / {brandEquivalentResult.line}
                <br />
                Tipo: {brandEquivalentResult.type}. Opacidade: {brandEquivalentResult.opacity}. Acabamento: {brandEquivalentResult.finish}.
              </div>
            </div>
          </div>
        </div>
        <details className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-bold text-slate-700 dark:text-slate-200">Ajustes avançados de marca</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr]">
            <IconButton icon={PaintBucket} label="Converter mistura manual para marca" onClick={convertMixerToBrand} />
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-2 text-sm font-bold text-slate-950 dark:text-white">Equivalente mais próximo do resultado atual</div>
              <div className="grid gap-2 sm:grid-cols-[90px_1fr]">
                <ColorSwatch hex={brandEquivalentResult.hex} label={brandEquivalentResult.name} />
                <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  <strong>{selectedBrand.name}</strong> / {brandEquivalentResult.line}
                  <br />
                  Tipo: {brandEquivalentResult.type}. Opacidade: {brandEquivalentResult.opacity}. Acabamento: {brandEquivalentResult.finish}.
                </div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <PhotoColorPickerSection
        selectedBrand={selectedBrand}
        selectedBrandPaints={selectedBrandPaints}
        selectedBrandLine={selectedBrandLine}
        applyPhotoMixSuggestion={applyPhotoMixSuggestion}
      />

      <div className="grid gap-4">
        <details className="hidden">
          <summary className="cursor-pointer text-lg font-black text-slate-950 dark:text-white">Ajustes manuais de mistura</summary>
          <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Cores da mistura</h3>
            <IconButton icon={Plus} label="Adicionar cor" onClick={addMixerColor} />
          </div>

          <div className="space-y-3">
            {mixerColors.map((color, index) => {
              const rgb = hexToRgb(color.hex);
              const hsl = rgbToHsl(rgb);
              return (
                <div key={color.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="grid gap-3 lg:grid-cols-[80px_minmax(160px,1.2fr)_minmax(180px,1fr)_minmax(170px,1fr)]">
                    <ColorSwatch hex={color.hex} label={`Cor ${index + 1}`} />
                    <div className="space-y-2">
                      <FieldLabel>Tinta da marca</FieldLabel>
                      <select
                        value={color.paintId ?? ""}
                        onChange={(event) => updateMixerColorFromBrandPaint(color.id, selectedBrandId, event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="">Selecionar em {selectedBrand.name}</option>
                        {selectedBrandPaints.map((paint) => (
                          <option key={paint.id} value={paint.id}>
                            {paint.name} · {paint.line}
                          </option>
                        ))}
                      </select>
                      <FieldLabel>Nome comum / banco</FieldLabel>
                      <select
                        value={color.sourceId ?? "custom"}
                        onChange={(event) => {
                          const selected = database.colors.find((entry) => entry.id === event.target.value);
                          if (selected) updateMixerColor(color.id, { ...createMixerColor(selected, color.parts), paintId: undefined, brandId: undefined, brandName: undefined, line: undefined });
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="custom">Cor personalizada</option>
                        {database.colors.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={color.name}
                        onChange={(event) => updateMixerColor(color.id, { name: event.target.value, sourceId: undefined, paintId: undefined })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        placeholder="Nome da cor"
                      />
                      {color.brandName ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {color.brandName} / {color.line}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Hex / RGB / HSL</FieldLabel>
                      <div className="grid grid-cols-[56px_1fr] gap-2">
                        <input
                          type="color"
                          value={normalizeHex(color.hex)}
                          onChange={(event) => updateMixerColor(color.id, { hex: event.target.value, sourceId: undefined, paintId: undefined })}
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950"
                        />
                        <input
                          value={color.hex}
                          onChange={(event) => updateMixerColor(color.id, { hex: normalizeHex(event.target.value), sourceId: undefined, paintId: undefined })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(["r", "g", "b"] as const).map((channel) => (
                          <input
                            key={channel}
                            type="number"
                            min={0}
                            max={255}
                            value={Math.round(rgb[channel])}
                            onChange={(event) => {
                              const next = { ...rgb, [channel]: Number(event.target.value) };
                              updateMixerColor(color.id, { hex: rgbToHex(next), sourceId: undefined, paintId: undefined });
                            }}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                            title={channel.toUpperCase()}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        HSL {Math.round(hsl.h)}°, {Math.round(hsl.s)}%, {Math.round(hsl.l)}%
                      </div>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Partes / gotas</FieldLabel>
                      <div className="grid grid-cols-[1fr_78px] items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={0.25}
                          value={color.parts}
                          onChange={(event) => updateMixerColor(color.id, { parts: Number(event.target.value) })}
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={color.parts}
                          onChange={(event) => updateMixerColor(color.id, { parts: Number(event.target.value) })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={color.paintType}
                          onChange={(event) => updateMixerColor(color.id, { paintType: event.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        >
                          {paintInputTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                        <select
                          value={color.finish}
                          onChange={(event) => updateMixerColor(color.id, { finish: event.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        >
                          {finishOptions.map((finish) => (
                            <option key={finish}>{finish}</option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                        Equivalente {selectedBrand.name}: <strong>{brandEquivalentColors[index]?.paint.name}</strong> / {brandEquivalentColors[index]?.paint.line}
                      </div>
                      <button
                        type="button"
                        title="Remover cor"
                        onClick={() => removeMixerColor(color.id)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <FieldLabel>Marca alvo da receita</FieldLabel>
              <select value={selectedBrandId} onChange={(event) => setSelectedBrandId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                {paintBrands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel>Primer / base</FieldLabel>
              <select value={primerId} onChange={(event) => setPrimerId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                {primerOptions.map((primer) => (
                  <option key={primer.id} value={primer.id}>
                    {primer.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel>Opacidade da aplicação</FieldLabel>
              <select value={mixerOpacity} onChange={(event) => setMixerOpacity(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                {opacityOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel>Acabamento</FieldLabel>
              <select value={mixerFinish} onChange={(event) => setMixerFinish(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                {finishOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          {primerId === "custom" ? (
            <div className="mt-3 max-w-xs">
              <FieldLabel>Cor personalizada do primer</FieldLabel>
              <input type="color" value={customPrimer} onChange={(event) => setCustomPrimer(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" />
            </div>
          ) : null}
        </details>

        <section ref={exportRef} id="recipe-export-card" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">Resultado final</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">Cor atual pronta para copiar, salvar ou ajustar rapidamente.</p>
            </div>
            <details className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <summary className="cursor-pointer text-xs font-black uppercase text-slate-600 dark:text-slate-300">Modo avançado</summary>
              <div className="mt-2 flex flex-wrap gap-2">
              {(["visual", "perceptual", "subtractive"] as MixMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMixMode(mode)}
                  className={cx(
                    "rounded-lg border px-3 py-2 text-xs font-bold uppercase",
                    mixMode === mode ? "border-teal-400 bg-teal-500 text-slate-950" : "border-slate-300 dark:border-slate-700",
                  )}
                >
                  {mode === "visual" ? "RGB linear" : mode === "perceptual" ? "OKLab" : "Subtrativa"}
                </button>
              ))}
              </div>
            </details>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <div>
              <ColorSwatch hex={calibratedHex} label="Resultado" large />
              <input
                type="color"
                value={calibratedHex}
                onChange={(event) => setManualCalibratedHex(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950"
                title="Ajuste manual do resultado calibrado"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorSwatch hex={predictedHex} label="Previsto" />
              <ColorSwatch hex={brandEquivalentResult.hex} label={brandEquivalentResult.name} />
            </div>
          </div>

          <div className="mt-3">
            <ColorCodePanel hex={calibratedHex} label="Códigos e contraste do resultado calibrado" />
          </div>

          <details className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-bold text-slate-700 dark:text-slate-200">Variações e primer</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Layers className="h-4 w-4 text-teal-500" />
                Primer e camadas
              </div>
              <div className="grid grid-cols-3 gap-2">
                {layerSamples.map((sample) => (
                  <ColorSwatch key={sample.layers} hex={sample.hex} label={`${sample.layers} camada${sample.layers > 1 ? "s" : ""}`} />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Pipette className="h-4 w-4 text-amber-500" />
                Variações úteis
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Clara", variations.lighter],
                  ["Escura", variations.darker],
                  ["Saturada", variations.saturated],
                  ["Apagada", variations.desaturated],
                  ["Quente", variations.warmer],
                  ["Fria", variations.cooler],
                ].map(([label, hex]) => (
                  <ColorSwatch key={label} hex={hex} label={label} />
                ))}
              </div>
            </div>
            </div>

          <div className="mt-3">
            <div className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Variação por base</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {primerVariations.map((primer) => (
                <ColorSwatch key={primer.id} hex={applyPrimer(predictedHex, primer.hex, mixerOpacity, 1)} label={primer.label} />
              ))}
            </div>
          </div>
          </details>

          {quickPreview ? (
            <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
              <div className="mb-2 text-sm font-bold text-teal-800 dark:text-teal-100">{quickPreview.label}</div>
              <ColorSwatch hex={quickPreview.hex} label="Prévia gerada" />
            </div>
          ) : null}

          {matchedCalibration ? (
            <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              Calibração aplicada: {matchedCalibration.brand} / {matchedCalibration.line}, {matchedCalibration.layers} camadas sobre {matchedCalibration.primer}.
            </div>
          ) : null}
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-teal-500" />
          <h3 className="text-lg font-black">Atalhos principais</h3>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <IconButton icon={Save} label="Salvar" onClick={saveRecipe} />
          <IconButton icon={ClipboardList} label="Projeto" onClick={addCurrentMixToProject} />
          <IconButton icon={Palette} label="Paleta" onClick={() => { setPaletteBase(predictedHex); setSection("palettes"); }} />
          <IconButton icon={Link} label="Compartilhar" onClick={shareCurrentRecipe} />
        </div>
        <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-bold text-slate-700 dark:text-slate-200">Mais ações</summary>
          <div className="mt-3 flex flex-wrap gap-2">
          <IconButton icon={Save} label="Salvar receita" onClick={saveRecipe} />
          <IconButton icon={Copy} label="Duplicar" onClick={duplicateMixer} />
          <IconButton icon={FileJson} label="Exportar JSON" onClick={exportCurrentJson} />
          <IconButton icon={FileText} label="Exportar PDF" onClick={exportCurrentPdf} />
          <IconButton icon={ImageIcon} label="Exportar PNG" onClick={exportCurrentPng} />
          <IconButton icon={Link} label="Compartilhar link" onClick={shareCurrentRecipe} />
          <IconButton icon={ClipboardList} label="Adicionar ao projeto" onClick={addCurrentMixToProject} />
          <IconButton icon={Sparkles} label="Gerar variações" onClick={() => applyQuickAction("Variação harmônica", variations.saturated)} />
          <IconButton
            icon={Palette}
            label="Criar paleta harmônica"
            onClick={() => {
              setPaletteBase(predictedHex);
              setSection("palettes");
            }}
          />
          <IconButton icon={Snowflake} label="Criar sombra" onClick={() => applyQuickAction("Sombra sugerida", variations.shadow)} />
          <IconButton icon={ThermometerSun} label="Criar highlight" onClick={() => applyQuickAction("Highlight sugerido", variations.highlight)} />
          <IconButton icon={Droplets} label="Criar wash" onClick={() => transformMedium("wash")} />
          <IconButton icon={Droplets} label="Criar glaze" onClick={() => transformMedium("glaze")} />
          <IconButton icon={Gem} label="Criar candy" onClick={() => transformMedium("candy")} />
          <IconButton icon={SprayCan} label="Versão airbrush" onClick={() => transformMedium("airbrush")} />
          <IconButton icon={Contrast} label="Adicionar complementar" onClick={addComplement} />
          <IconButton icon={RotateCw} label="Neutralizar" onClick={addComplement} />
          <IconButton icon={ThermometerSun} label="Mais quente" onClick={() => applyQuickAction("Mais quente", variations.warmer)} />
          <IconButton icon={Snowflake} label="Mais frio" onClick={() => applyQuickAction("Mais frio", variations.cooler)} />
          <IconButton icon={Sparkles} label="Mais saturado" onClick={() => applyQuickAction("Mais saturado", variations.saturated)} />
          <IconButton icon={Contrast} label="Mais apagado" onClick={() => applyQuickAction("Mais apagado", variations.desaturated)} />
          </div>
        </details>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-lg font-black">Histórico das últimas misturas</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {history.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => applyQuickAction("Histórico", item.calibratedHex ?? item.hex)}
                className="rounded-lg border border-slate-200 p-2 text-left hover:border-teal-400 dark:border-slate-800"
              >
                <ColorSwatch hex={item.calibratedHex ?? item.hex} label={item.mode} />
                <div className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.label}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-lg font-black">Regras de mistura de cores</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <RuleBlock title="Misturas básicas" items={seedDatabase.mixingRules.basics} />
            <RuleBlock title="Complementares" items={seedDatabase.mixingRules.complementaries} />
            <RuleBlock title="Ajustes rápidos" items={seedDatabase.mixingRules.quickAdjustments} />
            <RuleBlock title="Receitas genéricas" items={seedDatabase.mixingRules.genericRecipes} />
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-sm font-bold">Entrada HSL da primeira cor</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["h", "s", "l"] as const).map((key) => (
                <div key={key}>
                  <FieldLabel>{key.toUpperCase()}</FieldLabel>
                  <input
                    type="number"
                    value={Math.round(firstHsl[key])}
                    onChange={(event) => {
                      const next = { ...firstHsl, [key]: Number(event.target.value) };
                      const first = mixerColors[0];
                      if (first) updateMixerColor(first.id, { hex: rgbToHex(hslToRgb(next)), sourceId: undefined });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function RuleBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-black text-slate-950 dark:text-white">{title}</h4>
      <ul className="space-y-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
    </div>
  );
}

function FavoriteButton({ active, onClick, label = "Favoritar" }: { active: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? "Remover dos favoritos" : label}
      className={cx(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition",
        active
          ? "border-amber-300 bg-amber-300 text-slate-950"
          : "border-slate-300 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-950",
      )}
    >
      <Star className={cx("h-4 w-4", active && "fill-current")} />
    </button>
  );
}

function RecipesSection({
  recipes,
  search,
  setSearch,
  useRecipeInMixer,
  saveRecipe,
  favorites,
  favoriteOnly,
  setFavoriteOnly,
  toggleFavorite,
}: {
  recipes: Recipe[];
  search: string;
  setSearch: (value: string) => void;
  useRecipeInMixer: (recipe: Recipe, adaptation?: string) => void;
  saveRecipe: (recipe: Recipe) => void;
  favorites: string[];
  favoriteOnly: boolean;
  setFavoriteOnly: (value: boolean) => void;
  toggleFavorite: (id: string) => void;
}) {
  return (
    <div>
      <SectionTitle icon={BookOpen} title="Receitas Prontas" subtitle="Biblioteca inicial com 50 receitas de cores e efeitos para miniaturas, bustos, dioramas e peças em resina." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar receita, primer, técnica ou efeito" />
        <div className="flex items-center gap-2">
          <IconButton icon={Star} label="Favoritos" active={favoriteOnly} onClick={() => setFavoriteOnly(!favoriteOnly)} />
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{recipes.length} receitas</div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recipes.map((recipe) => (
          <DataCard key={recipe.id}>
            <div className="mb-3 flex gap-3">
              <div className="h-16 w-16 shrink-0 rounded-lg border border-white/20" style={{ background: recipe.targetHex }} />
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-950 dark:text-white">{recipe.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">Primer: {recipe.primer}</p>
                <p className="font-mono text-xs uppercase text-slate-500">{recipe.targetHex}</p>
              </div>
              <FavoriteButton active={favorites.includes(recipe.id)} onClick={() => toggleFavorite(recipe.id)} />
            </div>
            <div className="space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
              <p>
                <strong>Mistura:</strong> {recipe.mix.map((part) => `${part.parts} ${part.color}`).join(" + ")}
              </p>
              <p>
                <strong>Sombra:</strong> {recipe.shade}
              </p>
              <p>
                <strong>Highlight:</strong> {recipe.highlight}
              </p>
              <p>
                <strong>Acabamento:</strong> {recipe.finish}
              </p>
              {recipe.observations ? <p>{recipe.observations}</p> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <IconButton icon={FlaskConical} label="usar no misturador" onClick={() => useRecipeInMixer(recipe)} />
              <IconButton icon={Save} label="salvar" onClick={() => saveRecipe(recipe)} />
              <IconButton icon={Copy} label="copiar proporção" onClick={() => copyToClipboard(recipe.mix.map((part) => `${part.parts} partes ${part.color}`).join(" + "))} />
              <IconButton icon={Sparkles} label="gerar variação" onClick={() => useRecipeInMixer(recipe, "variação")} />
              <IconButton icon={Moon} label="primer preto" onClick={() => useRecipeInMixer(recipe, "adaptada para primer preto")} />
              <IconButton icon={Sun} label="primer branco" onClick={() => useRecipeInMixer(recipe, "adaptada para primer branco")} />
              <IconButton icon={SprayCan} label="airbrush" onClick={() => useRecipeInMixer(recipe, "airbrush")} />
              <IconButton icon={Brush} label="pincel" onClick={() => useRecipeInMixer(recipe, "pincel")} />
            </div>
          </DataCard>
        ))}
      </div>
    </div>
  );
}

function TechniquesSection({
  techniques,
  search,
  setSearch,
  activeFilter,
  setActiveFilter,
  favorites,
  favoriteOnly,
  setFavoriteOnly,
  toggleFavorite,
}: {
  techniques: PaintDatabase["techniques"];
  search: string;
  setSearch: (value: string) => void;
  activeFilter: string;
  setActiveFilter: (value: string) => void;
  favorites: string[];
  favoriteOnly: boolean;
  setFavoriteOnly: (value: boolean) => void;
  toggleFavorite: (id: string) => void;
}) {
  return (
    <div>
      <SectionTitle icon={Brush} title="Técnicas de Pintura" subtitle="Cards pesquisáveis com materiais, proporção, passo a passo, erros comuns e correções." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar técnica, material, uso ou tag" />
        <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="todos">todos os filtros</option>
          {techniqueFilters.map((filter) => (
            <option key={filter} value={filter}>
              {filter}
            </option>
          ))}
        </select>
        <IconButton icon={Star} label="Favoritos" active={favoriteOnly} onClick={() => setFavoriteOnly(!favoriteOnly)} />
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{techniques.length} técnicas</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {techniques.map((technique) => (
          <DataCard key={technique.id}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">{technique.name}</h3>
                <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">{technique.difficulty}</p>
              </div>
              <div className="flex items-center gap-2">
                <FavoriteButton active={favorites.includes(technique.id)} onClick={() => toggleFavorite(technique.id)} />
                <Brush className="h-5 w-5 text-slate-400" />
              </div>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-700 dark:text-slate-300">{technique.purpose}</p>
            <div className="mb-3 flex flex-wrap gap-1">
              {technique.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {tag}
                </span>
              ))}
            </div>
            <InfoList title="Materiais" items={technique.materials} />
            <p className="my-3 rounded-lg border border-slate-200 p-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
              <strong>Proporção:</strong> {technique.ratio}
            </p>
            <InfoList title="Passo a passo" items={technique.steps} numbered />
            <InfoList title="Erros comuns" items={technique.mistakes} />
            <InfoList title="Como corrigir" items={technique.fixes} />
            <InfoList title="Onde usar" items={technique.uses} />
          </DataCard>
        ))}
      </div>
    </div>
  );
}

function InfoList({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  const List = numbered ? "ol" : "ul";
  return (
    <div className="mb-3">
      <h4 className="mb-1 text-sm font-black text-slate-950 dark:text-white">{title}</h4>
      <List className={cx("space-y-1 text-sm leading-6 text-slate-600 dark:text-slate-300", numbered ? "list-decimal pl-5" : "")}>
        {items.map((item) => (
          <li key={item} className={numbered ? "" : "flex gap-2"}>
            {numbered ? null : <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />}
            <span>{item}</span>
          </li>
        ))}
      </List>
    </div>
  );
}

function PaintTypesSection({ paintTypes, search, setSearch }: { paintTypes: PaintDatabase["paintTypes"]; search: string; setSearch: (value: string) => void }) {
  const iconForType = (id: string) => {
    if (id.includes("primer")) return ShieldCheck;
    if (id.includes("wash") || id.includes("glaze") || id.includes("ink")) return Droplets;
    if (id.includes("candy") || id.includes("varnish")) return Gem;
    if (id.includes("metal") || id.includes("nmm")) return Sparkles;
    if (id.includes("texture") || id.includes("pigment")) return Layers;
    return PaintBucket;
  };
  return (
    <div>
      <SectionTitle icon={PaintBucket} title="Tipos de Tinta e Efeitos" subtitle="Referência prática para primer, base, layer, wash, ink, glaze, candy, metálicos, fluorescentes, óleos, enamels, vernizes e efeitos especiais." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar tipo, uso ou erro comum" />
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{paintTypes.length} tipos</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {paintTypes.map((paintType) => {
          const Icon = iconForType(paintType.id);
          return (
            <DataCard key={paintType.id}>
              <div className="mb-3 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-teal-700 dark:bg-slate-800 dark:text-teal-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-950 dark:text-white">{paintType.name}</h3>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{paintType.description}</p>
                </div>
              </div>
              {paintType.recipe ? <p className="mb-3 rounded-lg border border-teal-200 bg-teal-50 p-2 text-sm text-teal-950 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100">{paintType.recipe}</p> : null}
              {paintType.flow ? <InfoList title="Fluxo" items={paintType.flow} numbered /> : null}
              <InfoList title="Melhores usos" items={paintType.bestUse} />
              <InfoList title="Primers indicados" items={paintType.bestPrimer} />
              <InfoList title="Erros comuns" items={paintType.commonMistakes} />
              <InfoList title="Correções" items={paintType.fixes} />
            </DataCard>
          );
        })}
      </div>
    </div>
  );
}

function ResinSection({
  database,
  checklist,
  setChecklist,
}: {
  database: PaintDatabase;
  checklist: Record<string, boolean>;
  setChecklist: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const toggle = (key: string) => setChecklist((items) => ({ ...items, [key]: !items[key] }));
  return (
    <div>
      <SectionTitle icon={ShieldCheck} title="Fluxo para Resina 3D" subtitle="Checklist completo para peças SLA/MSLA/DLP, da preparação ao verniz seletivo." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DataCard>
          <h3 className="mb-3 text-lg font-black">Antes da pintura</h3>
          <div className="space-y-2">
            {database.resinFlow.beforePainting.map((item) => (
              <label key={item} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <input type="checkbox" checked={Boolean(checklist[item])} onChange={() => toggle(item)} className="h-4 w-4 accent-teal-500" />
                <span className={cx(checklist[item] && "line-through opacity-60")}>{item}</span>
              </label>
            ))}
          </div>
        </DataCard>
        <DataCard>
          <h3 className="mb-3 text-lg font-black">Fluxo de pintura recomendado</h3>
          <ol className="space-y-2">
            {database.resinFlow.paintingFlow.map((item, index) => (
              <li key={item} className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-sm font-black text-slate-950">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </DataCard>
      </div>
      <DataCard className="mt-4">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-black">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Alertas
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {database.resinFlow.alerts.map((alert) => (
            <div key={alert} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {alert}
            </div>
          ))}
        </div>
      </DataCard>
    </div>
  );
}

function PalettesSection({
  palettes,
  generatedPalette,
  paletteType,
  setPaletteType,
  paletteBase,
  setPaletteBase,
  favorites,
  favoriteOnly,
  setFavoriteOnly,
  toggleFavorite,
}: {
  palettes: PaintDatabase["palettes"];
  generatedPalette: PaletteData;
  paletteType: string;
  setPaletteType: (value: string) => void;
  paletteBase: string;
  setPaletteBase: (value: string) => void;
  favorites: string[];
  favoriteOnly: boolean;
  setFavoriteOnly: (value: boolean) => void;
  toggleFavorite: (id: string) => void;
}) {
  return (
    <div>
      <SectionTitle icon={Palette} title="Biblioteca de Paletas" subtitle="Gerador e biblioteca para montar cor principal, secundária, sombra, highlight, detalhe, contraste, base e acabamento." />
      <DataCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-[220px_140px_1fr]">
          <div>
            <FieldLabel>Tipo de paleta</FieldLabel>
            <select value={paletteType} onChange={(event) => setPaletteType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              {paletteTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Cor base</FieldLabel>
            <input type="color" value={paletteBase} onChange={(event) => setPaletteBase(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <PaletteCard palette={generatedPalette} generated />
        </div>
      </DataCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <IconButton icon={Star} label="Favoritos" active={favoriteOnly} onClick={() => setFavoriteOnly(!favoriteOnly)} />
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{palettes.length} paletas</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {palettes.map((palette) => (
          <PaletteCard key={palette.id} palette={palette} favorite={favorites.includes(palette.id)} onToggleFavorite={() => toggleFavorite(palette.id)} />
        ))}
      </div>
    </div>
  );
}

function PaletteCard({ palette, generated, favorite, onToggleFavorite }: { palette: PaletteData; generated?: boolean; favorite?: boolean; onToggleFavorite?: () => void }) {
  const entries = Object.entries(palette.colors);
  return (
    <div className={cx("rounded-lg border border-slate-200 p-4 dark:border-slate-800", generated ? "bg-teal-50 dark:bg-teal-500/10" : "bg-white dark:bg-slate-900")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">{palette.name}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{palette.type}</p>
        </div>
          <div className="flex items-center gap-2">
            {onToggleFavorite ? <FavoriteButton active={Boolean(favorite)} onClick={onToggleFavorite} /> : null}
            <WandSparkles className="h-5 w-5 text-teal-500" />
          </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entries.map(([label, hex]) => (
          <ColorSwatch key={label} hex={hex} label={label} />
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
        <strong>Verniz:</strong> {palette.varnish}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {palette.techniques.map((technique) => (
          <span key={technique} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {technique}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProblemsSection({ problems, search, setSearch, safety }: { problems: PaintDatabase["problems"]; search: string; setSearch: (value: string) => void; safety: string[] }) {
  return (
    <div>
      <SectionTitle icon={Wrench} title="Problemas e Soluções" subtitle="Busca rápida para falhas comuns de aderência, primer, wash, candy, fluorescentes, metálicos e compatibilidade." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar problema, causa ou solução" />
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{problems.length} problemas</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {problems.map((problem) => (
          <DataCard key={problem.id}>
            <h3 className="mb-2 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {problem.problem}
            </h3>
            <InfoList title="Causas" items={problem.causes} />
            <InfoList title="Solução" items={problem.solution} />
          </DataCard>
        ))}
      </div>
      <DataCard className="mt-4">
        <h3 className="mb-3 text-lg font-black">Segurança e boas práticas</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {safety.map((item) => (
            <div key={item} className="flex gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </DataCard>
    </div>
  );
}

function ProjectSection({
  project,
  setProject,
  savedRecipes,
  palettes,
  addCurrentMixToProject,
}: {
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  savedRecipes: SavedRecipe[];
  palettes: PaintDatabase["palettes"];
  addCurrentMixToProject: () => void;
}) {
  const selectedRecipes = savedRecipes.filter((recipe) => project.recipes.includes(recipe.id));
  const selectedPalette = palettes.find((palette) => palette.id === project.palette);
  const updateProject = (patch: Partial<ProjectState>) => setProject((current) => ({ ...current, ...patch }));
  const toggleRecipe = (id: string) =>
    updateProject({
      recipes: project.recipes.includes(id) ? project.recipes.filter((recipeId) => recipeId !== id) : [...project.recipes, id],
    });
  const toggleTask = (id: string) =>
    updateProject({
      tasks: project.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    });
  const addTask = () => {
    const label = window.prompt("Nova etapa do projeto");
    if (!label) return;
    updateProject({ tasks: [...project.tasks, { id: crypto.randomUUID(), label, done: false }] });
  };
  const summary = [
    `Projeto: ${project.name}`,
    `Peça: ${project.piece}`,
    `Primer: ${project.primer}`,
    `Paleta: ${selectedPalette?.name ?? "sem paleta definida"}`,
    `Verniz: ${project.varnish}`,
    `Receitas: ${selectedRecipes.map((recipe) => recipe.name).join(", ") || "nenhuma"}`,
    `Notas: ${project.notes || "sem notas"}`,
  ].join("\n");

  return (
    <div>
      <SectionTitle icon={ClipboardList} title="Projeto Atual" subtitle="Um caderno leve para manter a peça, paleta, receitas, etapas e observações juntos enquanto você pinta." />
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <DataCard>
          <h3 className="mb-3 text-lg font-black">Dados do projeto</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label="Nome do projeto" value={project.name} onChange={(value) => updateProject({ name: value })} />
            <TextInput label="Peça / modelo" value={project.piece} onChange={(value) => updateProject({ piece: value })} />
            <TextInput label="Primer usado" value={project.primer} onChange={(value) => updateProject({ primer: value })} />
            <TextInput label="Verniz final" value={project.varnish} onChange={(value) => updateProject({ varnish: value })} />
            <div className="md:col-span-2">
              <FieldLabel>Paleta escolhida</FieldLabel>
              <select value={project.palette} onChange={(event) => updateProject({ palette: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="">Sem paleta definida</option>
                {palettes.map((palette) => (
                  <option key={palette.id} value={palette.id}>
                    {palette.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Observações</FieldLabel>
              <textarea value={project.notes} onChange={(event) => updateProject({ notes: event.target.value })} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
          </div>
          {selectedPalette ? (
            <div className="mt-4">
              <PaletteCard palette={selectedPalette} />
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <IconButton icon={ClipboardList} label="Adicionar mistura atual" onClick={addCurrentMixToProject} />
            <IconButton icon={Copy} label="Copiar resumo" onClick={() => copyToClipboard(summary)} />
            <IconButton icon={FileJson} label="Exportar projeto" onClick={() => downloadBlob(`${project.name}.json`, JSON.stringify({ project, selectedRecipes, selectedPalette }, null, 2), "application/json")} />
          </div>
        </DataCard>

        <DataCard>
          <h3 className="mb-3 text-lg font-black">Etapas e receitas</h3>
          <div className="mb-4 space-y-2">
            {project.tasks.map((task) => (
              <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} className="h-4 w-4 accent-teal-500" />
                <span className={cx(task.done && "line-through opacity-60")}>{task.label}</span>
              </label>
            ))}
            <IconButton icon={Plus} label="Adicionar etapa" onClick={addTask} />
          </div>

          <h4 className="mb-2 text-sm font-black text-slate-950 dark:text-white">Receitas salvas neste projeto</h4>
          {savedRecipes.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Salve uma receita no misturador para anexar aqui.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {savedRecipes.map((recipe) => (
                <label key={recipe.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <input type="checkbox" checked={project.recipes.includes(recipe.id)} onChange={() => toggleRecipe(recipe.id)} className="h-4 w-4 accent-teal-500" />
                  <span className="h-7 w-7 shrink-0 rounded-md border border-white/20" style={{ background: recipe.calibratedHex ?? recipe.resultHex }} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{recipe.name}</span>
                    <span className="block truncate text-xs text-slate-500">{recipe.primer}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </DataCard>
      </div>
    </div>
  );
}

function MineSection({
  savedRecipes,
  setSavedRecipes,
  useSavedInMixer,
  shareSavedRecipe,
}: {
  savedRecipes: SavedRecipe[];
  setSavedRecipes: React.Dispatch<React.SetStateAction<SavedRecipe[]>>;
  useSavedInMixer: (recipe: SavedRecipe) => void;
  shareSavedRecipe: (recipe: SavedRecipe) => void;
}) {
  return (
    <div>
      <SectionTitle icon={Save} title="Minhas Receitas" subtitle="Receitas salvas localmente neste navegador via localStorage." />
      {savedRecipes.length === 0 ? (
        <DataCard>
          <p className="text-slate-600 dark:text-slate-300">Nenhuma receita salva ainda.</p>
        </DataCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedRecipes.map((recipe) => (
            <DataCard key={recipe.id}>
              <div className="mb-3 flex gap-3">
                <ColorSwatch hex={recipe.calibratedHex ?? recipe.resultHex} label="Resultado" />
                <div>
                  <h3 className="text-lg font-black">{recipe.name}</h3>
                  <p className="text-xs text-slate-500">{new Date(recipe.createdAt).toLocaleString("pt-BR")}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{recipe.primer}</p>
                </div>
              </div>
              <InfoList title="Mistura" items={recipe.colors.map((color) => `${color.parts} partes ${color.name} (${color.hex})`)} />
              <p className="mb-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{recipe.notes}</p>
              <div className="flex flex-wrap gap-2">
                <IconButton icon={FlaskConical} label="usar" onClick={() => useSavedInMixer(recipe)} />
                <IconButton icon={Link} label="compartilhar" onClick={() => shareSavedRecipe(recipe)} />
                <IconButton icon={FileJson} label="exportar" onClick={() => downloadBlob(`${recipe.name}.json`, JSON.stringify(recipe, null, 2), "application/json")} />
                <IconButton icon={Trash2} label="remover" onClick={() => setSavedRecipes((items) => items.filter((item) => item.id !== recipe.id))} />
              </div>
            </DataCard>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  theme,
  setTheme,
  database,
  exportDatabase,
  importDatabase,
  calibrationDraft,
  setCalibrationDraft,
  saveCalibration,
  calibrations,
  setCalibrations,
  currentKey,
}: {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  database: PaintDatabase;
  exportDatabase: () => void;
  importDatabase: (file?: File) => void;
  calibrationDraft: {
    brand: string;
    line: string;
    colorName: string;
    estimatedHex: string;
    opacity: string;
    finish: string;
    primer: string;
    layers: number;
    dilution: string;
    photoName: string;
    photoDataUrl: string;
  };
  setCalibrationDraft: React.Dispatch<React.SetStateAction<{
    brand: string;
    line: string;
    colorName: string;
    estimatedHex: string;
    opacity: string;
    finish: string;
    primer: string;
    layers: number;
    dilution: string;
    photoName: string;
    photoDataUrl: string;
  }>>;
  saveCalibration: () => void;
  calibrations: Calibration[];
  setCalibrations: React.Dispatch<React.SetStateAction<Calibration[]>>;
  currentKey: string;
}) {
  return (
    <div>
      <SectionTitle icon={Settings} title="Configurações / Calibração" subtitle="Importação do banco, exportação completa e correções manuais para aproximar o motor da tinta real usada na bancada." />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <DataCard>
          <h3 className="mb-3 text-lg font-black">Preferências e banco local</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            <IconButton icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? "Tema claro" : "Tema escuro"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} />
            <IconButton icon={Download} label="Exportar banco" onClick={exportDatabase} />
            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <Upload className="h-4 w-4" />
              Importar banco
              <input type="file" accept="application/json" className="hidden" onChange={(event) => importDatabase(event.target.files?.[0])} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Cores" value={database.colors.length} />
            <Stat label="Receitas" value={database.recipes.length} />
            <Stat label="Técnicas" value={database.techniques.length} />
            <Stat label="Tipos" value={database.paintTypes.length} />
          </div>
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100">
            Depois de publicado, o app pode ser instalado no celular pelo menu do navegador em “Adicionar à tela inicial”. O manifesto e o service worker já estão configurados.
          </div>
        </DataCard>

        <DataCard>
          <h3 className="mb-3 text-lg font-black">Calibrar Mistura Real</h3>
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Faça a mistura real, informe a proporção usada, escolha a cor resultante e salve a correção. Próximas misturas com a mesma combinação usam esta calibração.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label="Marca" value={calibrationDraft.brand} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, brand: value }))} />
            <TextInput label="Linha de tinta" value={calibrationDraft.line} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, line: value }))} />
            <TextInput label="Nome da cor" value={calibrationDraft.colorName} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, colorName: value }))} />
            <div>
              <FieldLabel>Hex estimado</FieldLabel>
              <div className="mt-1 grid grid-cols-[52px_1fr] gap-2">
                <input type="color" value={normalizeHex(calibrationDraft.estimatedHex)} onChange={(event) => setCalibrationDraft((draft) => ({ ...draft, estimatedHex: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" />
                <input value={calibrationDraft.estimatedHex} onChange={(event) => setCalibrationDraft((draft) => ({ ...draft, estimatedHex: normalizeHex(event.target.value) }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </div>
            </div>
            <TextInput label="Opacidade" value={calibrationDraft.opacity} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, opacity: value }))} />
            <TextInput label="Acabamento" value={calibrationDraft.finish} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, finish: value }))} />
            <TextInput label="Primer usado" value={calibrationDraft.primer} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, primer: value }))} />
            <div>
              <FieldLabel>Número de camadas</FieldLabel>
              <input type="number" min={1} value={calibrationDraft.layers} onChange={(event) => setCalibrationDraft((draft) => ({ ...draft, layers: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
            <TextInput label="Diluição" value={calibrationDraft.dilution} onChange={(value) => setCalibrationDraft((draft) => ({ ...draft, dilution: value }))} />
            <div>
              <FieldLabel>Foto opcional da amostra</FieldLabel>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    setCalibrationDraft((draft) => ({ ...draft, photoName: "", photoDataUrl: "" }));
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setCalibrationDraft((draft) => ({ ...draft, photoName: file.name, photoDataUrl: String(reader.result ?? "") }));
                  reader.readAsDataURL(file);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              {calibrationDraft.photoName ? <p className="mt-1 text-xs text-slate-500">{calibrationDraft.photoName}</p> : null}
              {calibrationDraft.photoDataUrl ? <img src={calibrationDraft.photoDataUrl} alt="Amostra calibrada" className="mt-2 h-28 w-full rounded-lg object-cover" /> : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <IconButton icon={Save} label="Salvar calibração" onClick={saveCalibration} />
            <span className="text-xs text-slate-500 dark:text-slate-400">Chave atual: {currentKey || "sem proporção"}</span>
          </div>
        </DataCard>
      </div>

      <DataCard className="mt-4">
        <h3 className="mb-3 text-lg font-black">Calibrações salvas</h3>
        {calibrations.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Nenhuma calibração salva.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {calibrations.map((calibration) => (
              <div key={calibration.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <ColorSwatch hex={calibration.estimatedHex} label={calibration.colorName} />
                {calibration.photoDataUrl ? <img src={calibration.photoDataUrl} alt={calibration.photoName ?? calibration.colorName} className="mt-2 h-28 w-full rounded-lg object-cover" /> : null}
                <p className="mt-2 text-sm font-bold">{calibration.brand} / {calibration.line}</p>
                <p className="text-xs text-slate-500">{calibration.layers} camadas, {calibration.primer}, {calibration.dilution}</p>
                <button type="button" onClick={() => setCalibrations((items) => items.filter((item) => item.id !== calibration.id))} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300">
                  <Trash2 className="h-4 w-4" />
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </DataCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-2xl font-black text-slate-950 dark:text-white">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
    </div>
  );
}

export default App;
