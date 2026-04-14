import logging
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

from app.services.pipeline import run_pipeline

result = run_pipeline()
print(json.dumps(result, indent=2))
