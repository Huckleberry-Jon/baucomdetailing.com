#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
cd apps/docdetailing_owner
flutter build ipa --release --build-name=1.0.0 --build-number="$APP_BUILD_NUMBER" --dart-define-from-file=config/staging.json --export-options-plist=/Users/builder/export_options.plist 2>&1 | tee ../../artifacts/ios-archive-build.log

