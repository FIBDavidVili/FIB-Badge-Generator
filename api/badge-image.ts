import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createCanvas, loadImage } from "canvas";
import { BADGE_LAYOUT, clampText } from "../src/lib/badge.js";

type Point = [number, number];

function decodeParam(value: unknown, fallback = "") {
  const raw = String(value ?? fallback);
  return decodeURIComponent(raw.replace(/\+/g, " "));
}

function setCanvasFont(
  ctx: CanvasRenderingContext2D,
  fontType: string,
  weight: string,
  size: number
) {
  const family =
    fontType === "Roman"
      ? '"DejaVu Serif", "Liberation Serif", serif'
      : '"DejaVu Sans", "Liberation Sans", Arial, sans-serif';

  ctx.font = `${weight} ${size}px ${family}`;
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
    widths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);

  let cursor = x - totalWidth / 2;

  chars.forEach((ch, index) => {
    const drawX = cursor + widths[index] / 2;
    ctx.strokeText(ch, drawX, y);
    ctx.fillText(ch, drawX, y);
    cursor += widths[index] + spacing;
  });
}

function drawStraightText(ctx: CanvasRenderingContext2D, text: string, config: any) {
  const rotation = config.rotation || 0;
  ctx.save();
  ctx.translate(config.x || 0, config.y || 0);
  ctx.rotate(rotation);
  strokeAndFillLetterSpaced(ctx, text, 0, 0, config.letterSpacing || 0);
  ctx.restore();
}

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
      samples[1]?.y - samples[0].y || 0,
      samples[1]?.x - samples[0].x || 1
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
  config: any,
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

    if (totalWidth <= usableLength) return size;

    size -= 1;
    if (size <= minSize) return minSize;
  }

  return Math.max(minSize, size);
}

function drawSmoothPathText(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: any,
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

function getShadowColor(finish: string) {
  if (
    finish.includes("Nickel") ||
    finish.includes("Silver") ||
    finish.includes("Sil-Ray")
  ) {
    return "rgba(255,255,255,0.92)";
  }
  return "rgba(255,245,210,0.95)";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const templateKey = decodeParam(req.query.templateKey, "command");
    const line1 = decodeParam(req.query.line1, "FIB");
    const line2 = decodeParam(req.query.line2, "");
    const line3 = decodeParam(req.query.line3, "");
    const line4 = decodeParam(req.query.line4, "");
    const line5 = decodeParam(req.query.line5, "");
    const line6 = decodeParam(req.query.line6, "");
    const fontType = decodeParam(req.query.fontType, "Block");
    const finish = decodeParam(req.query.finish, "Gold Electroplate");

    const canvas = createCanvas(BADGE_LAYOUT.width, BADGE_LAYOUT.height);
    const ctx = canvas.getContext("2d");

    const imageUrl = `https://www.fibbadges.com/badges/${
      templateKey === "trialLowCommand"
        ? "trial-low-command.png"
        : templateKey === "trialSupervisor"
        ? "trial-supervisor.png"
        : templateKey === "patrolAgent"
        ? "patrol-agent.png"
        : templateKey === "supervisor"
        ? "supervisor.png"
        : "command.png"
    }`;

    const badgeImage = await loadImage(imageUrl);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(badgeImage, 0, 0, BADGE_LAYOUT.width, BADGE_LAYOUT.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1a1a";
    ctx.strokeStyle = getShadowColor(finish);
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 2;

    const form: Record<string, string> = {
      line1,
      line2,
      line3,
      line4,
      line5,
      line6,
    };

    (Object.entries(BADGE_LAYOUT.lines) as [string, any][]).forEach(([key, config]) => {
      const text = clampText(form[key] || "", config.maxLen);
      if (!text) return;

      if (config.type === "straight") {
        setCanvasFont(ctx, fontType, config.weight, config.fontSize);
        drawStraightText(ctx, text, config);
      } else if (config.type === "path") {
        drawSmoothPathText(ctx, text, config, fontType, key);
      }
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(canvas.toBuffer("image/png"));
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to generate badge image",
    });
  }
}
