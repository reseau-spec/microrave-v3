// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(data, status = 200) {
  return Response.json(data, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authentification optionnelle (public endpoint)
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      // Public access OK
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    const domainKey = searchParams.get('domainKey') || null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    // Bbox format: lngMin,latMin,lngMax,latMax
    const bboxParam = searchParams.get('bbox');
    let bbox = null;
    if (bboxParam) {
      const coords = bboxParam.split(',').map(c => parseFloat(c));
      if (coords.length === 4) {
        bbox = {
          lngMin: coords[0],
          latMin: coords[1],
          lngMax: coords[2],
          latMax: coords[3]
        };
      }
    }

    // Construire le filtre
    const filter = { active: true };

    // Filtrer par domaine si spécifié
    if (domainKey) {
      filter.domainKey = domainKey;
    }

    // Récupérer tous les checkpoints actifs
    let checkpoints = await base44.entities.Checkpoint.filter(filter);

    // Filtrage texte (nom, vibe)
    if (query) {
      const queryLower = query.toLowerCase();
      checkpoints = checkpoints.filter(cp => {
        const name = (cp.name || '').toLowerCase();
        const vibe = (cp.vibe || '').toLowerCase();
        return name.includes(queryLower) || vibe.includes(queryLower);
      });
    }

    // Filtrage géographique (bbox)
    if (bbox) {
      checkpoints = checkpoints.filter(cp => {
        const lat = cp.geoLat || cp.lat;
        const lng = cp.geoLng || cp.lng || cp.lon;
        if (!lat || !lng) return false;
        
        return lng >= bbox.lngMin && lng <= bbox.lngMax &&
               lat >= bbox.latMin && lat <= bbox.latMax;
      });
    }

    // Limiter les résultats
    checkpoints = checkpoints.slice(0, limit);

    return json({
      ok: true,
      checkpoints,
      count: checkpoints.length
    });

  } catch (error) {
    console.error('searchCheckpoints error:', error);
    return jsonError(error.message, 500);
  }
});