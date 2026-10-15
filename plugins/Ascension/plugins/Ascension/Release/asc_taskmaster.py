import sys
import json
import requests
import os
import re
import math
import random
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

try:
    import stashapi.log as log
    from stashapi.stashapp import StashInterface
    STASHAPI_AVAILABLE = True
except ImportError:
    import logging
    logging.basicConfig(level=logging.INFO)
    log = logging
    STASHAPI_AVAILABLE = False

def call_graphql(url, query, variables=None, cookies=None):
    headers = {"Content-Type": "application/json"}
    payload = {"query": query, "variables": variables}
    try:
        response = requests.post(url, json=payload, headers=headers, cookies=cookies, timeout=60)
        return response.json()
    except Exception as e:
        error_msg = f"[ERROR] Request failed: {e}"
        if STASHAPI_AVAILABLE:
            log.error(error_msg)
        else:
            print(error_msg, file=sys.stderr)
        return None

def report_progress(current, total, message=""):
    if not STASHAPI_AVAILABLE or total <= 0:
        return
    pct = min(1.0, max(0.0, current / total))
    progress_msg = f"{message} ({current}/{total}, {pct*100:.1f}%)"
    log.info(progress_msg)
    log.progress(pct)

def build_simple_batch_mutation(batch, mutation_name, field_name, var_name, var_type):
    aliases = []
    var_decls = []
    variables = {}
    for i, item in enumerate(batch):
        aliases.append(
            f"u{i}: {mutation_name}(input: {{ id: $id{i}, {field_name}: ${var_name}{i} }}) {{ id }}"
        )
        var_decls.append(f"$id{i}: ID!")
        var_decls.append(f"${var_name}{i}: {var_type}")
        variables[f"id{i}"] = item["id"]
        variables[f"{var_name}{i}"] = item["value"]

    mutation = (
        "mutation BatchUpdate("
        + ", ".join(var_decls)
        + ") {\n"
        + "\n".join(aliases)
        + "\n}"
    )
    return mutation, variables

def build_remove_fields_batch(batch, mutation_name, fields_to_remove):
    aliases = []
    var_decls = []
    variables = {}
    remove_list_json = json.dumps(fields_to_remove)
    for i, item in enumerate(batch):
        aliases.append(
            f"u{i}: {mutation_name}(input: {{ id: $id{i}, custom_fields: {{ remove: {remove_list_json} }} }}) {{ id }}"
        )
        var_decls.append(f"$id{i}: ID!")
        variables[f"id{i}"] = item["id"]

    mutation = (
        "mutation BatchRemoveFields("
        + ", ".join(var_decls)
        + ") {\n"
        + "\n".join(aliases)
        + "\n}"
    )
    return mutation, variables

def build_partial_fields_batch(batch, mutation_name):
    aliases = []
    var_decls = []
    variables = {}
    for i, item in enumerate(batch):
        aliases.append(
            f"u{i}: {mutation_name}(input: {{ id: $id{i}, custom_fields: {{ partial: $fields{i} }} }}) {{ id }}"
        )
        var_decls.append(f"$id{i}: ID!")
        var_decls.append(f"$fields{i}: Map!")
        variables[f"id{i}"] = item["id"]
        variables[f"fields{i}"] = item["fields"]

    mutation = (
        "mutation BatchPartialFields("
        + ", ".join(var_decls)
        + ") {\n"
        + "\n".join(aliases)
        + "\n}"
    )
    return mutation, variables

def build_combined_update_batch(batch, mutation_name):
    aliases = []
    var_decls = []
    variables = {}
    for i, item in enumerate(batch):
        input_parts = [f"id: $id{i}"]
        var_decls.append(f"$id{i}: ID!")
        variables[f"id{i}"] = item["id"]

        if item.get("value") is not None:
            input_parts.append(f"rating100: $rating{i}")
            var_decls.append(f"$rating{i}: Int")
            variables[f"rating{i}"] = item["value"]

        if item.get("fields"):
            input_parts.append(f"custom_fields: {{ partial: $fields{i} }}")
            var_decls.append(f"$fields{i}: Map!")
            variables[f"fields{i}"] = item["fields"]

        aliases.append(
            f"u{i}: {mutation_name}(input: {{ {', '.join(input_parts)} }}) {{ id }}"
        )

    mutation = (
        "mutation BatchCombinedUpdate("
        + ", ".join(var_decls)
        + ") {\n"
        + "\n".join(aliases)
        + "\n}"
    )
    return mutation, variables

