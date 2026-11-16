# JAB Visions: business plan

**An entertainment-tech company turning original story worlds into creator commerce and the production network that connects them.**

Raising a $750,000 pre-seed round on a post-money SAFE. Built Nov 16, 2026 from the files in seed/.

| Key number | |
| --- | ---: |
| The raise | $750,000 pre-seed |
| Market (TAM / SAM / SOM) | $1.6B / $15.6M / $1.56M |
| Take rate | 100% of a $26.00 order |
| Contribution per order | $11.95 |
| LTV:CAC | 3.32x (LTV $39.82, CAC $12.00) |
| CAC payback | 5.02 months |
| Revenue, years 1 to 3 | $99,814 / $495,638 / $1,246,440 |
| Breakeven | month 32 (Aug 2029) |
| Peak burn | $106,975.75 a month (month 4) |
| Runway | the cash lasts all 36 months (low point $169,459.42 in month 31) |

## Checks

Every check passed: no empty sections, and the numbers agree between files.

## 1. Executive summary

JAB Visions LLC is an entertainment-tech company founded by John Andy in New York. It runs three engines on one site. THOSE RYDERZ is the original story world: a feature film in development with a pitch deck and proof-of-concept under way, and a browser game, Those Ryderz: Raid, that people can already play. The JAB Visions Store sells wearable and collectible artifacts from those worlds. Board is a creator-production network that began as the private tool for the film's cast and crew and is now in web beta for artists, actors, crew and fans. The principle behind the three: IP creates culture, commerce sustains it, infrastructure connects it.

This plan models the Store as the revenue engine, because it is the one line with real prices today: the average artifact sells for $26 and the Store keeps 100% of it, with artifact cost and fulfilment assumed at 50% of the price. On the founder's assumptions the model reaches $99,814 of revenue in year 1, $495,638 in year 2 and $1,246,440 in year 3, breaks even in month 32 and keeps the cash above $0 for all 36 months. JAB Visions is raising $750,000 on a post-money SAFE to take Board out of beta, shoot the THOSE RYDERZ proof-of-concept and run the first artifact drops.

These projections come from the founder's own assumptions, written out in seed/assumptions.json. They are a plan, not a forecast, and nothing in this document promises funding.

**Team.** John Andy, Founder, writer and director. Founded JAB Visions LLC; author of Solomon's Secrets: Sunrise; writer and director of THOSE RYDERZ.

## 2. Problem

Independent creators, the actors, crew, artists and musicians who make small productions happen, work across tools that do not talk to each other: one app to find work, one to get paid by fans, one to talk to the team, one to sell a shirt. Each takes a cut or a subscription and treats the creator as a user, not a collaborator. Fans of an independent world have it worse: there is no single place to follow the story, meet the people making it and buy from it.

The incumbents' own pages say what they charge. Patreon keeps 10% of a creator's income plus payment processing, currency conversion and payout fees (patreon.com/pricing). Casting Networks charges talent $29.99 a month or $299.90 a year for Premium, and the free tier cannot self-submit to roles (support.castingnetworks.com).

Their most recent App Store reviews, read on November 16, 2026, show where each one hurts. Patreon (4.9 stars, 582,850 ratings): 18 of 64 recent 1 and 2 star reviews mention bugs and app quality. Casting Networks (4.6 stars, 1,591 ratings): 10 of 60 mention fees and pricing. These are what reviewers wrote, not facts about the companies, and the full texts stay in seed/reviews/.

What the competitors' own reviews say (seed/competitors.json, 2026-11-16):

- Patreon: 18 of 64 recent 1 and 2 star reviews mention bugs and app quality.
- Casting Networks: 10 of 60 recent 1 and 2 star reviews mention fees and pricing.

## 3. Solution

JAB Visions connects the three things an independent world needs in one place.

Board is the creator-production network. A member has a profile and a Work Page, posts Drops (video, music, news, links, documents, thoughts), keeps a Project Notebook, and meets others in Rooms, including the official THOSE RYDERZ and JAB Visions rooms. Pay Drops let a creator request a payment and get paid through Stripe Connect; Board's platform fee on them is 0% today. Board runs on Supabase (auth, database, realtime) and is live as a web beta.

