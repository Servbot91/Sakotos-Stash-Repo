import sys
import json
import requests

def call_graphql(url, query, variables=None, cookies=None):
    headers = {"Content-Type": "application/json"}
    payload = {"query": query, "variables": variables}
    try:
        response = requests.post(url, json=payload, headers=headers, cookies=cookies, timeout=20)
        return response.json()
    except Exception as e:
        print(f"[ERROR] Request failed: {e}", file=sys.stderr)
        return None

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            return
        input_data = json.loads(raw_input)
        
        args = input_data.get("args", {})
        task_action = args.get("task")
        
        conn = input_data.get("server_connection", {})
        host = conn.get('Host', 'localhost')
        STASH_URL = f"{conn.get('Scheme')}://{host}:{conn.get('Port')}/graphql"
        
        session = conn.get("SessionCookie", {})
        cookies = {session.get("Name"): session.get("Value")}
    except Exception as e:
        print(f"[ERROR] Failed parsing input: {e}", file=sys.stderr)
        return

    # Step 1: Fetch all performer IDs
    find_query = "{ findPerformers(filter: { per_page: -1 }) { performers { id } } }"
    result = call_graphql(STASH_URL, find_query, cookies=cookies)

    if not result or "data" not in result:
        print("[ERROR] Could not fetch performers.", file=sys.stderr)
        return

    performers = result["data"]["findPerformers"]["performers"]
    total = len(performers)
    success_count = 0

    # Step 2: Set the mutation based on the 'task' argument
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
    
    else:
        print(f"[ERROR] Unknown task action: {task_action}", file=sys.stderr)
        return

    # Step 3: Execute the chosen mutation
    for idx, p in enumerate(performers):
        pid = p["id"]
        res = call_graphql(STASH_URL, mutation, {"id": pid}, cookies=cookies)
        
        # Check for GraphQL errors to help debug if rating100 is still grumpy
        if res and "errors" in res:
            print(f"[DEBUG] GraphQL Error on ID {pid}: {res['errors']}", file=sys.stderr)
        elif res and "data" in res:
            success_count += 1
        
        if (idx + 1) % 50 == 0:
            print(f"[INFO] {display_name}: Processed {idx + 1}/{total}...", file=sys.stdout)

    # Final output sent back to the Stash UI
    print(json.dumps({
        "output": f"Successfully {action_desc} for {success_count} performers."
    }))

if __name__ == "__main__":
    main()