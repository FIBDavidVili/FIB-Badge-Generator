import React, { useEffect, useMemo, useRef, useState } from "react";
import { BadgeInfo, Download, Settings2 } from "lucide-react";

type Point = [number, number];

type BadgeLine = {
  label: string;
  fixed?: boolean;
  type: "straight" | "arcTop" | "arcBottom" | "path";
  x?: number;
  y?: number;
  radius?: number;
  angle?: number;
  step?: number;
  points?: Point[];
  fontSize: number;
  weight: string;
  maxLen: number;
  letterSpacing?: number;
  rotation?: number;
};

type TemplateKey = "command" | "trialLowCommand" | "supervisor" | "trialSupervisor" | "patrolAgent";

type FormState = {
  size: string;
  finish: string;
  fontType: string;
  enamelColor: string;
  enamelType: string;
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  line5: string;
  line6: string;
};

const BADGE_LAYOUT: {
  width: number;
  height: number;
  lines: Record<keyof Pick<FormState, "line1" | "line2" | "line3" | "line4" | "line5" | "line6">, BadgeLine>;
} = {
  width: 1080,
  height: 1080,
  lines: {
    line1: {
      label: "Line 1",
      fixed: true,
      type: "straight",
      x: 540,
      y: 312,
      fontSize: 56,
      weight: "900",
      maxLen: 18,
      letterSpacing: 0.8,
      rotation: 0,
    },
    line2: {
      label: "Line 2: Rank",
      type: "path",
      points: [
        [355, 500],
        [448, 432],
        [540, 404],
        [648, 432],
        [735, 500],
      ],
      fontSize: 52,
      weight: "900",
      maxLen: 24,
      letterSpacing: 0.55,
    },
    line3: {
      label: "Line 3: First part of callsign",
      type: "straight",
      x: 318,
      y: 664,
      fontSize: 38,
      weight: "900",
      maxLen: 10,
      letterSpacing: 0.2,
      rotation: -0.47,
    },
    line4: {
      label: "Line 4: Second part of callsign",
      type: "straight",
      x: 767,
      y: 665,
      fontSize: 38,
      weight: "900",
      maxLen: 10,
      letterSpacing: 0.2,
      rotation: 0.47,
    },
    line5: {
      label: "Line 5: Name",
      type: "path",
      points: [
        [350, 792],
        [430, 838],
        [540, 854],
        [650, 838],
        [723, 796],
      ],
      fontSize: 52,
      weight: "900",
      maxLen: 22,
      letterSpacing: 0.45,
    },
    line6: {
      label: "Line 6: Badge Number",
      type: "straight",
      x: 542,
      y: 948,
      fontSize: 38,
      weight: "900",
      maxLen: 12,
      letterSpacing: 0.45,
      rotation: 0,
    },
  },
};

const templates = {
  command: {
    id: "command",
    name: "Command",
    imagePath: "/badges/command.png",
    defaults: {
      size: '2.325"',
      finish: "Gold Electroplate",
      fontType: "Block",
      enamelColor: "Black",
      enamelType: "Soft (Regular)",
      line1: "FIB",
      line2: "",
      line3: "",
      line4: "",
      line5: "",
      line6: "",
    },
  },
  trialLowCommand: {
    id: "trialLowCommand",
    name: "Trial Low Command",
    imagePath: "/badges/trial-low-command.png",
    defaults: {
      size: '2.325"',
      finish: "Gold Electroplate",
      fontType: "Block",
      enamelColor: "Black",
      enamelType: "Soft (Regular)",
      line1: "FIB",
      line2: "",
      line3: "",
      line4: "",
      line5: "",
      line6: "",
    },
  },
  supervisor: {
    id: "supervisor",
    name: "Supervisor",
    imagePath: "/badges/supervisor.png",
    defaults: {
      size: '2.325"',
      finish: "Nickel Electroplate",
      fontType: "Block",
      enamelColor: "Black",
      enamelType: "Soft (Regular)",
      line1: "FIB",
      line2: "SUPERVISOR",
      line3: "",
      line4: "",
      line5: "",
      line6: "",
    },
  },
  trialSupervisor: {
    id: "trialSupervisor",
    name: "Trial Supervisor",
    imagePath: "/badges/trial-supervisor.png",
    defaults: {
      size: '2.325"',
      finish: "Nickel Electroplate",
      fontType: "Block",
      enamelColor: "Black",
      enamelType: "Soft (Regular)",
      line1: "FIB",
      line2: "",
      line3: "",
      line4: "",
      line5: "",
      line6: "",
    },
  },
  patrolAgent: {
    id: "patrolAgent",
    name: "Patrol Agent",
    imagePath: "/badges/patrol-agent.png",
    defaults: {
      size: '2.325"',
      finish: "Gold Electroplate",
      fontType: "Block",
      enamelColor: "Black",
      enamelType: "Soft (Regular)",
      line1: "FIB",
      line2: "",
      line3: "",
      line4: "",
      line5: "",
      line6: "",
    },
  },
} satisfies Record<TemplateKey, {
  id: string;
  name: string;
  imagePath: string;
  defaults: FormState;
}>;

