#!/bin/bash

# --- SveltePress Installer Script ---
# This script unzips SveltePress files, installs dependencies,
# configures the environment, and provides instructions for final setup.

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}--- SveltePress Installer ---${NC}"

# --- 1. Pre-flight Checks ---

# Get the absolute path of the directory where the script is located
base=$(dirname $(realpath "$0"))

# Check for the zip file in the same directory as the script
if [ ! -f "$base/sveltepress.zip" ]; then
  echo -e "${YELLOW}Error: 'sveltepress.zip' not found in $base.${NC}"
  echo "Please place the zip file where this script is located and run this script again."
  exit 1
fi

# Check if the script is being run from a SvelteKit project root
if [ ! -d "src/routes" ]; then
  echo -e "${YELLOW}Error: Could not find 'src/routes'. Make sure you are in the root of your SvelteKit project when you run this script.${NC}"
  exit 1
fi

echo "✓ Pre-flight checks passed."

# --- 2. Create a temporary directory for unzipping ---
TEMP_DIR=$(mktemp -d)
echo "Unzipping files to a temporary location..."
unzip -q "$base/sveltepress.zip" -d "$TEMP_DIR"

# --- 3. Install Shared Components (BEFORE moving routes) ---
echo -e "${CYAN}--- Installing Shared Components ---${NC}"

# Ensure destination directory exists
mkdir -p "src/lib/components"

# Define component paths based on the provided zip structure
HERO_SOURCE_PATH="$TEMP_DIR/routes/sveltepress/_pubcomponents/HeroStatic.svelte"
HERO_DEST_PATH="src/lib/components/HeroStatic.svelte"
FOOTER_SOURCE_PATH="$TEMP_DIR/routes/sveltepress/_pubcomponents/Footer.svelte" # Corrected Path
FOOTER_DEST_PATH="src/lib/components/Footer.svelte"

# Process HeroStatic.svelte
if [ -f "$HERO_SOURCE_PATH" ]; then
  if [ -f "$HERO_DEST_PATH" ]; then
    echo -e "${YELLOW}INFO: '$HERO_DEST_PATH' already exists. Skipping.${NC}"
  else
    cp "$HERO_SOURCE_PATH" "$HERO_DEST_PATH"
    echo -e "${GREEN}✓ Copied 'HeroStatic.svelte' to 'src/lib/components'.${NC}"
  fi
else
  echo -e "${YELLOW}WARNING: Could not find 'HeroStatic.svelte' in zip.${NC}"
fi

# Process Footer.svelte
if [ -f "$FOOTER_SOURCE_PATH" ]; then
    if [ -f "$FOOTER_DEST_PATH" ]; then
        echo -e "${YELLOW}INFO: '$FOOTER_DEST_PATH' already exists. Skipping.${NC}"
    else
        cp "$FOOTER_SOURCE_PATH" "$FOOTER_DEST_PATH"
        echo -e "${GREEN}✓ Copied 'Footer.svelte' to 'src/lib/components'.${NC}"
    fi
else
    echo -e "${YELLOW}WARNING: Could not find 'Footer.svelte' in zip at the expected path.${NC}"
fi

# --- 4. Handle 'hooks.server.ts' ---
if [ -f "src/hooks.server.ts" ]; then
  echo -e "${YELLOW}WARNING: 'src/hooks.server.ts' already exists. Manual merge required.${NC}"
else
  if [ -f "$TEMP_DIR/hooks.server.ts" ]; then
    mv "$TEMP_DIR/hooks.server.ts" "src/"
    echo -e "${GREEN}✓ Created 'src/hooks.server.ts' successfully.${NC}"
  else
    echo -e "${YELLOW}WARNING: 'hooks.server.ts' not found in the zip file.${NC}"
  fi
fi

# --- 5. Move the SveltePress routes ---
if [ -d "$TEMP_DIR/routes/sveltepress" ]; then
  if [ -d "src/routes/sveltepress" ]; then
    echo -e "${YELLOW}WARNING: 'src/routes/sveltepress' directory already exists. Overwriting.${NC}"
    rm -rf "src/routes/sveltepress"
  fi
  mv "$TEMP_DIR/routes/sveltepress" "src/routes/"
  echo -e "${GREEN}✓ Installed SveltePress routes into 'src/routes/sveltepress'.${NC}"
else
  echo -e "${YELLOW}Warning: Could not find 'routes/sveltepress' in the zip.${NC}"
fi

