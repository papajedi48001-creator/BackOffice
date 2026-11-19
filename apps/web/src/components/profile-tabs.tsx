'use client';

import { useState, type ReactNode } from 'react';

export type ProfileTab = { key: string; label: string; content: ReactNode };

/** The person editor's tabs (system tab style, `nhso-tabs`): one group of boxes shown at a time. */
export function ProfileTabs({ tabs, label }: { tabs: ProfileTab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  return <div className="profile-tabs">
    <div className="nhso-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => <button key={tab.key} type="button" role="tab" id={`profile-tab-${tab.key}`} aria-controls="profile-tab-panel" aria-selected={tab.key === current?.key} className={tab.key === current?.key ? 'is-active' : ''} onClick={() => setActive(tab.key)}>{tab.label}</button>)}
    </div>
    <div role="tabpanel" id="profile-tab-panel" aria-labelledby={current ? `profile-tab-${current.key}` : undefined} className="profile">{current?.content}</div>
  </div>;
}
