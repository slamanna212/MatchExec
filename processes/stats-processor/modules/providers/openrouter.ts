export async function callOpenRouterVisionAPI(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      signal,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}