const fontMap = {
  Block: '900 32px "Arial Black", Impact, sans-serif',
  Roman: '700 31px Georgia, "Times New Roman", serif',
};

function clampText(text = "", maxLen = 24) {
  return text.toUpperCase().slice(0, maxLen);
}

function setCanvasFont(
  ctx: CanvasRenderingContext2D,
  fontType: keyof typeof fontMap | string,
  weight: string,
  size: number
) {
  const fontBase = fontMap[fontType as keyof typeof fontMap] || fontMap.Block;
  ctx.font = fontBase.replace(/\d+px/, `${size}px`).replace(/^\d+/, weight);
}

function strokeAndFillLetterSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing = 0
) {
  if (!text) return;

  if (!spacing) {
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    return;
  }

  const chars = text.split("");
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + spacing * (chars.length - 1);
  let cursor = x - totalWidth / 2;

  chars.forEach((ch, index) => {
    const drawX = cursor + widths[index] / 2;
    ctx.strokeText(ch, drawX, y);
    ctx.fillText(ch, drawX, y);
    cursor += widths[index] + spacing;
  });
}

function drawStraightText(ctx: CanvasRenderingContext2D, text: string, config: BadgeLine) {
  const rotation = config.rotation || 0;
  ctx.save();
  ctx.translate(config.x || 0, config.y || 0);
  ctx.rotate(rotation);
  strokeAndFillLetterSpaced(ctx, text, 0, 0, config.letterSpacing || 0);
  ctx.restore();
}

function drawArcCenteredText(ctx: CanvasRenderingContext2D, text: string, config: BadgeLine) {
  if (!text) return;
  const { x = 0, y = 0, radius = 0, angle = 0, step = 0 } = config;
  const chars = text.split("");
  const total = (chars.length - 1) * step;
  const start = angle - total / 2;

  ctx.save();
  ctx.translate(x, y);

  chars.forEach((ch, index) => {
    const a = start + index * step;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -radius);
    ctx.rotate(Math.PI / 2);
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });

  ctx.restore();
}

function drawArcText(ctx: CanvasRenderingContext2D, text: string, config: BadgeLine) {
  drawArcCenteredText(ctx, text, config);
}

function fitArcStep(text: string, config: BadgeLine) {
  if (!text || !config.step) return config.step || 0;
  if (text.length <= 4) return config.step * 1.18;
  if (text.length <= 8) return config.step * 1.08;
  if (text.length <= 12) return config.step;
  if (text.length <= 16) return config.step * 0.92;
  return config.step * 0.86;
}

function catmullRomToBezier(points: Point[]) {
  if (points.length < 2) return [] as [Point, Point, Point, Point][];
  const beziers: [Point, Point, Point, Point][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1: Point = [
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
    ];

    const cp2: Point = [
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
    ];

    beziers.push([p1, cp1, cp2, p2]);
  }

  return beziers;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const x =
    mt * mt * mt * p0[0] +
    3 * mt * mt * t * p1[0] +
    3 * mt * t * t * p2[0] +
    t * t * t * p3[0];
  const y =
    mt * mt * mt * p0[1] +
    3 * mt * mt * t * p1[1] +
    3 * mt * t * t * p2[1] +
    t * t * t * p3[1];
  return [x, y];
}

function buildSmoothPathSamples(points: Point[], detailPerSegment = 40) {
  const curves = catmullRomToBezier(points);
  const samples: { x: number; y: number; length: number }[] = [];

  let totalLength = 0;
  let prev: Point | null = null;

  curves.forEach(([p0, p1, p2, p3], curveIndex) => {
    for (let i = 0; i <= detailPerSegment; i++) {
      if (curveIndex > 0 && i === 0) continue;
      const t = i / detailPerSegment;
      const [x, y] = cubicPoint(p0, p1, p2, p3, t);

      if (prev) {
        totalLength += Math.hypot(x - prev[0], y - prev[1]);
      }

      samples.push({ x, y, length: totalLength });
      prev = [x, y];
    }
  });

  return { samples, totalLength };
}

