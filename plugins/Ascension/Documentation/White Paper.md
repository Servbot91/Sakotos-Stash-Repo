# Overview

Ascension is a fork of the plugin known as hot or not. At its core it is a comparator with comprehensive matchmaking logic to accurately and granularly rate stash entities on a rating scale of .1 to 100. The plugin aims to solve the problems of inherited personal bias and overestimation forcing the user to make weighted decisions while maintaining engagement and keeping the process from becoming monotonous while also protecting database integrity and maintaining healthy vertical scaling.

Ascension is able to achieve these goals through a variety of systems. Most of these systems feature variables that become unique to the player over time adapting to play schedule, frequency of play, rating and tier distribution.

---

# Tier System

A Tier System was introduced to better visualize entities in the user stash database. It allows for more granularity and allows potential levers to further refine and sophisticate the matchmaking. This system has been integrated in every aspect of Ascension and plays a minor role in match selection. 

| **Tier**   | **Rating Range** | **Status**         | **Matchmaking Logic**                                  |
| ---------- | ---------------- | ------------------ | ------------------------------------------------------ |
| **S-Tier** | **85 – 100**     | **Elite**          | Can only battle S, A, or B-Tier opponents.             |
| **A-Tier** | **70 – 84.9**    | **Top Tier**       | High-performance bracket.                              |
| **B-Tier** | **55 – 69.9**    | **Mid-High**       | The lowest tier eligible to face S-Tier seeds.         |
| **C-Tier** | **40 – 54.9**    | **Average**        | Standard competitive pool.                             |
| **D-Tier** | **25 – 39.9**    | **Below Average**  | Entry-level competitive bracket.                       |
| **F-Tier** | **0 – 24.9**     | **Underperformer** | New or Performers struggling to maintain a 25+ rating. |

## Tier Focus

Tier Focus was introduced to force battles within their respective tier. The system uses a random array and chooses from the following selection: S-Tier, A-Tier, B-Tier, C-Tier, D-Tier, F-Tier, Any, Newcomers. For a Tier to become focused, it must meet the following requirements:

 - S, A, B, C, D, F
    - Avg Pool Weight must be above .80
    - Minimum 20 performers
 - Newcomers
    - 6 matches or less
    - Minimum 20 Performers
    - Avg Pool Weight must be above .80
 - Any
    - No requirements are used for the Any selection, and the logic is the same as regular matchmaking.
  
When evaluting selection for a tier focus, a calculation is made verifying requirements for tier selection. If a selection fails, the battle log will update with its reason and a new check is made. The calculation will continue until it finds a valid selection and will safely fallback to the Any selection should no tier qualify. 

When a tier is selected, all performers within that tier have their weights boosted (2.0) for focused selection. This means if you have had performers within a tier rated in the Any selection and their weights have been dropped to a low value, they will get another oppurtunity for a match if the tier is selected for focus. The Any selection does not boost weights. While the system will still use the weight and recency calculations to prioritize entities, depending on your tier size you can still see entities who may have been shown more recently in your session. 

To maintain focus selection balance the system will lock on a tier for a semi-random block of matches ($3$ to $7$ matches long) before rolling a weighted probability check to select a new tier from the shuffled rotation list. If all pools have been exhausted, it will rely on the Any selection logic until a new pool qualifies for selection. The logic continuously evaluates tiers as users engage and entities recharge to determine eligibility.

This system further boosts database priming speed while promoting healthy match-ups. With the catch up mechanics like getLowMatchBoost and fair handling of tier selection match count distribution remains within an acceptable level of drift.

---

# Match Selection

Performers are filtered before a pairing is made which considers the Recency Weighting and Low Match Boost values. Combined these systems contribute to an overall 'weight' of a performer which governs their selection. The first performer is randomly selected via weightedRandomSelect as a 'Seed' from a pool of 15 seeds. After a performer is selected and rated in a match, their weight is set to 0 for 30 minutes making them ineligible for automated match making selection. 

Once this period has expired, their weight begins to recharge towards 1.0. If all performer weights are near exhaustion (90%) or there is no performers available to satisfy selection due to weight, all performer weights are reset to 1.0.

### getRecencyWeight(performer)

The Recency Weight calculates how likely a performer is to be selected based on last match time. It uses a cubed recency calculation $Weight = Recency^3$  to prioritize new or performers who haven't been seen in a while. A high weight of 1.0 expresses high priority in match selection while a low weight of .10 expresses a low match selection probability. If a weight is equal to or less than 0, the performer is not considered for selection.

