import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path, { dirname } from "path";
import axios from "axios";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { fileURLToPath } from "url";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

const upload = multer({ dest: uploadsDir });

const ELEVENLABS_API_KEY = "sk_c0efcb35f4bbf779ccb3cbcd00f16090a3bce9e3450304cd"; // Replace with your actual API key
const OPENAI_API_KEY = "sk-1234567890abcdef1234567890abcdef"; // Replace with your actual OpenAI API key

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const voiceMap = {
  Rachel: "21m00Tcm4TlvDq8ikWAM",
  Adam: "pNInz6obpgDQGcFmaJgB",
  Elli: "MF3mGyEYCl7XYWbV9V6O",
  Bella: "EXAVITQu4vr4xnSDxMaL",
  Josh: "TxGEqnHWrfWFTfGW9XjX",
  Arnold: "VR6AewLTigWG4xSOukaG",
};

function sanitizeText(text) {
  return text
    .replace(/\\/g, '\\\\')         
    .replace(/:/g, '\\:')           
    .replace(/'/g, "\\'")           
    .replace(/"/g, '\\"')           
    .replace(/\n/g, '\\\\n');       
}


function splitIntoSentences(text) {
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g);
  return sentences || [text];
}

function getTimedSegments(textSegments, totalDuration) {
  const avgDuration = totalDuration / textSegments.length;
  return textSegments.map((segment, index) => {
    const start = index * avgDuration;
    const end = start + avgDuration;
    return { text: segment.trim(), start, end };
  });
}

function buildDrawTextFilters(timedSegments) {
  // Mac için font yolu:
  const fontPath = "/System/Library/Fonts/Supplemental/Arial.ttf";

  return timedSegments.map((seg) => ({
    filter: "drawtext",
    options: {
      fontfile: fontPath,
      text: sanitizeText(seg.text),
      fontsize: 40,
      fontcolor: "white",
      x: "(w-text_w)/2",
      y: "(h-text_h)/2",
      shadowcolor: "black",
      shadowx: 2,
      shadowy: 2,
      box: 1,
      boxcolor: "black@0.6",
      boxborderw: 20,
      enable: `between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})`,
    },
  }));
}

async function generateRandomMotivation() {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Kısa ve etkileyici bir motivasyon sözü üret." }],
  });

  return response.choices[0].message.content.trim();
}

async function generateAudio(text, voice) {
  const voiceId = voiceMap[voice];
  if (!voiceId) throw new Error("Geçersiz voice");

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );

  const audioFileName = `audio-${Date.now()}.mp3`;
  const audioFilePath = path.join(uploadsDir, audioFileName);
  fs.writeFileSync(audioFilePath, response.data);
  return audioFilePath;
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

function resizeVideoForReels(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        "scale=1080:1920:force_original_aspect_ratio=decrease",
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
      ])
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

function mergeVideoAudioWithText(videoPath, audioPath, outputPath, textSegments, duration) {
  const timedSegments = getTimedSegments(textSegments, duration);
  const filters = buildDrawTextFilters(timedSegments);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .complexFilter(filters)
      .outputOptions("-c:a aac")
      .on("start", (cmd) => console.log("FFmpeg komutu:", cmd))
      .on("end", () => resolve(outputPath))
      .on("error", (err) => {
        console.error("FFmpeg hata:", err.message);
        reject(err);
      })
      .save(outputPath);
  });
}

app.post("/generate-video", upload.single("video"), async (req, res) => {
  try {
    let { text, voice, auto } = req.body;
    const videoFile = req.file;

    if (auto === "true" || !text) {
      text = await generateRandomMotivation();
    }

    const resizedVideoPath = path.join(uploadsDir, `resized-${Date.now()}.mp4`);
    await resizeVideoForReels(videoFile.path, resizedVideoPath);
    fs.unlinkSync(videoFile.path);

    const audioPath = await generateAudio(text, voice);
    const audioDuration = await getAudioDuration(audioPath);
    const textSegments = splitIntoSentences(text);

    const outputFileName = `output-${Date.now()}.mp4`;
    const outputPath = path.join(outputsDir, outputFileName);

    await mergeVideoAudioWithText(resizedVideoPath, audioPath, outputPath, textSegments, audioDuration);

    fs.unlinkSync(resizedVideoPath);
    fs.unlinkSync(audioPath);

    res.json({
      videoUrl: `http://localhost:${PORT}/videos/${outputFileName}`,
      textSegments,
      audioDuration,
      generatedText: text,
    });
  } catch (error) {
    console.error("Video oluşturulurken hata:", error);
    res.status(500).json({ error: "Video oluşturulurken hata oluştu" });
  }
});

app.use("/videos", express.static(outputsDir));

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor.`);
});
