import yaml
import hashlib
import os
from datetime import datetime
import sys

def calculate_sha256(file_path):
    """Calculate SHA256 hash of a file"""
    print(f"Checking file: {file_path}")
    if not os.path.exists(file_path):
        print(f"Warning: File not found: {file_path}")
        return "FILE_NOT_FOUND"
    try:
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        print(f"Error calculating SHA256 for {file_path}: {e}")
        return "ERROR"

def update_manifest():
    manifest_path = 'plugins/manifest.yml'
    print(f"Looking for manifest at: {manifest_path}")
    
    if not os.path.exists(manifest_path):
        print("ERROR: Manifest file not found.")
        return False

    try:
        with open(manifest_path, 'r') as file:
            manifest_data = file.read().strip()
    except Exception as e:
        print(f"ERROR: Cannot read manifest file: {e}")
        return False

    if not manifest_data:
        print("ERROR: Manifest file is empty.")
        return False

    # Split by --- to get individual documents
    docs = manifest_data.split('---')
    manifest_list = []
    
    for i, doc in enumerate(docs):
        doc = doc.strip()
        if doc:
            try:
                item = yaml.safe_load(doc)
                if item is not None:
                    manifest_list.append(item)
                    print(f"Parsed plugin: {item.get('id', 'unknown')}")
            except yaml.YAMLError as e:
                print(f"YAML parsing error in document {i}: {e}")
                print(f"Document content: {doc}")
                return False

    print(f"Found {len(manifest_list)} plugins in manifest")

    # Update each plugin entry
    updated_count = 0
    for plugin in manifest_list:
        plugin_id = plugin.get('id')
        print(f"Processing plugin: {plugin_id}")
        
        zip_paths = {
            'Ascension': 'plugins/Ascension/plugins/Ascension.zip',
            'DeckViewer': 'plugins/Deck Viewer/plugins/Deck Viewer.zip',
            'DiceR': 'plugins/DiceR/plugins/DiceR.zip',
            'SenpaiAddonPack': 'plugins/Senpai Stash Addon/plugins/senpai-addon-pack.zip',
            'SenpaiTheme': 'plugins/Senpai Stash Theme/plugins/SenpaiV1.zip',
            'TagImagesFromGalleries': 'plugins/TagImagesFromGalleries/plugins/tagImagesFromGalleries.zip'
        }

        zip_path = zip_paths.get(plugin_id)
        if zip_path:
            print(f"Looking for zip: {zip_path}")
            sha256 = calculate_sha256(zip_path)
            plugin['sha256'] = sha256
            plugin['date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            print(f"Updated {plugin_id}: SHA256={sha256[:16]}...")

            # Increment version last part
            version = plugin.get('version', '1.0.0')
            version_parts = version.split('.')
            if version_parts:
                try:
                    last_part = int(version_parts[-1]) + 1
                    version_parts[-1] = str(last_part)
                    plugin['version'] = '.'.join(version_parts)
                    print(f"Updated version to: {plugin['version']}")
                except Exception as e:
                    print(f"Could not increment version for {plugin_id}: {e}")
            
            updated_count += 1

    # Write back to manifest
    try:
        with open(manifest_path, 'w') as file:
            file.write('---\n')
            for i, plugin in enumerate(manifest_list):
                yaml.dump(plugin, file, default_flow_style=False, sort_keys=False)
                if i < len(manifest_list) - 1:
                    file.write('---\n')
            file.write('---\n')
        print(f"Successfully updated manifest with {updated_count} plugins")
        return True
    except Exception as e:
        print(f"ERROR: Cannot write manifest file: {e}")
        return False

if __name__ == '__main__':
    print("Starting manifest update...")
    success = update_manifest()
    if success:
        print("Manifest update completed successfully")
        sys.exit(0)
    else:
        print("Manifest update failed")
        sys.exit(1)
import yaml
import hashlib
import os
from datetime import datetime

def calculate_sha256(file_path):
    """Calculate SHA256 hash of a file"""
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return "FILE_NOT_FOUND"
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def update_manifest():
    manifest_path = 'plugins/manifest.yml'  # Correct path
    if not os.path.exists(manifest_path):
        print("Manifest file not found.")
        return

    with open(manifest_path, 'r') as file:
        manifest_data = file.read().strip()

    if not manifest_data:
        print("Manifest file is empty.")
        return

    # Split by --- to get individual documents
    docs = manifest_data.split('---')
    manifest_list = []
    for doc in docs:
        doc = doc.strip()
        if doc:
            try:
                item = yaml.safe_load(doc)
                if item is not None:
                    manifest_list.append(item)
            except yaml.YAMLError as e:
                print(f"YAML parsing error: {e}")

    # Update each plugin entry
    for plugin in manifest_list:
        plugin_id = plugin.get('id')
        zip_paths = {
            'Ascension': 'plugins/Ascension/plugins/Ascension.zip',
            'DeckViewer': 'plugins/Deck Viewer/plugins/Deck Viewer.zip',
            'DiceR': 'plugins/DiceR/plugins/DiceR.zip',
            'SenpaiAddonPack': 'plugins/Senpai Stash Addon/plugins/senpai-addon-pack.zip',
            'SenpaiTheme': 'plugins/Senpai Stash Theme/plugins/SenpaiV1.zip',
            'TagImagesFromGalleries': 'plugins/TagImagesFromGalleries/plugins/tagImagesFromGalleries.zip'
        }

        zip_path = zip_paths.get(plugin_id)
        if zip_path:
            sha256 = calculate_sha256(zip_path)
            plugin['sha256'] = sha256
            plugin['date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            # Increment version last part
            version = plugin.get('version', '1.0.0')
            version_parts = version.split('.')
            if version_parts:
                try:
                    last_part = int(version_parts[-1]) + 1
                    version_parts[-1] = str(last_part)
                    plugin['version'] = '.'.join(version_parts)
                except:
                    pass

    # Write back to manifest
    with open(manifest_path, 'w') as file:
        file.write('---\n')
        for i, plugin in enumerate(manifest_list):
            yaml.dump(plugin, file, default_flow_style=False, sort_keys=False)
            if i < len(manifest_list) - 1:
                file.write('---\n')
        file.write('---\n')

if __name__ == '__main__':
    update_manifest()
