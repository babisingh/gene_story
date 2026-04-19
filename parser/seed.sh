#!/bin/sh
# Run both data loaders in sequence.
# Used as the default CMD for Railway deployments.
# Safe to re-run — both scripts use ON CONFLICT DO UPDATE / DELETE+INSERT.
set -e
python gtf_parser.py
python load_cytoband.py
