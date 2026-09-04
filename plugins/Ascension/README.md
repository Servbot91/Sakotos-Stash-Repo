Ascension is the Sakoto fork of the original plugin known as hot or not. Ascension features mechanics that serve as a comprehensive stash entity rating and tier system that scales and adapts to your database in real time. This fork sets out to further expand and develop core features of the original while maintaining a consistent, fair, and stable rating system. 

Ascensions development has birthed a compressive matchmaking and scoring engine unique to its implementation. Mechanically it is the most verbose matchmaking system in the stash plugin comparison space and the originator of its core features such as Ascension Score (Asc.Score), recency, seed selection, weight handling, selection modifiers, limiters, and boosters.

For in-depth mechanic explanations, refer to the [Ascension White Paper](https://github.com/Servbot91/Sakotos-Stash-Repo/blob/main/plugins/Ascension/Documentation/White%20Paper.md).

---
# Features

 Ascension features 4 modes for matchmaking allowing users to rate their entities in a variety of ways.

### Head to Head

<details>

- Head to Head provides a 1v1 selection comparison view allowing the user to make the preferred selection. When a winner is selected the entity is given points contributing to their Ascension Score. As a performer climbs in score, they climb in Tier further increasing their competition. There are 5 tiers an entity can belong to exclusively at any time.

* **S-Tier** - Top 5%
* **A-Tier** - Top 13%
* **B-Tier** - Top 20%
* **C-Tier** - Top 30%
* **D-Tier** - Bottom 60%
* **F-Tier** -  Bottom 12%

- Head to Head mode features extensive match handling and logic to provide competitive matching, variety, and meaningful engagement. The more the player users the plugin, the more difficult the matches become. 

- This creates meaningful and personalized ratings unique to the players preference while explicitly designed systematically to prevent the same player from applying conscious or subconscious bias.

</details>
	
 ### Placement Mode

<details>

- Placement mode allows a performer to battle up tiers to find their place. Once a performer loses a match they enter a falling state until they win their next match. Once the performer wins while in a falling state they are placed within the ranks.
	
- When selecting this mode you are presented the option of 6 randomly chosen performers to choose from, spacebar or reselecting the mode refreshes the selection.
	
- Furthermore, launching a Ascension on a performer page and selecting placement mode will launch placement mode for that performer.

</details>
		
### Champion Mode

<details>

- A mode where winner stays on. If a performer loses their match up, they are knocked out and the  next performer takes over. As mentioned in placement mode, you are presented with an option of 6 different performers. If Ascension is launched on a performer page, you can switch to champion mode and it will start champion mode with the performer selected.
 
</details>

### Scene Mode

<details>

- Rate your stash scenes similarly to Head to Head mode. Launching Ascension from a performer page and navigating to scene mode will allow the user to compare that performers scenes and rate them against each other.
		 
</details>

---

## Match Making

Ascension matchmaking introduces a unique and comprehensive engine designed to adapt to the user in real time while maintaining match variety, integrity, and fairness. The logic behind this system features a significant amount of mechanics that operate in harmony to promote a healthy and dynamic system. 

[Ascension White Paper](https://github.com/Servbot91/Ascension/blob/main/Documentation/White%20Paper.md).

---

 ###  Tier System

<details>

 - A Tier system has been added to not only better visualize your performers, but to classify where they stand on the grand scale of your database. Performers can battle across tiers to maintain their status and can expect challenges climbing and maintaining their placement if competition is fierce. 

- The Tier system uses a percentile bracket to provide real time scaling according to the users database size and growth. Tier Gates are also implemented to account for volatility and minimum Ascended Scores must be met before a performer can enter a tier.

- As your tiers begin to fill, the Tier Focus select will begin focusing specific tiers to battle amongst themselves, this array uses specific tier selection logic to keep tier focusing varied. Tier Focus also features selections such as Any which puts performers against each other within a reasonable range ie C Tier vs B tier or A tier vs S Tier. Newcomers faces performers with low match counts against each other. Unrated battles exclusively unrated performers.

</details>

 ###  Custom Match Making

Users can override the default matchmaking pairing logic in both Head to Head mode and Scene mode to apply their own custom matching making criteria to their stash entities.

---

## New UI

The UI has been reimagined and is better streamlined on mobile introducing a card carousel swiping and one-handed design philosophy.

- ### Performer Statistics

	Performer Statistics tracks your performers in depth and real time. Visualize their cooldown time, match history, scoring calculations, and pool sizes.

- ### Cards

	The battle cards have been reworked to display more stash related information to give you a better assessment of the rating. These cards are modular and can be changed via the options menu.

## Performer Ledger

- A Performer Ledger has been introduced on your performer page to track the result of the last 10 matches. Hovering over each performers match provides a visualization of their opponent and result.

## Event Log

- Ascension introduces an event log that allows the user to identify issues they may notice or suspect. It is a comprehensive and detailed logger that features hyperlinking and tier color coordination to better visualize what is happening mechanically. 

- The event log can be toggled and also features a log export feature. The export feature sanitizes your performer\scene name references once exported to allow diagnoses from external sources.

- ### Options Mode

	Ascension introduces an options mode allowing the user to customize and adjust their matchmaking criteria for their convenience. Users can toggle displayed views, select only specific tiers, or choose their own saved stash filter for matchmaking to allow for a more tailored experience. 

## Metric Dashboard

- Ascension introduces the Metric Dashboard, an extensive stat visualizer, tracker, and history archive of your performers history within Ascension featured within the stash Stats page. This data is built off of your system snapshot tasks and is cached to optimize for performance.
	 
	Using the Metric Dashboard you can compare performers stats, see their strengths and weaknesses. Each performer gets a dashboard unique to them that more specifically defines their strengths and weaknesses.

### Metric Dashboard Features
<details>

- Ascension Performer Profile Page tracking detailing match history, average scene rating, highest rated scenes
- Diffs against other performers
- Fuzzy find search options allowing you to search your stash db with minimal accuracy
- Top stat metrics across tiers
- Compare Performers against each other (or multiple performers at the same time) and see their differences
- Historical stat tracking across all existing snapshots. As long as your snapshots exist, the metric dashboard can visualize it.
- Features Ascension snapshot selection allowing you to view your records at a point in time.


</details>

## Additional Animations & Misc

- Lots of visual animations have been prodded to the cards on mobile and desktop to give the app a more put together look. Users can expect to see Tier change notifications, and other improved UI elements on both mobile and desktop.

---

## System Tasks

Ascension introduces tasks for users to protect their databases. Users can prime, snapshot, reset, and restore their databases at the click of a button. This allows users to test beta builds or even the production build with no long term impact on their stash database and without having to backup the stash database as a whole.

<details>

- Prime Performer Ratings
	- Randomly assigns all performers a rating between 1 (F-Tier) up to 40 (C-Tier) honoring correct distribution.

- Wipe Performer Match History
	- Deletes all Performer Ascension history from custom fields.
	
- Reset All Performer Ratings
	- Resets all Performer ratings to 0.

- Wipe Scene Match History
	- Deletes all Scene Ascension history from custom fields.
	
- Reset All Scene Ratings
	- Resets all Scene ratings to 0.

- Snapshot
	- Writes all performer ratings, match history, and ledger to a json file. 
	- Example: ``` '[[Date]-[Time]] - Ascension Database Snapshot.json'```
	
- Import Ascension Snapshot
	- Looks for for most recent snapshot and restores database.

</details>

---

## Beta Testing

Ascension allows users to test multiple iterations of the plugin before official release to test new features. This behavior ships with plugin install requiring no extra work and users can freely switch back and forth between builds though it is always recommended to snapshot your database before doing so.

# Frequently Asked Questions

<details>
  <summary>Click to expand</summary>

### Should I start over or keep my ratings?

There are 3 categorized database types

**Unprimed**
- Your ratings start from 0, you have no match history or ratings.

**Sub-primed**
- You have ratings or match history from a previous version of hot or not, Ascension, or elsewhere

**Primed**
- Your database started from unprimed and is now fully fleshed out across tiers.

If starting with a sub-primed DB, you could benefit skipping the F tier grind if you delete your performer match history however it is important to consider that your tiers may be lobsided or inflated and could possibly put some performers at a disadvantage over time due to k-factor scaling. If you keep your match history, then performers with a k-factor of 16 will have less of an advantage than those closer to 32.

You can use the Primer task to jump start your database if you do not want to start from 0.  The system does in fact accounts for this however and it'll naturally balance out over time should the user choose to forgo priming.

### How long will it take before my performers are all out of F tier?

If you started from 0 it can take a quite a bit of time before your performers fill the other tiers on a reasonable bell curve. This is by design. A healthy tier system is going to filter more and more performers as they hit tier walls and bounce back to where they need to be. The scoring is meant to make your selections meaningful. Depending on your performer count, this could take a while.

However, there are accelerators that can help your performers climb. For example the cross tier match up will pair performers from higher tiers at a % chance. If they win, the score will generously award. This begins to domino and grow exponentially as more and more performers pass the rating wall. You will start to see your database accelerate as your S and A tiers break out. 

Another option is to use the other modes. Placement mode and Champion mode with performers at least in C in D tier can help accelerate getting performers out of F tier.

### Why S-Tier is hard to climb?

This is by design. S-Tiers are meant to be S-Tiers and their matches are meant to reflect that. They cannot battle anyone below A tier and face a significant point reduction at their level. If an S tier is in fact an S-Tier this really shouldn't be an issue.

### Where do I access the Performer Statistics or Metric Dashboard?

Both options exist in the sidebar selector.

### Why do I see unrated performers so much?

Keep in mind when your database starts from 0 unrated performers take overwhelming priority to give everyone a fair baseline and match count. Over time once your habits of play and scheduling kick in and you've got a baseline. Things will start shaking up.

### Why am I not seeing performers that graduated ranks?

If your performers have just graduated they probably have a low weight. Higher weights will always trump lower weights as you play. Over time, their weights recharge towards 1.0. 

### Why am I not seeing enough of X tier?

It takes time for your tiers to fill out enough to where the matchmaking can satisfy the requirement, you also have to consider whether weight is counting against the performers well. The database will scale over time with your input. You will see more and more cross tier matches, more and more different tier matches, and more and more competitive matches.

### How to I backup and restore my database?

Use the snapshot task in your plugin tasks menu. It will create a json file in your Ascension plugin folder with a date. When running the import, it will look for the most recently created snapshot and import automatically.

### How can I check the system is working correctly?

The browser console menu features an extremely robust logging system for debug. Users can use this to further gauge if matchmaking is working as intended. You can also use the Event log to spot abnormalities.

### How do i fix this error in scene mode? Error: GraphQL Error: Cannot query field “custom_fields” on type “Scene”.

Update to the latest version in stash as it added the custom fields value to scenes.

### How do I start over?

Go to Settings -> Tasks -> Scroll down to the Ascension plugin tasks. From here you can wipe match history and ratings.

### How can I support development?

Number 1 I will NEVER and certainly have 0 plans to paywall any of my work or contributions to the plugins I have touched nor will I ever. However, I spend a significant amount of my time trying to perfect these different plugins for you guys while I try to survive in the world. Selflessly. I have a [buy me a coffee](https://buymeacoffee.com/sakotobot?status=1) link where you can send me a few pennies for my time if you'd like to help. Its certainly not a requirement, but it does help.
</details>

---

## [Release Notes](https://github.com/Servbot91/Sakotos-Stash-Repo/releases)

## Installation
1. Settings → Plugins → Available Plugins
2. Add Source → Name: Sakoto's Stash Repo
3. Source URL: https://raw.githubusercontent.com/Servbot91/Sakotos-Stash-Repo/refs/heads/main/plugins/manifest.yml
4. Click checkbox, Install
5. Reload Plugins

---
