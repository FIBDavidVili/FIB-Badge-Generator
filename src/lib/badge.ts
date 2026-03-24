export type Point = [number, number];

export type BadgeLine = {
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

export type TemplateKey =
  | "command"
  | "trialLowCommand"
  | "supervisor"
  | "trialSupervisor"
  | "patrolAgent";

export type LookupResult = {
  callsign: string;
  badgeNumber: string;
  name: string;
  rank: string;
  discordId: string;
};

export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1R7SpirGzmgUzZK6_MwcH0LGAubwShjsaxxJG2fFDi5g/export?format=csv&gid=1598342668";

export const BADGE_LAYOUT: {
  width: number;
  height: number;
  lines: Record<string, BadgeLine>;
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
      fontSize: 65,
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
      fontSize: 57,
      weight: "900",
      maxLen: 33,
      letterSpacing: 0.55,
    },
    line3: {
      label: "Line 3: First part of callsign",
      type: "straight",
      x: 318,
      y: 664,
      fontSize: 50,
      weight: "900",
      maxLen: 4,
      letterSpacing: 0.2,
      rotation: -0.47,
    },
    line4: {
      label: "Line 4: Second part of callsign",
      type: "straight",
      x: 767,
      y: 665,
      fontSize: 50,
      weight: "900",
      maxLen: 4,
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
      fontSize: 65,
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
      maxLen: 5,
      letterSpacing: 0.45,
      rotation: 0,
    },
  },
};

export const templates = {
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
      finish: "Gol-Ray with Sil-Ray Panels",
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
      finish: "Sil-Ray with Gol-Ray Panels",
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
  trialSupervisor: {
    id: "trialSupervisor",
    name: "Trial Supervisor",
    imagePath: "/badges/trial-supervisor.png",
    defaults: {
      size: '2.325"',
      finish: "Sil-Ray with Gol-Ray Panels",
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
      finish: "Rhodium Electroplate",
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
};

const COMMAND_RANKS = new Set([
  "Director",
  "Deputy Director",
  "Assistant Director",
  "Executive Director",
  "Chief of Staff",
  "Command Specialist",
  "Commander in Charge",
  "Section Commander",
  "Agent Commander",
]);

const TRIAL_LOW_COMMAND_RANKS = new Set(["Senior Special Agent In Charge"]);

const SUPERVISOR_RANKS = new Set([
  "Special Agent in Charge",
  "Assistant Special Agent in Charge",
  "Supervisory Special Agent",
]);

const TRIAL_SUPERVISOR_RANKS = new Set(["Senior Special Agent"]);

const PATROL_AGENT_RANKS = new Set([
  "Special Agent",
  "Senior Agent",
  "Agent",
  "Probationary Agent",
]);

export function normalizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeHeader(value = "") {
  return normalizeText(value).toLowerCase();
}

export function clampText(text = "", maxLen = 24) {
  return text.toUpperCase().slice(0, maxLen);
}

export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function splitCallsign(rawCallsign: string) {
  const cleaned = normalizeText(rawCallsign).replace(/\s*-\s*/g, "-");
  const parts = cleaned.split("-").map((part) => normalizeText(part));

  return {
    first: parts[0] || "",
    second: parts[1] || "",
  };
}

export function getTemplateFromRank(rank: string): TemplateKey {
  const cleanRank = normalizeText(rank);

  if (COMMAND_RANKS.has(cleanRank)) return "command";
  if (TRIAL_LOW_COMMAND_RANKS.has(cleanRank)) return "trialLowCommand";
  if (SUPERVISOR_RANKS.has(cleanRank)) return "supervisor";
  if (TRIAL_SUPERVISOR_RANKS.has(cleanRank)) return "trialSupervisor";
  if (PATROL_AGENT_RANKS.has(cleanRank)) return "patrolAgent";

  return "patrolAgent";
}

export function findHeaderIndex(rows: string[][]) {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return (
      normalized.includes("callsign") &&
      normalized.includes("badge number") &&
      normalized.includes("name") &&
      normalized.includes("rank") &&
      (normalized.includes("discord id") || normalized.includes("discordid"))
    );
  });
}

export function getColumnIndexes(headerRow: string[]) {
  const normalized = headerRow.map(normalizeHeader);

  const indexOfAny = (...names: string[]) =>
    normalized.findIndex((value) => names.includes(value));

  return {
    callsign: indexOfAny("callsign"),
    badgeNumber: indexOfAny("badge number", "badgenumber"),
    name: indexOfAny("name"),
    rank: indexOfAny("rank"),
    discordId: indexOfAny("discord id", "discordid"),
  };
}

export function isRepeatedHeaderRow(row: string[]) {
  const normalized = row.map(normalizeHeader);
  return (
    normalized.includes("callsign") &&
    normalized.includes("badge number") &&
    normalized.includes("name") &&
    normalized.includes("rank")
  );
}

export function findRosterEntryByDiscordId(
  rows: string[][],
  discordId: string
): LookupResult | null {
  if (!rows.length) return null;

  const headerIndex = findHeaderIndex(rows);
  if (headerIndex === -1) return null;

  const headerRow = rows[headerIndex];
  const indexes = getColumnIndexes(headerRow);

  if (
    indexes.callsign === -1 ||
    indexes.badgeNumber === -1 ||
    indexes.name === -1 ||
    indexes.rank === -1 ||
    indexes.discordId === -1
  ) {
    return null;
  }

  const cleanDiscordId = discordId.replace(/\D/g, "");

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (isRepeatedHeaderRow(row)) continue;

    const rowDiscordId = String(row[indexes.discordId] || "").replace(/\D/g, "");
    if (!rowDiscordId) continue;

    if (rowDiscordId === cleanDiscordId) {
      return {
        callsign: normalizeText(row[indexes.callsign] || ""),
        badgeNumber: normalizeText(row[indexes.badgeNumber] || ""),
        name: normalizeText(row[indexes.name] || ""),
        rank: normalizeText(row[indexes.rank] || ""),
        discordId: rowDiscordId,
      };
    }
  }

  return null;
}
