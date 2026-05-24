import React from 'react';
import { Crown, Zap, Star, Shield, Gem } from 'lucide-react';

// ─── Config des tiers ─────────────────────────────────────────────────────────

const TIER_CONFIG = {
  A: {
    label:       'Freemium',
    icon:        Zap,
    rate:        '12%',
    color:       'text-gray-500',
    bg:          'bg-gray-100',
    border:      'border-gray-200',
    gradient:    'from-gray-100 to-gray-200',
    textGradient:'text-gray-600',
    dot:         'bg-gray-400',
  },
  E: {
    label:       'Founder',
    icon:        Star,
    rate:        '5%',
    color:       'text-amber-600',
    bg:          'bg-amber-50',
    border:      'border-amber-200',
    gradient:    'from-amber-50 to-yellow-100',
    textGradient:'text-amber-700',
    dot:         'bg-amber-400',
    limited:     true,
  },
  B: {
    label:       'Base',
    icon:        Shield,
    rate:        '9%',
    color:       'text-blue-600',
    bg:          'bg-blue-50',
    border:      'border-blue-200',
    gradient:    'from-blue-50 to-indigo-50',
    textGradient:'text-blue-700',
    dot:         'bg-blue-400',
  },
  C: {
    label:       'Pro',
    icon:        Crown,
    rate:        '6%',
    color:       'text-purple-600',
    bg:          'bg-purple-50',
    border:      'border-purple-200',
    gradient:    'from-purple-50 to-violet-50',
    textGradient:'text-purple-700',
    dot:         'bg-purple-500',
  },
  D: {
    label:       'Studio',
    icon:        Gem,
    rate:        '3.5%',
    color:       'text-rose-600',
    bg:          'bg-rose-50',
    border:      'border-rose-200',
    gradient:    'from-rose-50 to-pink-50',
    textGradient:'text-rose-700',
    dot:         'bg-rose-500',
  },
};

// ─── MembershipBadge — petit badge compact pour le header de profil ───────────

export function MembershipBadge({ tier = 'A', size = 'sm' }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.A;
  const Icon = cfg.icon;

  if (size === 'xs') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon className="w-4 h-4" />
      {cfg.label}
      <span className="text-xs opacity-70">· {cfg.rate}</span>
    </span>
  );
}

// ─── MembershipCard — carte complète d'un plan ───────────────────────────────

export function MembershipCard({ plan, isActive = false, isCurrent = false, onSelect }) {
  const cfg = TIER_CONFIG[plan.tier] || TIER_CONFIG.A;
  const Icon = cfg.icon;
  const yearlySaving = plan.priceYearlySavings || 0;

  return (
    <div
      className={`
        relative rounded-2xl border-2 p-6 flex flex-col gap-4 transition-all
        ${isCurrent
          ? `${cfg.border} shadow-md bg-gradient-to-br ${cfg.gradient}`
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        }
      `}
    >
      {/* Badge "Actuel" */}
      {isCurrent && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.border} ${cfg.color} shadow-sm`}>
          Votre forfait actuel
        </div>
      )}

      {/* Badge "Offre limitée" */}
      {cfg.limited && (
        <div className="absolute -top-3 right-4 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-white shadow-sm">
          Limité au 31 mai
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg} ${cfg.border} border`}>
          <Icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-lg leading-tight">{plan.nameFr}</h3>
          <p className={`text-sm font-semibold ${cfg.color}`}>Commission : {(plan.commissionRate * 100).toFixed(1)}%</p>
        </div>
      </div>

      {/* Prix */}
      <div className="border-t border-b border-gray-100 py-4">
        {plan.priceMonthly === 0 ? (
          <div className="text-center">
            <span className="text-3xl font-black text-gray-900">Gratuit</span>
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-black text-gray-900">{plan.priceMonthly}$</span>
              <span className="text-sm text-gray-500"> / mois</span>
            </div>
            {yearlySaving > 0 && (
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-700">{plan.priceYearly}$ / an</div>
                <div className="text-xs text-green-600 font-medium">Économie {yearlySaving}$</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      {Array.isArray(plan.features) && plan.features.length > 0 && (
        <ul className="space-y-2 flex-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      {!isCurrent && onSelect && (
        <button
          onClick={() => onSelect(plan)}
          className={`
            w-full py-2.5 rounded-xl text-sm font-semibold transition-all
            ${plan.priceMonthly === 0
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : `bg-gradient-to-br ${cfg.gradient} ${cfg.color} border ${cfg.border} hover:shadow-md`
            }
          `}
        >
          {plan.priceMonthly === 0 ? 'Plan gratuit' : `Choisir ${plan.nameFr}`}
        </button>
      )}
    </div>
  );
}

export default MembershipBadge;