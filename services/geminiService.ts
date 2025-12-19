
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeCharacterFeatures = async (base64Images: string[]): Promise<string> => {
  const ai = getAIClient();
  const imageParts = base64Images.map(img => {
    const parts = img.split(',');
    const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    return { inlineData: { data: parts[1], mimeType } };
  });

  const prompt = `分析图中人物的面部。提取骨相（颧骨、下颌角）、比例（眼距、鼻型）、辨识度特征（痣、发际线）。字数100内，只输出客观描述，禁止形容词。如果是两人，请区分人物A/B。`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...imageParts, { text: prompt }] },
    });
    return response.text || "";
  } catch (error) {
    console.error("分析失败:", error);
    return "";
  }
};

export const generateMovieSetSelfie = async (
  base64Images: string[],
  scenario: { movieTitle: string; description: string; actor: string },
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "1:1",
  characterDetail: string = "",
  modelType: 'standard' | 'pro' = 'standard'
): Promise<string> => {
  const ai = getAIClient();
  const targetModel = modelType === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const prompt = `
    ${SYSTEM_INSTRUCTION}
    
    【系列风格一致性指令】：
    这属于一个名为“探班瞬间”的影展系列。请确保本图的对比度、饱和度、以及色彩平衡与该系列保持同步。使用电影调色师级别的色彩处理。
    
    【具体生成要求】：
    1. 人物克隆：严格按照：${characterDetail} 生成。
    2. 剧组还原：电影《${scenario.movieTitle}》现场，${scenario.description}。
    3. 合影对象：${scenario.actor}。
    4. 画面逻辑：手机自拍感，带有一点手机镜头的广角和锐化特征，但色调必须是电影级的。
  `;

  const imageParts = base64Images.map(img => {
    const parts = img.split(',');
    const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    return { inlineData: { data: parts[1], mimeType } };
  });

  try {
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio,
          ...(modelType === 'pro' ? { imageSize: "1K" } : {})
        },
        ...(modelType === 'pro' ? { tools: [{ googleSearch: {} }] } : {})
      },
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("EMPTY_RESPONSE");
  } catch (error: any) {
    console.error("生成失败:", error);
    if (error.message?.includes("Requested entity was not found") || error.message?.includes("PERMISSION_DENIED")) {
      throw new Error("AUTH_REQUIRED");
    }
    throw error;
  }
};
