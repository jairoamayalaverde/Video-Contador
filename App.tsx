import React, { useState, useEffect, useRef } from 'react';
import { checkApiKey, openApiKeySelection, generateVideo } from './services/geminiService';
import { Button } from './components/Button';
import { Video, Upload, AlertCircle, Play, Download, Wand2, Image as ImageIcon, Info } from 'lucide-react';

const DEFAULT_PROMPT = `A 3D animated character of a friendly accountant with glasses and black hair, wearing a light blue shirt. He is sitting at a modern desk in a dimly lit room with blue neon accents. In front of him is a transparent holographic tablet. Floating in the air are holographic charts, graphs, and the text "PAQUETE PREMIUM". The character is looking directly at the camera with a welcoming smile and speaking with expressive gestures. The scene is cinematic and high-tech.`;

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [scriptLine, setScriptLine] = useState<string>("Bienvenidos a Contador 4.0");
  const [refImage, setRefImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  
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
    // Re-check after selection attempt (assuming success or user retry)
    const exists = await checkApiKey();
    setHasKey(exists);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefImage(reader.result as string);
      };
      reader.readAsDataURL(file);
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

    try {
      // Combine prompt with the specific action script
      const fullPrompt = `${prompt} The character is saying: "${scriptLine}". He is welcoming the viewer enthusiastically.`;
      
      setStatusMessage("Sending request to Veo...");
      const url = await generateVideo(fullPrompt, refImage);
      
      setVideoUrl(url);
      setStatusMessage("Generation complete!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
        <div className="max-w-md w-full bg-[#1e293b] rounded-2xl p-8 border border-slate-700 shadow-2xl text-center">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Video className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Welcome to Contador 4.0</h1>
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
            <span className="font-bold text-xl tracking-tight text-white">Contador 4.0 <span className="text-blue-400 text-sm font-normal">Veo Studio</span></span>
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
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Spoken Line (Action)</label>
                  <input 
                    type="text"
                    value={scriptLine}
                    onChange={(e) => setScriptLine(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                  <a 
                    href={videoUrl} 
                    download="contador-4.0.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download MP4
                  </a>
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
