#!/bin/bash

# Install cleanup script as a cron job
# Runs daily at 2 AM to clean up old ChatGPT images

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup-images.sh"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if cleanup script exists
if [ ! -f "$CLEANUP_SCRIPT" ]; then
    echo "Error: cleanup-images.sh not found at $CLEANUP_SCRIPT"
    exit 1
fi

# Make cleanup script executable
chmod +x "$CLEANUP_SCRIPT"

log_info "Installing ChatGPT MCP Images cleanup cron job..."

# Create cron job entry
CRON_ENTRY="0 2 * * * $CLEANUP_SCRIPT >/dev/null 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$CLEANUP_SCRIPT"; then
    log_warn "Cron job already exists for cleanup script"
    echo "Current cron jobs:"
    crontab -l | grep "$CLEANUP_SCRIPT"
    echo
    read -p "Do you want to replace it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled."
        exit 0
    fi
    
    # Remove existing cron job
    crontab -l | grep -v "$CLEANUP_SCRIPT" | crontab -
    log_info "Removed existing cron job"
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

log_info "Cron job installed successfully!"
log_info "The cleanup script will run daily at 2:00 AM"
log_info "Cron entry: $CRON_ENTRY"

echo
log_info "To verify the installation:"
echo "  crontab -l | grep cleanup-images"
echo
log_info "To remove the cron job:"
echo "  crontab -l | grep -v cleanup-images.sh | crontab -"
echo
log_info "To run cleanup manually:"
echo "  $CLEANUP_SCRIPT"