# --- 6. Create Required Directories ---
echo -e "${CYAN}--- Creating SveltePress Directories ---${NC}"
if [ ! -d "protected_content" ]; then
    mkdir "protected_content"
    echo -e "${GREEN}✓ Created 'protected_content' directory.${NC}"
else
    echo -e "${YELLOW}INFO: 'protected_content' directory already exists.${NC}"
fi
if [ ! -d "users" ]; then
    mkdir "users"
    echo -e "${GREEN}✓ Created 'users' directory.${NC}"
else
    echo -e "${YELLOW}INFO: 'users' directory already exists.${NC}"
fi


# --- 7. Install Dependencies ---
echo -e "\n${CYAN}--- Installing SveltePress Dependencies ---${NC}"

DEPS="@simplewebauthn/server @simplewebauthn/browser @webauthn/server @ckeditor/ckeditor5-build-decoupled-document svelte-email @getbrevo/brevo nodemailer html-to-text @typescript-eslint/parser astring estree-walker node-html-parser path-browserify svelte-dnd-action html2canvas"
INSTALL_CMD=""

if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
    echo "Detected Bun. Installing dependencies with 'bun add'..."
    INSTALL_CMD="bun add $DEPS"
elif [ -f "pnpm-lock.yaml" ]; then
    echo "Detected pnpm. Installing dependencies with 'pnpm add'..."
    INSTALL_CMD="pnpm add $DEPS"
elif [ -f "yarn.lock" ]; then
    echo "Detected Yarn. Installing dependencies with 'yarn add'..."
    INSTALL_CMD="yarn add $DEPS"
else
    echo "Detected npm (or defaulting to it). Installing dependencies with 'npm install'..."
    INSTALL_CMD="npm install $DEPS"
fi

if ! $INSTALL_CMD; then
    echo -e "${YELLOW}Error: Dependency installation failed. Please run the command manually:${NC}"
    echo "$INSTALL_CMD"
    rm -rf "$TEMP_DIR"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed successfully.${NC}"

# --- 8. Configure Environment (.env) ---
echo -e "\n${CYAN}--- Configuring Environment ---${NC}"
touch .env

if grep -q "^PUBLIC_CKEDITOR_LICENSE_KEY=" .env; then
    echo -e "${GREEN}✓ PUBLIC_CKEDITOR_LICENSE_KEY already set in .env.${NC}"
else
    echo -e "${YELLOW}Action Required: CKEditor License Key is not set.${NC}"
    echo "If this is an open-source project licensed under GPLv2+, you can use 'GPL'."
    echo "For proprietary use, obtain a license key from ckeditor.com."
    read -p "Enter your CKEditor License Key [GPL]: " -i "GPL" CKE_LICENSE_KEY
    echo -e "\n# CKEditor License Key (set by sveltepress-installer)" >> .env
    echo "PUBLIC_CKEDITOR_LICENSE_KEY=\"$CKE_LICENSE_KEY\"" >> .env
    echo -e "${GREEN}✓ Added PUBLIC_CKEDITOR_LICENSE_KEY to .env file.${NC}"
fi

# --- 9. Clean up temporary files ---
rm -rf "$TEMP_DIR"
echo "✓ Cleaned up temporary files."

# --- 10. Final Instructions ---
echo -e "\n${GREEN}--- Installation Complete! Next Steps: ---${NC}"
echo -e "SveltePress is installed, but you still need to configure path aliases."
echo -e "Please complete the following ${YELLOW}two manual steps${NC}:\n"

echo -e "${CYAN}1. Modify your 'tsconfig.json':${NC}"
echo "   Add the 'paths' property to 'compilerOptions' like this:"
echo '   "compilerOptions": {'
echo '     "paths": {'
echo '       "$routes/*": ["./src/routes/*"]'
echo '     },'
echo '     // ... your other options'
echo '   }'
echo ""
echo -e "${CYAN}2. Modify your 'vite.config.js':${NC}"
echo "   Import 'path' and add a 'resolve.alias' block:"
echo '   // At the top of the file:'
echo "   import path from 'path';"
echo ""
echo '   // Inside defineConfig({ ... }):'
echo '   plugins: [sveltekit()],'
echo '   resolve: {'
echo '     alias: {'
echo "       '\$routes': path.resolve('./src/routes')"
echo '     }'
echo '   }'
echo ""
echo -e "After configuring, you can start your dev server with ${CYAN}'bun run dev'${NC}."

