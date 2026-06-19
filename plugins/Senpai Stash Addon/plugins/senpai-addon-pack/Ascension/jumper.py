import sys
import json
import requests
import os
import re
from datetime import datetime

try:
    import stashapi.log as log
    from stashapi.stashapp import StashInterface
    STASHAPI_AVAILABLE = True
except ImportError:
    # Fallback to basic logging if stashapi is not available
    import logging
    logging.basicConfig(level=logging.INFO)
    log = logging
    STASHAPI_AVAILABLE = False

def call_graphql(url, query, variables=None, cookies=None):
    headers = {"Content-Type": "application/json"}
    payload = {"query": query, "variables": variables}
    try:
        response = requests.post(url, json=payload, headers=headers, cookies=cookies, timeout=20)
        return response.json()
    except Exception as e:
        error_msg = f"[ERROR] Request failed: {e}"
        if STASHAPI_AVAILABLE:
            log.error(error_msg)
        else:
            print(error_msg, file=sys.stderr)
        return None

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            error_msg = json.dumps({"error": "No input received"})
            if STASHAPI_AVAILABLE:
                log.error("No input received")
            else:
                print(error_msg, file=sys.stderr)
            return
        input_data = json.loads(raw_input)
        
        args = input_data.get("args", {})
        task_action = args.get("task")
        
        conn = input_data.get("server_connection", {})
        host = conn.get('Host', 'localhost')
        if host == "0.0.0.0":
            host = "127.0.0.1"
        STASH_URL = f"{conn.get('Scheme')}://{host}:{conn.get('Port')}/graphql"
        
        session = conn.get("SessionCookie", {})
        cookies = {session.get("Name"): session.get("Value")}
        
        if STASHAPI_AVAILABLE:
            stash = StashInterface(conn)
            log.info(f"Connected to Stash at {STASH_URL}")
    except Exception as e:
        error_msg = f"[ERROR] Failed parsing input: {e}"
        if STASHAPI_AVAILABLE:
            log.error(error_msg)
        else:
            print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return

    # Step 1: Fetch all performer IDs
    if STASHAPI_AVAILABLE:
        log.info("Fetching all performers...")
    find_query = "{ findPerformers(filter: { per_page: -1 }) { performers { id } } }"
    result = call_graphql(STASH_URL, find_query, cookies=cookies)

    if not result or "data" not in result or not result["data"]:
        error_msg = "[ERROR] Could not fetch performers."
        if STASHAPI_AVAILABLE:
            log.error(error_msg)
        else:
            print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return
        
    if "findPerformers" not in result["data"] or not result["data"]["findPerformers"]:
        error_msg = "[ERROR] No performers found in response."
        if STASHAPI_AVAILABLE:
            log.error(error_msg)
        else:
            print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return

    performers = result["data"]["findPerformers"]["performers"]
    total = len(performers)
    success_count = 0
    variables_template = {}
    
    if STASHAPI_AVAILABLE:
        log.info(f"Found {total} performers")

    # Step 2: Determine Logic based on task
    if task_action == "wipe":
        mutation = """
        mutation DeleteFields($id: ID!) {
          performerUpdate(input: {
            id: $id,
            custom_fields: { remove: ["hotornot_stats", "performer_record"] }
          }) { id }
        }
        """
        action_desc = "deleted custom field history"
        display_name = "Wipe History"
        if STASHAPI_AVAILABLE:
            log.info("Starting wipe task...")

    elif task_action == "reset":
        mutation = """
        mutation ResetRatings($id: ID!) {
          performerUpdate(input: {
            id: $id,
            rating100: null
          }) { id }
        }
        """
        action_desc = "reset ratings to null"
        display_name = "Reset Ratings"
        if STASHAPI_AVAILABLE:
            log.info("Starting reset task...")

    elif task_action == "prime":
        mutation = """
        mutation SetRating($id: ID!, $rating: Int!) {
          performerUpdate(input: {
            id: $id,
            rating100: $rating
          }) { id }
        }
        """
        action_desc = "assigned random tier-based ratings"
        display_name = "Prime"

        performers_list = performers
        total = len(performers_list)

        import random

        # Define desired distribution percentages (can be adjusted)
        tier_percentages = {
            'F': 70,   # 70% of performers rated F (lowest)
            'D': 25,   # 25% rated D
            'C': 5     # 5% rated C (highest)
        }

        num_f = int(total * tier_percentages['F'] / 100)
        num_d = int(total * tier_percentages['D'] / 100)
        num_c = total - num_f - num_d  # remaining goes to C

        # Generate ratings according to defined tiers
        ratings_pool = []

        ratings_pool.extend([random.randint(1, 9)] * num_f)       # F tier: 1–9
        ratings_pool.extend([random.randint(25, 39)] * num_d)     # D tier: 25–39
        ratings_pool.extend([40] * num_c)                         # C tier: always 40

        random.shuffle(ratings_pool)

        if STASHAPI_AVAILABLE:
            log.info(f"Generated ratings pool. F: {num_f}, D: {num_d}, C: {num_c}")
            log.info("Starting prime task...")

        # Apply ratings to performers
        for idx, p in enumerate(performers_list):
            pid = p["id"]
            rating = ratings_pool[idx]
            request_vars = {"id": pid, "rating": rating}

            res = call_graphql(STASH_URL, mutation, request_vars, cookies=cookies)
            if res and "errors" in res:
                error_detail = f"[DEBUG] GraphQL Error on ID {pid}: {res['errors']}"
                if STASHAPI_AVAILABLE:
                    log.debug(error_detail)
                else:
                    print(error_detail, file=sys.stderr)
            elif res and "data" in res:
                success_count += 1

            if (idx + 1) % 50 == 0:
                progress_msg = f"[INFO] {display_name}: Processed {idx + 1}/{total}..."
                if STASHAPI_AVAILABLE:
                    log.info(progress_msg)
                else:
                    print(progress_msg, file=sys.stdout)

    elif task_action == "snapshotexport":
        if STASHAPI_AVAILABLE:
            log.info("Starting snapshot export task...")
            
        # Fetch detailed performer info including additional fields and scenes
        detailed_performer_query = """
        query GetAllPerformersDetails {
          findPerformers(filter: { per_page: -1 }) {
            performers {
              id
              name
              gender
              birthdate
              country
              height_cm
              rating100
              custom_fields
              image_path
              scenes {
                id
              }
            }
          }
        }
        """
        
        if STASHAPI_AVAILABLE:
            log.debug("Fetching performer details...")
        result = call_graphql(STASH_URL, detailed_performer_query, cookies=cookies)
        if not result:
            error_msg = "[ERROR] Failed to get response from GraphQL query."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "errors" in result:
            error_msg = f"[ERROR] GraphQL query returned errors: {result['errors']}"
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "data" not in result or not result["data"]:
            error_msg = "[ERROR] No data returned from GraphQL query."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "findPerformers" not in result["data"] or not result["data"]["findPerformers"]:
            error_msg = "[ERROR] No performers found in GraphQL response."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        performers_details = result["data"]["findPerformers"]["performers"]
        if STASHAPI_AVAILABLE:
            log.info(f"Fetched details for {len(performers_details)} performers")
        
        # Fetch scene ratings
        scene_query = """
        query GetAllScenes {
          findScenes(filter: { per_page: -1 }) {
            scenes {
              id
              rating100
            }
          }
        }
        """
        
        if STASHAPI_AVAILABLE:
            log.debug("Fetching scene ratings...")
        scene_result = call_graphql(STASH_URL, scene_query, cookies=cookies)
        if not scene_result:
            error_msg = "[ERROR] Failed to get response from scene GraphQL query."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "errors" in scene_result:
            error_msg = f"[ERROR] Scene GraphQL query returned errors: {scene_result['errors']}"
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "data" not in scene_result or not scene_result["data"]:
            error_msg = "[ERROR] No scene data returned from GraphQL query."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "findScenes" not in scene_result["data"] or not scene_result["data"]["findScenes"]:
            error_msg = "[ERROR] No scenes found in GraphQL response."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        scenes_details = scene_result["data"]["findScenes"]["scenes"]
        if STASHAPI_AVAILABLE:
            log.info(f"Fetched ratings for {len(scenes_details)} scenes")
        
        # Get the directory where this script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Create snapshots directory if it doesn't exist
        snapshots_dir = os.path.join(script_dir, "snapshots")
        if not os.path.exists(snapshots_dir):
            os.makedirs(snapshots_dir)
            if STASHAPI_AVAILABLE:
                log.info(f"Created snapshots directory: {snapshots_dir}")
        
        # Create filename with timestamp in the snapshots directory
        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        output_file = os.path.join(snapshots_dir, f"[{timestamp}] - Ascension Database Snapshot.json")
        
        try:
            # Create export data structure
            export_data = {
                "performers": [],
                "scenes": []
            }
            
            for performer in performers_details:
                # Extract scene IDs for this performer
                scene_ids = [scene["id"] for scene in performer.get("scenes", [])]
                
                export_data["performers"].append({
                    "name": performer.get("name", "Unknown"),
                    "ID": performer.get("id"),
                    "gender": performer.get("gender"),
                    "birthday": performer.get("birthdate"),
                    "country": performer.get("country"),
                    "height": performer.get("height_cm"),
                    "rating": performer.get("rating100"),
                    "stats": performer.get("custom_fields", {}).get("hotornot_stats"),
                    "record": performer.get("custom_fields", {}).get("performer_record"),
                    "image_path": performer.get("image_path"),
                    "scenes": scene_ids  # Added scene IDs for this performer
                })
                
            for scene in scenes_details:
                export_data["scenes"].append({
                    "id": scene.get("id"),
                    "rating": scene.get("rating100")
                })
            
            # Write to JSON file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, default=str)
            
            action_desc = f"exported ratings snapshot to {output_file}"
            display_name = "Snapshot Export"
            success_count = len(performers_details)
            
            if STASHAPI_AVAILABLE:
                log.info(f"Exported {len(performers_details)} performers and {len(scenes_details)} scenes")
                log.info(f"Snapshot saved to: {output_file}")
            
        except Exception as e:
            error_msg = f"[ERROR] Failed to write snapshot file: {e}"
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

    elif task_action == "snapshotimport":
        if STASHAPI_AVAILABLE:
            log.info("Starting snapshot import task...")
            
        # Get the directory where this script is located and snapshots folder
        script_dir = os.path.dirname(os.path.abspath(__file__))
        snapshots_dir = os.path.join(script_dir, "snapshots")
        
        # Check if snapshots directory exists
        if not os.path.exists(snapshots_dir):
            error_msg = "[ERROR] Snapshots directory not found."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
        
        # Look for files matching the pattern in snapshots directory
        snapshot_files = []
        for filename in os.listdir(snapshots_dir):
            if filename.endswith(" - Ascension Database Snapshot.json"):
                # Extract timestamp from filename
                match = re.match(r'\[(\d{4}-\d{2}-\d{2}-\d{6})\]', filename)
                if match:
                    timestamp_str = match.group(1)
                    try:
                        timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d-%H%M%S")
                        snapshot_files.append((timestamp, filename))
                    except ValueError:
                        continue
        
        if not snapshot_files:
            error_msg = "[ERROR] No snapshot files found in snapshots directory."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        # Sort by timestamp (newest first) and get the most recent
        snapshot_files.sort(key=lambda x: x[0], reverse=True)
        most_recent_file = os.path.join(snapshots_dir, snapshot_files[0][1])
        
        if STASHAPI_AVAILABLE:
            log.info(f"Using snapshot file: {most_recent_file}")
        
        try:
            # Read the JSON file
            with open(most_recent_file, 'r', encoding='utf-8') as f:
                snapshot_data = json.load(f)
            
            # Get all performers with their names to match
            detailed_query = """
            query GetAllPerformersForImport {
              findPerformers(filter: { per_page: -1 }) {
                performers {
                  id
                  name
                }
              }
            }
            """
            
            if STASHAPI_AVAILABLE:
                log.debug("Fetching performer names for import...")
            result = call_graphql(STASH_URL, detailed_query, cookies=cookies)
            if not result or "data" not in result or not result["data"]:
                error_msg = "[ERROR] Could not fetch performer names for import."
                if STASHAPI_AVAILABLE:
                    log.error(error_msg)
                else:
                    print(error_msg, file=sys.stderr)
                print(json.dumps({"error": error_msg}))
                return
                
            if "findPerformers" not in result["data"] or not result["data"]["findPerformers"]:
                error_msg = "[ERROR] No performers found for import."
                if STASHAPI_AVAILABLE:
                    log.error(error_msg)
                else:
                    print(error_msg, file=sys.stderr)
                print(json.dumps({"error": error_msg}))
                return
                
            all_performers = result["data"]["findPerformers"]["performers"]
            
            # Create a mapping of performer names to IDs
            performer_name_map = {p["name"].lower(): p["id"] for p in all_performers}
            
            # Import mutations - using partial custom fields approach
            rating_mutation = """
            mutation ImportPerformerRating($id: ID!, $rating: Int) {
              performerUpdate(input: {
                id: $id,
                rating100: $rating
              }) { id }
            }
            """
            
            custom_fields_mutation = """
            mutation ImportPerformerCustomFields($id: ID!, $custom_fields: CustomFieldsInput!) {
              performerUpdate(input: {
                id: $id,
                custom_fields: $custom_fields
              }) { id }
            }
            """
            
            scene_rating_mutation = """
            mutation ImportSceneRating($id: ID!, $rating: Int) {
              sceneUpdate(input: {
                id: $id,
                rating100: $rating
              }) { id }
            }
            """
            
            imported_count = 0
            
            # Import performer data
            performers_data = snapshot_data.get("performers", [])
            if STASHAPI_AVAILABLE:
                log.info(f"Importing {len(performers_data)} performers...")
                
            for performer_data in performers_data:
                performer_name = performer_data["name"]
                performer_id = performer_name_map.get(performer_name.lower())
                
                if performer_id:
                    # Update rating if available
                    if performer_data["rating"] is not None:
                        rating_variables = {
                            "id": performer_id,
                            "rating": performer_data["rating"]
                        }
                        
                        res = call_graphql(STASH_URL, rating_mutation, rating_variables, cookies=cookies)
                        
                        if res and "errors" in res:
                            error_detail = f"[DEBUG] GraphQL Error importing rating for {performer_name}: {res['errors']}"
                            if STASHAPI_AVAILABLE:
                                log.debug(error_detail)
                            else:
                                print(error_detail, file=sys.stderr)
                        elif res and "data" in res:
                            # Successfully updated rating
                            pass
                    
                    # Update custom fields if available
                    custom_fields_data = {}
                    if performer_data["stats"] is not None:
                        custom_fields_data["hotornot_stats"] = performer_data["stats"]
                    if performer_data["record"] is not None:
                        custom_fields_data["performer_record"] = performer_data["record"]
                    
                    if custom_fields_data:
                        custom_fields_variables = {
                            "id": performer_id,
                            "custom_fields": {
                                "partial": custom_fields_data
                            }
                        }
                        
                        res = call_graphql(STASH_URL, custom_fields_mutation, custom_fields_variables, cookies=cookies)
                        
                        if res and "errors" in res:
                            error_detail = f"[DEBUG] GraphQL Error importing custom fields for {performer_name}: {res['errors']}"
                            if STASHAPI_AVAILABLE:
                                log.debug(error_detail)
                            else:
                                print(error_detail, file=sys.stderr)
                        elif res and "data" in res:
                            imported_count += 1
                    
                    if (imported_count + 1) % 50 == 0:
                        progress_msg = f"[INFO] Snapshot Import: Processed {imported_count + 1} performers..."
                        if STASHAPI_AVAILABLE:
                            log.info(progress_msg)
                        else:
                            print(progress_msg, file=sys.stdout)
                else:
                    warning_msg = f"[DEBUG] Warning: Performer '{performer_name}' not found in database"
                    if STASHAPI_AVAILABLE:
                        log.debug(warning_msg)
                    else:
                        print(warning_msg, file=sys.stderr)
            
            # Import scene ratings
            scenes_data = snapshot_data.get("scenes", [])
            scene_imported_count = 0
            if STASHAPI_AVAILABLE:
                log.info(f"Importing {len(scenes_data)} scenes...")
                
            for scene_data in scenes_data:
                scene_id = scene_data["id"]
                scene_rating = scene_data["rating"]
                
                if scene_rating is not None:
                    scene_rating_variables = {
                        "id": scene_id,
                        "rating": scene_rating
                    }
                    
                    res = call_graphql(STASH_URL, scene_rating_mutation, scene_rating_variables, cookies=cookies)
                    
                    if res and "errors" in res:
                        error_detail = f"[DEBUG] GraphQL Error importing rating for scene {scene_id}: {res['errors']}"
                        if STASHAPI_AVAILABLE:
                            log.debug(error_detail)
                        else:
                            print(error_detail, file=sys.stderr)
                    elif res and "data" in res:
                        scene_imported_count += 1
                    # Added missing else case to handle successful import without logging
                    else:
                        scene_imported_count += 1
                
                if (scene_imported_count + 1) % 50 == 0:
                    progress_msg = f"[INFO] Snapshot Import: Processed {scene_imported_count + 1} scenes..."
                    if STASHAPI_AVAILABLE:
                        log.info(progress_msg)
                    else:
                        print(progress_msg, file=sys.stdout)
            
            action_desc = f"imported snapshot from {snapshot_files[0][1]} for {imported_count} performers and {scene_imported_count} scenes"
            display_name = "Snapshot Import"
            success_count = imported_count
            
            if STASHAPI_AVAILABLE:
                log.info(f"Import complete: {imported_count} performers, {scene_imported_count} scenes")
            
        except Exception as e:
            error_msg = f"[ERROR] Failed to import snapshot: {e}"
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

    else:
        error_msg = f"[ERROR] Unknown task action: {task_action}"
        if STASHAPI_AVAILABLE:
            log.error(error_msg)
        else:
            print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return

    # Step 3: Execute (only for tasks that need mutation execution)
    if task_action not in ["snapshotexport", "snapshotimport"]:  # Skip execution for export/import
        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
        for idx, p in enumerate(performers):
            pid = p["id"]
            
            # Merge ID with any task-specific variables (like rating)
            request_vars = {"id": pid, **variables_template}
            
            res = call_graphql(STASH_URL, mutation, request_vars, cookies=cookies)
            
            if res and "errors" in res:
                error_detail = f"[DEBUG] GraphQL Error on ID {pid}: {res['errors']}"
                if STASHAPI_AVAILABLE:
                    log.debug(error_detail)
                else:
                    print(error_detail, file=sys.stderr)
            elif res and "data" in res:
                success_count += 1
            
            if (idx + 1) % 50 == 0:
                progress_msg = f"[INFO] {display_name}: Processed {idx + 1}/{total}..."
                if STASHAPI_AVAILABLE:
                    log.info(progress_msg)
                else:
                    print(progress_msg, file=sys.stdout)

    # Final output back to Stash
    output_msg = f"Successfully {action_desc} for {success_count} performers."
    if STASHAPI_AVAILABLE:
        log.info(output_msg)
    print(json.dumps({
        "output": output_msg
    }))

if __name__ == "__main__":
    main()
