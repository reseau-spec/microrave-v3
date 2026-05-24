import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, User, Play } from 'lucide-react';
import { DOMAIN_LABELS, getItemDomains } from './feedScoring';
import { getTaxonomies } from '../taxonomyCache.jsx';

function domainKeyForHero(item) {
  const domains = getItemDomains(item);
  return domains?.[0] || 'music';
}

// Résolution canonique de l'image de couverture.
// Ordre de priorité :
//   1. coverImageUrl  — champ canonique pour checkpoint / event / moment
//   2. avatarUrl      — champ canonique pour talent
//   3. legacy aliases — rétrocompatibilité
function getCoverUrl(item) {
  return (
    item?.coverImageUrl ||
    item?.avatarUrl ||
    item?._coverUrl ||
    item?.coverUrl ||
    item?.imageUrl ||
    item?.photoUrl ||
    null
  );
}

// Fallback image statique — base de secours si domainMap non encore chargé
// v2 : complété dynamiquement depuis Domain.defaultImageUrl en DB (si renseigné)
const HERO_DOMAIN_FALLBACKS_STATIC = {
  music:       'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&q=80',
  humour:      'https://images.unsplash.com/photo-1516450137517-162bfbeb8dba?w=1200&q=80',
  art:         'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=1200&q=80',
  video:       'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=1200&q=80',
  photo:       'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1200&q=80',
  food:        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
  responsable: 'https://images.unsplash.com/photo-1542601906897-eabf761bbec4?w=1200&q=80',
  boisson:     'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1200&q=80',
  default:     'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80',
};

function getHeroFallback(item, domainMap) {
  const domain = item?.domainDominantKey || null;
  // Priorité 1 : defaultImageUrl depuis l'entité Domain en DB (si renseigné)
  if (domain && domainMap?.[domain]?.defaultImageUrl) {
    return domainMap[domain].defaultImageUrl;
  }
  // Priorité 2 : fallback statique (rétrocompatibilité)
  return HERO_DOMAIN_FALLBACKS_STATIC[domain] || HERO_DOMAIN_FALLBACKS_STATIC.default;
}

function titleFor(featured) {
  const { kind, item } = featured || {};
  if (!item) return '';
  if (kind === 'talent') return item.displayName || item.name || 'Talent à la une';
  if (kind === 'checkpoint') return item.name || 'Checkpoint à la une';
  return item.title || 'Session à la une';
}

function subtitleFor(featured) {
  const { kind, item } = featured || {};
  if (!item) return '';
  if (kind === 'talent') return item.bio || 'En montée';
  if (kind === 'checkpoint') return item.type || item.neighborhood || 'Lieu';
  return item._checkpointName || item.checkpointName || 'Micro Rave';
}

function sotsLabel(item) {
  const v = item?.sessionSotsScore ?? item?.sotsGlobalScore ?? null;
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(1);
}

export default function HeroBanner({ featured, onPrimary, onSecondary }) {
  const { kind, item } = featured || {};
  const [domainMap, setDomainMap] = React.useState({});

  // Charger le domainMap depuis le cache taxonomyCache (déjà chargé par l'app)
  React.useEffect(() => {
    getTaxonomies().then(cache => setDomainMap(cache.domainMap || {})).catch(() => {});
  }, []);

  const effectiveCoverUrl = useMemo(() => {
    if (!item) return '';
    return getCoverUrl(item) || getHeroFallback(item, domainMap);
  }, [item, domainMap]);

  const bgStyle = useMemo(() => ({
    backgroundImage: `url(${effectiveCoverUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }), [effectiveCoverUrl]);

  if (!featured?.item) return null;

  const domainKey = domainKeyForHero(item);
  const title = titleFor(featured);
  const subtitle = subtitleFor(featured);
  const sots = sotsLabel(item);

  const primaryLabel =
    kind === 'session' ? 'Jouer maintenant' : kind === 'talent' ? 'Voir le profil' : 'Explorer';

  const secondaryLabel =
    kind === 'session' ? 'Voir le feed' : 'Ajouter';

  const Icon = kind === 'checkpoint' ? MapPin : kind === 'talent' ? User : Play;

  return (
    <div className="mb-8">
      <div className="relative w-full overflow-hidden rounded-2xl">
        {/* BG */}
        <div className="h-[420px] w-full" style={bgStyle} />

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />

        {/* Content */}
        <div className="absolute inset-0 flex items-end">
          <div className="p-6 sm:p-8 max-w-3xl">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge variant="secondary" className="bg-white/10 text-white border border-white/15">
                <span className="inline-flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {kind === 'session' ? 'À la une' : kind === 'talent' ? 'Talent' : 'Checkpoint'}
                </span>
              </Badge>

              <Badge variant="outline" className="text-white/90 border-white/20 bg-white/5">
                {DOMAIN_LABELS[domainKey] || domainKey}
              </Badge>

              {item?.status && (
                <Badge variant="outline" className="text-white/90 border-white/20 bg-white/5">
                  {String(item.status)}
                </Badge>
              )}

              {sots && (
                <Badge variant="secondary" className="bg-white/10 text-white border border-white/15">
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    {sots}/5
                  </span>
                </Badge>
              )}
            </div>

            {/* Title */}
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight mb-3">
              {title}
            </h2>

            {/* Subtitle */}
            <p className="text-white/80 max-w-2xl mb-6 line-clamp-2">
              {subtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 items-center">
              <Button
                className="bg-white text-black hover:bg-white/90 font-extrabold rounded-xl px-5"
                onClick={() => onPrimary?.(featured)}
              >
                {primaryLabel}
              </Button>

              <Button
                variant="secondary"
                className="bg-white/10 text-white hover:bg-white/15 border border-white/15 font-bold rounded-xl px-5"
                onClick={() => onSecondary?.(featured)}
              >
                {secondaryLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}