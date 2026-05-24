Deno.serve(async (req) => {
  const key = Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '';
  return Response.json({ publishableKey: key });
});