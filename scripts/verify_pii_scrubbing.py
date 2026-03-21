#!/usr/bin/env python3
import sys
import os
import io
import contextlib
import logging

# Ensure we can import portfolio_src
sys.path.append(os.path.join(os.path.dirname(__file__), "../src-tauri/python"))

from portfolio_src.prism_utils.logging_config import configure_root_logger, get_logger

def verify_scrubbing():
    print("Running PII Scrubber Verification...")
    
    # Capture stderr
    stderr_capture = io.StringIO()
    
    # Mocking sys.stderr might not work with the StreamHandler initialized inside logging_config
    # So we will manually add a handler tracking our capture stream for this test
    
    configure_root_logger()
    logger = get_logger("TestLogger")
    
    # Add a custom handler to capture output for verification
    # We do this because verifying stderr capture of the real handler is tricky in a script
    capture_handler = logging.StreamHandler(stderr_capture)
    # Important: Apply the filter to this handler too, mimicking the real setup
    from portfolio_src.prism_utils.logging_config import PIIFilter
    capture_handler.addFilter(PIIFilter())
    
    logger.addHandler(capture_handler)
    
    # Test Data
    test_email = "user.name@example.com"
    test_phone = "+491234567890"
    test_iban = "DE12345678901234567890"
    
    msg = f"User {test_email} logged in with phone {test_phone} and paid via {test_iban}"
    
    # Log it
    logger.info(msg)
    
    # Check output
    output = stderr_capture.getvalue()
    
    print(f"Original: {msg}")
    print(f"Scrubbed: {output.strip()}")
    
    failed = False
    
    if test_email in output:
        print("FAIL: Email not scrubbed!")
        failed = True
    elif "[EMAIL]" not in output:
         print("FAIL: [EMAIL] placeholder missing!")
         failed = True
         
    if test_phone in output:
        print("FAIL: Phone not scrubbed!")
        failed = True
    elif "[PHONE]" not in output:
         print("FAIL: [PHONE] placeholder missing!")
         failed = True
         
    if test_iban in output:
        print("FAIL: IBAN not scrubbed!")
        failed = True
    elif "[IBAN]" not in output:
         print("FAIL: [IBAN] placeholder missing!")
         failed = True
         
    if not failed:
        print("SUCCESS: All PII scrubbed correctly.")
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    verify_scrubbing()
