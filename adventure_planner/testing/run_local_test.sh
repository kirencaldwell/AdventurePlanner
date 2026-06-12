#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

IMAGE_NAME="my-ha-addon:local"
TEST_DIR="./local_test/data"
OPTIONS_FILE="${TEST_DIR}/options.json"

echo "=================================================="
echo "🚀 Starting Home Assistant Add-on Local Sandbox"
echo "=================================================="

# 1. Ensure the mock data directory exists
if [ ! -d "$TEST_DIR" ]; then
    echo "📁 Creating mock data directory at $TEST_DIR..."
    mkdir -p "$TEST_DIR"
fi

# 2. Seed a default options.json if it doesn't exist
if [ ! -f "$OPTIONS_FILE" ]; then
    echo "📝 No options.json found. Seeding a default configuration..."
    cat <<EOF > "$OPTIONS_FILE"
{
  "log_level": "debug",
  "api_retry_count": 3
}
EOF
    echo "💡 You can edit your mock config anytime at: $OPTIONS_FILE"
fi

# 3. Build the Docker image
echo "🔨 Building Docker image: $IMAGE_NAME..."
docker build -t "$IMAGE_NAME" ./adventure_planner

# 4. Run the container
echo "🏃 Launching the container..."
echo "--------------------------------------------------"
echo "Press Ctrl+C to stop the container and exit."
echo "--------------------------------------------------"

docker run -it --rm \
  -v "$(pwd)/local_test/data:/data" \
  -e SUPERVISOR_TOKEN="mock_development_token_12345" \
  -p 8099:8099 \
  "$IMAGE_NAME"
