export type Difficulty = "iniciante" | "intermediário" | "avançado";

export type ColorEntry = {
  id: string;
  name: string;
  hex: string;
  family: string;
  temperature: "quente" | "fria" | "neutra";
  opacity: string;
  finish: string;
  uses: string[];
};

export type PaintType = {
  id: string;
  name: string;
  description: string;
  bestPrimer: string[];
  bestUse: string[];
  commonMistakes: string[];
  fixes: string[];
  flow?: string[];
  recipe?: string;
};

export type MixPart = {
  color: string;
  parts: number;
};

export type Recipe = {
  id: string;
  name: string;
  targetHex: string;
  primer: string;
  mix: MixPart[];
  shade: string;
  highlight: string;
  finish: string;
  technique?: string;
  techniques: string[];
  observations?: string;
};

export type Technique = {
  id: string;
  name: string;
  difficulty: Difficulty;
  tags: string[];
  purpose: string;
  materials: string[];
  ratio: string;
  steps: string[];
  mistakes: string[];
  fixes: string[];
  uses: string[];
};

export type Palette = {
  id: string;
  name: string;
  type: string;
  colors: {
    principal: string;
    secundaria: string;
    sombra: string;
    highlight: string;
    detalhe: string;
    contraste: string;
    base: string;
  };
  varnish: string;
  techniques: string[];
};

export type ProblemGuide = {
  id: string;
  problem: string;
  causes: string[];
  solution: string[];
};

export type PaintDatabase = {
  colors: ColorEntry[];
  paintTypes: PaintType[];
  recipes: Recipe[];
  techniques: Technique[];
  palettes: Palette[];
  problems: ProblemGuide[];
  mixingRules: {
    basics: string[];
    complementaries: string[];
    quickAdjustments: string[];
    genericRecipes: string[];
  };
  resinFlow: {
    beforePainting: string[];
    paintingFlow: string[];
    alerts: string[];
  };
  safety: string[];
};

export type MixerColor = {
  id: string;
  sourceId?: string;
  name: string;
  hex: string;
  parts: number;
  paintType: string;
  opacity: string;
  finish: string;
};

export type SavedRecipe = {
  id: string;
  name: string;
  createdAt: string;
  colors: MixerColor[];
  resultHex: string;
  calibratedHex?: string;
  primer: string;
  opacity: string;
  finish: string;
  notes: string;
};

export type Calibration = {
  id: string;
  createdAt: string;
  sourceKey: string;
  brand: string;
  line: string;
  colorName: string;
  estimatedHex: string;
  opacity: string;
  finish: string;
  primer: string;
  layers: number;
  dilution: string;
  photoName?: string;
};
