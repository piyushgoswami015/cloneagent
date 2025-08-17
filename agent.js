// agent.js
import OpenAI from "openai";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import puppeteer from "puppeteer";

// 🔹 NEW
import express from "express";
import cors from "cors";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ SYSTEM PROMPT
const SYSTEM_PROMPT = `
You are an AI agent with JSON-only replies.
Steps = START, THINK, TOOL, OBSERVE, OUTPUT.
Each step must return valid JSON with fields:
- step: one of START, THINK, TOOL, OBSERVE, OUTPUT
- content: explanation or final result (always required)
- tool_name: (only for TOOL)
- input: (only for TOOL)
Available tools:
- getWeatherDetailsByCity(cityname)
- getGithubUserInfoByUsername(username)
- executeCommand(command)
- createFolder(name)
- createFile(path, content)
- cloneWebsiteToZip(url): Clones a site (dynamic via Puppeteer or static via fetch) into a zip file.
`;

// ✅ Helper function: download asset
async function downloadFile(fileUrl, destPath) {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return console.warn(`⚠️ Failed: ${fileUrl}`);
    const buffer = await res.buffer();
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.writeFile(destPath, buffer);
    console.log(`📥 Downloaded: ${fileUrl} -> ${destPath}`);
  } catch (err) {
    console.error(`❌ Error downloading ${fileUrl}:`, err.message);
  }
}

// ✅ Tools
const tools = {
  getWeatherDetailsByCity: async (cityname) => {
    return { result: `Weather details for ${cityname} (dummy)` };
  },

  getGithubUserInfoByUsername: async (username) => {
    const response = await fetch(`https://api.github.com/users/${username}`);
    return await response.json();
  },

  executeCommand: async (command) => {
    return { result: `Executed: ${command}` };
  },

  createFolder: async (name) => {
    if (!fs.existsSync(name)) {
      fs.mkdirSync(name);
    }
    return { result: `Folder '${name}' created.` };
  },

  createFile: async (filePath, content) => {
    fs.writeFileSync(filePath, content);
    return { result: `File '${filePath}' created.` };
  },

  // ✅ Clone website (static OR dynamic with Puppeteer)
  cloneWebsiteToZip: async (url) => {
    let html;
    let dynamic = false;

    try {
      // First try static fetch
      const response = await fetch(url, { timeout: 10000 });
      html = await response.text();

      // If page looks too empty, fallback to Puppeteer
      if (html.length < 2000 || !html.includes("<script")) {
        throw new Error("Likely dynamic site, use Puppeteer");
      }
    } catch (err) {
      console.log("⚡ Switching to Puppeteer for dynamic rendering...");
      dynamic = true;

      // Some hosts require --no-sandbox
      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      html = await page.content();
      await browser.close();
    }

    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    // Folder setup
    const folderName = url.replace(/(^\w+:|^)\/\//, "").replace(/[^\w]/g, "_");
    const folderPath = path.resolve(`./${folderName}`);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Collect assets
    const assetPromises = [];
    $("link[href], script[src], img[src]").each((_, el) => {
      const attrib = el.name === "link" ? "href" : "src";
      let link = $(el).attr(attrib);
      if (!link || link.startsWith("data:")) return;

      const assetUrl = new URL(link, baseUrl).href;

      // Decide subfolder
      let subfolder = "misc";
      if (link.endsWith(".css")) subfolder = "css";
      else if (link.endsWith(".js")) subfolder = "js";
      else if (link.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) subfolder = "images";
      else if (link.match(/\.(woff2?|ttf|eot|otf)$/i)) subfolder = "fonts";

      const localFile = path.join("assets", subfolder, path.basename(assetUrl.split("?")[0]));
      const destPath = path.join(folderPath, localFile);

      // Update HTML reference
      $(el).attr(attrib, localFile);

      assetPromises.push(downloadFile(assetUrl, destPath));
    });

    await Promise.all(assetPromises);

    // Save modified HTML
    fs.writeFileSync(path.join(folderPath, "index.html"), $.html());

    // Create zip
    const zip = new AdmZip();
    zip.addLocalFolder(folderPath);
    const zipName = `${folderName}.zip`;
    const zipPath = path.resolve(`./${zipName}`);
    zip.writeZip(zipPath);

    // 🔹 NEW: also place a copy under ./public/downloads for direct download
    const downloadsDir = path.resolve("./public/downloads");
    await fs.promises.mkdir(downloadsDir, { recursive: true });
    const publicZipPath = path.join(downloadsDir, zipName);
    await fs.promises.copyFile(zipPath, publicZipPath);

    return {
      result: `Website (${dynamic ? "dynamic" : "static"}) cloned to ${zipPath}`,
      zipPath,
      publicZipPath,
      zipName,
      mode: dynamic ? "dynamic" : "static",
    };
  },
};



// ✅ Agent loop (unchanged but exported if you still want CLI usage)
async function runAgent(userPrompt) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    console.log("🔎 Raw LLM response:", response.choices[0].message.content);

    let parsedContent;
    try {
      parsedContent = JSON.parse(response.choices[0].message.content);
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      break;
    }

    if (parsedContent.step === "START" || parsedContent.step === "THINK") {
      console.log("🤔", parsedContent.content);
      messages.push({ role: "assistant", content: JSON.stringify(parsedContent) });
    } else if (parsedContent.step === "TOOL") {
      const tool = tools[parsedContent.tool_name];
      if (tool) {
        const result = await tool(...[].concat(parsedContent.input || []));
        console.log("🛠️ Tool used:", parsedContent.tool_name, "➡️", result);

        messages.push({
          role: "assistant",
          content: JSON.stringify(parsedContent),
        });
        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: result }),
        });
      } else {
        console.log("❌ Unknown tool:", parsedContent.tool_name);
        break;
      }
    } else if (parsedContent.step === "OUTPUT") {
      console.log("✅ Final Output:", parsedContent.content || JSON.stringify(parsedContent));
      break;
    }
  }
}


async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  
  const publicDir = path.resolve("./public");
  app.use(express.static(publicDir));

  
  app.post("/api/clone", async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || !/^https?:\/\/.+/i.test(url)) {
        return res.status(400).json({ message: "Invalid URL. Include http(s)://" });
      }

      const result = await tools.cloneWebsiteToZip(url);
      return res.json({
        message: "Cloned successfully",
        zipFileName: result.zipName,
        downloadPath: `/downloads/${result.zipName}`,
        mode: result.mode,
      });
    } catch (err) {
      console.error("❌ /api/clone error:", err);
      return res.status(500).json({ message: err?.message || "Clone failed" });
    }
  });

  // Health check
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`🌐 Web UI: http://localhost:${PORT}`);
  });
}



  startServer();


export { tools, runAgent };
