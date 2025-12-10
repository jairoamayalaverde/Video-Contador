import { GoogleGenAI, VideoGenerationReferenceType, VideoGenerationReferenceImage } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please select a key.");
  }
  return new GoogleGenAI({ apiKey });
};

export const checkApiKey = async (): Promise<boolean> => {
  // In AI Studio environment
  if (window.aistudio && window.aistudio.hasSelectedApiKey) {
    return await window.aistudio.hasSelectedApiKey();
  }
  // In deployed environment (Vercel, etc.)
  if (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') {
    return true;
  }
  return false;
};
export const openApiKeySelection = async () => {
  if (window.aistudio && window.aistudio.openSelectKey) {
    await window.aistudio.openSelectKey();
  }
};

export const generateVideo = async (
  prompt: string,
  referenceImageBase64: string | null
): Promise<string> => {
  const ai = getClient();
  
  // Configuration for Veo
  // Using veo-3.1-generate-preview for high quality and reference image support.
  const model = 'veo-3.1-generate-preview';
  
  const config: any = {
    numberOfVideos: 1,
    resolution: '720p',
    aspectRatio: '16:9',
  };

  if (referenceImageBase64) {
    // If we have a reference image, we attach it.
    // We strip the data URL prefix if present for the raw bytes
    const base64Data = referenceImageBase64.replace(/^data:image\/\w+;base64,/, "");
    
    const referenceImages: VideoGenerationReferenceImage[] = [
      {
        image: {
          imageBytes: base64Data,
          mimeType: 'image/png', // Assuming PNG or standard image conversion
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

  // Polling loop
  while (!operation.done) {
    // Wait 5 seconds between polls
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

  // The URI requires the API key to be appended for access
  return `${videoUri}&key=${process.env.API_KEY}`;
};
