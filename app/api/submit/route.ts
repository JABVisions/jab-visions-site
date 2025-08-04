// File: app/api/submit/route.ts

export async function POST(request: Request) {
  // Parse the JSON body sent from the client form
  const data = await request.json();

  // Log the received payload to server console (locally visible)
  console.log('API Route received payload:', data);

  // Forward the payload to your Google Apps Script Web App
  const scriptUrl = 'https://script.google.com/macros/s/AKfycbyL8fjfH4T9Tcrcd7p2o9rrB9u4E2-O4EXynDgjdcmatNDtsfUOek-HAacNdqLrPBvxFg/exec';
  await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  // Respond with the same payload for verification
  return new Response(JSON.stringify({ success: true, received: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}