def execute_batches(items, batch_size, builder_fn, build_args, url, cookies, progress_message=""):
    success_count = 0
    total = len(items)
    for start in range(0, total, batch_size):
        batch = items[start:start + batch_size]
        mutation, variables = builder_fn(batch, *build_args)
        res = call_graphql(url, mutation, variables, cookies=cookies)

        if res and "data" in res and res["data"]:
            for i in range(len(batch)):
                alias_key = f"u{i}"
                if res["data"].get(alias_key) and res["data"][alias_key].get("id"):
                    success_count += 1
        elif res and "errors" in res:
            detail = f"[DEBUG] GraphQL batch error at offset {start}: {res['errors']}"
            if STASHAPI_AVAILABLE:
                log.debug(detail)
            else:
                print(detail, file=sys.stderr)

        processed = min(start + batch_size, total)
        if processed % 500 == 0 or processed == total:
            report_progress(processed, total, progress_message)

    return success_count

def execute_batches_concurrent(items, batch_size, max_workers, builder_fn, build_args, url, cookies, progress_message=""):
    total = len(items)
    if total == 0:
        return 0

    success_count = 0
    completed_count = 0
    lock = threading.Lock()

    def process_batch(start):
        nonlocal success_count, completed_count
        batch = items[start:start + batch_size]
        mutation, variables = builder_fn(batch, *build_args)
        res = call_graphql(url, mutation, variables, cookies=cookies)

        local_success = 0
        if res and "data" in res and res["data"]:
            for i in range(len(batch)):
                alias_key = f"u{i}"
                if res["data"].get(alias_key) and res["data"][alias_key].get("id"):
                    local_success += 1
        elif res and "errors" in res:
            detail = f"[DEBUG] GraphQL batch error at offset {start}: {res['errors']}"
            if STASHAPI_AVAILABLE:
                log.debug(detail)
            else:
                print(detail, file=sys.stderr)

        with lock:
            success_count += local_success
            completed_count += len(batch)
            if completed_count % 500 == 0 or completed_count >= total:
                report_progress(completed_count, total, progress_message)

        return local_success

    starts = list(range(0, total, batch_size))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        list(executor.map(process_batch, starts))

    return success_count

def fetch_all_performers(url, cookies, query_name, fields, filter_input=None, page_size=500):
    query = """
    query %s($page: Int!, $per_page: Int!, $filter: PerformerFilterType) {
        findPerformers(filter: { per_page: $per_page, page: $page }, performer_filter: $filter) {
            count
            performers { %s }
        }
    }
    """ % (query_name, fields)

    all_items = []
    estimated_total = None
    page = 1
    while True:
        res = call_graphql(url, query, {"page": page, "per_page": page_size, "filter": filter_input or {}}, cookies=cookies)
        if not res or "data" not in res or not res["data"]:
            break
        count = res["data"]["findPerformers"].get("count")
        if count is not None:
            estimated_total = count
        batch = res["data"]["findPerformers"]["performers"]
        if not batch:
            break
        all_items.extend(batch)
        if estimated_total:
            report_progress(min(len(all_items), estimated_total), estimated_total, "Fetching performers")
        if len(batch) < page_size:
            break
        page += 1
    return all_items

def fetch_all_scenes(url, cookies, query_name, fields, filter_input=None, page_size=500):
    query = """
    query %s($page: Int!, $per_page: Int!, $filter: SceneFilterType) {
        findScenes(filter: { per_page: $per_page, page: $page }, scene_filter: $filter) {
            count
            scenes { %s }
        }
    }
    """ % (query_name, fields)

    all_items = []
    estimated_total = None
    page = 1
    while True:
        res = call_graphql(url, query, {"page": page, "per_page": page_size, "filter": filter_input or {}}, cookies=cookies)
        if not res or "data" not in res or not res["data"]:
            break
        count = res["data"]["findScenes"].get("count")
        if count is not None:
            estimated_total = count
        batch = res["data"]["findScenes"]["scenes"]
        if not batch:
            break
        all_items.extend(batch)
        if estimated_total:
            report_progress(min(len(all_items), estimated_total), estimated_total, "Fetching scenes")
        if len(batch) < page_size:
            break
        page += 1
    return all_items

def merge_unique(query_results_list, key="id"):
    seen = set()
    merged = []
    for result in query_results_list:
        for item in result:
            iid = item.get(key)
            if iid and iid not in seen:
                seen.add(iid)
                merged.append(item)
    return merged

def is_unrated(item):
    r = item.get("rating100")
    return r is None or (isinstance(r, (int, float)) and r <= 1)

