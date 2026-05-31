# DiceR
DiceR(oll) is an improvement on the original [Stash](https://stashapp.cc/) plugin [random button](https://discourse.stashapp.cc/t/randombutton/1809) written by MrDocSabio. It features better entity context, localstorage, performance, and better logging. DiceR provides alot of improvements over the original random plugin such as localstoage which will cache your seen items and continue with the DiceR list until exhaustion. It also features checks in case content has been added and will include that content in the shuffle while protecting your already 'seen' list. Each entity scenes, images, galleries, tags etc all carry their own DiceR list when rolled.

## Features
1. **Random Item Selection:** 
    - DiceR fetches all IDs of the current entity type via GraphQL query. It'll then randomly sort and select
    - Entity handling with their own lists
    - DiceR tracks which items have already been shown from the shuffled list thus preventing repeat selections
    - Optimized performance and content handling due to new logic. Shuffling and verifying millions of items takes milliseconds

  
2. **Better Randomization**
    - Shuffles the IDs and selects the next random ID. Supercedes any sort bias when calling randomGlobal()
    - Uses localStorage to store shuffled ID lists and remaining IDs. A major improvement over the original which would inevitably show the same content session to session.
    - Once all items have been shown, the list reshuffles automatically
    - Works globally (all Scenes, performers, etc.)
  
3. **New Content Handling**
    - It compares the freshly fetched list (`currentIds`) with the stored cache (`stored.allIds`) using `arraysEqual()`. **If the IDs have changed** (i.e., new content has been added or some items removed) the cache will update to include the new items.

4. **Logging**
    - You can verify the state of your local cached list via the F12 browser console menu. All functions are fully logged and color coded to assist with debug.

### Original Credit
[random button](https://discourse.stashapp.cc/t/randombutton/1809) written by MrDocSabio. 
