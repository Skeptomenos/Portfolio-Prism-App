# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Prism Headless Engine

Creates a single-file executable for the headless IPC engine.
No Streamlit, no web server - just JSON stdin/stdout communication.
"""

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

block_cipher = None

# Collect package metadata for importlib.metadata
pandas_metadata = copy_metadata('pandas')
numpy_metadata = copy_metadata('numpy')
pydantic_metadata = copy_metadata('pydantic')

# Hidden imports - use collect_submodules for complex C-extension packages
hidden_imports = [
    # Core
    'certifi',
    'psutil',
    'sqlite3',
    
    # Validation
    'pydantic',
    'pydantic.deprecated',
    'pydantic.deprecated.decorator',
    
    # API clients
    'requests',
    'yfinance',
    
    # TR Auth
    'pytr',
    'keyring',
    'keyring.backends',
    'keyring.backends.macOS',
    'cryptography',
    
    # Heavy C-extension packages - MUST use collect_submodules on macOS ARM64
    *collect_submodules('pandas'),
    *collect_submodules('numpy'),
    *collect_submodules('pyarrow'),
    *collect_submodules('pydantic'),
    *collect_submodules('keyring.backends'),
    *collect_submodules('pytr'),
]

a = Analysis(
    ['prism_headless.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('portfolio_src', 'portfolio_src'),     # Business logic + schema.sql
        ('default_config', 'default_config'),   # Configuration files
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
    strip=False,   # CRITICAL: Do not strip on macOS ARM64
    upx=False,     # CRITICAL: Do not use UPX on macOS ARM64
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Required for stdin/stdout IPC
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
