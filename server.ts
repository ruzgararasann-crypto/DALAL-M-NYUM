import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

// Ensure Gemini client utility is instantiated server-side with User-Agent telemetry
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Endpoint for AI error/issue resolution assistant
  app.post("/api/assistant/explain-error", async (req, res) => {
    try {
      const { errorMessage, section, action, userInfo } = req.body;

      if (!errorMessage) {
        return res.status(400).json({ error: "No error message provided." });
      }

      if (!apiKey) {
        // Fallback response if API Key is not set yet
        return res.json({
          title: "Sistem Doğrulama Bildirimi",
          explanation: `Sistem dâhilinde bir işlem yürütülürken hata alındı: "${errorMessage}".`,
          steps: [
            "İşlemi yaptığınız bilgileri (şifre, boş alanlar vb.) kontrol edip tekrar deneyin.",
            "Eğer sorun devam ederse yöneticinizle irtibata geçin."
          ]
        });
      }

      const prompt = `
Bir kullanıcı "Dal Alüminyum Aksesuar Sistemi" üzerinde işlem yaparken bir hatayla karşılaştı. 
Lütfen bu hatayı analiz et ve kullanıcıya ne anlama geldiğini ve çözmek için ne yapması gerektiğini açıkla.

Hata Mesajı: "${errorMessage}"
İşlem Yapılan Bölüm: "${section || 'Bilinmiyor'}"
Kullanıcı Eylemi: "${action || 'Bilinmiyor'}"
Kullanıcı Rolü ve Bilgisi: ${JSON.stringify(userInfo || {})}

Senin Rolün:
Dal Alüminyum Aksesuar Muhasebe ve Cari Takip Sistemi'nin akıllı "Yapay Zeka Bildirim Asistanı"sın. 
Kullanıcıyı rahatlatıcı, son derece güler yüzlü, çözüm odaklı ve net bir Türkçe ile bilgilendirmelisin. 
Yazılım jargonundan uzak dur, sade ve anlaşılır bir dil kullan.

Lütfen yanıtı şu JSON şemasına uygun olarak üret:
{
  "title": "Kısa ve açıklayıcı bir başlık (Örn: 'Şifreniz Hatalı Girildi' veya 'Eksik Alan Hatası')",
  "explanation": "Hatanın ne anlama geldiğine dair sade Türkçe açıklama.",
  "steps": [
    "Sorunu çözmek için atılması gereken somut 1. adım.",
    "Atılması gereken somut 2. adım."
  ]
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "A short descriptive title in Turkish" },
              explanation: { type: Type.STRING, description: "Explanation of what went wrong in friendly Turkish" },
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Actionable step-by-step instructions for the user to resolve the issue in Turkish"
              }
            },
            required: ["title", "explanation", "steps"]
          }
        }
      });

      const responseText = response.text;
      if (responseText) {
        const result = JSON.parse(responseText.trim());
        return res.json(result);
      } else {
        throw new Error("Empty response from AI model.");
      }
    } catch (err: any) {
      console.error("AI Assistant Error:", err);
      // Fallback response in case of API failure
      res.json({
        title: "İşlem Bildirimi",
        explanation: `İstediğiniz işlem yapılamadı. Alınan hata: ${req.body.errorMessage}`,
        steps: [
          "Girdiğiniz verilerin doğruluğunu tahlil edin.",
          "Bağlantınızı kontrol ederek işlemi birkaç saniye sonra tekrarlayın."
        ]
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
