#!/bin/bash

echo "Installing dependencies for all lambdas..."

for dir in lambdas/*/; do
    echo "Processing: $dir"

    if [ -f "$dir/package.json" ]; then
        echo "Installing Node.js dependencies in $dir"
        cd "$dir"
        npm install --production
        cd ../..
    fi
    
done

echo "Dependencies installation completed."