# DiceR
DiceR(oll) is an exhaustive persistent stash entity randomizer that provides much better results than the built in stash randomization. It features extensive entity context, localstorage, performance, and comprehensive logging. DiceR provides alot of improvements over the other random plugins utilizing features such as localstorage which will cache your seen items and continue with the DiceR list until exhaustion with performance in mind on both mobile and desktop. It also features complex checks in case content has been added and will include newly added content in the randomization while protecting your already 'seen' list. Each entity scenes, images, galleries, tags etc all carry their own DiceR persistent list when rolled.

## Features
1. **Random Item Selection:** 
    - DiceR fetches all IDs of the current entity type via GraphQL query. It'll then randomly sort and select
    - Entity handling with their own lists
    - DiceR tracks which items have already been shown from the shuffled list thus preventing repeat selections
    - Optimized performance and content handling for both mobile and desktop. Shuffling and verifying millions of items takes milliseconds

2. **Better Randomization**
    - Shuffles the IDs and selects the next random ID. Supercedes any graphql sort bias when calling randomGlobal()
    - Uses localStorage to store shuffled ID lists and remaining IDs to prevent showing same content session to session.
    - Once all items have been shown, the list reshuffles automatically
    - Works globally (all Scenes, performers, etc.)
  
3. **New Content Handling**
    - It compares the freshly fetched list (`currentIds`) with the stored cache (`stored.allIds`) using `arraysEqual()`. **If the IDs have changed** (i.e., new content has been added or some items removed) the cache will update to include the new items.

4. **Logging**
    - You can verify the state of your local cached list via the F12 browser console menu. All functions are fully logged and color coded to assist with debug.
