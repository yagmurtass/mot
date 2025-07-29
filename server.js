const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ELEVENLABS_API_KEY = 'sk_c0efcb35f4bbf779ccb3cbcd00f16090a3bce9e3450304cd';

app.post('/generate', upload.single('video'), async (req, res) => {
  const { text } = req.body;
  const videoPath = req.file.path;
  const voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Default ses ID

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    const buffer = await response.buffer();
    fs.writeFileSync('output.mp3', buffer);

    ffmpeg()
      .input(videoPath)
      .input('output.mp3')
      .videoFilters(`drawtext=text='${text}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-100`)
      .outputOptions('-shortest')
      .save('output/output.mp4')
      .on('end', () => {
        res.download('output/output.mp4');
      });
  } catch (err) {
    console.error(err);
    res.status(500).send('Bir hata oluştu.');
  }
});

app.listen(3000, () => console.log('✅ Sunucu 3000 portunda çalışıyor.'));