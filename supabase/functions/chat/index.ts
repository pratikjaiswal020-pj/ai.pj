import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight requests from the browser
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, is_title_generation, custom_system_prompt, model, image } = await req.json()
    const selectedModel = model || 'gemini-2.0-flash'
    const isOpenAI = selectedModel.startsWith('gpt')

    // 1. Get API Keys
    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    // @ts-ignore
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    // @ts-ignore
    const IMAGGA_API_KEY = Deno.env.get('IMAGGA_API_KEY')
    // @ts-ignore
    const IMAGGA_API_SECRET = Deno.env.get('IMAGGA_API_SECRET')

    if (!GEMINI_API_KEY && !isOpenAI) throw new Error('Missing GEMINI_API_KEY')
    if (!OPENAI_API_KEY && isOpenAI) throw new Error('Missing OPENAI_API_KEY')

    // 2. Multimodal Support (Vision)
    // We treat the image as part of the latest message
    let processedMessages = [...messages]
    if (image) {
      const mimeType = image.split(';base64,')[0].split(':')[1] || 'image/jpeg'
      const base64Data = image.split(',')[1]

      // Find the last user message and add the image to it
      for (let i = processedMessages.length - 1; i >= 0; i--) {
        if (processedMessages[i].role === 'user') {
          // Add vision data to Gemini format (parts array)
          processedMessages[i].parts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          })
          break
        }
      }
    }

    // 3. Define System Prompt (DEEP INSIGHT AI)
    let systemPrompt = custom_system_prompt || `You are IntelliChat, a highly advanced, analytical, and insightful AI companion. You go beyond simple assistant tasks to provide deep analysis, diverse perspectives, and conversational depth.

## CORE IDENTITY
- You are knowledgeable about world events, history, politics, and culture.
- You provide objective, factual, yet engaging analysis.
- Your tone is sophisticated, balanced, and articulate.

## ANALYTICAL GUIDELINES
- When asked about public figures (e.g., world leaders like Donald Trump, Narendra Modi, etc.), provide a multi-faceted assessment.
- Discuss their policies, public perception, historical context, and impact.
- Avoid simple bias; instead, present a balanced view that includes both common praises and common criticisms.
- Engaging in deep, thoughtful discussion is your primary objective.

## VISION CAPABILITIES
- You have NATIVE vision support. You can see, analyze, and recognize images directly.
- When an image is provided, examine it with high precision.
- You CAN recognize well-known public figures in images.
- If an image is provided, never claim you cannot see it.

## CONVERSATIONAL STYLE
- Use expressive, professional, and clear language.
- Provide comprehensive answers that cover multiple angles of a topic.
- Encourage further inquiry by ending your responses with a thought-provoking question related to the discussion.`
    
    // Override System Prompt if simply requesting a title summary
    if (is_title_generation) {
        systemPrompt = "You are a helpful assistant. Reply ONLY with a 3 to 4 word summary title for the user's issue. Do not include quotes, markdown, or any conversational text. Keep it extremely brief."
    }
    
    let generatedText = ""

    if (isOpenAI) {
        // --- OpenAI Implementation (with Vision support) ---
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...processedMessages.map((m: any) => {
                      const role = m.role === "model" ? "assistant" : "user"
                      
                      // Convert Gemini-style parts to OpenAI-style content
                      let content: any = []
                      for (const part of m.parts) {
                        if (part.text) {
                          content.push({ type: "text", text: part.text })
                        }
                        if (part.inline_data) {
                          content.push({ 
                            type: "image_url", 
                            image_url: { url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}` } 
                          })
                        }
                      }
                      
                      // If only one text part, simplify to string for compatibility
                      if (content.length === 1 && content[0].type === "text") {
                        content = content[0].text
                      }

                      return { role, content }
                    })
                ]
            })
        })
        const data = await response.json()
        if (data.error) throw new Error(data.error.message)
        generatedText = data.choices[0].message.content
    } else {
        // --- Gemini Implementation ---
        const payload = {
            system_instruction: { parts: { text: systemPrompt } },
            contents: processedMessages 
        }
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const data = await response.json()
        if (data.error) {
            console.error("Gemini API Error:", data.error)
            throw new Error(data.error.message || "Gemini API error")
        }
        generatedText = data.candidates[0].content.parts[0].text
    }

    return new Response(JSON.stringify({ response: generatedText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