The Store sells wearable and collectible artifacts from the story worlds: smartwatches, socks, tees, knitwear, pendants, LED kits and more, priced from $8.77 to $59.99, an average of $26. The same artifacts appear inside Board as Store Drops that members can bookmark and collect.

THOSE RYDERZ is the IP that feeds both: a feature film in development, and Those Ryderz: Raid, a browser game with Solo, PvP and five-seat co-op Raid modes, a 12-character roster, four arenas and a Power Tree paid for in Signal Points earned by playing. Game cosmetics are earned, not sold, and the cast's live-action scans appear in the game as movie skins, so the film, the game and the Store share one set of faces.

- Board: creator-production network, web beta live
- Store: wearable and collectible artifacts, $26 average
- THOSE RYDERZ: film in development, Raid game playable now

## 4. Market

The market JAB Visions sells into is fan merchandise. Licensing International's 2026 Global Licensing Industry Study puts global sales of licensed merchandise and services at $389.8B in 2025, of which character and entertainment properties were $161.8B, the largest category and up 8% on the year; the US and Canada were $227.2B of the total.

Top-down TAM: 123,821,921 US residents aged 18 to 44 (US Census Bureau, Vintage 2025 estimates, Table 1) x 25% who buy entertainment or creator merchandise in a year x $52 a year = $1.61B. The 25% and the $52 are assumptions, labelled as such in seed/market.json: the $52 is two artifacts a year at the Store's $26 average price, and the 25% is a conservative reading of $227.2B of licensed merchandise sold across the US and Canada.

Bottom-up SAM: 250,000 fans of independent film, comics and music that Board, THOSE RYDERZ and the founder's New York creator network can reach online x 2.4 orders a year x $26 = $15.6M. The 250,000 is an assumption: no audience count exists in the repository yet, and it should be replaced with Board sign-ups and measured social reach.

SOM: 10% of the SAM in 3 years = $1.56M. The reason: fans who meet THOSE RYDERZ, JAB Lit, Comics and Music on Board buy about two artifacts a year, and the model reaches 26,600 paying customers by month 36, won through Board's rooms and drops rather than paid ads. Year 3 GMV in the model, $1,246,440, sits under the SOM.

| | Size (USD) |
| --- | ---: |
| TAM, the whole market | $1,609,684,973 ($1.6B) |
| SAM, the part you can serve | $15,600,000 ($15.6M) |
| SOM, the part you can win | $1,560,000 ($1.56M) |

Method: top-down TAM, bottom-up SAM, SOM 10% of SAM in 3 years. The inputs and where each comes from:

| Input | Value | Source |
| --- | ---: | --- |
| US residents aged 18 to 44 | 123,821,921 | US Census Bureau, Vintage 2025 estimates, Table 1 (census.gov/newsroom/press-releases/2026/vintage-2025-pop-estimates.html) |
| share who buy entertainment or creator merchandise in a year | 25% | assumption: Licensing International puts US/Canada licensed merchandise sales at $227.2B in 2025, about $660 a resident, so one in four adults buying fan merchandise is conservative; replace with a survey |
| spend a year on fan merchandise | $52 a year | assumption: two artifacts a year at the $26 average price of the 18 items in the JAB Visions Store catalog |
| fans of independent film, comics and music that Board, THOSE RYDERZ and the founder's New York creator network can reach online | 250,000 | assumption: no audience count exists in the repo yet; 250,000 is the online reach the three-year plan is built to earn, to be replaced with Board sign-ups and social reach once measured |
| orders a year per customer | 2.4 per year | assumption: 0.2 orders a customer a month in seed/assumptions.json, 2.4 a year |
| price per order | $26 | average of the 18 artifact prices in the JAB Visions Store catalog (StoreDropMarketplace.tsx, $8.77 to $59.99) |
| Global sales of licensed merchandise and services, 2025 | $389,800,000,000 | Licensing International, 2026 Global Licensing Industry Study (licensinginternational.org/get-survey) |
| Character and entertainment licensed merchandise sales, 2025 | $161,800,000,000 | Licensing International, 2026 Global Licensing Industry Study (licensinginternational.org/get-survey) |
| US and Canada licensed merchandise sales, 2025 | $227,200,000,000 | Licensing International, 2026 Global Licensing Industry Study infographic (licensinginternational.org) |