function getPointAtLength(
  samples: { x: number; y: number; length: number }[],
  targetLength: number
) {
  if (!samples.length) return { x: 0, y: 0, angle: 0 };

  if (targetLength <= 0) {
    const a = Math.atan2(samples[1]?.y - samples[0].y || 0, samples[1]?.x - samples[0].x || 1);
    return { x: samples[0].x, y: samples[0].y, angle: a };
  }

  const last = samples[samples.length - 1];
  if (targetLength >= last.length) {
    const prev = samples[samples.length - 2] || last;
    const a = Math.atan2(last.y - prev.y, last.x - prev.x);
    return { x: last.x, y: last.y, angle: a };
  }

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];

    if (targetLength <= b.length) {
      const segLen = b.length - a.length || 1;
      const t = (targetLength - a.length) / segLen;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      return { x, y, angle };
    }
  }

  return { x: last.x, y: last.y, angle: 0 };
}

function getTextAdvance(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing = 0
) {
  const chars = text.split("");
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + letterSpacing * Math.max(0, chars.length - 1);
  return { widths, totalWidth };
}

function fitPathFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: BadgeLine,
  fontType: string,
  baseSize: number,
  key?: string
) {
  if (!config.points || config.points.length < 2) return baseSize;

  const { totalLength } = buildSmoothPathSamples(config.points, 40);

  let usableLength = totalLength * 0.9;
  let minSize = 20;

  if (key === "line2") {
    usableLength = totalLength * 0.94;
    minSize = 18;
  }

  if (key === "line5") {
    usableLength = totalLength * 0.84;
    minSize = 18;
  }

  let size = baseSize;

  for (let i = 0; i < 40; i++) {
    setCanvasFont(ctx, fontType, config.weight, size);
    const { totalWidth } = getTextAdvance(ctx, text, config.letterSpacing || 0);

    if (totalWidth <= usableLength) {
      return size;
    }

    size -= 1;
    if (size <= minSize) return minSize;
  }

  return Math.max(minSize, size);
}

function drawSmoothPathText(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: BadgeLine,
  fontType: string,
  key?: string
) {
  if (!text || !config.points || config.points.length < 2) return;

  const fontSize = fitPathFontSize(ctx, text, config, fontType, config.fontSize, key);
  setCanvasFont(ctx, fontType, config.weight, fontSize);

  const { widths, totalWidth } = getTextAdvance(ctx, text, config.letterSpacing || 0);
  const { samples, totalLength } = buildSmoothPathSamples(config.points, 50);

  if (!samples.length || totalLength <= 0) return;

  const startOffset = Math.max(0, (totalLength - totalWidth) / 2);
  let cursor = startOffset;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const charWidth = widths[i];
    const centerAt = cursor + charWidth / 2;

    const { x, y, angle } = getPointAtLength(samples, centerAt);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    cursor += charWidth + (config.letterSpacing || 0);
  }
}

function buildInitialState(templateKey: TemplateKey): FormState {
  const defaults = templates[templateKey].defaults;
  return {
    size: defaults.size,
    finish: defaults.finish,
    fontType: defaults.fontType,
    enamelColor: defaults.enamelColor,
    enamelType: defaults.enamelType,
    line1: defaults.line1,
    line2: defaults.line2,
    line3: defaults.line3,
    line4: defaults.line4,
    line5: defaults.line5,
    line6: defaults.line6,
  };
}

