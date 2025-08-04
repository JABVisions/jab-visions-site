export async function POST(request: Request) {
  // Parse the JSON body sent from the client form
  const data = await request.json();

  // Forward the payload to your Google Apps Script Web App
  const scriptUrl = 'https://script.google.com/macros/s/AKfycbyL8fjfH4T9Tcrcd7p2o9rrB9u4E2-O4EXynDgjdcmatNDtsfUOek-HAacNdqLrPBvxFg/exec';
  await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  // Return a simple success response to the client
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