## 5. Competition

Nobody sells the whole bundle, so JAB Visions competes with one incumbent per job.

Patreon (4.9 stars, 582,850 ratings) is where fans pay creators. Its weak point in the reviews read on November 16, 2026 is bugs and app quality: 18 of 64 recent 1 and 2 star reviews (28.1%) mention it. It keeps 10% of creator income plus processing and payout fees.

Casting Networks (4.6 stars, 1,591 ratings) is where talent finds work. Its weak point is fees and pricing: 10 of 60 (16.7%). Premium is $29.99 a month or $299.90 a year, and the free tier cannot self-submit.

General-purpose community tools such as Discord sit alongside both, and take their own cut of creator subscriptions; they were not scored here because they do not do a production's job.

JAB Visions' position: Board is built by a production for productions, so the cast-and-crew workflow (Work Page, Drops, Rooms, Pay Drops) comes first and the fee is 0% today; the Store and the film give the network something to gather around that a general-purpose tool cannot. The risk is the mirror image: each incumbent is far larger, and Board must earn its users one production at a time.

| App | Rating | Ratings | Low reviews | Weak point | Evidence |
| --- | ---: | ---: | ---: | --- | --- |
| Patreon | 4.9 | 582,850 | 64 of 150 read | Bugs and app quality | 18 of 64 mention bugs and app quality |
| Casting Networks | 4.6 | 1,591 | 60 of 97 read | Fees and pricing | 10 of 60 mention fees and pricing |

Sources: https://itunes.apple.com/us/rss/customerreviews/page=1/id=1044456188/sortby=mostrecent/json (pages 1-3), https://itunes.apple.com/us/rss/customerreviews/page=1/id=1607830864/sortby=mostrecent/json (pages 1-2)

## 6. Business model

The Store sells its own artifacts, so the unit is one order and the Store keeps 100% of the $26 average price. Each order costs $14.05: card processing at 2.9% plus $0.30, and artifact cost and fulfilment assumed at 50% of the price (print-on-demand and small-batch sourcing). That leaves a contribution of $11.95 an order.

A customer is assumed to place 0.2 orders a month (2.4 a year) and to churn at 6% a month, so a customer is worth $39.82 of contribution over their life. Winning one is assumed to cost $12 (CAC), mostly through Board's rooms, the free Raid game and the film's own audience rather than paid ads. LTV:CAC is 3.32x and the CAC is paid back in 5.02 months.

Two revenue lines exist in the product but are not in the model, on purpose. Board's Pay Drops run on Stripe Connect with a configurable platform fee that is 0% today; turning it on is a lever for later, once creators are paid through Board routinely. Game cosmetics in Raid are priced in Signal Points earned by playing, with no real-money path, so the game stays a free front door.

| Per order | |
| --- | ---: |
| Price | $26.00 |
| You keep (100% take rate) | $26.00 |
| Costs of one order | $14.05 (card processing (2.9% + $0.30) $1.05, artifact cost and fulfilment (print-on-demand and small-batch sourcing) $13.00) |
| **Contribution per order** | **$11.95** |
| Orders per customer a month | 0.2 |
| Contribution per customer a month | $2.39 |
| CAC (cost to win one customer) | $12.00 |
| CAC payback | 5.02 months (CAC / contribution per customer a month) |
| Monthly churn | 6% |
| LTV | $39.82 (contribution per customer a month / churn) |
| **LTV:CAC** | **3.32x** |

## 7. Go-to-market

The launch starts with the people already inside. The model begins with 150 customers, the cast, crew and early Board members, and adds 150 new customers in month 1, growing 15% a month in year 1, 8% in year 2 and 4% in year 3.

Month 4 is the launch moment: the THOSE RYDERZ proof-of-concept shoot, budgeted at $90,000 in the model. The shoot produces the footage, the stills and the scans that become Drops on Board, movie skins in Raid and the first artifact drop in the Store, so one production feeds all three engines.

