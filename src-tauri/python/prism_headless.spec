# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Prism Headless Engine

This creates a minimal single-file executable for the headless IPC engine.
No Streamlit, no web server - just JSON stdin/stdout communication.

Size target: < 50MB (vs ~85MB for full Streamlit build)
"""

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, copy_metadata

block_cipher = None

# Collect package metadata for importlib.metadata
pandas_metadata = copy_metadata('pandas')
numpy_metadata = copy_metadata('numpy')
pydantic_metadata = copy_metadata('pydantic')

# Hidden imports - minimal set for headless operation
hidden_imports = [
    # Core data processing
    'pandas',
    'numpy',
    'pyarrow',
    
    # Validation
    'pydantic',
    'pydantic.deprecated',
    'pydantic.deprecated.decorator',
    
    # System monitoring
    'psutil',
    
    # Database (sqlite3 is built-in, but we use it)
    'sqlite3',
    
    # Future: API clients (uncomment when needed)
    # 'requests',
    # 'httpx',
    # 'yfinance',
    
    # Future: TR Auth (uncomment when TASK-205 is implemented)
    # 'pytr',
    # 'keyring',
    # 'keyring.backends',
    # 'keyring.backends.macOS',
    # 'cryptography',
]

a = Analysis(
    ['prism_headless.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('portfolio_src', 'portfolio_src'),  # Business logic
        ('default_config', 'default_config'),  # Default configs
        *pandas_metadata,
        *numpy_metadata,
        *pydantic_metadata,
    ],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy deps not needed for headless
        'streamlit',
        'altair',
        'plotly',
        'matplotlib',
        'PIL',
        'tkinter',
        'PyQt5',
        'PyQt6',
        # Dev tools
        'pytest',
        'pyinstaller',
        'setuptools',
        'wheel',
        'pip',
        # IPython/Jupyter
        'IPython',
        'jupyter',
        'notebook',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='prism-headless',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Required for stdin/stdout IPC
    disable_windowed_traceback=False,
    argv_emulation=True,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
