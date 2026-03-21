# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for TR Daemon
"""

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Hidden imports for daemon dependencies
hidden_imports = [
    'pytr',
    'keyring',
    'keyring.backends',
    'keyring.backends.macOS',
    'requests',
    'cryptography',
    # Add pytr submodules
    *collect_submodules('pytr'),
    # Add keyring submodules if needed (usually handled by hidden_imports but being safe)
    *collect_submodules('keyring.backends'),
]

a = Analysis(
    ['portfolio_src/core/tr_daemon.py'],
    pathex=[],
    binaries=[],
    datas=[],  # Daemon doesn't need streamlit datas
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'streamlit',
        'altair',
        'pandas',
        'numpy',
        'matplotlib',
        'PIL',
        'PyQt5',
        'tkinter',
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
    name='tr-daemon',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,  # CRITICAL: Do not strip on macOS ARM64
    upx=False,    # CRITICAL: Do not use UPX on macOS ARM64
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