Board and Raid are the free front door. Board's official rooms for THOSE RYDERZ and JAB Visions open to fans, and the Raid game is free to play in the browser. The Store sits inside both as Store Drops. Cast and crew carry the network to the next production through Join Us, the open call for cast, crew, music and visual art. The $12 CAC assumes most customers arrive this way; it should be measured from the first drop onward.

- Cast and crew first
- Proof-of-concept shoot in month 4
- Raid game and Board rooms as the free front door

## 8. Financial plan

The 36-month model runs from January 2027 and is built from seed/assumptions.json. Orders: 3,839 in year 1, 19,063 in year 2, 47,940 in year 3. Revenue (equal to GMV, since the Store keeps 100%): $99,814, $495,638 and $1,246,440. Gross profit: $45,861, $227,727 and $572,691. Operating costs: $388,737, $427,824 and $585,756. Net: -$342,876, -$200,097 and -$13,065. Customers at year end: 3,555, 12,685 and 26,600.

Breakeven comes in month 32 (August 2029) and holds every month after it. Peak burn is $106,976 in month 4 (April 2027), the month of the proof-of-concept shoot. The cash lasts all 36 months; its low point is $169,459 in month 31, with $193,962 left at the end of year 3.

Costs are deliberately lean. Payroll is three roles: the founder as CEO and creative director from month 1, a full-stack engineer for Board and the Store from month 2, and a community and production lead from month 7, with 15% overhead for taxes and benefits. Monthly opex is $900 for hosting, Supabase, Stripe, OpenAI and software and $900 for legal, accounting and insurance. One-off costs are the $90,000 shoot in month 4 and a $30,000 first artifact run in month 2. Marketing is new customers times the $12 CAC.

These are the founder's assumptions, not a forecast. The numbers most worth testing early are the 0.2 orders a customer a month, the 6% monthly churn and the $12 CAC; seed/model.csv has every month.

| | Year 1 | Year 2 | Year 3 |
| --- | ---: | ---: | ---: |
| Orders | 3,839 | 19,063 | 47,940 |
| GMV | $99,814 | $495,638 | $1,246,440 |
| Revenue | $99,814 | $495,638 | $1,246,440 |
| Gross profit | $45,861 | $227,727 | $572,691 |
| Opex | $388,737 | $427,824 | $585,756 |
| Net | -$342,876 | -$200,097 | -$13,065 |
| Cash at year end | $407,124 | $207,026 | $193,962 |

- Breakeven: month 32 (Aug 2029), and every month after it.
- Peak burn: $106,975.75 in month 4.
- Runway: the cash lasts all 36 months (low point $169,459.42 in month 31).

_From seed/model.json, Jan 2027 to Dec 2029: projections from your own assumptions, not a forecast._

## 9. Use of funds

JAB Visions is raising $750,000 on a post-money SAFE. Board engineering: $300,000 (40%), the engineer's payroll and the work to take Board out of beta (Drop Studio, Rooms, Pay Drops and Banking). THOSE RYDERZ proof-of-concept: $150,000 (20%), the shoot, post-production and the scans that feed the game and the Store. Store artifacts: $120,000 (16%), the first runs of inventory and the drop calendar. Community, marketing: $120,000 (16%), the community lead and customer acquisition at the $12 CAC. Operations, legal: $60,000 (8%), accounting, legal, insurance and hosting. The five add up to the raise.

| Use | Amount | Share |
| --- | ---: | ---: |
| Board engineering | $300,000 | 40% |
| THOSE RYDERZ proof-of-concept | $150,000 | 20% |
| Store artifacts | $120,000 | 16% |
| Community, marketing | $120,000 | 16% |
| Operations, legal | $60,000 | 8% |
| **Total** | **$750,000** | **100%** |

Adds up to the $750,000 raise.

---

_Every number in this plan comes from the files in seed/. Projections come from your own assumptions in seed/model.json: a plan, not a promise. Raising money depends on the business, and investors decide. Not investment advice._
