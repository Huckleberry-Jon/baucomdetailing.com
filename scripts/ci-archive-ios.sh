#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
task_root="$(pwd)"
trap '(cd "$task_root" && node scripts/ios-artifact-manifest.mjs)' EXIT
cd apps/docdetailing_owner
flutter build ipa --verbose --release --build-name=1.0.0 --build-number="$APP_BUILD_NUMBER" --dart-define-from-file=config/staging.json --export-options-plist=/Users/builder/export_options.plist 2>&1 | tee ../../artifacts/ios-archive-build.log
mkdir -p ../../artifacts/export
for report in build/ios/ipa/*.plist build/ios/ipa/Packaging.log; do
  if [ -f "$report" ]; then cp "$report" ../../artifacts/export/; fi
done
