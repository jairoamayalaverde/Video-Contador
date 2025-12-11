import { GoogleGenAI, VideoGenerationReferenceType, VideoGenerationReferenceImage } from "@google/genai";

// Definimos los formatos válidos
export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

const getClient = () => {
  const apiKey = process.env.API_KEY;
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
  
  if (process.env.API_KEY && 
      process.env.API_KEY !== 'undefined' && 
      process.env.API_KEY !== 'PLACEHOLDER_API_KEY') {
    console.log('✅ API Key found in environment');
    return true;
  }
  
  return false;
};

export const openApiKeySelection = async () => {
  if (window.aistudio && window.aistudio.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    console.warn('API key selection is only available in AI Studio environment.');
  }
};

export const generateVideo = async (
  prompt: string,
  referenceImageBase64: string | null,
  aspectRatioSelection: VideoAspectRatio = '16:9' // Recibimos la selección del usuario
): Promise<string> => {
  const ai = getClient();
  // Modelo actual en preview pública
  const model = 'veo-3.1-generate-preview';
  
  // --- PLAN B: INYECCIÓN DE PROMPT ---
  // Como la API falla si enviamos aspectRatios distintos a 16:9 en este modelo,
  // usamos la selección para modificar el prompt y asegurar una composición "crop-safe".
  
  let promptSuffix = "";
  switch (aspectRatioSelection) {
    case '9:16':
    case '3:4':
      // Para formatos verticales, forzamos una composición centrada y alejada de los bordes laterales.
      promptSuffix = ". CINEMATOGRAPHY NOTE: Wide shot with perfectly central framing. Ensure the main character and all action are contained entirely within the middle third of the frame, leaving ample space on the sides, safe for vertical cropping.";
      break;
    case '1:1':
    case '4:3':
      // Para formatos cuadrados/clásicos, aseguramos el foco central.
      promptSuffix = ". CINEMATOGRAPHY NOTE: Central composition ensuring the subject is perfectly framed for a square or 4:3 crop.";
      break;
    case '16:9':
    default:
      // No se necesita instrucción especial para el formato nativo.
      promptSuffix = "";
      break;
  }

  // Combinamos el prompt original del usuario con nuestras instrucciones técnicas
  const finalPrompt = prompt + promptSuffix;

  console.log(`🎬 Generating with fake aspect ratio strategy. Selected: ${aspectRatioSelection}. Actual config sent: 16:9`);
  console.log(`📝 Final modified prompt: ${finalPrompt}`);

  const config: any = {
    numberOfVideos: 1,
    resolution: '720p',
    // ¡IMPORTANTE! Hardcodeamos 16:9 aquí para evitar el error 400 de Google
    aspectRatio: '16:9', 
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

  // Usamos finalPrompt en lugar de prompt
  let operation = await ai.models.generateVideos({
    model,
    prompt: finalPrompt, 
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

  // Añadimos la key a la URL para que el frontend pueda reproducirla si es necesario en este entorno
  return `${videoUri}&key=${process.env.API_KEY}`;
};
