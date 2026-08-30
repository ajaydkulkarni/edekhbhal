#!/usr/bin/env bash
set -euo pipefail
if [ ! -f package.json ] || [ ! -f PROJECT-CONTEXT.md ] || [ ! -d src ]; then
  echo "Run this from the eDekhbhal repository root."
  exit 1
fi
python3 batch-payload/apply_core.py
python3 batch-payload/apply_ui.py
echo
echo "Fine-tuning Batch 03 applied."
echo "Next: bash CHECK-finetune-batch-03.sh"
