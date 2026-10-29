#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
task_root="$(pwd)"
trap '(cd "$task_root" && node scripts/ios-artifact-manifest.mjs)' EXIT
node scripts/ios-preflight.mjs 2>&1 | tee artifacts/source-preflight.log
python3 -B -m unittest discover -s test -p test_ios_plist.py 2>&1 | tee artifacts/plist-tests.log
git rev-parse HEAD > artifacts/source-commit.txt
xcodebuild -version > artifacts/xcode-version.txt
flutter --version --machine > artifacts/flutter-version.json
cd apps/docdetailing_owner
flutter pub get 2>&1 | tee ../../artifacts/dependencies.log
flutter analyze 2>&1 | tee ../../artifacts/flutter-analysis.log
flutter test --machine > ../../artifacts/flutter-tests.jsonl

