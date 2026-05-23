import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { key } = body;

    if (!key || typeof key !== 'string') {
      return Response.json({ error: 'Missing or invalid parameter: key' }, { status: 400 });
    }

    const records = await base44.entities.PolicyConfig.filter({ key: key }, '-created_date', 1);

    if (!records || records.length === 0) {
      return Response.json({ data: null });
    }

    return Response.json({ data: records[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});