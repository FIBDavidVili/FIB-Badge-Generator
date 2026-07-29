import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBadgeDataFromDiscordId } from "../src/lib/badge.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {

    // Only allow GET requests
    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }


    // Get Discord ID from URL
    const discordId = String(req.query.discordId || "")
      .replace(/\D/g, "")
      .trim();


    if (!discordId) {
      return res.status(400).json({
        ok: false,
        error: "Missing Discord ID",
      });
    }


    // Get badge information from your database/sheet
    const badge = await getBadgeDataFromDiscordId(discordId);


    if (!badge) {
      return res.status(404).json({
        ok: false,
        error: "No badge found for this Discord ID.",
      });
    }


    // Create image generation parameters
    const params = new URLSearchParams({
      discordId: badge.discordId,
      templateKey: badge.templateKey,

      line1: badge.line1 || "",
      line2: badge.line2 || "",
      line3: badge.line3 || "",
      line4: badge.line4 || "",
      line5: badge.line5 || "",
      line6: badge.line6 || "",

      fontType: badge.fontType || "default",
      finish: badge.finish || "standard",
    });


    const imageUrl =
      `https://www.fibbadges.com/api/badge-image?${params.toString()}`;


    return res.status(200).json({
      ok: true,

      // Badge information
      badge,

      // Generated badge image
      imageUrl,

      // Used by frontend for automatic download
      downloadName: "FIB-Badge.png",
    });


  } catch (error) {

    console.error("Badge API Error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });

  }
}
