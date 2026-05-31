import sys
import json
import requests
import os
import re
from datetime import datetime

def call_graphql(url, query, variables=None, cookies=None):
    headers = {"Content-Type": "application/json"}
    payload = {"query": query, "variables": variables}
    try:
        response = requests.post(url, json=payload, headers=headers, cookies=cookies, timeout=20)
        return response.json()
    except Exception as e:
        error_msg = f"[ERROR] Request failed: {e}"
        print(error_msg, file=sys.stderr)
        return None

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({"error": "No input received"}))
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
    except Exception as e:
        error_msg = f"[ERROR] Failed parsing input: {e}"
        print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return

    # Step 1: Fetch all performer IDs
    find_query = "{ findPerformers(filter: { per_page: -1 }) { performers { id } } }"
    result = call_graphql(STASH_URL, find_query, cookies=cookies)

    if not result or "data" not in result or not result["data"]:
        error_msg = "[ERROR] Could not fetch performers."
        print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return
        
    if "findPerformers" not in result["data"] or not result["data"]["findPerformers"]:
        error_msg = "[ERROR] No performers found in response."
        print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return

    performers = result["data"]["findPerformers"]["performers"]
    total = len(performers)
    success_count = 0
    variables_template = {}

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

        # Apply ratings to performers
        for idx, p in enumerate(performers_list):
            pid = p["id"]
            rating = ratings_pool[idx]
            request_vars = {"id": pid, "rating": rating}

            res = call_graphql(STASH_URL, mutation, request_vars, cookies=cookies)
            if res and "errors" in res:
                error_detail = f"[DEBUG] GraphQL Error on ID {pid}: {res['errors']}"
                print(error_detail, file=sys.stderr)
            elif res and "data" in res:
                success_count += 1

            if (idx + 1) % 50 == 0:
                progress_msg = f"[INFO] {display_name}: Processed {idx + 1}/{total}..."
                print(progress_msg, file=sys.stdout)

    elif task_action == "snapshotexport":
        # Fetch detailed performer info including name, rating, and custom fields
        detailed_query = """
        query GetAllPerformersDetails {
          findPerformers(filter: { per_page: -1 }) {
            performers {
              id
              name
              rating100
              custom_fields
            }
          }
        }
        """
        
        result = call_graphql(STASH_URL, detailed_query, cookies=cookies)
        if not result:
            error_msg = "[ERROR] Failed to get response from GraphQL query."
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "errors" in result:
            error_msg = f"[ERROR] GraphQL query returned errors: {result['errors']}"
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "data" not in result or not result["data"]:
            error_msg = "[ERROR] No data returned from GraphQL query."
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        if "findPerformers" not in result["data"] or not result["data"]["findPerformers"]:
            error_msg = "[ERROR] No performers found in GraphQL response."
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        performers_details = result["data"]["findPerformers"]["performers"]
        
        # Get the directory where this script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Create filename with timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        output_file = os.path.join(script_dir, f"[{timestamp}] - Ascension Database Snapshot.json")
        
        try:
            # Create export data structure
            export_data = []
            for performer in performers_details:
                export_data.append({
                    "name": performer.get("name", "Unknown"),
                    "rating": performer.get("rating100"),
                    "stats": performer.get("custom_fields", {}).get("hotornot_stats"),
                    "record": performer.get("custom_fields", {}).get("performer_record")
                })
            
            # Write to JSON file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, default=str)
            
            action_desc = f"exported ratings snapshot to {output_file}"
            display_name = "Snapshot Export"
            success_count = len(performers_details)
            
        except Exception as e:
            error_msg = f"[ERROR] Failed to write snapshot file: {e}"
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

    elif task_action == "snapshotimport":
        # Find the most recent snapshot file
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Look for files matching the pattern
        snapshot_files = []
        for filename in os.listdir(script_dir):
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
            error_msg = "[ERROR] No snapshot files found."
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return
            
        # Sort by timestamp (newest first) and get the most recent
        snapshot_files.sort(key=lambda x: x[0], reverse=True)
        most_recent_file = os.path.join(script_dir, snapshot_files[0][1])
        
        try:
            # Read the JSON file
            with open(most_recent_file, 'r', encoding='utf-8') as f:
                performers_data = json.load(f)
            
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
            
            result = call_graphql(STASH_URL, detailed_query, cookies=cookies)
            if not result or "data" not in result or not result["data"]:
                error_msg = "[ERROR] Could not fetch performer names for import."
                print(error_msg, file=sys.stderr)
                print(json.dumps({"error": error_msg}))
                return
                
            if "findPerformers" not in result["data"] or not result["data"]["findPerformers"]:
                error_msg = "[ERROR] No performers found for import."
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
            
            imported_count = 0
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
                            print(error_detail, file=sys.stderr)
                    
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
                            print(error_detail, file=sys.stderr)
                        elif res and "data" in res:
                            imported_count += 1
                    
                    if (imported_count + 1) % 50 == 0:
                        progress_msg = f"[INFO] Snapshot Import: Processed {imported_count + 1} performers..."
                        print(progress_msg, file=sys.stdout)
                else:
                    warning_msg = f"[DEBUG] Warning: Performer '{performer_name}' not found in database"
                    print(warning_msg, file=sys.stderr)
            
            action_desc = f"imported snapshot from {snapshot_files[0][1]} for {imported_count} performers"
            display_name = "Snapshot Import"
            success_count = imported_count
            
        except Exception as e:
            error_msg = f"[ERROR] Failed to import snapshot: {e}"
            print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

    else:
        error_msg = f"[ERROR] Unknown task action: {task_action}"
        print(error_msg, file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        return

    # Step 3: Execute (only for tasks that need mutation execution)
    if task_action not in ["snapshotexport", "snapshotimport"]:  # Skip execution for export/import
        for idx, p in enumerate(performers):
            pid = p["id"]
            
            # Merge ID with any task-specific variables (like rating)
            request_vars = {"id": pid, **variables_template}
            
            res = call_graphql(STASH_URL, mutation, request_vars, cookies=cookies)
            
            if res and "errors" in res:
                error_detail = f"[DEBUG] GraphQL Error on ID {pid}: {res['errors']}"
                print(error_detail, file=sys.stderr)
            elif res and "data" in res:
                success_count += 1
            
            if (idx + 1) % 50 == 0:
                progress_msg = f"[INFO] {display_name}: Processed {idx + 1}/{total}..."
                print(progress_msg, file=sys.stdout)

    # Final output back to Stash
    output_msg = f"Successfully {action_desc} for {success_count} performers."
    print(json.dumps({
        "output": output_msg
    }))

if __name__ == "__main__":
    main()
