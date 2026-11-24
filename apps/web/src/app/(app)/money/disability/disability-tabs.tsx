import Link from 'next/link';
import type { DisabilityCard } from '../../../../lib/money/disability-tabs';

/** แบบ 2 การ์ดเมนู: one card per tab with its main figures and what needs following; the open tab is marked. */
export function DisabilityTabs({ cards }: { cards: readonly DisabilityCard[] }) {
  return <nav className="dis-tabs" aria-label="เมนูกองทุนฟื้นฟูสมรรถภาพ">
    {cards.map((card) => <Link key={card.key} href={card.href} className={`dis-tab${card.current ? ' is-current' : ''}`} aria-current={card.current ? 'page' : undefined}>
      <span className="dis-tab-title"><span className="dis-tab-code">{card.code}</span>{card.title}</span>
      <span className="dis-tab-main">{card.main}</span>
      <span className={`dis-tab-alert is-${card.alert.tone}`}>{card.alert.text}</span>
    </Link>)}
  </nav>;
}