function makeEmptyImages() {
  return {
    patrolAgent: null as HTMLImageElement | null,
    command: null as HTMLImageElement | null,
    trialLowCommand: null as HTMLImageElement | null,
    supervisor: null as HTMLImageElement | null,
    trialSupervisor: null as HTMLImageElement | null,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("command");
  const [form, setForm] = useState<FormState>(buildInitialState("command"));
  const [templateImages, setTemplateImages] = useState(makeEmptyImages());
  const template = templates[templateKey];

  const previewList = useMemo(() => Object.values(templates), []);
  const currentImage = templateImages[templateKey];

  useEffect(() => {
    setForm(buildInitialState(templateKey));
  }, [templateKey]);

  useEffect(() => {
    const entries = Object.entries(templates) as [TemplateKey, (typeof templates)[TemplateKey]][];

    entries.forEach(([key, tpl]) => {
      const img = new Image();
      img.onload = () => {
        setTemplateImages((prev) => ({ ...prev, [key]: img }));
      };
      img.src = tpl.imagePath;
    });
  }, []);

  useEffect(() => {
    drawBadge();
  }, [form, templateKey, templateImages]);

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getTextColor() {
    return "#1a1a1a";
  }

  function getShadowColor() {
    if (form.finish.includes("Nickel") || form.finish.includes("Silver")) return "rgba(255,255,255,0.9)";
    return "rgba(255,245,210,0.95)";
  }

  function drawBadge() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentImage) return;

    ctx.drawImage(currentImage, 0, 0, BADGE_LAYOUT.width, BADGE_LAYOUT.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = getTextColor();
    ctx.strokeStyle = getShadowColor();
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 2;

    Object.entries(BADGE_LAYOUT.lines).forEach(([key, config]) => {
      const formKey = key as keyof Pick<FormState, "line1" | "line2" | "line3" | "line4" | "line5" | "line6">;
      const text = clampText(form[formKey] || "", config.maxLen);
      if (!text) return;

      if (config.type === "straight") {
        setCanvasFont(ctx, form.fontType, config.weight, config.fontSize);
        drawStraightText(ctx, text, config);
      } else if (config.type === "path") {
        drawSmoothPathText(ctx, text, config, form.fontType, key);
      } else {
        const arcConfig = { ...config, step: fitArcStep(text, config) };
        setCanvasFont(ctx, form.fontType, config.weight, config.fontSize);
        drawArcText(ctx, text, arcConfig);
      }
    });
  }

  function downloadBadge() {
    if (!currentImage || !canvasRef.current) return;
    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png", 1.0);
    link.download = `${template.name.replace(/\s+/g, "-").toLowerCase()}-badge.png`;
    link.click();
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-3xl bg-white shadow-xl">
          <div className="space-y-6 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-900 p-2 text-white">
                <BadgeInfo className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Badge Builder</h1>
                <p className="text-sm text-zinc-500">
                  Choose a badge template and generate badges directly on the website.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Badge Template</Label>
              <Select
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2"
              >
                {previewList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ReadOnlyField label="Size" value={form.size} />
              <ReadOnlyField label="Finish" value={form.finish} />
              <ReadOnlyField label="Font Type" value={form.fontType} />
              <ReadOnlyField label="Enamel Color" value={form.enamelColor} />
              <div className="col-span-2">
                <ReadOnlyField label="Enamel Type" value={form.enamelType} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <Settings2 className="h-4 w-4" />
                Engraving Lines
              </div>

              {(Object.entries(BADGE_LAYOUT.lines) as [keyof typeof BADGE_LAYOUT.lines, BadgeLine][]).map(([key, cfg]) => (
                <div key={key} className="grid gap-2">
                  <Label>{cfg.label}</Label>
                  <Input
                    className={`rounded-xl border border-zinc-300 px-3 py-2 ${cfg.fixed ? "bg-zinc-50" : "bg-white"}`}
                    value={form[key]}
                    maxLength={cfg.maxLen}
                    readOnly={cfg.fixed}
                    onChange={(e) => {
                      if (cfg.fixed) return;
                      setField(key, e.target.value.toUpperCase());
                    }}
                    placeholder={cfg.label}
                  />
                </div>
              ))}
            </div>

            <Button
              onClick={downloadBadge}
              className="flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-4 py-3 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!currentImage}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Badge
            </Button>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-3xl bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-6 py-4">
              <h2 className="text-lg font-semibold">Live Preview</h2>
            </div>

            <div className="grid place-items-center bg-[radial-gradient(circle_at_top,_#ffffff,_#e4e4e7)] p-6 md:p-10">
              <div className="rounded-[32px] bg-white/70 p-4 shadow-2xl backdrop-blur">
                {currentImage ? (
                  <canvas
                    ref={canvasRef}
                    width={BADGE_LAYOUT.width}
                    height={BADGE_LAYOUT.height}
                    className="h-auto w-full max-w-[700px] rounded-2xl"
                  />
                ) : (
                  <div className="grid h-[640px] w-[520px] place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-400">
                    Template image not found for {template.name}. Add the PNG file in /public/badges/.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {previewList.map((item) => {
              const hasImage = Boolean(templateImages[item.id as TemplateKey]);

              return (
                <button
                  key={item.id}
                  onClick={() => setTemplateKey(item.id as TemplateKey)}
                  className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:shadow-lg ${
                    templateKey === item.id ? "border-zinc-900 ring-2 ring-zinc-900/10" : "border-zinc-200"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between text-sm font-semibold text-zinc-900">
                    <span>{item.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        hasImage ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {hasImage ? "Ready" : "Missing"}
                    </span>
                  </div>

                  <div className="grid h-44 place-items-center rounded-2xl bg-zinc-100 p-3">
                    {hasImage ? (
                      <img
                        src={templateImages[item.id as TemplateKey]?.src}
                        alt={item.name}
                        className="h-40 w-auto object-contain"
                      />
                    ) : (
                      <div className="text-center text-xs text-zinc-400">No template image found</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type BasicProps = React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>;

function Label({ children, className = "", ...props }: BasicProps) {
  return (
    <label className={`text-sm font-medium text-zinc-800 ${className}`} {...props}>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={props.type || "button"} {...props} />;
}

function Separator() {
  return <div className="h-px w-full bg-zinc-200" />;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input value={value} readOnly className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2" />
    </div>
  );
}
