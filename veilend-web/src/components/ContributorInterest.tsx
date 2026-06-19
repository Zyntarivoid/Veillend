'use client';

import { useState } from 'react';
import { trackCampaignEvent } from '@/lib/campaignAnalytics';

const interestAreas = [
  'Soroban contracts',
  'Web app',
  'Mobile app',
  'Privacy research',
  'Docs and onboarding',
];

export function ContributorInterest() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-background-alt p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">
        Contributor interest
      </p>
      <h2 className="mt-3 text-2xl font-bold text-text">Tell us where you want to help</h2>
      <p className="mt-3 text-text-secondary">
        Pick an area to record anonymized campaign interest before jumping into GitHub.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {interestAreas.map((interestArea) => (
          <button
            key={interestArea}
            type="button"
            onClick={() => {
              setSelectedArea(interestArea);
              trackCampaignEvent('campaign_contributor_interest', {
                interestArea,
              });
            }}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selectedArea === interestArea
                ? 'border-secondary bg-secondary text-black'
                : 'border-border bg-card text-text-secondary hover:border-secondary hover:text-text'
            }`}
          >
            {interestArea}
          </button>
        ))}
      </div>
      {selectedArea ? (
        <p className="mt-4 text-sm text-success">
          Interest tracked for {selectedArea}. No names, emails, wallet addresses, or cookies were
          collected.
        </p>
      ) : null}
    </div>
  );
}
