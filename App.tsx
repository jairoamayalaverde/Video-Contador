import React, { useState, useEffect, useRef } from 'react';
// 1. IMPORTAMOS EL TIPO NUEVO VideoAspectRatio
import { checkApiKey, openApiKeySelection, generateVideo, VideoAspectRatio } from './services/geminiService';
import { Button } from './components/Button';
// 2. AÑADIMOS ICONOS NUEVOS (Smartphone, Monitor, Square, Tv)
import { Video, Upload, AlertCircle, Play, Download, Wand2, Image as ImageIcon, Info, Smartphone, Monitor, Square, Tv } from 'lucide-react';

const DEFAULT_PROMPT = "";

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [scriptLine, setScriptLine] = useState<string>("Bienvenidos a TalkSync Studio");
  const [tone, setTone] = useState<string>("confident and professional");
  // Si el frame de referencia NO tiene un personaje visible (ej. solo un
  // screenshot de producto/UI), el Spoken Line debe ir como voz en off,
  // no como diálogo de "el personaje está diciendo" — eso confundía al
  // modelo cuando no había nadie en la imagen a quien atribuirle la voz.
  const [hasCharacter, setHasCharacter] = useState<boolean>(true);
  const [refImage, setRefImage] = useState<string | null>(null);
  // Dimensiones reales (px) de la imagen de referencia subida, para poder
  // avisar si es muy chica o si no es 16:9 antes de gastar una generación.
  const [refImageDims, setRefImageDims] = useState<{ width: number; height: number } | null>(null);

  // 3. ESTADO PARA EL FORMATO DE VIDEO (Default: 16:9)
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // --- Chequeo de fidelidad de texto (OCR) ---
  // Compara el texto real detectado en el frame de referencia contra el
  // texto detectado en un frame del video ya generado, para no tener que
  // revisar a ojo si el modelo corrompió el texto de la UI.
  const [checkingFidelity, setCheckingFidelity] = useState<boolean>(false);
  const [fidelityResult, setFidelityResult] = useState<{ expectedText: string; generatedText: string; similarity: number } | null>(null);
  const [fidelityError, setFidelityError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const verifyKey = async () => {
      const exists = await checkApiKey();
      setHasKey(exists);
    };
    verifyKey();
  }, []);

  const handleKeySelection = async () => {
    await openApiKeySelection();
    const exists = await checkApiKey();
    setHasKey(exists);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setRefImage(dataUrl);

        // Medimos el tamaño real en píxeles cargando la imagen en memoria.
        const img = new window.Image();
        img.onload = () => {
          setRefImageDims({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  // Referencia recomendada: 16:9 (igual que el output real de Veo) y al
  // menos 1280x720 para no forzar un upscale que arruine el texto chico.
  const MIN_REF_WIDTH = 1280;
  const MIN_REF_HEIGHT = 720;
  const refAspectRatio = refImageDims ? refImageDims.width / refImageDims.height : null;
  const isLowRes = refImageDims ? (refImageDims.width < MIN_REF_WIDTH || refImageDims.height < MIN_REF_HEIGHT) : false;
  const isOffAspect = refAspectRatio !== null ? Math.abs(refAspectRatio - (16 / 9)) > 0.05 : false;

  // Normaliza texto (minúsculas, sin tildes, sin símbolos) para comparar
  // de forma tolerante a diferencias menores de OCR.
  const normalizeText = (t: string): string =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const levenshtein = (a: string, b: string): number => {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  };

  const textSimilarity = (a: string, b: string): number => {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (!na && !nb) return 100;
    const dist = levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length, 1);
    return Math.max(0, Math.round((1 - dist / maxLen) * 100));
  };

  // Extrae un frame del video generado como imagen (dataURL), en un punto
  // cercano al final pero no el último (que puede salir borroso por el
  // efecto de zoom de cierre, ver notas del guion).
  const extractFrameFromVideo = (url: string, atFraction: number = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.src = url;

      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.max(0, video.duration * atFraction);
      });

      video.addEventListener('seeked', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo crear el contexto de canvas.'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          reject(new Error('El navegador bloqueó la lectura del frame por CORS (canvas "tainted"). El servidor de Veo no está devolviendo headers CORS que permitan leer el video en el navegador.'));
        }
      });

      video.addEventListener('error', () => reject(new Error('No se pudo cargar el video para extraer el frame.')));
    });
  };

  // Cargamos tesseract.js directo desde un CDN en tiempo de ejecución
  // (sin necesidad de npm install / consola) usando import dinámico de URL,
  // algo que los navegadores modernos soportan de forma nativa.
  const runOCR = async (imageDataUrl: string): Promise<string> => {
    // @ts-ignore - import de URL remota, TypeScript no lo tipa pero funciona en runtime
    const Tesseract = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm');
    const { data } = await Tesseract.recognize(imageDataUrl, 'spa');
    return data.text;
  };

  const handleCheckFidelity = async () => {
    if (!videoUrl || !refImage) return;
    setCheckingFidelity(true);
    setFidelityError(null);
    setFidelityResult(null);
    try {
      const [expectedText, frameDataUrl] = await Promise.all([
        runOCR(refImage),
        extractFrameFromVideo(videoUrl, 0.85),
      ]);
      const generatedText = await runOCR(frameDataUrl);
      const similarity = textSimilarity(expectedText, generatedText);
      setFidelityResult({ expectedText, generatedText, similarity });
    } catch (err: any) {
      setFidelityError(err.message || 'No se pudo verificar la fidelidad del texto.');
    } finally {
      setCheckingFidelity(false);
    }
  };

  const handleGenerate = async () => {
    if (!hasKey) {
      await handleKeySelection();
      return;
    }

    setLoading(true);
    setError(null);
    setVideoUrl(null);
    setStatusMessage("Initializing generation...");
    setFidelityResult(null);
    setFidelityError(null);

    try {
      const dialogueClause = hasCharacter
        ? `The character is saying: "${scriptLine}". The tone is ${tone}.`
        : `Voice-over narration (no on-screen speaker, the scene has no character): "${scriptLine}". The tone is ${tone}.`;
      const fullPrompt = `${prompt} ${dialogueClause}`;
      
      setStatusMessage(`Sending request to Veo (${aspectRatio})...`);
      
      // 4. PASAMOS EL ASPECT RATIO A LA FUNCIÓN
      const url = await generateVideo(fullPrompt, refImage, aspectRatio);
      
      setVideoUrl(url);
      setStatusMessage("Generation complete!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Helper para los botones de formato
  const AspectRatioButton = ({ ratio, icon: Icon, label }: { ratio: VideoAspectRatio, icon: any, label: string }) => (
    <button
      onClick={() => setAspectRatio(ratio)}
      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
        aspectRatio === ratio 
          ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
          : 'bg-[#0f172a] border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-[#1e293b]'
      }`}
    >
      <Icon className="w-5 h-5 mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  if (!hasKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
        <div className="max-w-md w-full bg-[#1e293b] rounded-2xl p-8 border border-slate-700 shadow-2xl text-center">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Video className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Welcome to TalkSync Studio</h1>
          <p className="text-slate-400 mb-8">
            To generate high-quality videos with Veo, you need to select a billing-enabled Google Cloud API Key.
          </p>
          <Button onClick={handleKeySelection} className="w-full justify-center">
            Connect API Key
          </Button>
          <p className="mt-4 text-xs text-slate-500">
            Learn more about billing at <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">ai.google.dev</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">TalkSync <span className="text-blue-400 text-sm font-normal">Studio</span></span>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={handleKeySelection} className="text-xs text-slate-500 hover:text-slate-300">
              Change API Key
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Reference Image Section */}
            <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-blue-400" />
                  Reference Style
                </h2>
                <div className="group relative">
                  <Info className="w-4 h-4 text-slate-500 cursor-help" />
                  <div className="absolute right-0 w-64 p-2 bg-slate-800 text-xs text-slate-300 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-slate-700">
                    Upload a screenshot from your original video to maintain character consistency.
                  </div>
                </div>
              </div>

              <div 
                className={`relative border-2 border-dashed rounded-lg p-8 transition-colors text-center ${refImage ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                
                {refImage ? (
                  <div className="relative">
                    <img src={refImage} alt="Reference" className="max-h-48 mx-auto rounded shadow-lg object-contain" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/50 transition-opacity rounded">
                      <p className="text-white text-sm font-medium">Click to change</p>
                    </div>
                    {refImageDims && (
                      <div className="mt-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <span className={isLowRes || isOffAspect ? 'text-amber-400' : 'text-emerald-400'}>
                          {refImageDims.width}×{refImageDims.height}px
                          {refAspectRatio !== null && ` · ${refAspectRatio.toFixed(2)}:1`}
                        </span>
                        {isOffAspect && (
                          <p className="text-amber-400 mt-1">
                            ⚠️ No es 16:9 — Veo genera en 16:9 real, así que esta imagen se va a recortar/estirar.
                          </p>
                        )}
                        {isLowRes && (
                          <p className="text-amber-400 mt-1">
                            ⚠️ Menor a 1280×720 — el modelo tendrá que hacer upscale, lo que puede afectar la nitidez del texto.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="cursor-pointer space-y-3">
                    <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Upload Reference Frame</p>
                      <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Prompt & Script Section */}
            <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-purple-400" />
                Scene & Script
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Character & Scene Description</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    placeholder='Describe la escena, o si estás animando una imagen de referencia, escribe algo como: "No cambiar ni alterar los textos del frame, tampoco adicionar ningún elemento, gráfico o texto que no haga parte del frame."'
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                <div className="flex items-center justify-between bg-[#0f172a] border border-slate-700 rounded-lg p-3">
                  <label htmlFor="hasCharacter" className="text-sm font-medium text-slate-400 cursor-pointer">
                    ¿El frame tiene un personaje visible?
                  </label>
                  <input
                    id="hasCharacter"
                    type="checkbox"
                    checked={hasCharacter}
                    onChange={(e) => setHasCharacter(e.target.checked)}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Spoken Line {hasCharacter ? '(Action)' : '(Voz en off)'}
                  </label>
                  <input 
                    type="text"
                    value={scriptLine}
                    onChange={(e) => setScriptLine(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {!hasCharacter && (
                    <p className="text-xs text-slate-500 mt-1">
                      Sin personaje en el frame: esta línea se generará como narración en off, no como diálogo hablado.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Tone / Mood</label>
                  <input 
                    type="text"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="ej: confident and professional, serious and focused, calm..."
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 5. SECCIÓN NUEVA: VIDEO FORMAT */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Video Format</label>
                  <div className="grid grid-cols-4 gap-2">
                    <AspectRatioButton ratio="16:9" icon={Monitor} label="16:9" />
                    <AspectRatioButton ratio="9:16" icon={Smartphone} label="9:16" />
                    <AspectRatioButton ratio="1:1" icon={Square} label="1:1" />
                    <AspectRatioButton ratio="4:3" icon={Tv} label="4:3" />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <Button 
                  onClick={handleGenerate} 
                  isLoading={loading} 
                  disabled={!refImage && !prompt}
                  className="w-full justify-center text-lg h-12"
                >
                  <Wand2 className="w-5 h-5" />
                  Generate Video
                </Button>
                {statusMessage && loading && (
                   <p className="text-center text-xs text-slate-500 mt-3 animate-pulse">{statusMessage}</p>
                )}
              </div>
            </div>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* Right Column: Preview */}
          <div className="lg:col-span-7">
            <div className="bg-[#1e293b] rounded-xl border border-slate-700 shadow-xl overflow-hidden h-full flex flex-col min-h-[500px]">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-[#0f172a]/50">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-green-400" />
                  Preview
                </h2>
                {videoUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCheckFidelity}
                      disabled={checkingFidelity}
                      className="flex items-center gap-2 text-xs font-medium bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                    >
                      {checkingFidelity ? 'Verificando texto...' : 'Verificar texto (OCR)'}
                    </button>
                    <a 
                      href={videoUrl} 
                      download="talksync-studio.mp4"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download MP4
                    </a>
                  </div>
                )}
              </div>
              
              <div className="flex-1 flex items-center justify-center p-8 bg-[#020617] relative">
                {videoUrl ? (
                  <video 
                    src={videoUrl} 
                    controls 
                    autoPlay 
                    loop 
                    className="w-full h-full object-contain rounded-lg shadow-2xl ring-1 ring-slate-800"
                  />
                ) : loading ? (
                   <div className="text-center space-y-6 max-w-sm">
                      <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                      </div>
                      <div>
                        <h3 className="text-xl font-medium text-white mb-2">Creating your video</h3>
                        <p className="text-slate-400 text-sm">
                          Google Veo is processing your request. This typically takes 1-2 minutes. Please don't close this tab.
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded p-3 text-xs text-slate-500 font-mono">
                          Status: {statusMessage}
                      </div>
                   </div>
                ) : (
                  <div className="text-center space-y-4 opacity-50">
                    <div className="w-20 h-20 bg-slate-800 rounded-2xl rotate-3 mx-auto flex items-center justify-center ring-4 ring-slate-700/50">
                      <Play className="w-8 h-8 text-slate-500 ml-1" />
                    </div>
                    <p className="text-slate-400 font-medium">Your generated video will appear here</p>
                  </div>
                )}
              </div>

              {(fidelityResult || fidelityError) && (
                <div className="border-t border-slate-700 p-4 bg-[#0f172a]/50">
                  {fidelityError && (
                    <div className="flex items-start gap-2 text-xs text-amber-300">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>{fidelityError}</p>
                    </div>
                  )}
                  {fidelityResult && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">Fidelidad de texto (OCR)</span>
                        <span className={`text-sm font-bold ${
                          fidelityResult.similarity >= 85 ? 'text-emerald-400' :
                          fidelityResult.similarity >= 60 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {fidelityResult.similarity}%
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-slate-500 mb-1">Texto esperado (frame de referencia):</p>
                          <p className="text-slate-300 bg-[#0f172a] border border-slate-700 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                            {fidelityResult.expectedText || '(sin texto detectado)'}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1">Texto detectado (video generado):</p>
                          <p className="text-slate-300 bg-[#0f172a] border border-slate-700 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                            {fidelityResult.generatedText || '(sin texto detectado)'}
                          </p>
                        </div>
                      </div>
                      {fidelityResult.similarity < 85 && (
                        <p className="text-xs text-amber-400 mt-2">
                          ⚠️ Similitud baja — revisá el video manualmente, es probable que el texto haya salido corrompido.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
