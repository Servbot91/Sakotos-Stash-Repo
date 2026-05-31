import yaml
import hashlib
import os
from datetime import datetime

def calculate_sha256(file_path):
    """Calculate SHA256 hash of a file"""
    if not os.path.exists(file_path):
        return "FILE_NOT_FOUND"
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def update_manifest():
    manifest_path = 'manifest.yml'
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