def is_rated(item):
    r = item.get("rating100")
    return isinstance(r, (int, float)) and r > 1

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

    WRITE_BATCH_SIZE = 50
    CONCURRENT_WORKERS = 4
    success_count = 0
    action_desc = ""
    display_name = ""

    if task_action == "wipe":
        display_name = "Wipe Performer History"
        action_desc = "deleted performer custom field history"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        performers = fetch_all_performers(
            STASH_URL, cookies, "GetPerformersForWipe",
            "id custom_fields", filter_input=None
        )

        wipe_items = []
        for p in performers:
            cf = p.get("custom_fields") or {}
            if cf.get("hotornot_stats") is not None or cf.get("performer_record") is not None:
                wipe_items.append({"id": p["id"]})

        if not wipe_items:
            output_msg = "No performers with hotornot_stats or performer_record to wipe."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        success_count = execute_batches_concurrent(
            wipe_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_remove_fields_batch,
            ("performerUpdate", ["hotornot_stats", "performer_record"]),
            STASH_URL, cookies,
            progress_message=display_name
        )

    elif task_action == "reset":
        display_name = "Reset Performer Ratings"
        action_desc = "reset performer ratings to null"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        performers = fetch_all_performers(
            STASH_URL, cookies, "GetAllPerformersForReset",
            "id rating100",
            filter_input=None
        )

        reset_items = [{"id": p["id"], "value": None} for p in performers]

        if not reset_items:
            output_msg = "No performers to reset."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        success_count = execute_batches_concurrent(
            reset_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_simple_batch_mutation,
            ("performerUpdate", "rating100", "rating", "Int"),
            STASH_URL, cookies,
            progress_message=display_name
        )

    elif task_action == "prime":
        display_name = "Prime"
        action_desc = "assigned random tier-based ratings"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        null_performers = fetch_all_performers(
            STASH_URL, cookies, "GetNullRatedPerformers",
            "id",
            filter_input={"rating100": {"modifier": "IS_NULL"}}
        )
        low_performers = fetch_all_performers(
            STASH_URL, cookies, "GetLowRatedPerformers",
            "id rating100",
            filter_input={"rating100": {"value": 2, "modifier": "LESS_THAN"}}
        )

        performers_list = merge_unique([null_performers, low_performers])
        performers_list = [p for p in performers_list if is_unrated(p)]

        total = len(performers_list)
        if total == 0:
            output_msg = "No unrated performers to prime."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        tier_percentages = {
            'F': 70,
            'D': 25,
            'C': 5
        }

        num_f = int(total * tier_percentages['F'] / 100)
        num_d = int(total * tier_percentages['D'] / 100)
        num_c = total - num_f - num_d

        ratings_pool = []
        ratings_pool.extend([random.randint(1, 9)] * num_f)
        ratings_pool.extend([random.randint(25, 39)] * num_d)
        ratings_pool.extend([40] * num_c)

        random.shuffle(ratings_pool)

        prime_items = [{"id": p["id"], "value": ratings_pool[i]} for i, p in enumerate(performers_list)]

        if STASHAPI_AVAILABLE:
            log.info(f"Generated ratings pool. F: {num_f}, D: {num_d}, C: {num_c}")

        success_count = execute_batches_concurrent(
            prime_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_simple_batch_mutation,
            ("performerUpdate", "rating100", "rating", "Int!"),
            STASH_URL, cookies,
            progress_message=display_name
        )

    elif task_action == "scenewipe":
        display_name = "Wipe Scene History"
        action_desc = "deleted scene custom field history"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        scenes = fetch_all_scenes(
            STASH_URL, cookies, "GetScenesForWipe",
            "id custom_fields", filter_input=None
        )

        wipe_items = []
        for s in scenes:
            cf = s.get("custom_fields") or {}
            if cf.get("hotornot_stats") is not None or cf.get("scene_record") is not None:
                wipe_items.append({"id": s["id"]})

        if not wipe_items:
            output_msg = "No scenes with hotornot_stats or scene_record to wipe."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        success_count = execute_batches_concurrent(
            wipe_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_remove_fields_batch,
            ("sceneUpdate", ["hotornot_stats", "scene_record"]),
            STASH_URL, cookies,
            progress_message=display_name
        )

    elif task_action == "scenereset":
        display_name = "Reset Scene Ratings"
        action_desc = "reset scene ratings to null"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        scenes = fetch_all_scenes(
            STASH_URL, cookies, "GetAllScenesForReset",
            "id rating100",
            filter_input=None
        )

        reset_items = [{"id": s["id"], "value": None} for s in scenes]

        if not reset_items:
            output_msg = "No scenes to reset."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        success_count = execute_batches_concurrent(
            reset_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_simple_batch_mutation,
            ("sceneUpdate", "rating100", "rating", "Int"),
            STASH_URL, cookies,
            progress_message=display_name
        )

    elif task_action == "sceneprime":
        display_name = "Prime Scenes from Performer Ratings"
        action_desc = "assigned performer-derived baseline ratings to unrated scenes"

        # ------------------------------------------------------------------
        # 1. Fetch all performers (needed for percentile / effective rating)
        # ------------------------------------------------------------------
        if STASHAPI_AVAILABLE:
            log.info("Fetching performers for scene prime...")
            log.progress(0.0)

        performers = fetch_all_performers(
            STASH_URL, cookies, "GetPerformersForScenePrime",
            "id name rating100 custom_fields scenes { id }",
            filter_input=None
        )

        if not performers:
            error_msg = "[ERROR] Could not fetch performers for scene prime."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

        # ------------------------------------------------------------------
        # 2. Fetch ALL scenes with performers in one pass (full fields)
        # ------------------------------------------------------------------
        if STASHAPI_AVAILABLE:
            log.info("Fetching all scenes with performers...")
            log.progress(0.0)

        all_scenes = fetch_all_scenes(
            STASH_URL, cookies, "GetAllScenesWithPerformers",
            "id rating100 performers { id } studio { id } tags { id } files { duration }",
            filter_input={"performer_count": {"value": 0, "modifier": "GREATER_THAN"}},
            page_size=500
        )

        if not all_scenes:
            error_msg = "[ERROR] Could not fetch scenes for prime."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

        rated_values = [s["rating100"] for s in all_scenes if is_rated(s)]
        global_scene_mean = sum(rated_values) / len(rated_values) if rated_values else 30.0

        scenes = [s for s in all_scenes if is_unrated(s) and (s.get("performers") or [])]

        if STASHAPI_AVAILABLE:
            log.info(f"Found {len(all_scenes)} scenes with performers; {len(rated_values)} rated, {len(scenes)} unrated.")
            log.info(f"Global scene mean: {global_scene_mean:.2f}")

        if not scenes:
            output_msg = "No unrated scenes with performers to prime."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        if STASHAPI_AVAILABLE:
            log.info(f"Using {len(performers)} performers and {len(scenes)} unrated scenes for priming.")

        # ------------------------------------------------------------------
        # Helper: safely parse hotornot_stats
        # ------------------------------------------------------------------
        def safe_stats(item):
            raw = item.get("custom_fields", {}).get("hotornot_stats") if item.get("custom_fields") else None
            if not raw:
                return {}
            try:
                return json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                return {}

        # ------------------------------------------------------------------
        # Helper: mirror calculateBattleScore from rating-utils.js
        # ------------------------------------------------------------------
        def calc_battle_score(performer):
            rating100 = performer.get("rating100") or 1
            stats = safe_stats(performer)
            total_matches = stats.get("total_matches", 0)
            wins = stats.get("wins", 0)
            win_margin = stats.get("win_margin", 0)
            win_rate = wins / total_matches if total_matches > 0 else 0
            composite = (
                (rating100 / 100.0) +
                (win_rate * 0.5) +
                (win_margin / 100.0) +
                (math.log10(wins + 1) * 0.2)
            )
            return (rating100 / 10.0) + composite

        # ------------------------------------------------------------------
        # Helper: mirror getRatingTier / calculateEffectiveEloRating
        # ------------------------------------------------------------------
        TIER_GATES = [
            {"tier": "S-Tier", "maxPercentile": 5,   "minBattleScore": 9.0},
            {"tier": "A-Tier", "maxPercentile": 18,  "minBattleScore": 7.5},
            {"tier": "B-Tier", "maxPercentile": 38,  "minBattleScore": 5.0},
            {"tier": "C-Tier", "maxPercentile": 68,  "minBattleScore": 2.0},
            {"tier": "D-Tier", "maxPercentile": 88,  "minBattleScore": 0.4},
            {"tier": "F-Tier", "maxPercentile": 100, "minBattleScore": 0.11},
        ]

        BASE_RATINGS = {
            "S-Tier": 90,
            "A-Tier": 75,
            "B-Tier": 60,
            "C-Tier": 45,
            "D-Tier": 30,
            "F-Tier": 15,
        }

        def get_tier(percentile, battle_score):
            for gate in TIER_GATES:
                if percentile < gate["maxPercentile"] and battle_score >= gate["minBattleScore"]:
                    return gate["tier"]
            return "F-Tier"

        def calc_effective_rating(performer, all_battle_scores):
            battle_score = calc_battle_score(performer)
            if not all_battle_scores:
                return performer.get("rating100") or 1
            strictly_better = sum(1 for s in all_battle_scores if s > battle_score)
            percentile = (strictly_better / len(all_battle_scores)) * 100
            tier = get_tier(percentile, battle_score)
            tier_idx = next((i for i, g in enumerate(TIER_GATES) if g["tier"] == tier), len(TIER_GATES) - 1)
            prev_max = TIER_GATES[tier_idx - 1]["maxPercentile"] if tier_idx > 0 else 0
            tier_span = TIER_GATES[tier_idx]["maxPercentile"] - prev_max
            position = 0
            if tier_span > 0:
                position = max(0.0, min(1.0, (percentile - prev_max) / tier_span))
            return min(100, BASE_RATINGS[tier] + (1 - position) * 15)

        # ------------------------------------------------------------------
        # Helper: scene similarity, matching math-utils.js
        # ------------------------------------------------------------------
        def scene_similarity(a, b):
            if not a or not b or a["id"] == b["id"]:
                return 1.0

            penalty = 0.0
            weight = 0.0

            pa = set(p["id"] for p in a.get("performers", []) if p and p.get("id"))
            pb = set(p["id"] for p in b.get("performers", []) if p and p.get("id"))
            if pa or pb:
                shared = len(pa & pb)
                maxp = max(len(pa), len(pb), 1)
                penalty += (shared / maxp) * 0.55
                weight += 0.55

            sa = a.get("studio", {}).get("id") if a.get("studio") else None
            sb = b.get("studio", {}).get("id") if b.get("studio") else None
            if sa or sb:
                if sa and sb and sa == sb:
                    penalty += 0.25
                weight += 0.25

            ta = set(t["id"] for t in a.get("tags", []) if t and t.get("id"))
            tb = set(t["id"] for t in b.get("tags", []) if t and t.get("id"))
            if ta or tb:
                shared = len(ta & tb)
                maxt = max(len(ta), len(tb), 1)
                penalty += (shared / maxt) * 0.20
                weight += 0.20

            return penalty / weight if weight > 0 else 0.0

        # ------------------------------------------------------------------
        # 3. Build performer lookup + scene map
        # ------------------------------------------------------------------
        all_battle_scores = sorted((calc_battle_score(p) for p in performers), reverse=True)

        performer_map = {}
        for p in performers:
            stats = safe_stats(p)
            eff = calc_effective_rating(p, all_battle_scores)
            performer_map[p["id"]] = {
                "id": p["id"],
                "effective_rating": eff,
                "match_count": stats.get("total_matches", 0),
                "scene_count": len(p.get("scenes", [])),
                "scene_ids": {s["id"] for s in p.get("scenes", []) if s.get("id")}
            }

        scene_map = {s["id"]: s for s in all_scenes}

        MATCH_CONFIDENCE_TARGET = 50.0
        GLOBAL_ANCHOR_WEIGHT = 1.0

        # Softer duplicate penalty: higher threshold, smaller per-sibling hit, lower total cap
        SOFT_SIM_THRESHOLD = 0.40
        HARD_SIM_THRESHOLD = 0.60
        MAX_DUP_PENALTY = 4.0
        MAX_TOTAL_DUP_PENALTY = 6.0

        GLOBAL_MAX_RATING = 95

        # ------------------------------------------------------------------
        # 4. Compute baseline for every unrated scene
        # ------------------------------------------------------------------
        scene_updates = []
        total_scenes_for_prime = len(scenes)
        if STASHAPI_AVAILABLE:
            log.info("Computing scene baselines...")
            log.progress(0.0)

        for idx, scene in enumerate(scenes):
            scene_performers = scene.get("performers", []) or []
            if not scene_performers:
                if (idx + 1) % 500 == 0:
                    report_progress(idx + 1, total_scenes_for_prime, "Computing scene baselines")
                continue

            weighted_sum = 0.0
            weight_sum = 0.0
            max_performer_rating = 1.0

            for perf_ref in scene_performers:
                pid = perf_ref.get("id")
                if not pid or pid not in performer_map:
                    continue
                perf = performer_map[pid]

                confidence = min(1.0, perf["match_count"] / MATCH_CONFIDENCE_TARGET)
                scene_weight = confidence / math.sqrt(max(1, perf["scene_count"]))

                weighted_sum += scene_weight * perf["effective_rating"]
                weight_sum += scene_weight
                max_performer_rating = max(max_performer_rating, perf["effective_rating"])

            if weight_sum <= 0:
                if (idx + 1) % 500 == 0:
                    report_progress(idx + 1, total_scenes_for_prime, "Computing scene baselines")
                continue

            prior = (
                (weighted_sum + GLOBAL_ANCHOR_WEIGHT * global_scene_mean)
                / (weight_sum + GLOBAL_ANCHOR_WEIGHT)
            )

            duration = 0
            for f in scene.get("files", []) or []:
                duration = max(duration, f.get("duration") or 0)
            metadata_bonus = 0
            if duration > 1200:
                metadata_bonus += 2
            elif duration > 600:
                metadata_bonus += 1
            metadata_bonus = max(-2, min(metadata_bonus, 3))

            dup_penalty = 0.0
            checked_other_ids = set()
            for perf_ref in scene_performers:
                pid = perf_ref.get("id")
                if not pid or pid not in performer_map:
                    continue
                for other_id in performer_map[pid]["scene_ids"]:
                    if other_id == scene["id"] or other_id in checked_other_ids:
                        continue
                    checked_other_ids.add(other_id)
                    other = scene_map.get(other_id)
                    if not other:
                        continue
                    sim = scene_similarity(scene, other)
                    if sim > SOFT_SIM_THRESHOLD:
                        penalty = (
                            (sim - SOFT_SIM_THRESHOLD)
                            / (HARD_SIM_THRESHOLD - SOFT_SIM_THRESHOLD)
                        ) * MAX_DUP_PENALTY
                        dup_penalty += min(penalty, MAX_DUP_PENALTY)

            dup_penalty = min(dup_penalty, MAX_TOTAL_DUP_PENALTY)

            baseline = prior + metadata_bonus - dup_penalty

            hard_ceiling = min(max_performer_rating + 5.0, GLOBAL_MAX_RATING)
            baseline = max(1.0, min(baseline, hard_ceiling))

            if baseline >= 70:
                baseline -= max(0.0, (baseline - 70.0) / 8.0)

            final_rating = max(1, min(int(round(baseline)), 95))
            scene_updates.append({"id": scene["id"], "rating": final_rating})

            if (idx + 1) % 500 == 0:
                report_progress(idx + 1, total_scenes_for_prime, "Computing scene baselines")

        # ------------------------------------------------------------------
        # 5. Write baselines back to Stash in batches
        # ------------------------------------------------------------------
        success_count = 0
        total = len(scene_updates)
        if total == 0:
            output_msg = "No scenes needed priming after baseline calculation."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        if STASHAPI_AVAILABLE:
            log.info(f"Priming {total} unrated scenes from performer ratings in batches of {WRITE_BATCH_SIZE}...")
            log.progress(0.0)

        prime_items = [{"id": u["id"], "value": u["rating"]} for u in scene_updates]

        success_count = execute_batches_concurrent(
            prime_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_simple_batch_mutation,
            ("sceneUpdate", "rating100", "rating", "Int!"),
            STASH_URL, cookies,
            progress_message="Writing primed scene ratings"
        )

    elif task_action == "sceneprimeunrated":
        display_name = "Prime Unrated Scenes"
        action_desc = "assigned random tier-based ratings to unrated scenes"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        all_scenes = fetch_all_scenes(
            STASH_URL, cookies, "GetAllScenesForPrimeUnrated",
            "id rating100",
            filter_input=None
        )

        scenes_list = [s for s in all_scenes if is_unrated(s)]

        total = len(scenes_list)
        if total == 0:
            output_msg = "No unrated scenes to prime."
            if STASHAPI_AVAILABLE:
                log.info(output_msg)
            print(json.dumps({"output": output_msg}))
            return

        tier_percentages = {
            'F': 70,
            'D': 25,
            'C': 5
        }

        num_f = int(total * tier_percentages['F'] / 100)
        num_d = int(total * tier_percentages['D'] / 100)
        num_c = total - num_f - num_d

        ratings_pool = []
        ratings_pool.extend([random.randint(1, 9)] * num_f)
        ratings_pool.extend([random.randint(25, 39)] * num_d)
        ratings_pool.extend([40] * num_c)

        random.shuffle(ratings_pool)

        prime_items = [{"id": s["id"], "value": ratings_pool[i]} for i, s in enumerate(scenes_list)]

        if STASHAPI_AVAILABLE:
            log.info(f"Generated ratings pool. F: {num_f}, D: {num_d}, C: {num_c}")

        success_count = execute_batches_concurrent(
            prime_items, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
            build_simple_batch_mutation,
            ("sceneUpdate", "rating100", "rating", "Int!"),
            STASH_URL, cookies,
            progress_message=display_name
        )

    elif task_action == "snapshotexport":
        display_name = "Snapshot Export"
        action_desc = "exported ratings snapshot"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        detailed_performer_query = """
        query GetAllPerformersDetails($page: Int!, $per_page: Int!) {
            findPerformers(filter: { per_page: $per_page, page: $page }) {
                count
                performers {
                    id name gender birthdate country height_cm rating100 custom_fields image_path
                    scenes { id }
                }
            }
        }
        """

        performers_details = []
        pg = 1
        while True:
            res = call_graphql(STASH_URL, detailed_performer_query, {"page": pg, "per_page": 500}, cookies=cookies)
            if not res or "data" not in res or not res["data"]:
                break
            count = res["data"]["findPerformers"].get("count")
            batch = res["data"]["findPerformers"]["performers"]
            if not batch:
                break
            performers_details.extend(batch)
            if count:
                report_progress(min(len(performers_details), count), count, "Fetching performers")
            if len(batch) < 500:
                break
            pg += 1

        scene_query = """
        query GetAllScenes($page: Int!, $per_page: Int!) {
            findScenes(filter: { per_page: $per_page, page: $page }) {
                count
                scenes { id rating100 custom_fields }
            }
        }
        """

        scenes_details = []
        pg = 1
        while True:
            res = call_graphql(STASH_URL, scene_query, {"page": pg, "per_page": 500}, cookies=cookies)
            if not res or "data" not in res or not res["data"]:
                break
            count = res["data"]["findScenes"].get("count")
            batch = res["data"]["findScenes"]["scenes"]
            if not batch:
                break
            scenes_details.extend(batch)
            if count:
                report_progress(min(len(scenes_details), count), count, "Fetching scenes")
            if len(batch) < 500:
                break
            pg += 1

        script_dir = os.path.dirname(os.path.abspath(__file__))
        snapshots_dir = os.path.join(script_dir, "snapshots")
        if not os.path.exists(snapshots_dir):
            os.makedirs(snapshots_dir)
        if STASHAPI_AVAILABLE:
            log.info(f"Created snapshots directory: {snapshots_dir}")

        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        output_file = os.path.join(snapshots_dir, f"[{timestamp}] - Ascension Database Snapshot.json")

        try:
            export_data = {"performers": [], "scenes": []}

            total_export_items = len(performers_details) + len(scenes_details)
            processed_export = 0

            for performer in performers_details:
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
                    "scenes": scene_ids
                })
                processed_export += 1
                if processed_export % 500 == 0:
                    report_progress(processed_export, total_export_items, "Exporting snapshot")

            for scene in scenes_details:
                export_data["scenes"].append({
                    "id": scene.get("id"),
                    "rating": scene.get("rating100"),
                    "stats": scene.get("custom_fields", {}).get("hotornot_stats"),
                    "record": scene.get("custom_fields", {}).get("scene_record")
                })
                processed_export += 1
                if processed_export % 500 == 0:
                    report_progress(processed_export, total_export_items, "Exporting snapshot")

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, default=str)

            action_desc = f"exported ratings snapshot to {output_file}"
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
        display_name = "Snapshot Import"

        if STASHAPI_AVAILABLE:
            log.info(f"Starting {display_name} task...")
            log.progress(0.0)

        script_dir = os.path.dirname(os.path.abspath(__file__))
        snapshots_dir = os.path.join(script_dir, "snapshots")

        if not os.path.exists(snapshots_dir):
            error_msg = "[ERROR] Snapshots directory not found."
            if STASHAPI_AVAILABLE:
                log.error(error_msg)
            else:
                print(error_msg, file=sys.stderr)
            print(json.dumps({"error": error_msg}))
            return

        snapshot_files = []
        for filename in os.listdir(snapshots_dir):
            if filename.endswith(" - Ascension Database Snapshot.json"):
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

        snapshot_files.sort(key=lambda x: x[0], reverse=True)
        most_recent_file = os.path.join(snapshots_dir, snapshot_files[0][1])

        if STASHAPI_AVAILABLE:
            log.info(f"Using snapshot file: {most_recent_file}")

        try:
            with open(most_recent_file, 'r', encoding='utf-8') as f:
                snapshot_data = json.load(f)

            performers_data = snapshot_data.get("performers", [])
            scenes_data = snapshot_data.get("scenes", [])
            total_import_items = len(performers_data) + len(scenes_data)
            processed_import = 0

            # ------------------------------------------------------------------
            # Build combined performer updates from snapshot IDs
            # ------------------------------------------------------------------
            performer_update_batch = []
            skipped_performer_names = []

            for performer_data in performers_data:
                performer_id = performer_data.get("ID") or performer_data.get("id")
                name = performer_data.get("name", "Unknown")

                if not performer_id:
                    skipped_performer_names.append(name)
                    processed_import += 1
                    continue

                item = {"id": performer_id}

                if performer_data.get("rating") is not None:
                    item["value"] = performer_data["rating"]

                custom_fields_data = {}
                if performer_data.get("stats") is not None:
                    custom_fields_data["hotornot_stats"] = performer_data["stats"]
                if performer_data.get("record") is not None:
                    custom_fields_data["performer_record"] = performer_data["record"]

                if custom_fields_data:
                    item["fields"] = custom_fields_data

                if "value" in item or "fields" in item:
                    performer_update_batch.append(item)

                processed_import += 1
                if processed_import % 500 == 0:
                    report_progress(processed_import, total_import_items, "Preparing snapshot imports")

            if skipped_performer_names and STASHAPI_AVAILABLE:
                log.warning(f"Skipped {len(skipped_performer_names)} performers without IDs: {skipped_performer_names[:10]}{'...' if len(skipped_performer_names) > 10 else ''}")

            performer_success = 0
            if performer_update_batch:
                if STASHAPI_AVAILABLE:
                    log.info(f"Writing {len(performer_update_batch)} performer imports...")
                performer_success = execute_batches_concurrent(
                    performer_update_batch, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
                    build_combined_update_batch,
                    ("performerUpdate",),
                    STASH_URL, cookies,
                    progress_message="Writing performer imports"
                )

            # ------------------------------------------------------------------
            # Build combined scene updates from snapshot IDs
            # ------------------------------------------------------------------
            scene_update_batch = []
            skipped_scene_count = 0

            for scene_data in scenes_data:
                scene_id = scene_data.get("id")

                if not scene_id:
                    skipped_scene_count += 1
                    processed_import += 1
                    continue

                item = {"id": scene_id}

                if scene_data.get("rating") is not None:
                    item["value"] = scene_data["rating"]

                custom_fields_data = {}
                if scene_data.get("stats") is not None:
                    custom_fields_data["hotornot_stats"] = scene_data["stats"]
                if scene_data.get("record") is not None:
                    custom_fields_data["scene_record"] = scene_data["record"]

                if custom_fields_data:
                    item["fields"] = custom_fields_data

                if "value" in item or "fields" in item:
                    scene_update_batch.append(item)

                processed_import += 1
                if processed_import % 500 == 0:
                    report_progress(processed_import, total_import_items, "Preparing snapshot imports")

            if skipped_scene_count > 0 and STASHAPI_AVAILABLE:
                log.warning(f"Skipped {skipped_scene_count} scenes without IDs")

            scene_success = 0
            if scene_update_batch:
                if STASHAPI_AVAILABLE:
                    log.info(f"Writing {len(scene_update_batch)} scene imports...")
                scene_success = execute_batches_concurrent(
                    scene_update_batch, WRITE_BATCH_SIZE, CONCURRENT_WORKERS,
                    build_combined_update_batch,
                    ("sceneUpdate",),
                    STASH_URL, cookies,
                    progress_message="Writing scene imports"
                )

            imported_count = len(performer_update_batch)
            scene_imported_count = len(scene_update_batch)
            action_desc = (
                f"imported snapshot from {snapshot_files[0][1]} for "
                f"{imported_count} performers ({performer_success} succeeded) and "
                f"{scene_imported_count} scenes ({scene_success} succeeded)"
            )
            success_count = performer_success + scene_success

            if STASHAPI_AVAILABLE:
                log.info(f"Import complete: {performer_success}/{imported_count} performers, {scene_success}/{scene_imported_count} scenes")

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

    if task_action in ["scenewipe", "scenereset", "sceneprime", "sceneprimeunrated"]:
        output_msg = f"Successfully {action_desc} for {success_count} scenes."
    elif task_action == "snapshotexport":
        output_msg = f"Successfully {action_desc}."
    elif task_action == "snapshotimport":
        output_msg = f"Successfully {action_desc}."
    else:
        output_msg = f"Successfully {action_desc} for {success_count} performers."

    if STASHAPI_AVAILABLE:
        log.info(output_msg)
        log.progress(1.0)

    print(json.dumps({
        "output": output_msg
    }))

if __name__ == "__main__":
    main()
