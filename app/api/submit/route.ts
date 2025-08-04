// File: app/api/submit/route.ts

export async function POST(request: Request) {
  // Parse the JSON body from your client form
  const data = await request.json();

  // Log payload (local server console)
  console.log('API Route received payload →', data);

  // Forward payload to the new Google Apps Script Web App URL
  const scriptUrl = 'https://script.google.com/macros/s/AKfycbwgYHE16n0UlD4yltfVmvl1vt8OzQRNrCicKY4ztiVNXZqZZ7wKy1eBR5CtSHdAuha_CQ/exec';
  await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  // Echo back what we received for confirmation
  return new Response(JSON.stringify({ success: true, received: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}