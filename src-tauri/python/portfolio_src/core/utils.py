# core/utils.py
"""
Shared utility functions for the analytics pipeline.

These functions are used across multiple services to ensure consistency.
"""

import pandas as pd


def calculate_portfolio_total_value(
    direct_positions: pd.DataFrame,
    etf_positions: pd.DataFrame
) -> float:
    """
    Calculate total portfolio value from positions DataFrames.
    
    Args:
        direct_positions: DataFrame of direct stock holdings
        etf_positions: DataFrame of ETF positions
        
    Returns:
        Total portfolio value as float
    """
    if not isinstance(direct_positions, pd.DataFrame):
        direct_positions = pd.DataFrame()
    if not isinstance(etf_positions, pd.DataFrame):
        etf_positions = pd.DataFrame()

    direct_value = 0
    etf_value = 0
    
    if not direct_positions.empty:
        # Try common column names for value
        for col in ["tr_value", "NetValue", "market_value", "net_value", "value"]:
            if col in direct_positions.columns:
                direct_value = direct_positions[col].sum()
                break
    
    if not etf_positions.empty:
        for col in ["tr_value", "NetValue", "market_value", "net_value", "value"]:
            if col in etf_positions.columns:
                etf_value = etf_positions[col].sum()
                break
    
    return float(direct_value + etf_value)


def get_value_column(df: pd.DataFrame) -> str:
    """
    Find the value column name in a DataFrame.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for value, or None if not found
    """
    for col in ["tr_value", "NetValue", "market_value", "net_value", "value"]:
        if col in df.columns:
            return col
    return None


def get_isin_column(df: pd.DataFrame) -> str:
    """
    Find the ISIN column name in a DataFrame.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for ISIN
    """
    return "ISIN" if "ISIN" in df.columns else "isin"


def get_name_column(df: pd.DataFrame) -> str:
    """
    Find the name column in a DataFrame.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for name
    """
    for col in ["Name", "name", "TR_Name"]:
        if col in df.columns:
            return col
    return "name"

def get_weight_column(df: pd.DataFrame) -> str:
    """
    Find the weight column in a DataFrame.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for weight, or None if not found
    """
    for col in ["weight_percentage", "Weight", "weight"]:
        if col in df.columns:
            return col
    return None
