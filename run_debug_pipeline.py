import os
import sys
from pathlib import Path

# Add src-tauri/python to path
sys.path.append(str(Path(__file__).parent / "src-tauri" / "python"))

from portfolio_src.core.pipeline import Pipeline


def main():
    print("Running pipeline in DEBUG mode...")
    os.environ["DEBUG_PIPELINE"] = "true"

    pipeline = Pipeline(debug=True)
    result = pipeline.run(lambda msg, pct, phase: print(f"[{pct:.2f}] {phase}: {msg}"))

    if result.success:
        print("Pipeline completed successfully!")
    else:
        print("Pipeline failed!")
        for error in result.errors:
            print(f"Error: {error}")


if __name__ == "__main__":
    main()
