const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GOOGLE_GEMINI_API_KEY;

// Claude generates image prompts
async function generateImagePrompts(text) {
  const systemPrompt = `You are CANVAIZ 2 - image prompt specialist for visual content transformation.

Analyze the input text and generate SPECIFIC, detailed image prompts optimized for Gemini image generation.

For TRAVEL content:
- Hero: Wide establishing shot of main location
- Insights (3): Three key visual moments/themes
- Journey (4): Sequential locations/transitions

For MEDICAL content:
- Hero: Medical visualization establishing shot
- Insights (3): Problem/Solution/Outcome visuals
- Journey (4): Timeline progression

For BUSINESS content:
- Hero: Growth/strategy visualization
- Insights (3): Risks/Opportunities/Action visuals
- Journey (4): Strategic progression

CRITICAL: Each prompt must be SPECIFIC to actual locations, concepts, or outcomes. NOT generic.

Return ONLY valid JSON, no markdown:
{
  "domain": "travel|medical|business|research|brain_dump",
  "hero": "detailed specific prompt",
  "insights": ["specific prompt 1", "specific prompt 2", "specific prompt 3"],
  "journey": ["specific prompt 1", "specific prompt 2", "specific prompt 3", "specific prompt 4"]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Generate image prompts for this content:\n\n${text}`
      }]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  
  const rawText = data.content[0].text;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid Claude response');
  
  return JSON.parse(jsonMatch[0]);
}

// Gemini generates images
async function generateImage(prompt) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a high-quality, detailed image for this description: ${prompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();
    if (data.error) {
      console.error('Gemini error:', data.error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Image generation error:', err.message);
    return null;
  }
}

// API: Generate prompts only (fast test)
app.post('/api/generate-prompts', async (req, res) => {
  const { text } = req.body;
  
  if (!text) return res.status(400).json({ error: 'No text provided' });
  if (!ANTHROPIC_KEY) return res.json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    const prompts = await generateImagePrompts(text);
    res.json({ success: true, prompts });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// API: Generate prompts + images (full test)
app.post('/api/transform', async (req, res) => {
  const { text } = req.body;
  
  if (!text) return res.status(400).json({ error: 'No text provided' });
  if (!ANTHROPIC_KEY) return res.json({ error: 'ANTHROPIC_API_KEY not set' });
  if (!GEMINI_KEY) return res.json({ error: 'GOOGLE_GEMINI_API_KEY not set' });

  try {
    console.log('Generating prompts...');
    const prompts = await generateImagePrompts(text);

    console.log('Generating images...');
    const heroImage = await generateImage(prompts.hero);
    
    const insightImages = await Promise.all(
      prompts.insights.map(p => generateImage(p))
    );
    
    const journeyImages = await Promise.all(
      prompts.journey.map(p => generateImage(p))
    );

    res.json({
      success: true,
      prompts,
      images: {
        hero: heroImage ? 'generated' : 'failed',
        insights: insightImages.map(i => i ? 'generated' : 'failed'),
        journey: journeyImages.map(i => i ? 'generated' : 'failed')
      }
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CANVAIZ 2 running on port ${PORT}`);
  console.log(`Anthropic API: ${ANTHROPIC_KEY ? '✓' : '✗'}`);
  console.log(`Gemini API: ${GEMINI_KEY ? '✓' : '✗'}`);
});
