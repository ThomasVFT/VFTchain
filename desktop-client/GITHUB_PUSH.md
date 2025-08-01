# Push to GitHub Instructions

## 1. Create GitHub Repository
Go to https://github.com/new and create:
- Repository name: `vft-desktop-client`
- Description: "VFT Desktop Client - GPU Mining & AI Computing Platform"
- Public repository
- Add README: No (we have our own)

## 2. Push the Code
```bash
# Navigate to desktop-client folder
cd E:\VFT_POUW\desktop-client

# Initialize git (if needed)
git init

# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/vft-desktop-client.git

# Add files
git add .

# Commit
git commit -m "Initial release - VFT Desktop Client v1.0.0"

# Push
git push -u origin main
```

## 3. Create Release
1. Go to: https://github.com/YOUR_USERNAME/vft-desktop-client/releases/new
2. Tag version: `v1.0.0`
3. Release title: `VFT Desktop Client v1.0.0 - Windows Release`
4. Description: Copy from `RELEASE_NOTES_v1.0.0.md`
5. Attach binary: Upload `dist-installer/VFT-Desktop-Setup-1.0.0.exe`
6. ✅ This is a pre-release (optional for beta)
7. Publish release

## 4. Update README
After creating the release, update the download link in README.md:
```
https://github.com/YOUR_USERNAME/vft-desktop-client/releases/latest
```

## Files to Include
- ✅ Source code (src/)
- ✅ Assets (logo, icons)
- ✅ Package files
- ✅ README.md
- ✅ LICENSE.txt
- ✅ Release notes

## Files to Exclude (already in .gitignore)
- ❌ node_modules/
- ❌ dist folders (except installer)
- ❌ Log files
- ❌ Temporary files
- ❌ Archive folders