# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Portfolio Prism

This creates a single-directory distribution containing:
- Python interpreter
- Streamlit and all dependencies
- Application code
"""

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

block_cipher = None

# Collect Streamlit's static assets (JS, CSS, etc.)
streamlit_datas = collect_data_files('streamlit')

# Collect altair's schema files
altair_datas = collect_data_files('altair')

# CRITICAL: Collect package metadata for importlib.metadata
streamlit_metadata = copy_metadata('streamlit')
pandas_metadata = copy_metadata('pandas')
altair_metadata = copy_metadata('altair')
numpy_metadata = copy_metadata('numpy')

# Hidden imports that PyInstaller might miss
hidden_imports = [
    'streamlit',
    'streamlit.web.cli',
    'streamlit.runtime.scriptrunner',
    'pandas',
    'numpy',
    'pyarrow',
    'altair',
    'altair.vegalite.v5',
    'PIL',
    'PIL.Image',
    # POC Dependencies
    'plotly',
    'requests',
    'bs4',
    'lxml',
    'openpyxl',
    'pydantic',
    'pandera',
    'tqdm',
    'cryptography',
    'pytr',
    'dotenv',
    # Phase 4: Auth & Hive dependencies
    'keyring',
    'keyring.backends',
    'keyring.backends.macOS',
    'supabase',
    'postgrest',
    'gotrue',
    'httpx',
    'storage3',
    'realtime',
]

# Add all streamlit submodules
hidden_imports += collect_submodules('streamlit')

a = Analysis(
    ['prism_boot.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('portfolio_src', 'portfolio_src'),  # Include the business logic
        ('default_config', 'default_config'),  # Include default configs for migration
        *streamlit_datas,
        *altair_datas,
        *streamlit_metadata,
        *pandas_metadata,
        *altair_metadata,
        *numpy_metadata,
    ],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'pytest',
        'pyinstaller',
        'setuptools',
        'wheel',
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
    name='prism',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=True,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