|**Scenario**|**Time Since Last Match**|**Logic Applied**|**Final Weight**|**Priority Level**|
|---|---|---|---|---|
|**New Entry**|N/A (0 matches)|Returns 1.0 immediately|**1.0**|**Critical**|
|**Cooling Down**|< 15 Minutes|Hard Blackout: returns 0|**0.0**|**Excluded**|
|**Short Break**|1 Hour|$0.1 + (1 \times 0.075) = 0.175$|**0.17**|**Very Low**|
|**Mid-Day**|6 Hours|$0.1 + (6 \times 0.075) = 0.55$|**0.55**|**Medium**|
|**Recovered**|12+ Hours|Capped at 1.0 maximum|**1.0**|**High**|

### getLowMatchBoost

The Low Match Boost function considers a performers match count and prioritizes new performers and performers that are behind the match average to quickly integrate and catch up them up to others in the database. If the performer is new they have a 2x chance of being selected. If a performer is behind the pool match average of 30% or 50% they get a large weight boost or smaller weight boost respectively.

|**Match Status**|**Threshold Condition**|**Multiplier Applied**|**Strategic Purpose**|
|---|---|---|---|
|**Completely Unrated**|$matches = 0$|**2.0x**|**Critical Discovery**: Maximum priority to establish a baseline rank for new entries.|
|**Significantly Under-sampled**|$avgMatches > 5$ AND $matches < 30\%$ of Average|**1.5x**|**High Priority**: Rapidly increases sample size for performers trailing the community average.|
|**Moderately Under-sampled**|$avgMatches > 10$ AND $matches < 50\%$ of Average|**1.2x**|**Steady Growth**: A gentle nudge for performers who are active but still below the median data density.|
|**Well-Established**|All other cases|**1.0x**|**Normal Selection**: No artificial boost; selection relies purely on recency and performance.|

To maintain reasonable pairing the selection logic uses a match cap of 10 compared to the pool average to determine boost. 

| **Match Count Type** | **Variable Name** | **Actual Value** | **Value Seen by Weighting Engine** |
| -------------------- | ----------------- | ---------------- | ---------------------------------- |
| **Real Value**       | `rawMatches`      | 0                | 0                                  |
| **Real Value**       | `rawMatches`      | 4                | 4                                  |
| **Real Value**       | `rawMatches`      | 10               | 10                                 |
| **Real Value**       | `rawMatches`      | **250**          | **10**                             |

|**Real Matches**|**Capped Value**|**Impact on Selection Priority**|
|---|---|---|
|**0**|**0**|**Maximum Boost (2.0x)**: The system treats the performer as "High Discovery".|
|**1 to 9**|**1-9**|**Scaling Boost**: If the community average is high, these performers still receive 1.5x or 1.2x multipliers to reach the "Veteran" status faster.|
|**10+**|**10**|**Stabilized**: The multiplier drops to **1.0x**. Once a performer hits 10 matches, they are considered "sampled enough" to compete purely on recency.|

### Comparator Selection Window

When selecting a performer, the matchmaking does not select the first available. Instead it chooses via weightedRandomSelect from the top 15 weighted performers to maintain variety. The selected performer becomes the seed. The seed's rating determines its anchor pairing eligibility.

#### Anchor Eligibility Selectors

The anchor must be within 15 points of the seed above or below while respecting recency. For S Tier performers, they are restricted from battling anyone below B tier to maintain match integrity. This is also considered in the cross tier match event pairing.

### Match Selection Events

Match selection events are meant to maintain engagement while introducing a little bit of match swing chaos relying on probability.

#### shouldForceCrossTierMatch

The match selection features a 10% chance of a Cross tier matchup with the selection of a minimum 20 point gap. The maintain balance, S tiers are excluded from performers below B tier. 

### Additional Fallbacks

The system will always maintain checks to satisfy the 2 minimum performer requirement. However if criteria fails to be met, the system will drop the smart selection and search the nearest opponent. This is to maintain match continuity in the event of failover. If it cannot find the next closest opponent, it will randomly select. 

---

# Scoring

The system now provides dynamic scoring according to point gap and Dynamic K-Factor. Protections have also been implemented for underdog and high tier loses which is considered in the point gap and scoring. 

## Dynamic K-Factor

### getProgressiveKFactor

