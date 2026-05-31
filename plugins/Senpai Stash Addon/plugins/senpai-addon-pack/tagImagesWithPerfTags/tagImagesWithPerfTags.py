import stashapi.log as log
from stashapi.stashapp import StashInterface
import sys
import json

GALLERY_PAGE_SIZE = 50
IMAGE_UPDATE_BATCH = 1000


def processAll():
    exclusion_marker_tag_id = None
    if settings["excludeWithTag"]:
        exclusion_marker_tag = stash.find_tag(settings["excludeWithTag"])
        if exclusion_marker_tag:
            exclusion_marker_tag_id = exclusion_marker_tag["id"]

    query = {"image_count": {"modifier": "NOT_EQUALS", "value": 0}}
    if settings["excludeOrganized"]:
        query["organized"] = False
    if exclusion_marker_tag_id:
        query["tags"] = {"value": [exclusion_marker_tag_id], "modifier": "EXCLUDES"}

    try:
        total_count = stash.find_galleries(f=query, filter={"page": 1, "per_page": 1}, get_count=True)[0]
    except Exception:
        total_count = 0

    log.info(f"Starting Process All: Inspecting {total_count} total galleries.")
    processed = 0
    page = 1

    stats = {"skipped_empty": 0, "skipped_synced": 0, "skipped_excluded": 0}

    while True:
        if total_count > 0:
            log.progress(min(processed / total_count, 1.0))

        galleries = stash.find_galleries(
            f=query,
            filter={"page": page, "per_page": GALLERY_PAGE_SIZE},
            fragment="id title code organized tags { id name } performers { id name } studio { id }"
        )

        if not galleries:
            log.info(f"Finished processing all galleries. Summary: "
                     f"Skipped: {stats['skipped_synced']} already synced, "
                     f"{stats['skipped_empty']} empty performer/tag metadata, {stats['skipped_excluded']} excluded filter.")
            break

        for gallery in galleries:
            processGallery(gallery, stats)
            processed += 1

        page += 1


def processGallery(gallery: dict, stats: dict = None):
    if stats is None:
        stats = {"skipped_empty": 0, "skipped_synced": 0, "skipped_excluded": 0}

    gallery_name = gallery.get("title") or gallery.get("code") or f"ID {gallery['id']}"

    # Excluded via Settings Check
    if settings["excludeWithTag"]:
        for tag in gallery.get("tags", []):
            if tag["name"] == settings["excludeWithTag"]:
                stats["skipped_excluded"] += 1
                log.debug(f"Skipping Gallery '{gallery_name}': Has exclusion tag '{settings['excludeWithTag']}'.")
                return

    if settings["excludeOrganized"] and gallery.get("organized"):
        stats["skipped_excluded"] += 1
        log.debug(f"Skipping Gallery '{gallery_name}': Marked as organized.")
        return

    gallery_tag_ids = [t["id"] for t in gallery.get("tags", [])]
    gallery_performer_ids = [p["id"] for p in gallery.get("performers", [])]
    
    # CRITICAL FIX: If this specific script has no performers AND no tags, skip it immediately.
    # We do not allow a studio-only gallery to pass through this plugin.
    if not gallery_tag_ids and not gallery_performer_ids:
        stats["skipped_empty"] += 1
        return

    gallery_studio = gallery.get("studio")
    gallery_studio_id = gallery_studio["id"] if gallery_studio else None

    images = stash.find_gallery_images(
        gallery["id"],
        fragment="id tags { id } performers { id } studio { id }"
    )

    if not images:
        return

    image_ids_to_update = []
    gallery_tags_set = set(gallery_tag_ids)
    gallery_perfs_set = set(gallery_performer_ids)

    for img in images:
        existing_img_tags = {t['id'] for t in img.get('tags', [])}
        existing_img_perfs = {p['id'] for p in img.get('performers', [])}
        
        img_studio = img.get("studio")
        img_studio_id = img_studio["id"] if img_studio else None

        missing_tags = gallery_tags_set - existing_img_tags
        missing_perfs = gallery_perfs_set - existing_img_perfs
        studio_mismatch = (gallery_studio_id is not None and img_studio_id != gallery_studio_id)

        if missing_tags or missing_perfs or studio_mismatch:
            image_ids_to_update.append(img["id"])

    if not image_ids_to_update:
        stats["skipped_synced"] += 1
        log.debug(f"Skipping Gallery '{gallery_name}': All child assets match parent metadata.")
        return

    # Reconstruct log metadata safely
    perf_names = [p["name"] for p in gallery.get("performers", [])]
    tag_names = [t["name"] for t in gallery.get("tags", [])]
    
    perfs_string = ", ".join(perf_names) if perf_names else "None"
    tags_string = ", ".join(tag_names) if tag_names else "None"
    context_msg = f"Gallery: '{gallery_name}' | Performers: [{perfs_string}] | Tags: [{tags_string}]"

    for i in range(0, len(image_ids_to_update), IMAGE_UPDATE_BATCH):
        batch = image_ids_to_update[i:i + IMAGE_UPDATE_BATCH]
        sendImageBatch(batch, gallery_tag_ids, gallery_performer_ids, gallery_studio_id, context_msg)


def sendImageBatch(image_ids, tag_ids, performer_ids, studio_id, context_msg):
    update_data = {"ids": image_ids}
    if tag_ids:
        update_data["tag_ids"] = {"mode": "ADD", "ids": tag_ids}
    if performer_ids:
        update_data["performer_ids"] = {"mode": "ADD", "ids": performer_ids}
    if studio_id:
        update_data["studio_id"] = studio_id

    log.info(f"Bulk updating {len(image_ids)} images ({context_msg})")
    stash.update_images(update_data)


def processImageHook(image: dict):
    target_tag_ids = set()
    for perf in image.get("performers", []):
        for tag in perf.get("tags", []):
            target_tag_ids.add(tag["id"])

    if not target_tag_ids:
        return

    existing_tag_ids = {t["id"] for t in image.get("tags", [])}
    missing_tags = target_tag_ids - existing_tag_ids

    if not missing_tags:
        return

    log.info(f"Hook Update: Appending missing performer tags to Image ID {image['id']}")
    stash.update_images({
        "ids": [image["id"]], 
        "tag_ids": {"mode": "ADD", "ids": list(missing_tags)}
    })


json_input = json.loads(sys.stdin.read())
FRAGMENT_SERVER = json_input["server_connection"]
stash = StashInterface(FRAGMENT_SERVER)

config = stash.get_configuration()
settings = {"excludeWithTag": "", "excludeOrganized": False}

if "tagImagesFromGalleries" in config["plugins"]:
    settings.update(config["plugins"]["tagImagesFromGalleries"])

if "mode" in json_input["args"]:
    if "processAll" in json_input["args"]["mode"]:
        processAll()
elif "hookContext" in json_input["args"]:
    hook = json_input["args"]["hookContext"]
    hook_id = hook["id"]
    hook_type = hook.get("type", "")

    if hook_type in ["Gallery.Update.Post", "Gallery.Create.Post"]:
        if hook.get("inputFields") is not None:
            gallery = stash.find_gallery(hook_id, fragment="id title code organized tags { id name } performers { id name } studio { id }")
            if gallery:
                processGallery(gallery)
                
    elif hook_type in ["Image.Update.Post", "Image.Create.Post"]:
        if hook.get("inputFields") is not None:
            image = stash.find_image(hook_id, fragment="id tags { id } performers { id tags { id } }")
            if image:
                processImageHook(image)