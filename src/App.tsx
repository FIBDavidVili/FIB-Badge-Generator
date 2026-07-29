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

  const [discordId, setDiscordId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [templateKey, setTemplateKey] =
    useState<TemplateKey>("command");

  const [form, setForm] = useState(
    buildInitialState("command")
  );

  const [templateImages, setTemplateImages] =
    useState(makeEmptyImages());

  const template = templates[templateKey];
  const currentImage = templateImages[templateKey];


  useEffect(() => {
    Object.entries(templates).forEach(([key, tpl]) => {

      const img = new Image();

      img.onload = () => {
        setTemplateImages(prev => ({
          ...prev,
          [key]: img
        }));
      };

      img.src = tpl.imagePath;

    });
  }, []);


  useEffect(() => {
    drawBadge();
  }, [form, templateKey, templateImages]);


  function drawBadge() {

    const canvas = canvasRef.current;
    if (!canvas || !currentImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;


    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    ctx.drawImage(
      currentImage,
      0,
      0,
      BADGE_LAYOUT.width,
      BADGE_LAYOUT.height
    );


    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#1a1a1a";
    ctx.strokeStyle = "rgba(255,245,210,.95)";
    ctx.lineWidth = 3.5;


    Object.entries(BADGE_LAYOUT.lines)
      .forEach(([key, config]) => {

        const text =
          clampText(
            form[key as keyof typeof form] || "",
            config.maxLen
          );

        if (!text) return;


        if (config.type === "straight") {

          setCanvasFont(
            ctx,
            form.fontType,
            config.weight,
            config.fontSize
          );

          drawStraightText(
            ctx,
            text,
            config
          );

        } 
        
        else {

          drawSmoothPathText(
            ctx,
            text,
            config,
            form.fontType,
            key
          );

        }

      });
  }



  async function getBadge() {

    const id =
      discordId.replace(/\D/g, "");


    if (!id) {

      setError(
        "Please enter your Discord ID."
      );

      return;

    }


    setLoading(true);
    setError("");
    setLoaded(false);


    try {


      const response =
        await fetch(
          `/api/badge?discordId=${id}`
        );


      const data =
        await response.json();


      if (!data.ok) {

        throw new Error(
          data.error
        );

      }


      const badge =
        data.badge;


      const nextTemplate =
        badge.templateKey ||
        getTemplateFromRank(
          badge.rank
        );


      setTemplateKey(
        nextTemplate
      );


      setForm(prev => ({
        ...prev,

        line1: badge.line1,
        line2: badge.line2,
        line3: badge.line3,
        line4: badge.line4,
        line5: badge.line5,
        line6: badge.line6,

        fontType:
          badge.fontType ||
          "Block",

        finish:
          badge.finish ||
          "Standard"

      }));


      setLoaded(true);


      // automatic download popup
      setTimeout(() => {

        const link =
          document.createElement(
            "a"
          );

        link.href =
          data.imageUrl;

        link.download =
          "FIB-Badge.png";

        document.body.appendChild(
          link
        );

        link.click();

        document.body.removeChild(
          link
        );


      }, 1000);



    }

    catch(err:any){

      setError(
        err.message
      );

    }

    finally {

      setLoading(false);

    }

  }



  return (

    <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-6">


      {!loaded && !loading && (

        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md text-center">


          <img
            src="/favicon.png"
            className="w-20 h-20 mx-auto mb-5"
          />


          <h1 className="text-2xl font-bold">
            FIB Badge Claim
          </h1>


          <p className="text-zinc-500 mb-5">
            Enter your Discord ID to receive your badge.
          </p>


          <input

            value={discordId}

            onChange={
              e =>
              setDiscordId(
                e.target.value
              )
            }

            placeholder="Discord ID"

            className="
              w-full
              border
              rounded-xl
              px-4
              py-3
              mb-3
            "

          />


          <button

            onClick={getBadge}

            className="
              w-full
              bg-zinc-900
              text-white
              rounded-xl
              py-3
            "

          >

            Get Badge

          </button>


          {
            error &&
            <p className="text-red-500 mt-3">
              {error}
            </p>
          }


        </div>

      )}



      {loading && (

        <div className="text-center">

          <img
            src="/favicon.png"
            className="
              w-20
              h-20
              mx-auto
              animate-spin
            "
          />


          <h2 className="mt-4 text-xl font-bold">
            Creating your badge...
          </h2>


        </div>

      )}



      {loaded && (

        <div className="bg-white rounded-3xl shadow-xl p-6 text-center">


          <h1 className="text-2xl font-bold mb-5">
            Your Badge
          </h1>


          <canvas

            ref={canvasRef}

            width={BADGE_LAYOUT.width}

            height={BADGE_LAYOUT.height}

            className="max-w-xl"

          />


          <p className="mt-4 text-sm text-zinc-500">
            Your download should start automatically.
          </p>


        </div>

      )}


    </div>

  );
}
