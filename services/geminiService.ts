import { GoogleGenAI, VideoGenerationReferenceType, VideoGenerationReferenceImage } from "@google/genai";

// 1. DEFINIMOS LOS FORMATOS VÁLIDOS (Para evitar errores de escritura)
export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

const getClient = () => {
  const apiKey = process.env.API_KEY; // Nota: En Vite a veces es import.meta.env.VITE_GEMINI_API_KEY, pero respeto tu configuración actual.
  console.log('🔑 getClient - API_KEY:', apiKey ? 'EXISTS (length: ' + apiKey.length + ')' : 'UNDEFINED');
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY' || apiKey === 'undefined') {
    throw new Error("API Key not found. Please configure VITE_GEMINI_API_KEY in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

export const checkApiKey = async (): Promise<boolean> => {
  console.log('🔍 checkApiKey called');
  
  if (window.aistudio && window.aistudio.hasSelectedApiKey) {
    console.log('✅ AI Studio environment detected');
    return await window.aistudio.hasSelectedApiKey();
  }
  
  console.log('🌐 Checking deployed environment');
  console.log('📊 process.env.API_KEY:', process.env.API_KEY);
  console.log('📊 Type:', typeof process.env.API_KEY);
  console.log('📊 Value exists:', !!process.env.API_KEY);
  
  if (process.env.API_KEY && 
      process.env.API_KEY !== 'undefined' && 
      process.env.API_KEY !== 'PLACEHOLDER_API_KEY') {
    console.log('✅ API Key found in environment');
    return true;
  }
  
  console.log('❌ API Key NOT found');
  return false;
};

export const openApiKeySelection = async () => {
  if (window.aistudio && window.aistudio.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    console.warn('API key selection is only available in AI Studio environment. Please configure VITE_GEMINI_API_KEY in environment variables.');
  }
};

// 2. ACTUALIZAMOS LA FUNCIÓN PARA ACEPTAR EL FORMATO
export const generateVideo = async (
  prompt: string,
  referenceImageBase64: string | null,
  aspectRatio: VideoAspectRatio = '16:9' // Valor por defecto si no se envía nada
): Promise<string> => {
  const ai = getClient();
  
  // Configuration for Veo
  const model = 'veo-3.1-generate-preview';
  
  const config: any = {
    numberOfVideos: 1,
    resolution: '720p',
    aspectRatio: aspectRatio, // 3. AQUÍ USAMOS LA VARIABLE DINÁMICA
  };

  if (referenceImageBase64) {
    const base64Data = referenceImageBase64.replace(/^data:image\/\w+;base64,/, "");
    
    const referenceImages: VideoGenerationReferenceImage[] = [
      {
        image: {
          imageBytes: base64Data,
          mimeType: 'image/png',
        },
        referenceType: VideoGenerationReferenceType.ASSET, 
      }
    ];
    config.referenceImages = referenceImages;
  }

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    config,
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  if (operation.error) {
    throw new Error(operation.error.message || "Video generation failed");
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) {
    throw new Error("No video URI returned");
  }

  return `${videoUri}&key=${process.env.API_KEY}`;
};