A base K-Factor of 32 is given to every new performer to maintain maximum fluidity during their initial matches to establish a tier using a sigmoid function, $BaseK$ , and $ReductionFactor$. As their matches increase, their K-Factor gradually slides towards half its initial value. The lower K-Factor over time allows for performers to essentially 'settle' within their rank to limit more dramatic point swings. It considers 

|**Match Count**|**Experience Multiplier**|**Base K-Factor (32×Factor)**|**Strategy**|
|---|---|---|---|
|**0 Matches**|**~0.97x**|**~31.1**|**Placement**: Rapidly moving the performer to their deserved rank.|
|**18 Matches**|**0.75x**|**24.0**|**Transition**: The "Pivot Point" where volatility begins to stabilize.|
|**50+ Matches**|**~0.51x**|**~16.3**|**Established**: Slow, steady adjustments based on long-term performance.|

### Tier Score Reductions

The K-Factor scoring is reduced once performers hit A or S tier. This is to avoid rating inflation and to further established earned rank performers vs tourists.

| **Rating**      | **Reduction Applied** | **Effect on Volatility**                                                           |
| --------------- | --------------------- | ---------------------------------------------------------------------------------- |
| **0 - 60**      | **None (1.0x)**       | Full mobility; rewards climb equally.                                              |
| **75**          | **~0.78x**            | Points become "heavier"; harder to gain/easier to lose.                            |
| **95 (S-Tier)** | **~0.50x**            | **High Squeeze**: Significant stability; protects the elite tier from wild swings. |

### Other Game Mode Scoring

Additionally the K-Factor adjusts according to game mode being used.

| **Game Mode** | **Adjustment**      | **K-Factor Limits (Min / Max)** |
| ------------- | ------------------- | ------------------------------- |
| **Gauntlet**  | **1.1x Boost**      | **8 / 45**                      |
| **Swiss**     | **Standard**        | **6 / 40**                      |
| **Champion**  | **0.85x Reduction** | **6 / 35**                      |

### Protection and Underdog Multipliers

Rating difference affects point distribution and there are also protections for matchups with significant gaps. This is to prevent punishments for the expected loser or winner and to cap unexpected wins and losses to maintain a fair scoring system. The outcome is decided by the sum of the following variables:
$$Result = (K \text{ Factor}) \times (\text{Elo Probability}) \times (\text{Underdog Multiplier}) \times (\text{Protection/Dampening})$$

#### Rating Difference Scoring

|**Rating Difference**|**Protection Level**|**Points Lost**|**Multiplier**|
|---|---|---|---|
|**0 – 15 pts**|**None**|100% of normal loss|**1.0x**|
|**16 – 20 pts**|**Minor**|90% of normal loss|**0.9x**|
|**21 – 25 pts**|**Moderate**|85% of normal loss|**0.85x**|
|**26 – 30 pts**|**Strong**|80% of normal loss|**0.8x**|
|**31+ pts**|**Maximum**|70% of normal loss|**0.7x**|

#### Protection Overrides

|**Scenario**|**Logic**|**Resulting Limit**|
|---|---|---|
|**Expected Loss**|Loser is 15+ pts below Winner|**Mitigation Factor (0.2x to 1.0x)**: The bigger the gap, the less the loser drops.|
|**High Gap Loss**|Loser is 25+ pts below Winner|**Hard Cap**: Loser cannot lose more than **3 points**.|
|**Underdog Upset**|Winner is 20+ pts below Loser|**Scale Factor**: Dampens both the winner's gain and loser's loss to avoid wild swings.|
|**Upset Cap**|Winner is 20+ pts below Loser|**Hard Cap**: Loser's total point drop is capped at **5 points**.|

#### Other Modes

| **Mode**     | **Trigger Condition** | **Multiplier**                   | **Strategic Effect**                                                 |
| ------------ | --------------------- | -------------------------------- | -------------------------------------------------------------------- |
| **Placement** | Streak $\ge 3$        | **Variable (0.9x down to 0.3x)** | Wins become 15% less effective for every win past the 3rd.           |
| **Champion** | Streak $5–9$          | **0.7x**                         | Significant reduction in gains to keep the "King" within reach.      |
| **Champion** | Streak $\ge 10$       | **0.4x**                         | **Hard Cap**: Extreme dampening to stop runaway leaderboard leaders. |

---

# Summary

The aggregation of all these systems in tandem allows for a dynamic granular vertical scaling rating system unique to the user that evolves in real time. Users can expect to see a healthy vertically scaled tier distribution of their database when starting from 0 or by using the Primer features in the stash task settings.
