import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, BadgeInfo, Settings2 } from "lucide-react";
import {
  BADGE_LAYOUT,
  templates,
  SHEET_CSV_URL,
  parseCsv,
  findRosterEntryByDiscordId,
  splitCallsign,
  getTemplateFromRank,
  clampText,
} from "./lib/badge";
import type { TemplateKey } from "./lib/badge";

type BuilderMode = "semiAutomatic" | "manual";

const fontMap = {
  Block: '900 32px "Arial Black", Impact, sans-serif',
  Roman: '700 31px Georgia, "Times New Roman", serif',
};

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
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + spacing * (chars.length - 1);
  let cursor = x - totalWidth / 2;

  chars.forEach((ch, index) => {
    const drawX = cursor + widths[index] / 2;
    ctx.strokeText(ch, drawX, y);
    ctx.fillText(ch, drawX, y);
    cursor += widths[index] + spacing;
  });
}

function drawStraightText(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: (typeof BADGE_LAYOUT.lines)[string]
) {
  const rotation = config.rotation || 0;
  ctx.save();
  ctx.translate(config.x || 0, config.y || 0);
  ctx.rotate(rotation);
  strokeAndFillLetterSpaced(ctx, text, 0, 0, config.letterSpacing || 0);
  ctx.restore();
}

type Point = [number, number];

function catmullRomToBezier(points: Point[]) {
  if (points.length < 2) return [];
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

function cubicPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
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
    const a = Math.atan2(
      (samples[1]?.y ?? 0) - samples[0].y,
      (samples[1]?.x ?? 1) - samples[0].x
    );
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
    widths.reduce((sum, w) => sum + w, 0) +
    letterSpacing * Math.max(0, chars.length - 1);
  return { widths, totalWidth };
}

function fitPathFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: (typeof BADGE_LAYOUT.lines)[string],
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
  config: (typeof BADGE_LAYOUT.lines)[string],
  fontType: string,
  key?: string
) {
  if (!text || !config.points || config.points.length < 2) return;

  const fontSize = fitPathFontSize(
    ctx,
    text,
    config,
    fontType,
    config.fontSize,
    key
  );
  setCanvasFont(ctx, fontType, config.weight, fontSize);

  const { widths, totalWidth } = getTextAdvance(
    ctx,
    text,
    config.letterSpacing || 0
  );
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

function buildInitialState(templateKey: keyof typeof templates) {
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

function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CardContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={className}>{children}</div>;
}

function Button({
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`bg-zinc-900 px-4 py-3 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500 ${props.className || ""}`}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-zinc-700">{children}</label>;
}

function Separator() {
  return <div className="h-px w-full bg-zinc-200" />;
}

function Select({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
    >
      {children}
    </select>
  );
}

function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <option value={value}>{children}</option>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<BuilderMode>("semiAutomatic");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("command");
  const [form, setForm] = useState(buildInitialState("command"));
  const [templateImages, setTemplateImages] = useState(makeEmptyImages());
  const [discordId, setDiscordId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupSuccess, setLookupSuccess] = useState("");
  const template = templates[templateKey];

  const previewList = useMemo(() => Object.values(templates), []);
  const currentImage = templateImages[templateKey];
  const isSemiAutomatic = mode === "semiAutomatic";

  useEffect(() => {
    const entries = Object.entries(templates) as [
      keyof typeof templates,
      (typeof templates)[keyof typeof templates]
    ][];

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

  function applyTemplateDefaults(nextTemplateKey: TemplateKey, preserveLines = true) {
    const defaults = templates[nextTemplateKey].defaults;

    setTemplateKey(nextTemplateKey);
    setForm((prev) => ({
      ...prev,
      size: defaults.size,
      finish: defaults.finish,
      fontType: defaults.fontType,
      enamelColor: defaults.enamelColor,
      enamelType: defaults.enamelType,
      line1: "FIB",
      line2: preserveLines ? prev.line2 : defaults.line2,
      line3: preserveLines ? prev.line3 : defaults.line3,
      line4: preserveLines ? prev.line4 : defaults.line4,
      line5: preserveLines ? prev.line5 : defaults.line5,
      line6: preserveLines ? prev.line6 : defaults.line6,
    }));
  }

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getTextColor() {
    return "#1a1a1a";
  }

  function getShadowColor() {
    if (
      form.finish.includes("Nickel") ||
      form.finish.includes("Silver") ||
      form.finish.includes("Sil-Ray")
    ) {
      return "rgba(255,255,255,0.92)";
    }
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
      const text = clampText(form[key as keyof typeof form] || "", config.maxLen);
      if (!text) return;

      if (config.type === "straight") {
        setCanvasFont(ctx, form.fontType, config.weight, config.fontSize);
        drawStraightText(ctx, text, config);
      } else if (config.type === "path") {
        drawSmoothPathText(ctx, text, config, form.fontType, key);
      }
    });
  }

  async function fetchBadgeDetails() {
    const cleanDiscordId = discordId.replace(/\D/g, "");

    setLookupError("");
    setLookupSuccess("");

    if (!cleanDiscordId) {
      setLookupError("Please enter a valid Discord ID.");
      return;
    }

    try {
      setLookupLoading(true);

      const response = await fetch(SHEET_CSV_URL, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Unable to fetch roster data.");
      }

      const csvText = await response.text();
      const rows = parseCsv(csvText);
      const match = findRosterEntryByDiscordId(rows, cleanDiscordId);

      if (!match) {
        setLookupError("No badge details were found for that Discord ID.");
        return;
      }

      const nextTemplate = getTemplateFromRank(match.rank);
      const callsignParts = splitCallsign(match.callsign);

      setTemplateKey(nextTemplate);
      setForm((prev) => ({
        ...prev,
        size: templates[nextTemplate].defaults.size,
        finish: templates[nextTemplate].defaults.finish,
        fontType: templates[nextTemplate].defaults.fontType,
        enamelColor: templates[nextTemplate].defaults.enamelColor,
        enamelType: templates[nextTemplate].defaults.enamelType,
        line1: "FIB",
        line2: match.rank,
        line3: callsignParts.first,
        line4: callsignParts.second,
        line5: match.name,
        line6: match.badgeNumber,
      }));

      setLookupSuccess(`Badge details loaded for ${match.name || "this roster entry"}.`);
    } catch (error) {
      console.error(error);
      setLookupError("There was a problem fetching the roster data.");
    } finally {
      setLookupLoading(false);
    }
  }

  function clearBadgeDetails() {
    setLookupError("");
    setLookupSuccess("");
    setDiscordId("");
    setTemplateKey("command");
    setForm(buildInitialState("command"));
  }

  function downloadBadge() {
    if (!currentImage || !canvasRef.current) return;
    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png", 1.0);
    link.download = `${template.name.replace(/\s+/g, "-").toLowerCase()}-badge.png`;
    link.click();
  }

  const subtitle =
    mode === "manual"
      ? "Choose a badge template and generate badges directly on the website."
      : "Enter your Discord ID to fetch your badge details automatically.";

  return (
    <div className="min-h-screen bg-zinc-100 p-4 md:p-6">
      <div
        className={`mx-auto grid max-w-7xl gap-6 ${
          isSemiAutomatic
            ? "xl:grid-cols-[340px_minmax(0,1fr)]"
            : "xl:grid-cols-[380px_minmax(0,1fr)]"
        }`}
      >
        <Card className={`rounded-3xl border-0 shadow-xl ${isSemiAutomatic ? "self-start" : ""}`}>
          <CardContent className={`space-y-6 ${isSemiAutomatic ? "p-4" : "p-5"}`}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-900 p-2 text-white">
                <BadgeInfo className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Badge Builder</h1>
                <p className="text-sm text-zinc-500">{subtitle}</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Build Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("semiAutomatic")}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    mode === "semiAutomatic"
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  Auto-Fill from Discord ID
                </button>

                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    mode === "manual"
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  Manual Badge Setup
                </button>
              </div>
            </div>

            <Separator />

            {isSemiAutomatic ? (
              <div className="grid gap-2">
                <Label>Discord ID</Label>
                <Input
                  value={discordId}
                  inputMode="numeric"
                  placeholder="Enter your Discord ID to load your badge details"
                  onChange={(e) => setDiscordId(e.target.value.replace(/[^\d]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      fetchBadgeDetails();
                    }
                  }}
                  className="rounded-xl"
                />

                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={fetchBadgeDetails}
                      disabled={lookupLoading}
                      className="w-full rounded-2xl"
                    >
                      {lookupLoading ? "Loading Badge Details..." : "Load Badge Details"}
                    </Button>

                    <Button
                      type="button"
                      onClick={clearBadgeDetails}
                      className="w-full rounded-2xl bg-zinc-700 hover:bg-zinc-600"
                    >
                      Clear Form
                    </Button>
                  </div>

                  <Button
                    type="button"
                    onClick={downloadBadge}
                    className="w-full rounded-2xl"
                    disabled={!currentImage}
                  >
                    <Download className="mr-2 inline h-4 w-4" />
                    Download Badge
                  </Button>
                </div>

                {lookupError ? (
                  <p className="text-sm font-medium text-red-600">{lookupError}</p>
                ) : null}

                {lookupSuccess ? (
                  <p className="text-sm font-medium text-emerald-600">{lookupSuccess}</p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Badge Template</Label>
                  <Select
                    value={templateKey}
                    onValueChange={(value) =>
                      applyTemplateDefaults(value as TemplateKey, true)
                    }
                  >
                    {previewList.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </Select>
                  <p className="text-xs text-zinc-500">
                    Select a badge template and enter the engraving details manually.
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                    <Settings2 className="h-4 w-4" />
                    Engraving Lines
                  </div>

                  {Object.entries(BADGE_LAYOUT.lines).map(([key, cfg]) => (
                    <div key={key} className="grid gap-2">
                      <Label>{cfg.label}</Label>
                      <Input
                        className={`rounded-xl ${cfg.fixed ? "bg-zinc-50" : ""}`}
                        value={form[key as keyof typeof form]}
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
                  className="w-full rounded-2xl"
                  disabled={!currentImage}
                >
                  <Download className="mr-2 inline h-4 w-4" />
                  Download Badge
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="rounded-3xl border-0 shadow-xl">
            <CardContent className="p-0">
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
                      Template image not found for {template.name}. Check the file path in /public/badges/.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {!isSemiAutomatic ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {previewList.map((item) => {
                const hasImage = Boolean(
                  templateImages[item.id as keyof typeof templateImages]
                );

                return (
                  <button
                    key={item.id}
                    onClick={() => applyTemplateDefaults(item.id as TemplateKey, true)}
                    className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:shadow-lg ${
                      templateKey === item.id
                        ? "border-zinc-900 ring-2 ring-zinc-900/10"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between text-sm font-semibold text-zinc-900">
                      <span>{item.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          hasImage
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {hasImage ? "Ready" : "Missing"}
                      </span>
                    </div>

                    <div className="grid h-44 place-items-center rounded-2xl bg-zinc-100 p-3">
                      {hasImage ? (
                        <img
                          src={templateImages[item.id as keyof typeof templateImages]?.src}
                          alt={item.name}
                          className="h-40 w-auto object-contain"
                        />
                      ) : (
                        <div className="text-center text-xs text-zinc-400">
                          No template image found
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <a
        href="https://discord.com/users/640288455766704162"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 rounded-lg bg-gradient-to-r from-white to-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-md transition hover:scale-105 hover:shadow-lg"
      >
        Built by David V.
      </a>
    </div>
  );
}
