import { useState, useEffect, useRef } from "react";

const voices = ["Rachel", "Adam", "Elli", "Bella", "Josh", "Arnold"];

function App() {
  const [text, setText] = useState("");
  const [video, setVideo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [outputUrl, setOutputUrl] = useState(null);
  const [voice, setVoice] = useState(voices[0]);
  const [autoText, setAutoText] = useState(false);
  const [currentSegment, setCurrentSegment] = useState("");
  const [textSegments, setTextSegments] = useState([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [fade, setFade] = useState(false);
  const videoRef = useRef(null);

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    setVideo(file);
    if (file) {
      setPreview(URL.createObjectURL(file));
      setOutputUrl(null); 
      setCurrentSegment("");
      setTextSegments([]);
    }
  };

  const handleSubmit = async () => {
    if (!video || (!autoText && !text.trim())) {
      alert("Lütfen video seçin ve metin girin veya otomatik üretimi açın.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("video", video);
    formData.append("voice", voice);
    formData.append("text", text);
    if (autoText) formData.append("auto", "true");

    try {
      const res = await fetch("http://localhost:3001/generate-video", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("İstek başarısız");

      const data = await res.json();
      setOutputUrl(data.videoUrl);
      setTextSegments(data.textSegments);
      setAudioDuration(data.audioDuration);
      setCurrentSegment("");
      
      if (autoText) {
        setText(data.generatedText); 
      }
    } catch (err) {
      alert("Bir hata oluştu: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  
  useEffect(() => {
    if (!outputUrl || textSegments.length === 0 || !videoRef.current) return;

    const videoElement = videoRef.current;

    const intervalTime = audioDuration / textSegments.length * 1000;
    let index = 0;

    setCurrentSegment(textSegments[0]);

    const interval = setInterval(() => {
      index++;
      if (index >= textSegments.length) {
        clearInterval(interval);
        setCurrentSegment(""); // cümleleri bitince temizle
        return;
      }

      setFade(true); 
      setTimeout(() => {
        setCurrentSegment(textSegments[index]);
        setFade(false); 
      }, 400);
    }, intervalTime);

    
    const onPauseOrEnded = () => {
      clearInterval(interval);
      setCurrentSegment("");
    };
    videoElement.addEventListener("pause", onPauseOrEnded);
    videoElement.addEventListener("ended", onPauseOrEnded);

    return () => {
      clearInterval(interval);
      videoElement.removeEventListener("pause", onPauseOrEnded);
      videoElement.removeEventListener("ended", onPauseOrEnded);
    };
  }, [outputUrl, textSegments, audioDuration]);

  return (
    <div className="min-h-screen bg-white text-gray-900 p-6 max-w-3xl mx-auto flex flex-col items-center">
      <h1 className="text-4xl font-extrabold mb-6 text-purple-700">🎬 MotiveHisset</h1>

      <label className="block mb-4 w-full max-w-md">
        <span>Ses Seçimi:</span>
        <select
          className="w-full p-2 rounded border border-gray-300 mt-1"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
        >
          {voices.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          checked={autoText}
          onChange={() => setAutoText((a) => !a)}
        />
        <span>Otomatik motivasyon sözü üret</span>
      </label>

      {!autoText && (
        <textarea
          rows={4}
          placeholder="Motivasyon sözünü yaz..."
          className="w-full max-w-md p-3 rounded border border-gray-300 resize-none mb-4"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      <label className="block mb-6 w-full max-w-md">
        <span>Video seç:</span>
        <input
          type="file"
          accept="video/*"
          className="w-full mt-1 border border-gray-300 rounded p-2"
          onChange={handleVideoChange}
        />
      </label>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 p-3 rounded w-full max-w-md font-semibold disabled:opacity-50 mb-6"
      >
        {loading ? "Yükleniyor..." : "📢 Ses Oluştur ve Videoyu Hazırla"}
      </button>
      {loading && (
        <div className="text-center text-purple-600 font-semibold">
          Lütfen bekleyin, video işleniyor...
        </div>
      )}

      <div className="flex gap-4 w-full max-w-4xl justify-center items-start">
        {preview && (
          <div className="flex flex-col items-center w-1/2">
            <h2 className="mb-2 font-semibold">Yüklenen Video</h2>
            <video src={preview} controls className="rounded shadow-md max-h-[400px]" />
          </div>
        )}

        {outputUrl && (
          <div className="flex flex-col items-center w-1/2 relative">
  <h2 className="mb-2 font-semibold">Oluşan Video</h2>

  {/* 🟣 Video container */}
  <div className="relative w-full">
    <video
      src={outputUrl}
      controls
      autoPlay
      ref={videoRef}
      className="rounded shadow-md w-full max-h-[400px]"
    />

    {/* 🟢 Overlay metin */}
    <div
      className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white text-lg font-semibold px-4 py-2 rounded transition-opacity duration-500 ${
        fade ? "opacity-0" : "opacity-100"
      }`}
    >
      {currentSegment}
    </div>
  </div>

  {/* İndirme bağlantısı */}
  <video width="360" height="640" controls>
  <source src="http://localhost:3001/videos/output-12345.mp4" type="video/mp4" />
  Tarayıcınız video etiketini desteklemiyor.
</video>

<br />

<a href="http://localhost:3001/videos/output-12345.mp4" download="motivasyon.mp4">
  📥 Videoyu İndir
</a>

</div>

       
        )}
      </div>
    </div>
  );
}

export default App;
