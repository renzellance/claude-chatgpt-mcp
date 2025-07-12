#!/bin/bash

# Standalone cleanup script for ChatGPT MCP Images
# Can be run independently or via cron job

set -e

# Configuration
IMAGE_DIR="$HOME/Downloads/ChatGPT_MCP_Images"
MAX_AGE_HOURS=24
MAX_DIRECTORY_SIZE_MB=500
KEEP_LAST_N=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if directory exists
if [ ! -d "$IMAGE_DIR" ]; then
    log_info "Directory $IMAGE_DIR does not exist. Nothing to clean."
    exit 0
fi

log_info "Starting cleanup of ChatGPT MCP Images..."
log_info "Directory: $IMAGE_DIR"

# Count initial files
INITIAL_COUNT=$(find "$IMAGE_DIR" -name "chatgpt_*.png" | wc -l | tr -d ' ')
log_info "Found $INITIAL_COUNT ChatGPT image files"

if [ "$INITIAL_COUNT" -eq 0 ]; then
    log_info "No ChatGPT image files to clean up."
    exit 0
fi

# Calculate cutoff time for old files
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CUTOFF_TIME=$(date -v-"${MAX_AGE_HOURS}H" +%s)
else
    # Linux
    CUTOFF_TIME=$(date -d "$MAX_AGE_HOURS hours ago" +%s)
fi

# Clean up old files
log_info "Removing files older than $MAX_AGE_HOURS hours..."
OLD_FILES_REMOVED=0

find "$IMAGE_DIR" -name "chatgpt_*.png" -type f | while read -r file; do
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        FILE_TIME=$(stat -f %m "$file")
    else
        # Linux
        FILE_TIME=$(stat -c %Y "$file")
    fi
    
    if [ "$FILE_TIME" -lt "$CUTOFF_TIME" ]; then
        log_info "Removing old file: $(basename "$file")"
        rm "$file"
        OLD_FILES_REMOVED=$((OLD_FILES_REMOVED + 1))
    fi
done

# Check directory size and remove oldest files if needed
log_info "Checking directory size..."
DIR_SIZE_KB=$(du -sk "$IMAGE_DIR" | cut -f1)
DIR_SIZE_MB=$((DIR_SIZE_KB / 1024))

log_info "Current directory size: ${DIR_SIZE_MB}MB"

if [ "$DIR_SIZE_MB" -gt "$MAX_DIRECTORY_SIZE_MB" ]; then
    log_warn "Directory size (${DIR_SIZE_MB}MB) exceeds limit (${MAX_DIRECTORY_SIZE_MB}MB)"
    log_info "Removing oldest files..."
    
    # Get list of files sorted by modification time (oldest first)
    find "$IMAGE_DIR" -name "chatgpt_*.png" -type f -exec ls -t {} + | tail -n +$((KEEP_LAST_N + 1)) | while read -r file; do
        CURRENT_SIZE_KB=$(du -sk "$IMAGE_DIR" | cut -f1)
        CURRENT_SIZE_MB=$((CURRENT_SIZE_KB / 1024))
        
        if [ "$CURRENT_SIZE_MB" -gt "$MAX_DIRECTORY_SIZE_MB" ]; then
            log_info "Removing large directory file: $(basename "$file")"
            rm "$file"
        else
            break
        fi
    done
fi

# Ensure we keep at least KEEP_LAST_N files
REMAINING_COUNT=$(find "$IMAGE_DIR" -name "chatgpt_*.png" | wc -l | tr -d ' ')

if [ "$REMAINING_COUNT" -gt "$KEEP_LAST_N" ]; then
    EXCESS_COUNT=$((REMAINING_COUNT - KEEP_LAST_N))
    log_info "Removing $EXCESS_COUNT excess files (keeping last $KEEP_LAST_N)..."
    
    find "$IMAGE_DIR" -name "chatgpt_*.png" -type f -exec ls -t {} + | tail -n "$EXCESS_COUNT" | while read -r file; do
        log_info "Removing excess file: $(basename "$file")"
        rm "$file"
    done
fi

# Final count
FINAL_COUNT=$(find "$IMAGE_DIR" -name "chatgpt_*.png" | wc -l | tr -d ' ')
REMOVED_COUNT=$((INITIAL_COUNT - FINAL_COUNT))

log_info "Cleanup completed!"
log_info "Files removed: $REMOVED_COUNT"
log_info "Files remaining: $FINAL_COUNT"

# Final directory size
FINAL_SIZE_KB=$(du -sk "$IMAGE_DIR" | cut -f1)
FINAL_SIZE_MB=$((FINAL_SIZE_KB / 1024))
log_info "Final directory size: ${FINAL_SIZE_MB}MB"

if [ "$REMOVED_COUNT" -gt 0 ]; then
    log_info "Successfully cleaned up $REMOVED_COUNT files from ChatGPT MCP Images directory."
else
    log_info "No files needed to be removed."
fi
